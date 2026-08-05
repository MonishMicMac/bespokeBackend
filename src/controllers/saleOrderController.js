import SaleOrderHistory from "../../models/SaleOrderHistory.js";
import SaleOrder from "../../models/SaleOrder.js";
import { resolveOrderHistoryEnum } from "./orderController.js";
import sequelize from "../../config/db.js";
import { QueryTypes } from "sequelize";

export const saleOrderController = async (req, res) => {
  try {

    console.log(req.body);
    const { id, order_history, cancel_remark } = req.body;

    if (!id || order_history === undefined) {
      return res.status(400).json({ error: "Missing id or order_status in request body" });
    }

    const resolvedEnum = resolveOrderHistoryEnum(order_history);

    // 1. Create the history record in sale_order_history table
    const newRecord = await SaleOrderHistory.create({
      sale_order_id: id,
      order_history: resolvedEnum,
      remarks: cancel_remark || null
    });

    console.log("Saved status update to DB (history via saleOrderController):", newRecord.toJSON());

    // 2. Update the main sale_order table
    const [updatedCount] = await SaleOrder.update(
      {
        order_history: resolvedEnum,
        ...(resolvedEnum === 'Decline_Order' && { cancel_remark: cancel_remark || null })
      },
      {
        where: { id: id }
      }
    );
    // 3. Update the main orders table
    const saleOrderRecord = await SaleOrder.findByPk(id);
    if (saleOrderRecord && saleOrderRecord.order_id) {
      await sequelize.query(
        `UPDATE orders SET order_history = ?, decline_remarks = ? WHERE order_id = ?`,
        {
          replacements: [
            resolvedEnum,
            resolvedEnum === 'Decline_Order' ? (cancel_remark || null) : null,
            String(saleOrderRecord.order_id)
          ],
          type: QueryTypes.UPDATE
        }
      );
      console.log(`Updated orders table status for order_id ${saleOrderRecord.order_id} to ${resolvedEnum} via saleOrderController`);
    }

    console.log(`Updated sale_order status for id ${id} to ${resolvedEnum} via saleOrderController (count: ${updatedCount})`);

    return res.json({
      success: true,
      message: "Order status update recorded successfully",
      data: newRecord
    });
  } catch (error) {
    console.error("Error updating order status in DB (via saleOrderController):", error);
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};
