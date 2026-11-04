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

// 1. Get user's active wishlist items from `user_favourites`
export const getWishlist = async (req, res) => {
  try {
    const userId = req.query.user_id || req.query.userId || req.body?.user_id;
    if (!userId) {
      return res.json({ status: true, data: [], count: 0 });
    }

    const items = await sequelize.query(
      `SELECT 
        f.id AS wishlist_id,
        COALESCE(f.product_id, pp.product_id) AS product_id,
        f.price_id,
        f.user_id,
        f.size,
        f.action,
        f.c_date,
        f.created_at,
        COALESCE(f.product_id, pp.product_id, p.id) AS id,
        COALESCE(p.product_name, 'Bespoke Item') AS product_name,
        COALESCE(p.product_name, 'Bespoke Item') AS title,
        COALESCE(
          NULLIF(p.main_image, ''),
          (SELECT pmi.img_path FROM product_material_images pmi 
           WHERE pmi.product_id = COALESCE(f.product_id, pp.product_id, p.id) 
             AND pmi.img_path IS NOT NULL AND pmi.img_path != '' 
           ORDER BY pmi.id ASC LIMIT 1),
          (SELECT pm.main_img_path FROM product_materials pm 
           WHERE pm.product_id = COALESCE(f.product_id, pp.product_id, p.id) 
             AND pm.main_img_path IS NOT NULL AND pm.main_img_path != '' 
           ORDER BY pm.id ASC LIMIT 1),
          ''
        ) AS image_path,
        COALESCE(pp.discount_price, pp.actual_price, 499) AS price,
        pp.actual_price,
        pp.discount_price,
        COALESCE(p.rating, '4.5') AS rating,
        p.category,
        p.subcategory,
        p.vendor_id,
        COALESCE(v.shop_name, v.username, 'Bespoke Atelier') AS vendor
       FROM user_favourites f
       LEFT JOIN product_prices pp ON f.price_id = pp.id
       LEFT JOIN products p ON (f.product_id = p.id OR pp.product_id = p.id)
       LEFT JOIN vendor_login v ON p.vendor_id = v.id
       WHERE f.user_id = ? AND f.action = '0'
       ORDER BY f.id DESC`,
      {
        replacements: [userId],
        type: QueryTypes.SELECT,
      }
    );

    const formatted = items
      .filter((item) => item.product_id)
      .map((item) => ({
        ...item,
        id: Number(item.product_id || item.id),
        product_id: Number(item.product_id || item.id),
        image:
          formatImageUrl(item.image_path) ||
          "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=600&q=80",
        price: parseFloat(item.price || 499),
        actual_price: parseFloat(item.actual_price || item.price || 499),
        discount_price: parseFloat(item.discount_price || item.price || 499),
      }));

    return res.json({
      status: true,
      data: formatted,
      count: formatted.length,
    });
  } catch (error) {
    console.error("❌ Wishlist fetch error from user_favourites:", error);
    return res.status(500).json({ status: false, message: error.message, data: [] });
  }
};

// 2. Get active wishlist product IDs from `user_favourites`
export const getWishlistIds = async (req, res) => {
  try {
    const userId = req.query.user_id || req.query.userId;
    if (!userId) {
      return res.json({ status: true, data: [] });
    }

    const rows = await sequelize.query(
      `SELECT DISTINCT COALESCE(f.product_id, pp.product_id) AS product_id
       FROM user_favourites f
       LEFT JOIN product_prices pp ON f.price_id = pp.id
       WHERE f.user_id = ? AND f.action = '0' AND COALESCE(f.product_id, pp.product_id) IS NOT NULL`,
      {
        replacements: [userId],
        type: QueryTypes.SELECT,
      }
    );

    const ids = rows.map((r) => Number(r.product_id)).filter((id) => id > 0);
    return res.json({ status: true, data: ids });
  } catch (error) {
    console.error("❌ Wishlist IDs error from user_favourites:", error);
    return res.status(500).json({ status: false, data: [] });
  }
};

// 3. Toggle product in Wishlist (Add or Remove)
export const toggleWishlist = async (req, res) => {
  try {
    const { user_id, product_id, price_id, size } = req.body;
    if (!user_id || !product_id) {
      return res.status(400).json({
        status: false,
        message: "user_id and product_id are required.",
      });
    }

    // Check if entry already exists in user_favourites
    const [existing] = await sequelize.query(
      `SELECT id, action FROM user_favourites 
       WHERE user_id = ? AND product_id = ? 
       ORDER BY id DESC LIMIT 1`,
      {
        replacements: [user_id, product_id],
        type: QueryTypes.SELECT,
      }
    );

    let isFavorited = false;

    // Resolve non-null price_id
    let resolvedPriceId = price_id;
    if (!resolvedPriceId && product_id) {
      const [matchedPrice] = await sequelize.query(
        `SELECT id FROM product_prices WHERE product_id = ? ORDER BY id ASC LIMIT 1`,
        {
          replacements: [product_id],
          type: QueryTypes.SELECT,
        }
      );
      resolvedPriceId = matchedPrice ? matchedPrice.id : 0;
    }

    if (existing) {
      // Toggle action: if '0' -> set '1' (remove), if '1' -> set '0' (re-add)
      const newAction = existing.action === "0" ? "1" : "0";
      await sequelize.query(
        `UPDATE user_favourites 
         SET action = ?, updated_at = NOW() 
         WHERE id = ?`,
        {
          replacements: [newAction, existing.id],
          type: QueryTypes.UPDATE,
        }
      );
      isFavorited = newAction === "0";
    } else {
      // Create new favourite entry
      await sequelize.query(
        `INSERT INTO user_favourites (user_id, product_id, price_id, size, action, c_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, '0', NOW(), NOW(), NOW())`,
        {
          replacements: [user_id, product_id, resolvedPriceId || 0, size || null],
          type: QueryTypes.INSERT,
        }
      );
      isFavorited = true;
    }

    // Get current total wishlist count
    const [countRow] = await sequelize.query(
      `SELECT COUNT(*) as total FROM user_favourites WHERE user_id = ? AND action = '0'`,
      {
        replacements: [user_id],
        type: QueryTypes.SELECT,
      }
    );

    const wishlistCount = countRow ? Number(countRow.total) : 0;

    console.log(`❤️ [Wishlist] Product #${product_id} toggled for user #${user_id}: ${isFavorited ? 'Added' : 'Removed'}`);

    return res.json({
      status: true,
      isFavorited,
      wishlistCount,
      message: isFavorited
        ? "Item added to your Wishlist!"
        : "Item removed from your Wishlist.",
    });
  } catch (error) {
    console.error("❌ Toggle wishlist error:", error);
    return res.status(500).json({ status: false, message: error.message });
  }
};

// 4. Remove item from Wishlist
export const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.body?.user_id || req.query?.user_id || req.body?.userId || req.query?.userId;
    const productId = req.body?.product_id || req.query?.product_id || req.body?.productId || req.query?.productId;

    if (!productId) {
      return res.status(400).json({ status: false, message: "product_id is required" });
    }

    if (userId) {
      await sequelize.query(
        `UPDATE user_favourites SET action = '1', updated_at = NOW() 
         WHERE user_id = ? AND product_id = ?`,
        {
          replacements: [userId, productId],
          type: QueryTypes.UPDATE,
        }
      );
    } else {
      await sequelize.query(
        `UPDATE user_favourites SET action = '1', updated_at = NOW() 
         WHERE product_id = ?`,
        {
          replacements: [productId],
          type: QueryTypes.UPDATE,
        }
      );
    }

    return res.json({
      status: true,
      message: "Item removed from Wishlist.",
    });
  } catch (error) {
    console.error("❌ Remove wishlist error:", error);
    return res.status(500).json({ status: false, message: error.message });
  }
};
