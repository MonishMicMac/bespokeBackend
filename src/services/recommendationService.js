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

// Canonical color & fabric lists for robust normalization
export const KNOWN_COLORS = [
  "black", "white", "red", "blue", "green", "yellow", "pink", "maroon",
  "grey", "gray", "purple", "orange", "gold", "silver", "beige", "brown", "navy", "teal"
];

export const KNOWN_FABRICS = [
  "cotton", "silk", "polyester", "polyster", "linen", "georgette", "chiffon", "rayon",
  "velvet", "satin", "tulle", "wool", "denim", "organza", "crepe", "ceramic", "steel"
];

// In-Memory cache for recommendations (TTL 60s)
const recommendationCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

function getCacheKey(productId, limit) {
  return `${productId}_${limit}`;
}

function extractTokens(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function extractColors(texts, materialsList = []) {
  const found = new Set();
  const allTexts = [...texts];
  for (const m of materialsList) {
    if (m.name) allTexts.push(m.name);
    if (m.material_name) allTexts.push(m.material_name);
  }
  for (const t of allTexts) {
    const tokens = extractTokens(t);
    for (const c of KNOWN_COLORS) {
      if (tokens.includes(c)) found.add(c);
    }
  }
  return Array.from(found);
}

export function extractMaterials(texts, materialsList = [], masterMaterials = []) {
  const found = new Set();
  const allTexts = [...texts];
  for (const m of materialsList) {
    if (m.name) allTexts.push(m.name);
    if (m.material_name) allTexts.push(m.material_name);
    if (m.master_material_name) allTexts.push(m.master_material_name);
  }
  for (const t of allTexts) {
    const tokens = extractTokens(t);
    for (const f of KNOWN_FABRICS) {
      if (tokens.includes(f)) found.add(f === "polyster" ? "polyester" : f);
    }
    for (const mm of masterMaterials) {
      const mmLower = mm.toLowerCase().trim();
      if (mmLower.length < 3 || ["ok", "sd", "23", "32", "gt", "gygy", "trtr", "ddd"].includes(mmLower)) continue;
      if (tokens.includes(mmLower) || t.toLowerCase().includes(mmLower)) {
        found.add(mmLower);
      }
    }
  }
  return Array.from(found);
}

export function getProductTypeClassification(product) {
  const isCust = product.is_customizable === 1 || product.is_customizable === "1" || product.is_customizable === true;
  let types = [];
  if (Array.isArray(product.product_types)) {
    types = product.product_types.map((t) => String(t).toUpperCase());
  } else if (typeof product.product_types === "string") {
    try {
      types = JSON.parse(product.product_types).map((t) => String(t).toUpperCase());
    } catch {}
  }

  const hasReady = types.includes("READY_MADE") || product.product_type === "1" || product.product_type === 1 || !isCust;
  const hasCustom = types.includes("CUSTOMIZABLE") || isCust || product.product_type === "0" || product.product_type === 0;

  return {
    isCustomizable: hasCustom,
    isReadyMade: hasReady,
    rawTypes: types,
  };
}

/**
 * Intelligent Recommended Products for a Reference Product
 *
 * Scoring Weights (Configurable):
 * - Same Category: 30
 * - Same Subcategory: 25
 * - Same Product Type: 20
 * - Matching Material: 15
 * - Matching Color: 10
 * Total: 100
 */
export async function getRecommendedProducts(productId, options = {}) {
  const limit = Math.min(Math.max(1, parseInt(options.limit, 10) || 12), 24);
  const cacheKey = getCacheKey(productId, limit);

  // Check in-memory cache
  const cached = recommendationCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // 1. Fetch reference product
  const [refProduct] = await sequelize.query(
    `SELECT p.*, c.name as category_name, sc.name as subcategory_name,
            v.shop_name, v.brand_business_name, v.id as vendor_id
     FROM products p
     LEFT JOIN categories c ON p.category = c.id
     LEFT JOIN subcategories sc ON p.subcategory = sc.id
     LEFT JOIN vendor_login v ON p.vendor_id = v.id
     WHERE (p.id = ? OR p.product_id = ?)
     LIMIT 1`,
    { replacements: [productId, productId], type: QueryTypes.SELECT }
  );

  if (!refProduct) {
    return {
      status: false,
      message: `Product ${productId} not found`,
      reference_product_id: productId,
      recommendations: [],
    };
  }

  const actualRefId = refProduct.id;

  // 2. Fetch materials & master materials for reference product
  const [refMaterials, masterMatsRows] = await Promise.all([
    sequelize.query(
      `SELECT pm.*, mm.name as master_material_name
       FROM product_materials pm
       LEFT JOIN material_masters mm ON (pm.name = mm.id OR pm.name = mm.name)
       WHERE pm.product_id = ? AND (pm.action IS NULL OR pm.action != '1')`,
      { replacements: [actualRefId], type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT material_name FROM master_materials WHERE (action IS NULL OR action != '1')`,
      { type: QueryTypes.SELECT }
    ).catch(() => []),
  ]);

  const masterMatNames = masterMatsRows.map((m) => m.material_name).filter(Boolean);
  const refTexts = [refProduct.product_name, refProduct.description];
  const refColors = extractColors(refTexts, refMaterials);
  const refFabrics = extractMaterials(refTexts, refMaterials, masterMatNames);
  const refType = getProductTypeClassification(refProduct);

  // 3. Fetch candidate products:
  // - Exclude currently viewed product
  // - Exclude deleted products (action = '1')
  // - Exclude inactive products (is_active = '0')
  // - Exclude banned vendors (is_banned = '1')
  const candidates = await sequelize.query(
    `SELECT p.*,
            c.name as category_name,
            sc.name as subcategory_name,
            COALESCE(v.brand_business_name, v.shop_name) as brand_name,
            v.shop_name,
            v.rating as vendor_rating,
            (
              SELECT pimg.image_url 
              FROM product_images pimg 
              WHERE pimg.product_id = p.id AND (pimg.action IS NULL OR pimg.action != '1') 
              ORDER BY pimg.id ASC LIMIT 1
            ) as gallery_image,
            (
              SELECT COALESCE(MIN(pp.discount_price), MIN(pp.actual_price), 0)
              FROM product_prices pp 
              WHERE pp.product_id = p.id AND pp.discount_price > 0
            ) as effective_price,
            (
              SELECT MIN(pp.actual_price)
              FROM product_prices pp 
              WHERE pp.product_id = p.id
            ) as original_price,
            (
              SELECT MAX(
                CASE 
                  WHEN pp.actual_price > pp.discount_price AND pp.actual_price > 0 
                  THEN ROUND(((pp.actual_price - pp.discount_price) / pp.actual_price) * 100)
                  ELSE 0 
                END
              )
              FROM product_prices pp WHERE pp.product_id = p.id
            ) as discount_pct,
            (
              SELECT COUNT(*)
              FROM product_prices pp
              WHERE pp.product_id = p.id AND (pp.is_out_stock IS NULL OR pp.is_out_stock != '1')
            ) as in_stock_count
     FROM products p
     LEFT JOIN categories c ON p.category = c.id
     LEFT JOIN subcategories sc ON p.subcategory = sc.id
     LEFT JOIN vendor_login v ON p.vendor_id = v.id
     WHERE p.id != ?
       AND (p.action IS NULL OR p.action = '0' OR p.action != '1')
       AND (p.is_active IS NULL OR p.is_active = '1' OR p.is_active != '0')
       AND (v.is_banned IS NULL OR v.is_banned != '1')`,
    { replacements: [actualRefId], type: QueryTypes.SELECT }
  );

  if (!candidates || candidates.length === 0) {
    const emptyResult = {
      status: true,
      message: "No recommendations available",
      reference_product_id: actualRefId,
      recommendations: [],
    };
    recommendationCache.set(cacheKey, { data: emptyResult, timestamp: Date.now() });
    return emptyResult;
  }

  // 4. Fetch materials & images for all candidate products
  const candidateIds = candidates.map((c) => c.id);
  const [candidateMaterialsRows, candidateSizesRows] = await Promise.all([
    sequelize.query(
      `SELECT pm.id, pm.product_id, pm.name, pm.material_name, pm.description, pm.main_img_path,
              mm.name as master_material_name,
              (
                SELECT pmi.img_path 
                FROM product_material_images pmi 
                WHERE pmi.product_material_id = pm.id AND (pmi.action IS NULL OR pmi.action != '1') 
                LIMIT 1
              ) as mat_img
       FROM product_materials pm
       LEFT JOIN material_masters mm ON (pm.name = mm.id OR pm.name = mm.name)
       WHERE pm.product_id IN (?) AND (pm.action IS NULL OR pm.action != '1')
       ORDER BY pm.id ASC`,
      { replacements: [candidateIds], type: QueryTypes.SELECT }
    ).catch(() => []),
    sequelize.query(
      `SELECT DISTINCT product_id, size FROM product_prices 
       WHERE product_id IN (?) AND size IS NOT NULL AND size != '' AND (is_out_stock IS NULL OR is_out_stock != '1')`,
      { replacements: [candidateIds], type: QueryTypes.SELECT }
    ).catch(() => []),
  ]);

  const matMap = {};
  for (const m of candidateMaterialsRows) {
    if (!matMap[m.product_id]) matMap[m.product_id] = [];
    matMap[m.product_id].push(m);
  }

  const sizesMap = {};
  for (const s of candidateSizesRows) {
    if (!sizesMap[s.product_id]) sizesMap[s.product_id] = [];
    if (!sizesMap[s.product_id].includes(s.size)) {
      sizesMap[s.product_id].push(s.size);
    }
  }

  // 5. Calculate Relevance Scores
  const scored = [];

  for (const cand of candidates) {
    const candMats = matMap[cand.id] || [];
    const candTexts = [cand.product_name, cand.description];
    const candColors = extractColors(candTexts, candMats);
    const candFabrics = extractMaterials(candTexts, candMats, masterMatNames);
    const candType = getProductTypeClassification(cand);

    let score = 0;
    const reasons = [];

    // 1. Same Category: 30 pts
    const sameCategory = String(cand.category) === String(refProduct.category) ||
      (cand.category_name && refProduct.category_name && cand.category_name.toLowerCase() === refProduct.category_name.toLowerCase());
    if (sameCategory) {
      score += 30;
      reasons.push("Same Category");
    }

    // 2. Same Subcategory: 25 pts
    const sameSubcategory = String(cand.subcategory) === String(refProduct.subcategory) ||
      (cand.subcategory_name && refProduct.subcategory_name && cand.subcategory_name.toLowerCase() === refProduct.subcategory_name.toLowerCase());
    if (sameSubcategory) {
      score += 25;
      reasons.push("Same Subcategory");
    }

    // 3. Same Product Type: 20 pts (Customizable vs Ready-Made)
    const typeMatch = (refType.isCustomizable && candType.isCustomizable) || (refType.isReadyMade && candType.isReadyMade);
    if (typeMatch) {
      score += 20;
      reasons.push("Same Product Type");
    }

    // 4. Matching Material: 15 pts (Any matching fabric/material adds 15 once)
    const matchedFabric = refFabrics.find((f) => candFabrics.includes(f));
    if (matchedFabric) {
      score += 15;
      reasons.push(`Matching Material (${matchedFabric})`);
    }

    // 5. Matching Color: 10 pts (Any matching color adds 10 once)
    const matchedColor = refColors.find((c) => candColors.includes(c));
    if (matchedColor) {
      score += 10;
      reasons.push(`Matching Color (${matchedColor})`);
    }

    // Quality gate: require at least one domain match (category, subcategory, material, color)
    // Avoid recommending completely unrelated products that merely share generic product_type
    const hasDomainMatch = sameCategory || sameSubcategory || Boolean(matchedFabric) || Boolean(matchedColor);

    if (score > 0 && hasDomainMatch) {
      const priceVal = parseFloat(cand.effective_price || cand.original_price || 499);
      const origVal = parseFloat(cand.original_price || priceVal);
      const discountVal = parseInt(cand.discount_pct || 0, 10);

      // Best image priority: candidate's first material image -> gallery image -> main_image
      const matImg = candMats.find((m) => m.mat_img || m.main_img_path);
      const bestImg = formatImageUrl(matImg?.mat_img || matImg?.main_img_path || cand.gallery_image || cand.main_image) ||
        "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80";

      scored.push({
        id: cand.id,
        product_id: cand.id,
        product_name: cand.product_name,
        title: cand.product_name,
        main_image: bestImg,
        image: bestImg,
        image_url: bestImg,
        category: cand.category_name || cand.category,
        category_name: cand.category_name,
        category_id: cand.category,
        subcategory: cand.subcategory_name || cand.subcategory,
        subcategory_name: cand.subcategory_name,
        subcategory_id: cand.subcategory,
        product_type: candType.isCustomizable ? "Customizable" : "Ready Made",
        product_types: candType.rawTypes,
        is_customizable: candType.isCustomizable ? 1 : 0,
        materials: candFabrics.length > 0 ? candFabrics : candMats.map((m) => m.name || m.material_name).filter(Boolean),
        colours: candColors,
        colors: candColors,
        brand_name: cand.brand_name || cand.shop_name || "Bespoke Designer",
        vendor_name: cand.shop_name || cand.brand_name || "Bespoke Designer",
        vendor_id: cand.vendor_id,
        actual_price: origVal,
        original_price: origVal,
        originalPrice: origVal,
        offer_price: priceVal,
        selling_price: priceVal,
        price: priceVal,
        discount_percentage: discountVal,
        discountPercentage: discountVal,
        rating: parseFloat(cand.rating || cand.vendor_rating || 4.5),
        availability: cand.in_stock_count > 0,
        is_available: cand.in_stock_count > 0,
        in_stock: cand.in_stock_count > 0,
        sizes: sizesMap[cand.id] || [],
        relevance_score: score,
        match_reasons: reasons,
      });
    }
  }

  // 6. Ranking with Multi-Vendor Interleaving:
  // Primary sort by score DESC, then rating DESC
  scored.sort((a, b) => {
    if (b.relevance_score !== a.relevance_score) return b.relevance_score - a.relevance_score;
    if (b.rating !== a.rating) return b.rating - a.rating;
    return b.id - a.id;
  });

  // Interleave vendors to prevent a single vendor from monopolizing the carousel
  // when other relevant vendors exist with similar scores
  const finalRecommendations = [];
  const vendorCounts = {};
  const remaining = [...scored];

  while (remaining.length > 0 && finalRecommendations.length < limit) {
    let pickedIdx = -1;

    // First try to find a candidate whose vendor has < 2 items in current list
    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i];
      const vCount = vendorCounts[item.vendor_id] || 0;
      // Allow up to 2 items per vendor before checking others, unless scores differ significantly (> 20 pts)
      const topScore = remaining[0].relevance_score;
      const scoreDiff = topScore - item.relevance_score;

      if (vCount < 2 || scoreDiff > 20) {
        pickedIdx = i;
        break;
      }
    }

    if (pickedIdx === -1) {
      pickedIdx = 0;
    }

    const [picked] = remaining.splice(pickedIdx, 1);
    finalRecommendations.push(picked);
    vendorCounts[picked.vendor_id] = (vendorCounts[picked.vendor_id] || 0) + 1;
  }

  const result = {
    status: true,
    message: "Recommended products retrieved successfully",
    reference_product_id: actualRefId,
    total: finalRecommendations.length,
    recommendations: finalRecommendations,
  };

  // Cache result for 60 seconds
  recommendationCache.set(cacheKey, { data: result, timestamp: Date.now() });

  return result;
}

/**
 * Invalidate cache for a product or all products
 */
export function invalidateRecommendationCache(productId = null) {
  if (productId) {
    for (const key of recommendationCache.keys()) {
      if (key.startsWith(`${productId}_`)) {
        recommendationCache.delete(key);
      }
    }
  } else {
    recommendationCache.clear();
  }
}

