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
      category: rawCategory,
      category_id,
      subcategory: rawSubcategory,
      subcategory_id,
      gender,
      vendor_id,
      search,
      sort,
    } = req.query;

    const category = rawCategory || category_id;
    const subcategory = rawSubcategory || subcategory_id;

    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const whereClauses = [
      "(p.action IS NULL OR p.action != '1')",
      "(p.is_active IS NULL OR p.is_active != '0')",
      `EXISTS (
        SELECT 1 FROM product_materials pm 
        WHERE pm.product_id = p.id 
          AND pm.is_active = '1' 
          AND (pm.action IS NULL OR pm.action = '0' OR pm.action != '1')
      )`,
    ];
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
          WHERE pmi.product_id = p.id AND (pmi.action IS NULL OR pmi.action != '1') 
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

    // Fetch all sizes and materials for these products to power dynamic filtering
    const productIds = products.map((p) => p.id);
    const sizeMap = {};
    const materialMap = {};

    if (productIds.length > 0) {
      try {
        const [allPrices] = await sequelize.query(
          `SELECT DISTINCT product_id, size FROM product_prices WHERE product_id IN (?) AND size IS NOT NULL AND size != ''`,
          { replacements: [productIds] }
        );
        allPrices.forEach((row) => {
          if (!sizeMap[row.product_id]) sizeMap[row.product_id] = [];
          if (!sizeMap[row.product_id].includes(row.size)) {
            sizeMap[row.product_id].push(row.size);
          }
        });

        const [allMaterials] = await sequelize.query(
          `SELECT pm.id, pm.product_id, pm.name, pm.material_name, pm.description, pm.main_img_path,
                  (SELECT pmi.img_path FROM product_material_images pmi WHERE pmi.product_material_id = pm.id AND (pmi.action IS NULL OR pmi.action != '1') LIMIT 1) as mat_image,
                  (SELECT pp.discount_price FROM product_prices pp WHERE pp.material_id = pm.id AND pp.discount_price > 0 LIMIT 1) as discount_price,
                  (SELECT pp.actual_price FROM product_prices pp WHERE pp.material_id = pm.id LIMIT 1) as actual_price
           FROM product_materials pm
           WHERE pm.product_id IN (?) AND (pm.action IS NULL OR pm.action != '1') AND pm.is_active = '1'
           ORDER BY pm.id ASC`,
          { replacements: [productIds] }
        );

        const [allPricesWithMat] = await sequelize.query(
          `SELECT pp.id, pp.material_id, pp.product_id, pp.size, pp.discount_price, pp.actual_price, pp.is_out_stock, pp.qty,
                  COALESCE(pp.gst_id, 10) AS gst_id,
                  COALESCE(gm.gst_name, 'IGST 18%') AS gst_name,
                  COALESCE(gm.rate, 'IGST 18%') AS gst_rate,
                  CAST(COALESCE(gm.gst_percentage, 18) AS DECIMAL(5,2)) AS gst_percentage
           FROM product_prices pp
           LEFT JOIN gst_masters gm ON COALESCE(pp.gst_id, 10) = gm.id AND (gm.action IS NULL OR gm.action != '1')
           WHERE pp.product_id IN (?)`,
          { replacements: [productIds] }
        );

        allMaterials.forEach((row) => {
          if (!materialMap[row.product_id]) materialMap[row.product_id] = [];
          const mSizes = [];
          let bestDisc = parseFloat(row.discount_price) || 0;
          let bestAct = parseFloat(row.actual_price) || 0;
          let bestPriceId = null;
          let bestGstId = null;
          let bestGstName = null;
          let bestGstPct = 0;
          let bestGstRate = null;

          const matPrices = allPricesWithMat.filter((mp) => mp.material_id === row.id);
          const inStockPrices = matPrices.filter((mp) => mp.is_out_stock !== "1" && mp.is_out_stock !== 1);
          const eligiblePrices = inStockPrices.length > 0 ? inStockPrices : matPrices;

          eligiblePrices.forEach((mp) => {
            if (mp.size && !mSizes.includes(mp.size)) mSizes.push(mp.size);
            const d = parseFloat(mp.discount_price) || 0;
            const a = parseFloat(mp.actual_price) || 0;
            if (!bestPriceId) {
              bestPriceId = mp.id;
              bestGstId = mp.gst_id;
              bestGstName = mp.gst_name;
              bestGstPct = parseFloat(mp.gst_percentage || 0);
              bestGstRate = mp.gst_rate;
            }
            if (d > 0 && (bestDisc === 0 || d < bestDisc)) {
              bestDisc = d;
              bestPriceId = mp.id;
              bestGstId = mp.gst_id;
              bestGstName = mp.gst_name;
              bestGstPct = parseFloat(mp.gst_percentage || 0);
              bestGstRate = mp.gst_rate;
            }
            if (a > 0 && (bestAct === 0 || a < bestAct)) {
              bestAct = a;
              if (!bestPriceId) {
                bestPriceId = mp.id;
                bestGstId = mp.gst_id;
                bestGstName = mp.gst_name;
                bestGstPct = parseFloat(mp.gst_percentage || 0);
                bestGstRate = mp.gst_rate;
              }
            }
          });

          if (!bestPriceId && matPrices.length > 0) {
            bestPriceId = matPrices[0].id;
            bestGstId = matPrices[0].gst_id;
            bestGstName = matPrices[0].gst_name;
            bestGstPct = parseFloat(matPrices[0].gst_percentage || 0);
            bestGstRate = matPrices[0].gst_rate;
          }

          materialMap[row.product_id].push({
            id: row.id,
            material_id: row.id,
            price_id: bestPriceId,
            gst_id: bestGstId ? Number(bestGstId) : null,
            gst_name: bestGstName,
            gst_percentage: bestGstPct,
            gst_rate: bestGstRate,
            product_id: row.product_id,
            name: row.name || "",
            material_name: row.material_name || "",
            description: row.description || "",
            image: formatImageUrl(row.mat_image || row.main_img_path),
            price: bestDisc > 0 ? bestDisc : bestAct,
            original_price: bestAct > 0 ? bestAct : bestDisc,
            sizes: mSizes,
          });
        });
      } catch (err) {
        console.warn("Could not fetch auxiliary product sizes/materials:", err.message);
      }
    }

    const KNOWN_FABRICS = [
      "cotton", "silk", "polyester", "linen", "georgette", "chiffon", "rayon",
      "velvet", "satin", "tulle", "wool", "denim", "organza", "crepe"
    ];
    const KNOWN_COLORS = [
      "black", "white", "red", "blue", "green", "yellow", "pink", "maroon",
      "grey", "purple", "orange", "gold", "silver", "beige", "brown", "navy"
    ];

    const expandedFormatted = [];

    products.forEach((prod) => {
      const rawImg = prod.material_img || prod.main_image;
      const fullImg = formatImageUrl(rawImg);
      const priceNum = parseFloat(prod.price) || parseFloat(prod.original_price) || 0;
      const origPriceNum = parseFloat(prod.original_price) || priceNum;
      const discountPercent =
        origPriceNum > priceNum && origPriceNum > 0
          ? Math.round(((origPriceNum - priceNum) / origPriceNum) * 100)
          : 0;

      const brand =
        prod.shop_name ||
        prod.seller_name ||
        prod.brand_business_name ||
        "Bespoke Studio";

      const pMats = materialMap[prod.id] || [];
      const pSizes = sizeMap[prod.id] || [];
      const allText = `${prod.product_name || ""} ${prod.description || ""} ${pMats.map(m => `${m.name || ""} ${m.material_name || ""}`).join(" ")}`.toLowerCase();

      // Extract fabrics
      const fabrics = [];
      pMats.forEach(m => {
        const n = (m.name || "").trim();
        const mn = (m.material_name || "").trim();
        KNOWN_FABRICS.forEach(f => {
          if (n.toLowerCase().includes(f) || mn.toLowerCase().includes(f)) {
            const cap = f.charAt(0).toUpperCase() + f.slice(1);
            if (!fabrics.includes(cap)) fabrics.push(cap);
          }
        });
      });
      KNOWN_FABRICS.forEach(f => {
        if (allText.includes(f)) {
          const cap = f.charAt(0).toUpperCase() + f.slice(1);
          if (!fabrics.includes(cap)) fabrics.push(cap);
        }
      });
      if (fabrics.length === 0) fabrics.push("Cotton");

      // Extract colors
      const colors = [];
      pMats.forEach(m => {
        const n = (m.name || "").trim();
        const mn = (m.material_name || "").trim();
        KNOWN_COLORS.forEach(c => {
          if (n.toLowerCase().includes(c) || mn.toLowerCase().includes(c)) {
            const cap = c.charAt(0).toUpperCase() + c.slice(1);
            if (!colors.includes(cap)) colors.push(cap);
          }
        });
      });
      KNOWN_COLORS.forEach(c => {
        if (allText.includes(c)) {
          const cap = c.charAt(0).toUpperCase() + c.slice(1);
          if (!colors.includes(cap)) colors.push(cap);
        }
      });
      if (colors.length === 0) colors.push("Multicolor");

      // Extract occasions
      const occasions = [];
      const catLower = (prod.category_name || prod.category || "").toLowerCase();
      const subcatLower = (prod.subcategory_name || prod.subcategory || "").toLowerCase();
      if (allText.includes("wedding") || catLower.includes("wedding") || catLower.includes("banarasi")) {
        occasions.push("Wedding");
      }
      if (allText.includes("festival") || allText.includes("festive") || catLower.includes("traditional") || catLower.includes("fusion")) {
        occasions.push("Festive");
      }
      if (allText.includes("party") || allText.includes("evening") || allText.includes("celebration")) {
        occasions.push("Party");
      }
      if (allText.includes("formal") || allText.includes("boardroom") || allText.includes("office") || catLower.includes("formal")) {
        occasions.push("Formal");
      }
      if (allText.includes("casual") || catLower.includes("casual") || subcatLower.includes("t shirt") || catLower.includes("jeans") || occasions.length === 0) {
        occasions.push("Casual");
      }

      const baseProd = {
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
        gender: prod.gender || (catLower.includes("mens") || catLower.includes("men") ? "male" : catLower.includes("girls") || catLower.includes("kids") ? "kids" : "unisex"),
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
        sizes: pSizes,
        fabrics: fabrics,
        fabric: fabrics[0] || "Cotton",
        colors: colors,
        color: colors[0] || "Multicolor",
        occasions: occasions,
        occasion: occasions[0] || "Casual",
        materials: pMats,
        product_materials: pMats,
      };

      if (pMats.length > 0) {
        // Expand each variant/material as a separate item in the list
        pMats.forEach((mat, mIdx) => {
          const n = (mat.name || "").trim();
          const mn = (mat.material_name || "").trim();
          let variantName = mn;
          if (!isNaN(mn) && isNaN(n) && n.length > 0) variantName = n;
          else if (!isNaN(n) && isNaN(mn) && mn.length > 0) variantName = mn;
          else if (KNOWN_COLORS.some(c => mn.toLowerCase().includes(c))) variantName = mn;
          else if (KNOWN_COLORS.some(c => n.toLowerCase().includes(c))) variantName = n;
          else if (KNOWN_FABRICS.some(f => mn.toLowerCase().includes(f))) variantName = mn;
          else if (KNOWN_FABRICS.some(f => n.toLowerCase().includes(f))) variantName = n;
          else if (mn && mn.toLowerCase() !== "ready" && mn.toLowerCase() !== "test") variantName = mn;
          else if (n && n.toLowerCase() !== "test") variantName = n;
          else variantName = mn || n || "";

          const variantImg = mat.image || fullImg;
          const variantPrice = mat.price > 0 ? mat.price : priceNum;
          const variantOrig = mat.original_price > 0 ? mat.original_price : origPriceNum;
          const variantDiscount =
            variantOrig > variantPrice && variantOrig > 0
              ? Math.round(((variantOrig - variantPrice) / variantOrig) * 100)
              : discountPercent;

          const displayTitle =
            (pMats.length > 1 && variantName && !prod.product_name.toLowerCase().includes(variantName.toLowerCase()))
              ? `${prod.product_name} - ${variantName}`
              : prod.product_name;

          // Variant specific fabrics & colors
          const variantFabrics = [];
          KNOWN_FABRICS.forEach((f) => {
            if (
              mat.name.toLowerCase().includes(f) ||
              mat.material_name.toLowerCase().includes(f)
            ) {
              const cap = f.charAt(0).toUpperCase() + f.slice(1);
              if (!variantFabrics.includes(cap)) variantFabrics.push(cap);
            }
          });
          if (variantFabrics.length === 0) variantFabrics.push(...fabrics);

          const variantColors = [];
          KNOWN_COLORS.forEach((c) => {
            if (
              mat.name.toLowerCase().includes(c) ||
              mat.material_name.toLowerCase().includes(c)
            ) {
              const cap = c.charAt(0).toUpperCase() + c.slice(1);
              if (!variantColors.includes(cap)) variantColors.push(cap);
            }
          });
          if (variantColors.length === 0 && variantName) {
            variantColors.push(variantName);
          }
          if (variantColors.length === 0) variantColors.push(...colors);

          expandedFormatted.push({
            ...baseProd,
            unique_id: `${prod.id}-${mat.id}`,
            variant_id: mat.id,
            material_id: mat.id,
            selectedMaterialId: mat.id,
            selectedMaterialIdx: mIdx,
            price_id: mat.price_id || baseProd.price_id,
            priceId: mat.price_id || baseProd.price_id,
            title: displayTitle,
            name: displayTitle,
            variant_name: variantName,
            material_name: mat.material_name || "",
            image: variantImg,
            main_image: variantImg,
            images: [variantImg],
            price: variantPrice,
            original_price: variantOrig,
            discount_percentage: variantDiscount,
            discount_label: variantDiscount > 0 ? `${variantDiscount}% OFF` : null,
            gst_id: mat.gst_id ? Number(mat.gst_id) : (baseProd.gst_id ? Number(baseProd.gst_id) : null),
            gst_name: mat.gst_name || null,
            gst_percentage: parseFloat(mat.gst_percentage || 0),
            gst_rate: mat.gst_rate || null,
            sizes: mat.sizes?.length > 0 ? mat.sizes : pSizes,
            fabrics: variantFabrics,
            fabric: variantFabrics[0] || "Cotton",
            colors: variantColors,
            color: variantColors[0] || "Multicolor",
          });
        });
      } else {
        expandedFormatted.push({
          ...baseProd,
          unique_id: String(prod.id),
        });
      }
    });

    res.json({
      status: true,
      message: "Products fetched successfully",
      count: expandedFormatted.length,
      total: expandedFormatted.length,
      data: expandedFormatted,
      products: expandedFormatted,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: expandedFormatted.length,
        totalPages: Math.ceil(expandedFormatted.length / parseInt(limit, 10)),
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

    if (!product || product.action === '1' || product.is_active === '0') {
      return res.status(404).json({
        status: false,
        message: "Product not found or is currently inactive",
      });
    }

    const productId = product.id;

    // Check if product has at least one active material in product_materials (is_active = '1')
    const [activeMatCheck] = await sequelize.query(
      `SELECT id FROM product_materials WHERE product_id = ? AND is_active = '1' AND (action IS NULL OR action = '0' OR action != '1') LIMIT 1`,
      { replacements: [productId], type: QueryTypes.SELECT }
    );

    if (!activeMatCheck) {
      return res.status(404).json({
        status: false,
        message: "This product is currently inactive or out of stock",
      });
    }

    // Fetch prices with size breakdown and GST details
    const prices = await sequelize.query(
      `SELECT pp.*,
              COALESCE(pp.gst_id, 10) AS gst_id,
              COALESCE(gm.gst_name, 'IGST 18%') AS gst_name,
              COALESCE(gm.rate, 'IGST 18%') AS gst_rate,
              CAST(COALESCE(gm.gst_percentage, 18) AS DECIMAL(5,2)) AS gst_percentage
       FROM product_prices pp
       LEFT JOIN gst_masters gm ON COALESCE(pp.gst_id, 10) = gm.id AND (gm.action IS NULL OR gm.action != '1')
       WHERE pp.product_id = ? 
       ORDER BY pp.discount_price ASC`,
      { replacements: [productId], type: QueryTypes.SELECT }
    );

    // Fetch materials (only active materials where is_active = '1')
    const materials = await sequelize.query(
      `SELECT * FROM product_materials WHERE product_id = ? AND (action IS NULL OR action != '1') AND is_active = '1'`,
      { replacements: [productId], type: QueryTypes.SELECT }
    );

    // Fetch material images
    const matImages = await sequelize.query(
      `SELECT * FROM product_material_images WHERE product_id = ? AND (action IS NULL OR action != '1') ORDER BY id ASC`,
      { replacements: [productId], type: QueryTypes.SELECT }
    );

    // Fetch general product images
    const generalImages = await sequelize.query(
      `SELECT * FROM product_images WHERE product_id = ? AND (action IS NULL OR action != '1') ORDER BY id ASC`,
      { replacements: [productId], type: QueryTypes.SELECT }
    );

    // Fetch specifications / info
    const infoItems = await sequelize.query(
      `SELECT details_name, details_value FROM product_info WHERE product_id = ? AND (action IS NULL OR action != '1')`,
      { replacements: [productId], type: QueryTypes.SELECT }
    );

    // Fetch size details if available
    const sizeDetails = await sequelize.query(
      `SELECT * FROM product_size_details WHERE product_id = ? AND (action IS NULL OR action != '1')`,
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
          in_stock: String(p.is_out_stock) !== "1",
          gst_id: p.gst_id ? Number(p.gst_id) : null,
          gst_name: p.gst_name || null,
          gst_rate: p.gst_rate || null,
          gst_percentage: parseFloat(p.gst_percentage || 0),
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

    // Materials details with material-specific images, prices and price_ids
    const formattedMaterials = materials.map((m) => {
      const mImgs = matImages.filter((mi) => mi.product_material_id === m.id);
      const primaryImg = mImgs[0]?.img_path || m.main_img_path || null;
      const mPrices = prices.filter((p) => p.material_id === m.id);
      const readyMade = mPrices.filter((p) => p.product_type === 1 || p.product_type === '1' || !p.product_type);
      const customizable = mPrices.filter((p) => p.product_type === 0 || p.product_type === '0');
      const inStockPrice = mPrices.find((p) => p.is_out_stock !== '1' && p.is_out_stock !== 1);
      const bestPriceId = inStockPrice?.id || mPrices[0]?.id || null;

      return {
        id: m.id,
        material_id: m.id,
        name: m.name,
        material_name: m.material_name,
        description: m.description,
        main_img_path: primaryImg,
        image: formatImageUrl(primaryImg),
        images: mImgs.map((mi) => ({ id: mi.id, img_path: mi.img_path, url: formatImageUrl(mi.img_path) })),
        prices: {
          ready_made_products: readyMade.length > 0 ? readyMade : mPrices,
          customizable_products: customizable,
        },
        all_prices: mPrices,
        price_id: bestPriceId,
      };
    });

    // Vendor details
    const brand =
      product.shop_name ||
      product.seller_name ||
      product.brand_business_name ||
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
      WHERE p.category = ? AND p.id != ? AND (p.action IS NULL OR p.action != '1')
        AND EXISTS (
          SELECT 1 FROM product_materials pm
          WHERE pm.product_id = p.id AND pm.is_active = '1' AND (pm.action IS NULL OR pm.action != '1')
        )
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
        brand: r.shop_name || r.seller_name || r.brand_business_name || "Bespoke",
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
      product_info: infoItems,
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
