import { Product, ProductPrice } from "../../models/setupAssociations.js";
import { redisClient } from "../redis/redisClient.js";

class InventoryService {
  /**
   * Atomically decrement stock only if available.
   * Tries Redis lock first, falls back to DB lock.
   *
   * @param {Object} product
   * @param {Object} priceRow
   * @param {number} qty
   * @param {Object} [transaction]
   */
  static async decrementIfAvailable(product, priceRow, qty, transaction = null) {
    const lockKey = `stock_lock_product_${product.id}_size_${priceRow.size}`;
    let lockAcquired = false;

    try {
      if (redisClient && redisClient.isReady) {
        // Attempt to acquire lock for 5 seconds
        const result = await redisClient.set(lockKey, "locked", {
          NX: true,
          EX: 5,
        });
        if (result === "OK") {
          lockAcquired = true;
        }
      }
    } catch (err) {
      // Redis error, proceed to fallback DB lock
    }

    try {
      await this.executeStockUpdate(product, priceRow, qty, transaction);
    } finally {
      if (lockAcquired) {
        try {
          await redisClient.del(lockKey);
        } catch (e) {
          // ignore release errors
        }
      }
    }
  }

  /**
   * Core logic for checking and updating stock.
   */
  static async executeStockUpdate(product, priceRow, qty, transaction = null) {
    // Handle Customizable Products (Type 0 / "0")
    if (String(product.product_type) === "0") {
      if (String(priceRow.is_out_stock) === "1") {
        throw new Error(`Stock not available for ${product.product_name || "product"}`);
      }
      return;
    }

    // Handle Ready-made Products (Type != 0) - ATOMIC UPDATE
    const currentPriceRow = await ProductPrice.findByPk(priceRow.id, {
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
    });

    if (!currentPriceRow) {
      throw new Error(`Price row not found for ID ${priceRow.id}`);
    }

    const currentQty = parseInt(currentPriceRow.qty || 0, 10);
    if (currentQty < qty) {
      throw new Error(
        `Stock not available for ${product.product_name || "product"}. Requested: ${qty}, Available: ${currentQty}`
      );
    }

    const newQty = currentQty - qty;
    const isOutStock = newQty <= 0 ? "1" : "0";

    await currentPriceRow.update(
      {
        qty: newQty,
        is_out_stock: isOutStock,
      },
      { transaction }
    );
  }

  /**
   * Restore stock to inventory (e.g. on order cancellation/decline).
   *
   * @param {Object} product
   * @param {Object} priceRow
   * @param {number} qty
   * @param {Object} [transaction]
   */
  static async restoreStock(product, priceRow, qty, transaction = null) {
    if (String(product.product_type) !== "0") {
      const currentPriceRow = await ProductPrice.findByPk(priceRow.id, {
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : undefined,
      });

      if (currentPriceRow) {
        const currentQty = parseInt(currentPriceRow.qty || 0, 10);
        const newQty = currentQty + qty;

        await currentPriceRow.update(
          {
            qty: newQty,
            is_out_stock: "0",
          },
          { transaction }
        );
      }
    }
  }
}

export default InventoryService;
