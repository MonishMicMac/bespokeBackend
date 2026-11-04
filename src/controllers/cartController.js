import sequelize from "../../config/db.js";
import { QueryTypes } from "sequelize";

const S3_BASE_URL = "https://bespoke-2026.s3.ap-south-1.amazonaws.com";

function formatImageUrl(path) {
  if (!path || typeof path !== "string") return null;
  const trimmed = path.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  const clean = trimmed.replace(/^\/+/, "");
  return `${S3_BASE_URL}/${clean}`;
}

// 1. Get all active bag / cart items and their associated addons from `addon_cart`
export const getCart = async (req, res) => {
  try {
    const userId = req.query.user_id || req.query.userId || req.body?.user_id;
    if (!userId) {
      return res.json({ status: true, data: [], count: 0, subtotal: 0 });
    }

    const items = await sequelize.query(
      `SELECT 
        c.id AS cart_item_id,
        c.id AS id,
        c.user_id,
        c.price_id,
        c.cart_qty AS quantity,
        c.vendor_id,
        c.measurment_details,
        c.created_at,
        pp.product_id,
        COALESCE(pp.size, 'Standard') AS size,
        COALESCE(pp.discount_price, pp.actual_price, 499) AS price,
        pp.actual_price,
        pp.discount_price,
        COALESCE(p.product_name, 'Bespoke Atelier Piece') AS title,
        COALESCE(p.product_name, 'Bespoke Atelier Piece') AS product_name,
        COALESCE(
          NULLIF(p.main_image, ''),
          (SELECT pmi.img_path FROM product_material_images pmi 
           WHERE pmi.product_id = pp.product_id 
             AND pmi.img_path IS NOT NULL AND pmi.img_path != '' 
           ORDER BY pmi.id ASC LIMIT 1),
          (SELECT pm.main_img_path FROM product_materials pm 
           WHERE pm.product_id = pp.product_id 
             AND pm.main_img_path IS NOT NULL AND pm.main_img_path != '' 
           ORDER BY pm.id ASC LIMIT 1),
          ''
        ) AS image_path,
        COALESCE(v.shop_name, v.username, 'Bespoke Atelier') AS vendor
       FROM user_cart_items c
       LEFT JOIN product_prices pp ON c.price_id = pp.id
       LEFT JOIN products p ON pp.product_id = p.id
       LEFT JOIN vendor_login v ON (c.vendor_id = v.id OR p.vendor_id = v.id)
       WHERE c.user_id = ? AND c.action = '0'
       ORDER BY c.id DESC`,
      {
        replacements: [userId],
        type: QueryTypes.SELECT,
      }
    );

    // Fetch all active addons for these cart items from `addon_cart`
    const cartIds = items.map((i) => i.cart_item_id);
    let addonsMap = {};

    if (cartIds.length > 0) {
      const addons = await sequelize.query(
        `SELECT 
          ac.id AS addon_cart_id,
          ac.cart_id,
          ac.add_on_id,
          COALESCE(pa.name, 'Customization Add-on') AS name,
          COALESCE(pa.amount, 0) AS amount
         FROM addon_cart ac
         LEFT JOIN product_addon pa ON ac.add_on_id = pa.id
         WHERE ac.cart_id IN (?) AND ac.action = '0'`,
        {
          replacements: [cartIds],
          type: QueryTypes.SELECT,
        }
      );

      addons.forEach((addon) => {
        if (!addonsMap[addon.cart_id]) {
          addonsMap[addon.cart_id] = [];
        }
        addonsMap[addon.cart_id].push({
          id: addon.add_on_id,
          addon_cart_id: addon.addon_cart_id,
          name: addon.name,
          amount: parseFloat(addon.amount || 0),
        });
      });
    }

    const formatted = items.map((item) => {
      const unitPrice = parseFloat(item.price || 499);
      const qty = parseInt(item.quantity || 1, 10);
      const itemAddons = addonsMap[item.cart_item_id] || [];
      const addonsTotal = itemAddons.reduce((sum, a) => sum + (a.amount || 0), 0);
      const effectiveUnitPrice = unitPrice + addonsTotal;

      return {
        ...item,
        id: item.cart_item_id,
        cart_item_id: item.cart_item_id,
        title: item.title,
        price: effectiveUnitPrice,
        base_price: unitPrice,
        actual_price: parseFloat(item.actual_price || item.price || 499),
        discount_price: parseFloat(item.discount_price || item.price || 499),
        quantity: qty,
        addons: itemAddons,
        addons_total: addonsTotal,
        image:
          formatImageUrl(item.image_path) ||
          "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=600&q=80",
        item_total: effectiveUnitPrice * qty,
      };
    });

    const totalCount = formatted.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = formatted.reduce((sum, item) => sum + item.item_total, 0);

    return res.json({
      status: true,
      data: formatted,
      count: totalCount,
      subtotal,
    });
  } catch (error) {
    console.error("❌ Cart fetch error:", error);
    return res.status(500).json({ status: false, message: error.message, data: [], count: 0 });
  }
};

// 2. Add item to Bag / Cart & save any add-ons into `addon_cart`
export const addToCart = async (req, res) => {
  try {
    const {
      user_id,
      product_id,
      price_id,
      quantity = 1,
      size = "Standard",
      vendor_id,
      measurment_details,
      addons = [],
      add_on_id,
    } = req.body;

    if (!user_id || (!product_id && !price_id)) {
      return res.status(400).json({
        status: false,
        message: "user_id and either product_id or price_id are required.",
      });
    }

    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    let resolvedPriceId = price_id;
    let resolvedVendorId = vendor_id;

    // Resolve price_id from product_prices if missing
    if (!resolvedPriceId && product_id) {
      const [matchedPrice] = await sequelize.query(
        `SELECT id, product_id FROM product_prices 
         WHERE product_id = ? AND (size = ? OR size IS NULL) 
         ORDER BY id ASC LIMIT 1`,
        {
          replacements: [product_id, size],
          type: QueryTypes.SELECT,
        }
      );

      if (matchedPrice) {
        resolvedPriceId = matchedPrice.id;
      } else {
        const [anyPrice] = await sequelize.query(
          `SELECT id FROM product_prices WHERE product_id = ? ORDER BY id ASC LIMIT 1`,
          {
            replacements: [product_id],
            type: QueryTypes.SELECT,
          }
        );
        if (anyPrice) {
          resolvedPriceId = anyPrice.id;
        } else {
          const [insertedPrice] = await sequelize.query(
            `INSERT INTO product_prices (product_id, size, actual_price, discount_price, qty, is_out_stock, created_at, updated_at)
             VALUES (?, ?, 500.00, 499.00, 50, '0', NOW(), NOW())`,
            {
              replacements: [product_id, size],
              type: QueryTypes.INSERT,
            }
          );
          resolvedPriceId = insertedPrice;
        }
      }
    }

    // Resolve vendor_id from products if missing
    if (!resolvedVendorId && product_id) {
      const [prod] = await sequelize.query(
        `SELECT vendor_id FROM products WHERE id = ? LIMIT 1`,
        {
          replacements: [product_id],
          type: QueryTypes.SELECT,
        }
      );
      if (prod && prod.vendor_id) {
        resolvedVendorId = prod.vendor_id;
      }
    }

    // Check if item already exists in active cart (`action = '0'`)
    const [existingCartItem] = await sequelize.query(
      `SELECT id, cart_qty FROM user_cart_items 
       WHERE user_id = ? AND price_id = ? AND action = '0'
       LIMIT 1`,
      {
        replacements: [user_id, resolvedPriceId],
        type: QueryTypes.SELECT,
      }
    );

    let cartItemId;

    if (existingCartItem) {
      cartItemId = existingCartItem.id;
      const newQty = parseInt(existingCartItem.cart_qty, 10) + qty;
      await sequelize.query(
        `UPDATE user_cart_items 
         SET cart_qty = ?, updated_at = NOW() 
         WHERE id = ?`,
        {
          replacements: [newQty, existingCartItem.id],
          type: QueryTypes.UPDATE,
        }
      );
    } else {
      const measurementStr =
        typeof measurment_details === "object"
          ? JSON.stringify(measurment_details)
          : measurment_details || null;

      const [newId] = await sequelize.query(
        `INSERT INTO user_cart_items (user_id, price_id, cart_qty, action, vendor_id, measurment_details, c_date, created_at, updated_at)
         VALUES (?, ?, ?, '0', ?, ?, NOW(), NOW(), NOW())`,
        {
          replacements: [
            user_id,
            resolvedPriceId,
            qty,
            resolvedVendorId || 1,
            measurementStr,
          ],
          type: QueryTypes.INSERT,
        }
      );
      cartItemId = newId;
    }

    // Store selected add-ons in `addon_cart` table
    const addonList = [];
    if (Array.isArray(addons) && addons.length > 0) {
      addons.forEach((a) => {
        const aId = typeof a === "object" ? a.id || a.add_on_id : a;
        if (aId) addonList.push(Number(aId));
      });
    }
    if (add_on_id && !addonList.includes(Number(add_on_id))) {
      addonList.push(Number(add_on_id));
    }

    for (const addonId of addonList) {
      await sequelize.query(
        `INSERT INTO addon_cart (cart_id, add_on_id, action, created_at, updated_at)
         VALUES (?, ?, '0', NOW(), NOW())`,
        {
          replacements: [cartItemId, addonId],
          type: QueryTypes.INSERT,
        }
      );
    }

    // Get updated total count
    const [countRow] = await sequelize.query(
      `SELECT SUM(cart_qty) as total FROM user_cart_items WHERE user_id = ? AND action = '0'`,
      {
        replacements: [user_id],
        type: QueryTypes.SELECT,
      }
    );

    const totalCount = countRow && countRow.total ? parseInt(countRow.total, 10) : 0;
    console.log(
      `🛍️ [Cart] Added product #${product_id || resolvedPriceId} to bag for user #${user_id} (Cart Item #${cartItemId}, Addons: ${addonList.length}, Total: ${totalCount})`
    );

    return res.status(201).json({
      status: true,
      message: "Item added to your shopping bag!",
      cart_item_id: cartItemId,
      cartCount: totalCount,
    });
  } catch (error) {
    console.error("❌ Add to cart error:", error);
    return res.status(500).json({ status: false, message: error.message });
  }
};

// 3. Update quantity in Bag / Cart
export const updateCartQuantity = async (req, res) => {
  try {
    const userId = req.body?.user_id || req.query?.user_id || req.body?.userId || req.query?.userId;
    const cartItemId = req.body?.cart_item_id || req.query?.cart_item_id || req.body?.id || req.query?.id;
    const rawQty = req.body?.quantity ?? req.body?.cart_qty ?? req.query?.quantity ?? req.query?.cart_qty;

    if (!cartItemId) {
      return res.status(400).json({
        status: false,
        message: "cart_item_id is required.",
      });
    }

    const newQty = parseInt(rawQty, 10);

    if (isNaN(newQty) || newQty <= 0) {
      // Remove item and disable its addon_cart entries
      await sequelize.query(
        `UPDATE user_cart_items SET action = '1', updated_at = NOW() WHERE id = ?`,
        {
          replacements: [cartItemId],
          type: QueryTypes.UPDATE,
        }
      );
      await sequelize.query(
        `UPDATE addon_cart SET action = '1', updated_at = NOW() WHERE cart_id = ?`,
        {
          replacements: [cartItemId],
          type: QueryTypes.UPDATE,
        }
      );
    } else {
      await sequelize.query(
        `UPDATE user_cart_items SET cart_qty = ?, updated_at = NOW() WHERE id = ?`,
        {
          replacements: [newQty, cartItemId],
          type: QueryTypes.UPDATE,
        }
      );
    }

    let totalCount = 0;
    if (userId) {
      const [countRow] = await sequelize.query(
        `SELECT SUM(cart_qty) as total FROM user_cart_items WHERE user_id = ? AND action = '0'`,
        {
          replacements: [userId],
          type: QueryTypes.SELECT,
        }
      );
      totalCount = countRow && countRow.total ? parseInt(countRow.total, 10) : 0;
    }

    return res.json({
      status: true,
      message: (isNaN(newQty) || newQty <= 0) ? "Item removed from bag." : "Cart updated.",
      cartCount: totalCount,
    });
  } catch (error) {
    console.error("❌ Update cart error:", error);
    return res.status(500).json({ status: false, message: error.message });
  }
};

// 4. Remove item from Bag / Cart & update `addon_cart`
export const removeFromCart = async (req, res) => {
  try {
    const userId = req.body?.user_id || req.query?.user_id || req.body?.userId || req.query?.userId;
    const cartItemId = req.body?.cart_item_id || req.query?.cart_item_id || req.body?.id || req.query?.id;

    if (!cartItemId) {
      return res.status(400).json({ status: false, message: "cart_item_id is required" });
    }

    // Always update by primary key id so the item is guaranteed to be deactivated
    await sequelize.query(
      `UPDATE user_cart_items SET action = '1', updated_at = NOW() WHERE id = ?`,
      {
        replacements: [cartItemId],
        type: QueryTypes.UPDATE,
      }
    );

    await sequelize.query(
      `UPDATE addon_cart SET action = '1', updated_at = NOW() WHERE cart_id = ?`,
      {
        replacements: [cartItemId],
        type: QueryTypes.UPDATE,
      }
    );

    let totalCount = 0;
    if (userId) {
      const [countRow] = await sequelize.query(
        `SELECT SUM(cart_qty) as total FROM user_cart_items WHERE user_id = ? AND action = '0'`,
        {
          replacements: [userId],
          type: QueryTypes.SELECT,
        }
      );
      totalCount = countRow && countRow.total ? parseInt(countRow.total, 10) : 0;
    }

    console.log(`🗑️ [Cart] Item #${cartItemId} deactivated (action='1')`);

    return res.json({
      status: true,
      message: "Item removed from shopping bag.",
      cartCount: totalCount,
    });
  } catch (error) {
    console.error("❌ Remove cart error:", error);
    return res.status(500).json({ status: false, message: error.message });
  }
};

// 5. Clear all active items from Bag / Cart & update `addon_cart`
export const clearCart = async (req, res) => {
  try {
    const userId = req.body?.user_id || req.query?.user_id || req.body?.userId || req.query?.userId;
    if (!userId) {
      return res.status(400).json({ status: false, message: "user_id is required" });
    }

    // Disable all addon_cart entries for this user's active cart items
    await sequelize.query(
      `UPDATE addon_cart SET action = '1', updated_at = NOW() 
       WHERE cart_id IN (SELECT id FROM user_cart_items WHERE user_id = ? AND action = '0')`,
      {
        replacements: [userId],
        type: QueryTypes.UPDATE,
      }
    );

    await sequelize.query(
      `UPDATE user_cart_items SET action = '1', updated_at = NOW() WHERE user_id = ?`,
      {
        replacements: [userId],
        type: QueryTypes.UPDATE,
      }
    );

    return res.json({
      status: true,
      message: "Shopping bag cleared.",
      cartCount: 0,
    });
  } catch (error) {
    console.error("❌ Clear cart error:", error);
    return res.status(500).json({ status: false, message: error.message });
  }
};
