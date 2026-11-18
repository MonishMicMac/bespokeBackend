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
        pp.material_id,
        COALESCE(pp.size, 'Standard') AS size,
        COALESCE(pp.discount_price, pp.actual_price, 499) AS price,
        pp.actual_price,
        pp.discount_price,
        COALESCE(pp.gst_id, pm.gst_id, p.gst_id, 10) AS gst_id,
        COALESCE(gm.gst_name, 'IGST 18%') AS gst_name,
        COALESCE(gm.rate, 'IGST 18%') AS gst_rate,
        CAST(COALESCE(gm.gst_percentage, 18) AS DECIMAL(5,2)) AS gst_percentage,
        COALESCE(p.product_name, 'Bespoke Atelier Piece') AS title,
        COALESCE(p.product_name, 'Bespoke Atelier Piece') AS product_name,
        COALESCE(
          (SELECT pmi_sub.img_path FROM product_material_images pmi_sub 
           WHERE pmi_sub.product_material_id = pp.material_id 
             AND pmi_sub.img_path IS NOT NULL AND pmi_sub.img_path != '' 
           ORDER BY pmi_sub.id ASC LIMIT 1),
          NULLIF(pm.main_img_path, ''),
          NULLIF(p.main_image, ''),
          (SELECT pmi.img_path FROM product_material_images pmi 
           WHERE pmi.product_id = pp.product_id 
             AND pmi.img_path IS NOT NULL AND pmi.img_path != '' 
           ORDER BY pmi.id ASC LIMIT 1),
          ''
        ) AS image_path,
        COALESCE(pm.material_name, pm.color_code, '') AS material_name,
        COALESCE(pm.material_name, pm.color_code, '') AS color,
        COALESCE(pm.color_code, '') AS color_code,
        COALESCE(pm.name, '') AS material,
        COALESCE(pm.name, '') AS fabric,
        pp.material_id AS material_id,
        pp.material_id AS materialId,
        COALESCE(v.shop_name, v.username, 'Bespoke Atelier') AS vendor
       FROM user_cart_items c
       LEFT JOIN product_prices pp ON c.price_id = pp.id
       LEFT JOIN products p ON pp.product_id = p.id
       LEFT JOIN product_materials pm ON pp.material_id = pm.id
       LEFT JOIN gst_masters gm ON COALESCE(pp.gst_id, pm.gst_id, p.gst_id, 10) = gm.id AND (gm.action IS NULL OR gm.action != '1')
       LEFT JOIN vendor_login v ON v.id = COALESCE(c.vendor_id, p.vendor_id)
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
      const gstPct = parseFloat(item.gst_percentage || 0);
      const gstUnitAmt = gstPct > 0 ? Math.round(((effectiveUnitPrice * gstPct) / 100) * 100) / 100 : 0;
      const totalItemGst = Math.round((gstUnitAmt * qty) * 100) / 100;

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
        gst_id: item.gst_id ? Number(item.gst_id) : null,
        gst_name: item.gst_name || item.gst_rate || null,
        gst_rate: item.gst_rate || null,
        gst_percentage: gstPct,
        gst_amount: gstUnitAmt,
        total_gst: totalItemGst,
        image:
          formatImageUrl(item.image_path) ||
          "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=600&q=80",
        item_total: effectiveUnitPrice * qty,
      };
    });

    const totalCount = formatted.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = formatted.reduce((sum, item) => sum + item.item_total, 0);
    const totalGst = formatted.reduce((sum, item) => sum + (item.total_gst || 0), 0);
    const grandTotal = Math.round((subtotal + totalGst) * 100) / 100;

    return res.json({
      status: true,
      data: formatted,
      count: totalCount,
      subtotal,
      total_gst: totalGst,
      grand_total: grandTotal,
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
      material_id,
      materialId,
      quantity = 1,
      size = "Standard",
      vendor_id,
      measurment_details,
      addons = [],
      add_on_id,
    } = req.body;

    const resolvedMaterialId = material_id || materialId || null;

    if (!user_id || (!product_id && !price_id)) {
      return res.status(400).json({
        status: false,
        message: "user_id and either product_id or price_id are required.",
      });
    }

    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    let resolvedPriceId = price_id;
    let resolvedVendorId = vendor_id;

    // If material_id was passed, verify that resolvedPriceId belongs to that material
    if (resolvedPriceId && resolvedMaterialId) {
      const [priceCheck] = await sequelize.query(
        `SELECT id, material_id FROM product_prices WHERE id = ? AND material_id = ? LIMIT 1`,
        {
          replacements: [resolvedPriceId, resolvedMaterialId],
          type: QueryTypes.SELECT,
        }
      );
      if (!priceCheck) {
        // Price ID is mismatched or belongs to another material variant!
        resolvedPriceId = null;
      }
    }

    // Resolve price_id from product_prices if missing or invalidated
    if (!resolvedPriceId && product_id) {
      let matchedPrice = null;

      if (resolvedMaterialId) {
        // 1. Try to match product_id, material_id and requested size
        const [matSizeMatch] = await sequelize.query(
          `SELECT id FROM product_prices 
           WHERE product_id = ? AND material_id = ? AND (size = ? OR size IS NULL OR size = '') 
           ORDER BY (is_out_stock IS NULL OR is_out_stock != '1') DESC, id ASC LIMIT 1`,
          {
            replacements: [product_id, resolvedMaterialId, size],
            type: QueryTypes.SELECT,
          }
        );
        if (matSizeMatch) {
          matchedPrice = matSizeMatch;
        } else {
          // 2. Try to match any price for this material, preferring in-stock
          const [anyMatPrice] = await sequelize.query(
            `SELECT id FROM product_prices 
             WHERE product_id = ? AND material_id = ? 
             ORDER BY (is_out_stock IS NULL OR is_out_stock != '1') DESC, id ASC LIMIT 1`,
            {
              replacements: [product_id, resolvedMaterialId],
              type: QueryTypes.SELECT,
            }
          );
          matchedPrice = anyMatPrice;
        }
      }

      if (!matchedPrice) {
        // Match by size without material
        const [genPrice] = await sequelize.query(
          `SELECT id FROM product_prices 
           WHERE product_id = ? AND (size = ? OR size IS NULL OR size = '') 
           ORDER BY (is_out_stock IS NULL OR is_out_stock != '1') DESC, id ASC LIMIT 1`,
          {
            replacements: [product_id, size],
            type: QueryTypes.SELECT,
          }
        );
        matchedPrice = genPrice;
      }

      if (matchedPrice) {
        resolvedPriceId = matchedPrice.id;
      } else {
        const [anyPrice] = await sequelize.query(
          `SELECT id FROM product_prices WHERE product_id = ? ORDER BY (is_out_stock IS NULL OR is_out_stock != '1') DESC, id ASC LIMIT 1`,
          {
            replacements: [product_id],
            type: QueryTypes.SELECT,
          }
        );
        if (anyPrice) {
          resolvedPriceId = anyPrice.id;
        } else {
          const [insertedPrice] = await sequelize.query(
            `INSERT INTO product_prices (product_id, material_id, size, actual_price, discount_price, qty, is_out_stock, created_at, updated_at)
             VALUES (?, ?, ?, 500.00, 499.00, 50, '0', NOW(), NOW())`,
            {
              replacements: [product_id, resolvedMaterialId, size],
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
    const cartItemId = req.params?.id || req.body?.cart_item_id || req.query?.cart_item_id || req.body?.id || req.query?.id;

    if (!cartItemId) {
      return res.status(400).json({ status: false, message: "cart_item_id is required" });
    }

    // 1. Deactivate by cart item primary key id
    await sequelize.query(
      `UPDATE user_cart_items SET action = '1', updated_at = NOW() WHERE id = ?`,
      {
        replacements: [cartItemId],
        type: QueryTypes.UPDATE,
      }
    );

    // 2. Also deactivate if cartItemId matched a product or price ID
    if (userId) {
      await sequelize.query(
        `UPDATE user_cart_items SET action = '1', updated_at = NOW() 
         WHERE user_id = ? AND (
           id = ? OR 
           price_id = ? OR 
           price_id IN (SELECT id FROM product_prices WHERE product_id = ?)
         )`,
        {
          replacements: [userId, cartItemId, cartItemId, cartItemId],
          type: QueryTypes.UPDATE,
        }
      );
    }

    // 3. Deactivate associated addon_cart entries
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
