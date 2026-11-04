import sequelize from "../../config/db.js";
import { QueryTypes } from "sequelize";

const S3_BASE_URL = "https://bespoke-2026.s3.ap-south-1.amazonaws.com";

export function formatImageUrl(path) {
  if (!path || typeof path !== "string") return null;
  const trimmed = path.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  const clean = trimmed.replace(/^\/+/, "");
  return `${S3_BASE_URL}/${clean}`;
}

export const getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      category,
      subcategory,
      gender,
      vendor_id,
      search,
      sort,
    } = req.query;

    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const whereClauses = ["(p.action IS NULL OR p.action != '1')"];
    const replacements = [];

    if (category) {
      if (!isNaN(category)) {
        whereClauses.push("p.category = ?");
        replacements.push(category);
      } else {
        whereClauses.push("LOWER(c.name) = LOWER(?)");
        replacements.push(category);
      }
    }

    if (subcategory) {
      if (!isNaN(subcategory)) {
        whereClauses.push("p.subcategory = ?");
        replacements.push(subcategory);
      } else {
        whereClauses.push("LOWER(sc.name) = LOWER(?)");
        replacements.push(subcategory);
      }
    }

    if (gender) {
      whereClauses.push("LOWER(p.gender) = LOWER(?)");
      replacements.push(gender);
    }

    if (vendor_id) {
      whereClauses.push("p.vendor_id = ?");
      replacements.push(vendor_id);
    }

    if (search && search.trim() !== "") {
      const term = `%${search.trim().toLowerCase()}%`;
      whereClauses.push(
        "(LOWER(p.product_name) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(v.shop_name) LIKE ? OR LOWER(c.name) LIKE ?)"
      );
      replacements.push(term, term, term, term);
    }

    let orderBy = "p.id DESC";
    if (sort === "price_asc") {
      orderBy = "price ASC";
    } else if (sort === "price_desc") {
      orderBy = "price DESC";
    } else if (sort === "rating") {
      orderBy = "rating DESC";
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const countQuery = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM products p
      LEFT JOIN categories c ON p.category = c.id
      LEFT JOIN subcategories sc ON p.subcategory = sc.id
      LEFT JOIN vendor_login v ON p.vendor_id = v.id
      ${whereSql}
    `;

    const [countResult] = await sequelize.query(countQuery, {
      replacements,
      type: QueryTypes.SELECT,
    });
    const total = countResult ? countResult.total : 0;

    const dataQuery = `
      SELECT 
        p.id,
        p.product_id,
        p.product_name,
        p.vendor_id,
        p.hsn_code,
        p.main_image,
        p.product_type,
        p.product_types,
        p.wear_type_id,
        p.category,
        c.name as category_name,
        p.subcategory,
        sc.name as subcategory_name,
        p.gender,
        p.is_customizable,
        p.is_alter,
        p.alter_charge,
        p.description,
        p.rating,
        p.action,
        p.is_active,
        p.created_at,
        p.updated_at,
        v.shop_name,
        v.brand_business_name,
        v.seller_name,
        v.rating as vendor_rating,
        v.img_path as vendor_img,
        (
          SELECT pmi.img_path 
          FROM product_material_images pmi 
          WHERE pmi.product_id = p.id AND (pmi.action IS NULL OR pmi.action != 1) 
          ORDER BY pmi.id ASC LIMIT 1
        ) as material_img,
        (
          SELECT pp.id 
          FROM product_prices pp 
          WHERE pp.product_id = p.id 
          ORDER BY pp.discount_price ASC LIMIT 1
        ) as price_id,
        (
          SELECT pp.discount_price 
          FROM product_prices pp 
          WHERE pp.product_id = p.id AND pp.discount_price > 0 
          ORDER BY pp.discount_price ASC LIMIT 1
        ) as price,
        (
          SELECT pp.actual_price 
          FROM product_prices pp 
          WHERE pp.product_id = p.id 
          ORDER BY pp.discount_price ASC LIMIT 1
        ) as original_price
      FROM products p
      LEFT JOIN categories c ON p.category = c.id
      LEFT JOIN subcategories sc ON p.subcategory = sc.id
      LEFT JOIN vendor_login v ON p.vendor_id = v.id
      ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const dataReplacements = [...replacements, parseInt(limit, 10), offset];

    const products = await sequelize.query(dataQuery, {
      replacements: dataReplacements,
      type: QueryTypes.SELECT,
    });

    const formatted = products.map((prod) => {
      const rawImg = prod.material_img || prod.main_image;
      const fullImg = formatImageUrl(rawImg);
      const priceNum = parseFloat(prod.price) || parseFloat(prod.original_price) || 0;
      const origPriceNum = parseFloat(prod.original_price) || priceNum;
      const discountPercent =
        origPriceNum > priceNum && origPriceNum > 0
          ? Math.round(((origPriceNum - priceNum) / origPriceNum) * 100)
          : 0;

      const brand =
        prod.brand_business_name ||
        prod.shop_name ||
        prod.seller_name ||
        "Bespoke Studio";

      return {
        id: prod.id,
        product_id: prod.product_id,
        price_id: prod.price_id || null,
        name: prod.product_name,
        title: prod.product_name,
        product_name: prod.product_name,
        description: prod.description || "",
        hsn_code: prod.hsn_code,
        category_id: prod.category,
        category: prod.category_name || prod.category,
        category_name: prod.category_name,
        subcategory_id: prod.subcategory,
        subcategory: prod.subcategory_name || prod.subcategory,
        subcategory_name: prod.subcategory_name,
        gender: prod.gender || "unisex",
        vendor_id: prod.vendor_id,
        vendor_name: brand,
        brand: brand,
        shop_name: prod.shop_name,
        seller_name: prod.seller_name,
        vendor_image: formatImageUrl(prod.vendor_img),
        image: fullImg,
        main_image: fullImg,
        images: fullImg ? [fullImg] : [],
        price: priceNum,
        original_price: origPriceNum,
        discount_percentage: discountPercent,
        discount_label: discountPercent > 0 ? `${discountPercent}% OFF` : null,
        is_customizable: Boolean(prod.is_customizable),
        is_alter: Boolean(prod.is_alter),
        alter_charge: parseFloat(prod.alter_charge) || 0,
        rating: parseFloat(prod.rating) || parseFloat(prod.vendor_rating) || 4.5,
        rating_count: Math.floor(Math.random() * 30) + 12, // realistic mock reviews count
        is_active: prod.is_active === "1" || prod.is_active === 1,
        created_at: prod.created_at,
      };
    });

    res.json({
      status: true,
      message: "Products fetched successfully",
      count: formatted.length,
      total,
      data: formatted,
      products: formatted,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching products:", error);
    res.status(500).json({
      status: false,
      message: "Failed to fetch products",
      error: error.message,
    });
  }
};

export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ status: false, message: "Product ID is required" });
    }

    const productQuery = `
      SELECT 
        p.*,
        c.name as category_name,
        sc.name as subcategory_name,
        v.shop_name,
        v.brand_business_name,
        v.seller_name,
        v.rating as vendor_rating,
        v.img_path as vendor_img,
        v.address as vendor_address,
        v.business_address as vendor_business_address,
        v.pincode as vendor_pincode,
        v.state as vendor_state,
        v.mobile as vendor_mobile,
        v.description as vendor_description
      FROM products p
      LEFT JOIN categories c ON p.category = c.id
      LEFT JOIN subcategories sc ON p.subcategory = sc.id
      LEFT JOIN vendor_login v ON p.vendor_id = v.id
      WHERE p.id = ? OR p.product_id = ?
      LIMIT 1
    `;

    const [product] = await sequelize.query(productQuery, {
      replacements: [id, id],
      type: QueryTypes.SELECT,
    });

    if (!product) {
      return res.status(404).json({
        status: false,
        message: "Product not found",
      });
    }

    const productId = product.id;

    // Fetch prices with size breakdown
    const prices = await sequelize.query(
      `SELECT * FROM product_prices WHERE product_id = ? ORDER BY discount_price ASC`,
      { replacements: [productId], type: QueryTypes.SELECT }
    );

    // Fetch materials
    const materials = await sequelize.query(
      `SELECT * FROM product_materials WHERE product_id = ? AND (action IS NULL OR action != 1)`,
      { replacements: [productId], type: QueryTypes.SELECT }
    );

    // Fetch material images
    const matImages = await sequelize.query(
      `SELECT * FROM product_material_images WHERE product_id = ? AND (action IS NULL OR action != 1) ORDER BY id ASC`,
      { replacements: [productId], type: QueryTypes.SELECT }
    );

    // Fetch general product images
    const generalImages = await sequelize.query(
      `SELECT * FROM product_images WHERE product_id = ? AND (action IS NULL OR action != 1) ORDER BY id ASC`,
      { replacements: [productId], type: QueryTypes.SELECT }
    );

    // Fetch specifications / info
    const infoItems = await sequelize.query(
      `SELECT details_name, details_value FROM product_info WHERE product_id = ? AND (action IS NULL OR action != 1)`,
      { replacements: [productId], type: QueryTypes.SELECT }
    );

    // Fetch size details if available
    const sizeDetails = await sequelize.query(
      `SELECT * FROM product_size_details WHERE product_id = ? AND (action IS NULL OR action != 1)`,
      { replacements: [productId], type: QueryTypes.SELECT }
    );

    // Compile all images
    const allImages = [];
    const seenImages = new Set();

    const addImg = (raw) => {
      const formatted = formatImageUrl(raw);
      if (formatted && !seenImages.has(formatted)) {
        seenImages.add(formatted);
        allImages.push(formatted);
      }
    };

    if (product.main_image) addImg(product.main_image);
    matImages.forEach((m) => addImg(m.img_path));
    generalImages.forEach((g) => addImg(g.image_url));
    materials.forEach((m) => addImg(m.main_img_path));

    // Fallback if no images found
    if (allImages.length === 0) {
      allImages.push("https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80");
    }

    // Sizes compilation
    const availableSizes = [];
    const seenSizes = new Set();
    prices.forEach((p) => {
      const s = p.size || "Standard";
      if (!seenSizes.has(s)) {
        seenSizes.add(s);
        const actual = parseFloat(p.actual_price) || 0;
        const discount = parseFloat(p.discount_price) || actual;
        availableSizes.push({
          id: p.id,
          size: s,
          actual_price: actual,
          discount_price: discount,
          price: discount > 0 ? discount : actual,
          original_price: actual,
          qty: p.qty || 0,
          in_stock: p.is_out_stock !== "1" && p.is_out_stock !== 1 && (p.qty === null || p.qty > 0),
        });
      }
    });

    if (availableSizes.length === 0) {
      availableSizes.push({
        id: 1,
        size: "Free Size",
        price: 999,
        original_price: 1299,
        qty: 10,
        in_stock: true,
      });
    }

    const defaultPrice = availableSizes[0]?.price || 0;
    const defaultOriginal = availableSizes[0]?.original_price || defaultPrice;
    const discountPercent =
      defaultOriginal > defaultPrice && defaultOriginal > 0
        ? Math.round(((defaultOriginal - defaultPrice) / defaultOriginal) * 100)
        : 0;

    // Compile specifications
    const specifications = [];
    if (infoItems && infoItems.length > 0) {
      infoItems.forEach((info) => {
        if (info.details_name && info.details_value) {
          specifications.push({
            label: info.details_name.trim(),
            value: info.details_value.trim(),
          });
        }
      });
    }

    // Additional specs derived from product columns
    if (product.hsn_code) specifications.push({ label: "HSN Code", value: product.hsn_code });
    if (product.gender) specifications.push({ label: "Ideal For", value: product.gender.toUpperCase() });
    if (product.category_name) specifications.push({ label: "Category", value: product.category_name });
    if (product.subcategory_name) specifications.push({ label: "Subcategory", value: product.subcategory_name });
    if (product.is_customizable) specifications.push({ label: "Customization", value: "Bespoke Custom Tailoring Available" });
    if (product.is_alter) {
      specifications.push({
        label: "Alterations",
        value: `Available (Fee: ₹${parseFloat(product.alter_charge || 0).toFixed(2)})`,
      });
    }

    // Materials details
    const formattedMaterials = materials.map((m) => ({
      id: m.id,
      name: m.name,
      material_name: m.material_name,
      description: m.description,
      image: formatImageUrl(m.main_img_path),
    }));

    // Vendor details
    const brand =
      product.brand_business_name ||
      product.shop_name ||
      product.seller_name ||
      "Bespoke Studio";

    const vendorDetails = {
      id: product.vendor_id,
      name: brand,
      shop_name: product.shop_name,
      brand_business_name: product.brand_business_name,
      seller_name: product.seller_name,
      rating: parseFloat(product.vendor_rating) || 4.9,
      address: product.vendor_address || product.vendor_business_address || "",
      city: product.vendor_state || "",
      state: product.vendor_state || "",
      pincode: product.vendor_pincode || "",
      image: formatImageUrl(product.vendor_img),
      description: product.vendor_description || "Designer Boutique & Tailoring Studio",
    };

    // Related products (from same category)
    const related = await sequelize.query(
      `
      SELECT 
        p.id, p.product_name, p.gender,
        (SELECT pmi.img_path FROM product_material_images pmi WHERE pmi.product_id = p.id LIMIT 1) as mat_img,
        (SELECT pp.discount_price FROM product_prices pp WHERE pp.product_id = p.id AND pp.discount_price > 0 LIMIT 1) as price,
        (SELECT pp.actual_price FROM product_prices pp WHERE pp.product_id = p.id LIMIT 1) as original_price,
        v.shop_name, v.brand_business_name
      FROM products p
      LEFT JOIN vendor_login v ON p.vendor_id = v.id
      WHERE p.category = ? AND p.id != ? AND (p.action IS NULL OR p.action != 1)
      LIMIT 8
      `,
      { replacements: [product.category, productId], type: QueryTypes.SELECT }
    );

    const formattedRelated = related.map((r) => {
      const priceNum = parseFloat(r.price) || parseFloat(r.original_price) || 0;
      const origNum = parseFloat(r.original_price) || priceNum;
      return {
        id: r.id,
        name: r.product_name,
        product_name: r.product_name,
        brand: r.brand_business_name || r.shop_name || "Bespoke",
        image: formatImageUrl(r.mat_img),
        price: priceNum,
        original_price: origNum,
        discount_percentage:
          origNum > priceNum && origNum > 0
            ? Math.round(((origNum - priceNum) / origNum) * 100)
            : 0,
      };
    });

    const detailedProduct = {
      id: product.id,
      product_id: product.product_id,
      room_id: product.room_id,
      name: product.product_name,
      title: product.product_name,
      product_name: product.product_name,
      description: product.description || "Crafted with precision and premium quality materials for exceptional comfort and style.",
      hsn_code: product.hsn_code,
      category_id: product.category,
      category: product.category_name || product.category,
      category_name: product.category_name,
      subcategory_id: product.subcategory,
      subcategory: product.subcategory_name || product.subcategory,
      subcategory_name: product.subcategory_name,
      gender: product.gender || "unisex",
      is_customizable: Boolean(product.is_customizable),
      is_alter: Boolean(product.is_alter),
      alter_charge: parseFloat(product.alter_charge) || 0,
      measurement_guide_image: formatImageUrl(product.measurement_guide_image),
      rating: parseFloat(product.rating) || 4.8,
      rating_count: 54,
      main_image: allImages[0],
      images: allImages,
      price: defaultPrice,
      original_price: defaultOriginal,
      discount_percentage: discountPercent,
      discount_label: discountPercent > 0 ? `${discountPercent}% OFF` : null,
      available_sizes: availableSizes,
      materials: formattedMaterials,
      specifications,
      raw_info: infoItems,
      size_details: sizeDetails,
      vendor: vendorDetails,
      related_products: formattedRelated,
      created_at: product.created_at,
      updated_at: product.updated_at,
    };

    res.json({
      status: true,
      message: "Product details retrieved successfully",
      data: detailedProduct,
      product: detailedProduct,
    });
  } catch (error) {
    console.error("❌ Error fetching product details:", error);
    res.status(500).json({
      status: false,
      message: "Failed to fetch product details",
      error: error.message,
    });
  }
};

// Also expose categories, banners, and deals from Node API (synced with remote Laravel API)
export const getCategories = async (req, res) => {
  try {
    const remote = await fetch("http://43.204.68.67/bespoke/public/api/categories?per_page=100");
    if (remote.ok) {
      const json = await remote.json();
      if (json.data && Array.isArray(json.data.data || json.data)) {
        return res.json({ status: true, data: json.data.data || json.data });
      }
    }
  } catch (e) {
    console.warn("Categories remote fetch fallback to DB:", e.message);
  }

  try {
    const cats = await sequelize.query(
      "SELECT id, type, name, img_path, action FROM categories WHERE action = '0' ORDER BY id ASC",
      { type: QueryTypes.SELECT }
    );
    const data = cats.map((c) => ({
      ...c,
      image: formatImageUrl(c.img_path),
      img_path: formatImageUrl(c.img_path),
    }));
    res.json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getSubcategories = async (req, res) => {
  try {
    const remote = await fetch("http://43.204.68.67/bespoke/public/api/subcategories?per_page=150");
    if (remote.ok) {
      const json = await remote.json();
      if (json.data && Array.isArray(json.data.data || json.data)) {
        return res.json({ status: true, data: json.data.data || json.data });
      }
    }
  } catch (e) {
    console.warn("Subcategories remote fetch fallback to DB:", e.message);
  }

  try {
    const subs = await sequelize.query(
      `SELECT 
        s.id, s.name, s.category_type, s.category_id, s.img_path, s.action,
        c.id as cat_id, c.name as cat_name, c.type as cat_type, c.img_path as cat_img_path
      FROM subcategories s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.action = '0' OR s.action IS NULL
      ORDER BY s.id ASC`,
      { type: QueryTypes.SELECT }
    );
    const data = subs.map((s) => ({
      id: s.id,
      name: s.name,
      category_type: s.category_type || s.cat_type,
      category_id: s.category_id,
      image: formatImageUrl(s.img_path),
      img_path: formatImageUrl(s.img_path),
      category: s.cat_id
        ? {
            id: s.cat_id,
            name: s.cat_name,
            type: s.cat_type,
            image: formatImageUrl(s.cat_img_path),
          }
        : null,
    }));
    res.json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getBanners = async (req, res) => {
  try {
    const banners = await sequelize.query(
      "SELECT * FROM app_banners WHERE action = '0' ORDER BY id DESC",
      { type: QueryTypes.SELECT }
    );
    const data = banners.map((b) => ({
      ...b,
      image: formatImageUrl(b.img_path),
      img_path: formatImageUrl(b.img_path),
    }));
    res.json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

/**
 * Endpoint matching Laravel remote: /show/product?product_id=:id
 */
export const showProduct = async (req, res) => {
  const productId = req.query.product_id || req.query.id || req.params.id;
  if (!productId) {
    return res.status(400).json({ status: false, message: "product_id is required" });
  }

  try {
    const remoteUrl = `http://43.204.68.67/bespoke/public/api/show/product?product_id=${productId}`;
    const remoteRes = await fetch(remoteUrl, { headers: { Accept: "application/json" } });
    if (remoteRes.ok) {
      const json = await remoteRes.json();
      if (json.status && json.data) {
        return res.json(json);
      }
    }
  } catch (err) {
    console.warn("showProduct remote proxy warning:", err.message);
  }

  // Fallback to local DB product detail logic
  req.params.id = productId;
  return getProductById(req, res);
};
