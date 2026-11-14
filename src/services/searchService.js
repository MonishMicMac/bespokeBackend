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

// Synonyms Map for Fashion & Bespoke Ecommerce
const SYNONYMS = {
  saree: ["sari", "sarees", "pattu", "kanjivaram", "banarasi"],
  sari: ["saree", "sarees"],
  kurta: ["kurti", "kurtas", "kurtis", "kurta set", "chudithar", "churidar"],
  kurti: ["kurta", "kurtas", "kurtis"],
  tshirt: ["t-shirt", "tee", "tshirts", "t-shirts", "t shirt"],
  shirt: ["shirts", "button-down", "tshirt"],
  dress: ["frock", "gown", "dresses", "tulle dress"],
  frock: ["dress", "frocks"],
  lehenga: ["lehnga", "ghagra", "chaniya"],
  polyester: ["polyster"],
  polyster: ["polyester"],
  cotton: ["coton"],
  silk: ["slik"],
  bottle: ["cup", "water bottle", "cup with bottle"],
  cup: ["bottle", "cup with bottle", "cupwithbottle"],
  toy: ["toys", "children toys"],
  toys: ["toy", "childrens toys"],
  traditional: ["ethnic", "fusion", "indian"],
  men: ["mens", "male"],
  mens: ["men", "male"],
  women: ["womens", "female", "ladies"],
  womens: ["women", "female", "ladies"],
  girls: ["girl", "kids", "child"],
  kids: ["children", "girls", "boys"],
};

// Common Typo Corrections
const TYPOS = {
  sar: "saree",
  sare: "saree",
  sarry: "saree",
  sari: "saree",
  kur: "kurta",
  kurt: "kurta",
  kurtii: "kurti",
  tsh: "tshirt",
  tshr: "tshirt",
  tshrt: "tshirt",
  "t-shrt": "tshirt",
  froc: "frock",
  frok: "frock",
  cottn: "cotton",
  coton: "cotton",
  slk: "silk",
  slik: "silk",
  polyster: "polyester",
  lehanga: "lehenga",
  bot: "bottle",
  botle: "bottle",
};

export const KNOWN_FABRICS = [
  "Cotton", "Silk", "Polyester", "Linen", "Georgette", "Chiffon", "Rayon",
  "Velvet", "Satin", "Tulle", "Wool", "Denim", "Organza", "Crepe"
];

export const KNOWN_COLORS = [
  "Black", "White", "Red", "Blue", "Green", "Yellow", "Pink", "Maroon",
  "Grey", "Purple", "Orange", "Gold", "Silver", "Beige", "Brown", "Navy", "Teal"
];

export const KNOWN_OCCASIONS = [
  "Wedding", "Festive", "Party", "Formal", "Casual"
];

export const POPULAR_SEARCH_TERMS = [
  "Cotton Kurta",
  "Red Saree",
  "Silk Saree",
  "Black Tshirt",
  "Modern Frock",
  "Traditional Wears",
  "Cup With Bottle",
  "Student Uniform",
];

// In-Memory LRU Cache for search suggestions & popular results (TTL 60s)
const suggestionCache = new Map();
const SUGGESTION_CACHE_TTL = 60 * 1000;

/**
 * Pre-process search query with synonyms and typo tolerance
 */
export function processQueryTokens(rawQuery) {
  if (!rawQuery || typeof rawQuery !== "string") return [];
  const clean = rawQuery.trim().toLowerCase();
  if (!clean) return [];

  const rawTokens = clean.split(/[\s,+/_-]+/).filter((t) => t.length > 0);
  const tokenSet = new Set();

  rawTokens.forEach((token) => {
    // 1. Exact token
    tokenSet.add(token);

    // 2. Typo correction
    if (TYPOS[token]) {
      tokenSet.add(TYPOS[token]);
    }

    // 3. Synonym expansion
    if (SYNONYMS[token]) {
      SYNONYMS[token].forEach((syn) => tokenSet.add(syn.toLowerCase()));
    }

    // 4. Singular / Plural handling
    if (token.endsWith("s") && token.length > 3 && !token.endsWith("ss")) {
      const singular = token.slice(0, -1);
      tokenSet.add(singular);
      if (SYNONYMS[singular]) {
        SYNONYMS[singular].forEach((syn) => tokenSet.add(syn.toLowerCase()));
      }
    }
  });

  return Array.from(tokenSet);
}

/**
 * Extract fabrics from text and materials
 */
export function extractFabrics(text, materials = []) {
  const found = new Set();
  const lowerText = (text || "").toLowerCase();

  materials.forEach((m) => {
    const matText = `${m.name || ""} ${m.material_name || ""}`.toLowerCase();
    KNOWN_FABRICS.forEach((f) => {
      if (matText.includes(f.toLowerCase())) {
        found.add(f);
      }
    });
  });

  KNOWN_FABRICS.forEach((f) => {
    if (lowerText.includes(f.toLowerCase())) {
      found.add(f);
    }
  });

  if (found.size === 0) found.add("Cotton");
  return Array.from(found);
}

/**
 * Extract colors from text and materials
 */
export function extractColors(text, materials = []) {
  const found = new Set();
  const lowerText = (text || "").toLowerCase();

  materials.forEach((m) => {
    const matText = `${m.name || ""} ${m.material_name || ""}`.toLowerCase();
    KNOWN_COLORS.forEach((c) => {
      if (matText.includes(c.toLowerCase())) {
        found.add(c);
      }
    });
  });

  KNOWN_COLORS.forEach((c) => {
    if (lowerText.includes(c.toLowerCase())) {
      found.add(c);
    }
  });

  if (found.size === 0) found.add("Multicolor");
  return Array.from(found);
}

/**
 * Extract occasions from text, category and subcategory
 */
export function extractOccasions(text, catName = "", subcatName = "") {
  const found = new Set();
  const combined = `${text} ${catName} ${subcatName}`.toLowerCase();

  if (combined.includes("wedding") || combined.includes("banarasi") || combined.includes("kanjivaram")) {
    found.add("Wedding");
  }
  if (combined.includes("festive") || combined.includes("festival") || combined.includes("traditional") || combined.includes("saree") || combined.includes("kurta")) {
    found.add("Festive");
  }
  if (combined.includes("party") || combined.includes("celebration") || combined.includes("evening")) {
    found.add("Party");
  }
  if (combined.includes("formal") || combined.includes("office") || combined.includes("shirt")) {
    found.add("Formal");
  }
  if (combined.includes("casual") || combined.includes("t shirt") || combined.includes("tshirt") || combined.includes("bottle") || found.size === 0) {
    found.add("Casual");
  }

  return Array.from(found);
}

/**
 * Generate 100% dynamic search suggestion phrases from database records
 * (E.g. "sar" -> "saree", "saree for women", "silk saree", "cotton saree", "green saree", "red saree")
 */
export async function getDynamicSearchPhrases(rawQuery) {
  const cleanQ = (rawQuery || "").trim().toLowerCase();
  if (!cleanQ) return [];

  // 1. Process tokens & typo corrections
  const correctedBase = TYPOS[cleanQ] || cleanQ;
  const isAskingFor = cleanQ.includes("for") || cleanQ.endsWith("for");
  const queryPrefix = cleanQ.replace(/\s+for\s*$/, "").trim();
  const effectiveWord = TYPOS[queryPrefix] || queryPrefix || correctedBase;

  const likePattern = `%${cleanQ}%`;
  const baseLikePattern = `%${correctedBase}%`;
  const prefixLikePattern = `${effectiveWord}%`;

  // 2. Fetch active subcategories, products, materials, and vendors
  const [subcats, prods, mats, vendors] = await Promise.all([
    sequelize.query(
      `SELECT sc.id, sc.name as subcategory_name, c.name as category_name, p.gender, COUNT(DISTINCT p.id) as count
       FROM subcategories sc
       LEFT JOIN categories c ON sc.category_id = c.id
       INNER JOIN products p ON p.subcategory = sc.id
       WHERE (sc.action IS NULL OR sc.action != '1')
         AND (p.action IS NULL OR p.action != '1')
         AND (p.is_active IS NULL OR p.is_active != '0')
         AND EXISTS (SELECT 1 FROM product_materials pm WHERE pm.product_id = p.id AND pm.is_active = '1' AND (pm.action IS NULL OR pm.action != '1'))
         AND (LOWER(sc.name) LIKE ? OR LOWER(sc.name) LIKE ? OR LOWER(c.name) LIKE ?)
       GROUP BY sc.id, sc.name, c.name, p.gender
       ORDER BY (LOWER(sc.name) LIKE ?) DESC, count DESC
       LIMIT 8`,
      { replacements: [likePattern, baseLikePattern, likePattern, prefixLikePattern], type: QueryTypes.SELECT }
    ).catch(() => []),

    sequelize.query(
      `SELECT p.id, p.product_name, c.name as category_name, sc.name as subcategory_name, p.gender,
              COALESCE(v.shop_name, v.brand_business_name) as brand_name
       FROM products p
       LEFT JOIN categories c ON p.category = c.id
       LEFT JOIN subcategories sc ON p.subcategory = sc.id
       LEFT JOIN vendor_login v ON p.vendor_id = v.id
       WHERE (p.action IS NULL OR p.action != '1')
         AND (p.is_active IS NULL OR p.is_active != '0')
         AND EXISTS (SELECT 1 FROM product_materials pm WHERE pm.product_id = p.id AND pm.is_active = '1' AND (pm.action IS NULL OR pm.action != '1'))
         AND (LOWER(p.product_name) LIKE ? OR LOWER(p.product_name) LIKE ? OR LOWER(sc.name) LIKE ? OR LOWER(sc.name) LIKE ?)
       GROUP BY p.id, p.product_name, c.name, sc.name, p.gender, brand_name
       ORDER BY (LOWER(p.product_name) LIKE ?) DESC, p.id DESC
       LIMIT 12`,
      { replacements: [likePattern, baseLikePattern, likePattern, baseLikePattern, prefixLikePattern], type: QueryTypes.SELECT }
    ).catch(() => []),

    sequelize.query(
      `SELECT DISTINCT COALESCE(mm.name, pm.name, pm.material_name) as mat_name, sc.name as subcategory_name
       FROM product_materials pm
       LEFT JOIN material_masters mm ON (pm.name = mm.id OR pm.name = mm.name)
       INNER JOIN products p ON pm.product_id = p.id
       LEFT JOIN subcategories sc ON p.subcategory = sc.id
       WHERE (pm.action IS NULL OR pm.action != '1')
         AND pm.is_active = '1'
         AND (p.action IS NULL OR p.action != '1')
         AND (p.is_active IS NULL OR p.is_active != '0')
         AND (LOWER(p.product_name) LIKE ? OR LOWER(sc.name) LIKE ? OR LOWER(pm.name) LIKE ? OR LOWER(pm.material_name) LIKE ? OR LOWER(mm.name) LIKE ?)
       LIMIT 10`,
      { replacements: [likePattern, likePattern, likePattern, likePattern, likePattern], type: QueryTypes.SELECT }
    ).catch(() => []),

    sequelize.query(
      `SELECT DISTINCT COALESCE(v.shop_name, v.brand_business_name) as brand_name, sc.name as subcategory_name
       FROM vendor_login v
       INNER JOIN products p ON p.vendor_id = v.id
       LEFT JOIN subcategories sc ON p.subcategory = sc.id
       WHERE (v.action IS NULL OR v.action != '1')
         AND (p.action IS NULL OR p.action != '1')
         AND (p.is_active IS NULL OR p.is_active != '0')
         AND EXISTS (SELECT 1 FROM product_materials pm WHERE pm.product_id = p.id AND pm.is_active = '1' AND (pm.action IS NULL OR pm.action != '1'))
         AND (LOWER(v.shop_name) LIKE ? OR LOWER(v.brand_business_name) LIKE ? OR LOWER(p.product_name) LIKE ? OR LOWER(sc.name) LIKE ?)
       LIMIT 6`,
      { replacements: [likePattern, likePattern, likePattern, likePattern], type: QueryTypes.SELECT }
    ).catch(() => [])
  ]);

  const seen = new Set();
  const suggestions = [];

  const add = (phrase, type = "query", meta = {}) => {
    if (!phrase) return;
    const clean = phrase.trim().toLowerCase().replace(/\s+/g, " ");
    if (!clean || clean.length < 2 || seen.has(clean)) return;
    seen.add(clean);
    suggestions.push({
      text: clean,
      display: clean.charAt(0).toUpperCase() + clean.slice(1),
      type,
      ...meta
    });
  };

  // 1. If user typed "xyz for" or similar, provide audience & occasion options upfront
  if (isAskingFor) {
    const baseNoun = queryPrefix || effectiveWord || "saree";
    add(`${baseNoun} for women`, "audience");
    add(`${baseNoun} for girls`, "audience");
    add(`${baseNoun} for wedding`, "occasion");
    add(`${baseNoun} for festive`, "occasion");
    add(`${baseNoun} for party`, "occasion");
  }

  // 2. Base category / subcategory (e.g. "saree", "kurta", "tshirt")
  subcats.forEach((sc) => {
    const sName = sc.subcategory_name.toLowerCase();
    const isPrimaryMatch = sName.startsWith(cleanQ) || sName.startsWith(effectiveWord) || sName.includes(cleanQ) || cleanQ.includes(sName);
    if (isPrimaryMatch) {
      if (!isAskingFor) {
        add(sName, "keyword");
      }

      // Gender / Audience
      const gender = sc.gender || "";
      const catLower = (sc.category_name || "").toLowerCase();
      if (gender === "female" || catLower.includes("fusion") || catLower.includes("women") || catLower.includes("traditional")) {
        add(`${sName} for women`, "audience");
      } else if (gender === "male" || catLower.includes("men")) {
        add(`${sName} for men`, "audience");
      } else if (gender === "kids" || catLower.includes("girl") || catLower.includes("child")) {
        add(`${sName} for girls`, "audience");
      }

      // In Category
      if (sc.category_name) {
        add(`${sName} in ${sc.category_name}`, "category", { category: sc.category_name });
      }
    }
  });

  // 3. Materials / Fabrics + Subcategory from DB (e.g. "silk saree", "cotton saree")
  mats.forEach((m) => {
    const mName = (m.mat_name || "").toLowerCase();
    const sName = (m.subcategory_name || effectiveWord || "").toLowerCase();
    KNOWN_FABRICS.forEach((fab) => {
      const fLower = fab.toLowerCase();
      if (mName.includes(fLower)) {
        if (sName && sName.length > 2) {
          add(`${fLower} ${sName}`, "fabric");
        } else {
          add(`${fLower} ${effectiveWord}`, "fabric");
        }
      }
    });
  });

  // 4. Meaningful Product Names from DB (e.g. "Red Saree", "green saree", "Ladies Saree", "Modern Frock")
  prods.forEach((p) => {
    const pTitle = (p.product_name || "").toLowerCase().trim();
    // Exclude dummy test titles like "dfghj" or very short junk
    if (pTitle && pTitle.length > 2 && !/^[bcdfghjklmnpqrstvwxyz]{4,}$/i.test(pTitle)) {
      if (pTitle.startsWith(cleanQ) || pTitle.includes(cleanQ) || pTitle.startsWith(effectiveWord) || pTitle.includes(effectiveWord)) {
        add(pTitle, "product");
        if (p.gender === "female" && !pTitle.includes("women")) {
          add(`${pTitle} for women`, "audience");
        } else if (p.gender === "male" && !pTitle.includes("men")) {
          add(`${pTitle} for men`, "audience");
        }
      }
    }
  });

  // 5. Designer / Brand combinations (e.g. "saree by Nazia Syed")
  vendors.forEach((v) => {
    const bName = (v.brand_name || "").trim();
    if (bName && bName.toLowerCase() !== "bespoke") {
      const targetSub = subcats[0]?.subcategory_name?.toLowerCase() || effectiveWord;
      if (targetSub && targetSub.length > 2) {
        add(`${targetSub} by ${bName}`, "brand", { brand: bName });
      }
    }
  });

  // Fallback: If no suggestion matched yet, add typo correction or base
  if (suggestions.length === 0) {
    if (TYPOS[cleanQ]) {
      add(TYPOS[cleanQ], "keyword");
      add(`${TYPOS[cleanQ]} for women`, "audience");
    } else {
      add(cleanQ, "keyword");
    }
  }

  // Sort suggestions so exact / prefix / primary word matches appear first
  suggestions.sort((a, b) => {
    const scoreA =
      (a.text === effectiveWord ? 200 : 0) +
      (a.text.startsWith(effectiveWord) ? 100 : 0) +
      (a.text.startsWith(cleanQ) ? 80 : 0) +
      (a.text.includes(effectiveWord) ? 40 : 0) +
      (a.text.includes(cleanQ) ? 20 : 0);
    const scoreB =
      (b.text === effectiveWord ? 200 : 0) +
      (b.text.startsWith(effectiveWord) ? 100 : 0) +
      (b.text.startsWith(cleanQ) ? 80 : 0) +
      (b.text.includes(effectiveWord) ? 40 : 0) +
      (b.text.includes(cleanQ) ? 20 : 0);
    return scoreB - scoreA;
  });

  return suggestions.slice(0, 8);
}

/**
 * Autocomplete suggestions: GET /api/search/suggestions?q=
 */
export async function getSearchSuggestions(rawQuery) {
  const cleanQ = (rawQuery || "").trim();
  if (!cleanQ) {
    return {
      suggestions: [],
      products: [],
      categories: [],
      subcategories: [],
      brands: [],
      popular_searches: POPULAR_SEARCH_TERMS.slice(0, 5),
      recent_searches: [],
    };
  }

  // Check cache
  const cacheKey = cleanQ.toLowerCase();
  const cached = suggestionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SUGGESTION_CACHE_TTL) {
    return cached.data;
  }

  const likePattern = `%${cleanQ.toLowerCase()}%`;

  // 1. Matching Categories with product count
  const categoriesQuery = `
    SELECT c.id, c.name, COUNT(DISTINCT p.id) as product_count
    FROM categories c
    INNER JOIN products p ON p.category = c.id
    WHERE (c.action IS NULL OR c.action != '1')
      AND (p.action IS NULL OR p.action != '1')
      AND (p.is_active IS NULL OR p.is_active != '0')
      AND LOWER(c.name) LIKE ?
    GROUP BY c.id, c.name
    ORDER BY product_count DESC
    LIMIT 4
  `;

  // 2. Matching Subcategories with product count
  const subcategoriesQuery = `
    SELECT sc.id, sc.name, c.name as category_name, COUNT(DISTINCT p.id) as product_count
    FROM subcategories sc
    LEFT JOIN categories c ON sc.category_id = c.id
    INNER JOIN products p ON p.subcategory = sc.id
    WHERE (sc.action IS NULL OR sc.action != '1')
      AND (p.action IS NULL OR p.action != '1')
      AND (p.is_active IS NULL OR p.is_active != '0')
      AND (LOWER(sc.name) LIKE ? OR LOWER(c.name) LIKE ?)
    GROUP BY sc.id, sc.name, c.name
    ORDER BY product_count DESC
    LIMIT 4
  `;

  // 3. Matching Brands / Designers with product count
  const brandsQuery = `
    SELECT v.id, COALESCE(v.shop_name, v.seller_name, v.brand_business_name) as name, COUNT(DISTINCT p.id) as product_count
    FROM vendor_login v
    INNER JOIN products p ON p.vendor_id = v.id
    WHERE (v.action IS NULL OR v.action != '1')
      AND (p.action IS NULL OR p.action != '1')
      AND (p.is_active IS NULL OR p.is_active != '0')
      AND (
        LOWER(v.shop_name) LIKE ? OR 
        LOWER(v.brand_business_name) LIKE ? OR 
        LOWER(v.seller_name) LIKE ?
      )
    GROUP BY v.id, name
    ORDER BY product_count DESC
    LIMIT 4
  `;

  const [categories, subcategories, brands, dynamicSuggestions] = await Promise.all([
    sequelize.query(categoriesQuery, { replacements: [likePattern], type: QueryTypes.SELECT }).catch(() => []),
    sequelize.query(subcategoriesQuery, { replacements: [likePattern, likePattern], type: QueryTypes.SELECT }).catch(() => []),
    sequelize.query(brandsQuery, { replacements: [likePattern, likePattern, likePattern], type: QueryTypes.SELECT }).catch(() => []),
    getDynamicSearchPhrases(cleanQ).catch(() => []),
  ]);

  const data = {
    suggestions: dynamicSuggestions,
    products: [], // Do NOT return matching products as requested!
    categories: categories.map((c) => ({ id: c.id, name: c.name, count: c.product_count })),
    subcategories: subcategories.map((sc) => ({ id: sc.id, name: sc.name, category: sc.category_name, count: sc.product_count })),
    brands: brands.map((b) => ({ id: b.id, name: b.name, count: b.product_count })),
    popular_searches: POPULAR_SEARCH_TERMS.slice(0, 5),
    recent_searches: [cleanQ],
  };

  // Cache response
  suggestionCache.set(cacheKey, { timestamp: Date.now(), data });

  return data;
}

/**
 * Main Global Search with Category-Aware Faceted Filtering
 * GET /api/search/products
 */
export async function searchProductsWithFacets(params = {}) {
  const {
    q = "",
    category_id,
    subcategory_id,
    brand_id,
    material,
    fabric,
    color,
    occasion,
    size,
    min_price,
    max_price,
    min_discount,
    rating,
    product_type,
    sort = "recommended",
    page = 1,
    limit = 24,
  } = params;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 24));
  const offset = (pageNum - 1) * limitNum;

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

  // 1. Text Query Processing (Multi-token, Synonyms, and Typos across Title, Desc, Category, Subcat, Material, Brand)
  const cleanQ = (q || "").trim();
  const rawWords = cleanQ.split(/[\s,+/_-]+/).filter(Boolean);

  if (rawWords.length > 0) {
    if (rawWords.length >= 2) {
      // Build AND clauses for each distinct word group
      const andClauses = [];
      const andReplacements = [];

      rawWords.forEach((word) => {
        const tokens = processQueryTokens(word);
        const orTokens = [];
        tokens.forEach((token) => {
          orTokens.push(`(
            LOWER(p.product_name) LIKE ? OR
            LOWER(p.description) LIKE ? OR
            LOWER(c.name) LIKE ? OR
            LOWER(sc.name) LIKE ? OR
            LOWER(v.shop_name) LIKE ? OR
            LOWER(v.brand_business_name) LIKE ? OR
            EXISTS (
              SELECT 1 FROM product_materials pm 
              LEFT JOIN material_masters mm ON (pm.name = mm.id OR pm.name = mm.name)
              WHERE pm.product_id = p.id 
                AND (pm.action IS NULL OR pm.action != '1')
                AND (LOWER(pm.name) LIKE ? OR LOWER(pm.material_name) LIKE ? OR LOWER(pm.description) LIKE ? OR LOWER(mm.name) LIKE ?)
            )
          )`);
          const patt = `%${token}%`;
          andReplacements.push(patt, patt, patt, patt, patt, patt, patt, patt, patt, patt);
        });
        if (orTokens.length > 0) {
          andClauses.push(`(${orTokens.join(" OR ")})`);
        }
      });

      if (andClauses.length > 0) {
        whereClauses.push(`(${andClauses.join(" AND ")})`);
        replacements.push(...andReplacements);
      }
    } else {
      // Single word query
      const tokens = processQueryTokens(cleanQ);
      const tokenClauses = [];
      tokens.forEach((token) => {
        tokenClauses.push(`(
          LOWER(p.product_name) LIKE ? OR
          LOWER(p.description) LIKE ? OR
          LOWER(c.name) LIKE ? OR
          LOWER(sc.name) LIKE ? OR
          LOWER(v.shop_name) LIKE ? OR
          LOWER(v.brand_business_name) LIKE ? OR
          EXISTS (
            SELECT 1 FROM product_materials pm 
            LEFT JOIN material_masters mm ON (pm.name = mm.id OR pm.name = mm.name)
            WHERE pm.product_id = p.id 
              AND (pm.action IS NULL OR pm.action != '1')
              AND (LOWER(pm.name) LIKE ? OR LOWER(pm.material_name) LIKE ? OR LOWER(pm.description) LIKE ? OR LOWER(mm.name) LIKE ?)
          )
        )`);
        const patt = `%${token}%`;
        replacements.push(patt, patt, patt, patt, patt, patt, patt, patt, patt, patt);
      });
      if (tokenClauses.length > 0) {
        whereClauses.push(`(${tokenClauses.join(" OR ")})`);
      }
    }
  }

  // 2. Category Filter (comma-separated or single)
  if (category_id) {
    const catList = String(category_id).split(",").map((c) => c.trim()).filter(Boolean);
    if (catList.length > 0) {
      whereClauses.push(`p.category IN (?)`);
      replacements.push(catList);
    }
  }

  // 3. Subcategory Filter
  if (subcategory_id) {
    const subcatList = String(subcategory_id).split(",").map((sc) => sc.trim()).filter(Boolean);
    if (subcatList.length > 0) {
      whereClauses.push(`p.subcategory IN (?)`);
      replacements.push(subcatList);
    }
  }

  // 4. Brand / Vendor Filter
  if (brand_id) {
    const brandList = String(brand_id).split(",").map((b) => b.trim()).filter(Boolean);
    if (brandList.length > 0) {
      whereClauses.push(`p.vendor_id IN (?)`);
      replacements.push(brandList);
    }
  }

  // 5. Product Type Filter (Customizable vs Ready Made)
  if (product_type !== undefined && product_type !== null && product_type !== "") {
    const pTypeStr = String(product_type).toLowerCase();
    if (pTypeStr === "customizable" || pTypeStr === "0") {
      whereClauses.push(`(p.is_customizable = 1 OR p.product_type = '0')`);
    } else if (pTypeStr === "ready_made" || pTypeStr === "ready to wear" || pTypeStr === "1") {
      whereClauses.push(`(p.is_customizable = 0 OR p.product_type = '1')`);
    }
  }

  // 6. Rating Filter
  if (rating) {
    const minRating = parseFloat(rating);
    if (!isNaN(minRating) && minRating > 0) {
      whereClauses.push(`COALESCE(p.rating, v.rating, 4.5) >= ?`);
      replacements.push(minRating);
    }
  }

  // 7. Fabric Filter
  if (fabric) {
    const fabricList = String(fabric).split(",").map((f) => f.trim().toLowerCase()).filter(Boolean);
    if (fabricList.length > 0) {
      const fabricLikes = fabricList.map((f) => {
        replacements.push(`%${f}%`, `%${f}%`, `%${f}%`, `%${f}%`);
        return `(LOWER(p.product_name) LIKE ? OR EXISTS (
          SELECT 1 FROM product_materials pm 
          LEFT JOIN material_masters mm ON (pm.name = mm.id OR pm.name = mm.name)
          WHERE pm.product_id = p.id AND (LOWER(pm.name) LIKE ? OR LOWER(pm.material_name) LIKE ? OR LOWER(mm.name) LIKE ?)
        ))`;
      });
      whereClauses.push(`(${fabricLikes.join(" OR ")})`);
    }
  }

  // 8. Color Filter
  if (color) {
    const colorList = String(color).split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
    if (colorList.length > 0) {
      const colorLikes = colorList.map((c) => {
        replacements.push(`%${c}%`, `%${c}%`, `%${c}%`, `%${c}%`);
        return `(
          LOWER(p.product_name) LIKE ? OR 
          LOWER(p.description) LIKE ? OR 
          EXISTS (
            SELECT 1 FROM product_materials pm 
            WHERE pm.product_id = p.id 
              AND (pm.action IS NULL OR pm.action != '1')
              AND (LOWER(pm.name) LIKE ? OR LOWER(pm.material_name) LIKE ?)
          )
        )`;
      });
      whereClauses.push(`(${colorLikes.join(" OR ")})`);
    }
  }

  // 9. Material Filter
  if (material) {
    const matList = String(material).split(",").map((m) => m.trim().toLowerCase()).filter(Boolean);
    if (matList.length > 0) {
      const matLikes = matList.map((m) => {
        replacements.push(`%${m}%`, `%${m}%`, `%${m}%`);
        return `EXISTS (
          SELECT 1 FROM product_materials pm 
          LEFT JOIN material_masters mm ON (pm.name = mm.id OR pm.name = mm.name)
          WHERE pm.product_id = p.id AND (LOWER(pm.name) LIKE ? OR LOWER(pm.material_name) LIKE ? OR LOWER(mm.name) LIKE ?)
        )`;
      });
      whereClauses.push(`(${matLikes.join(" OR ")})`);
    }
  }

  // 10. Size Filter
  if (size) {
    const sizeList = String(size).split(",").map((s) => s.trim()).filter(Boolean);
    if (sizeList.length > 0) {
      whereClauses.push(`EXISTS (SELECT 1 FROM product_prices pp WHERE pp.product_id = p.id AND pp.size IN (?))`);
      replacements.push(sizeList);
    }
  }

  // 11. Price Range Filters
  if (min_price && !isNaN(parseFloat(min_price))) {
    whereClauses.push(`(
      SELECT COALESCE(MIN(pp.discount_price), MIN(pp.actual_price), 0)
      FROM product_prices pp WHERE pp.product_id = p.id
    ) >= ?`);
    replacements.push(parseFloat(min_price));
  }
  if (max_price && !isNaN(parseFloat(max_price))) {
    whereClauses.push(`(
      SELECT COALESCE(MIN(pp.discount_price), MIN(pp.actual_price), 0)
      FROM product_prices pp WHERE pp.product_id = p.id
    ) <= ?`);
    replacements.push(parseFloat(max_price));
  }

  // 12. Minimum Discount Filter
  if (min_discount && !isNaN(parseFloat(min_discount))) {
    const minDiscVal = parseFloat(min_discount);
    whereClauses.push(`(
      SELECT MAX(
        CASE 
          WHEN pp.actual_price > pp.discount_price AND pp.actual_price > 0 
          THEN ROUND(((pp.actual_price - pp.discount_price) / pp.actual_price) * 100)
          ELSE 0 
        END
      )
      FROM product_prices pp WHERE pp.product_id = p.id
    ) >= ?`);
    replacements.push(minDiscVal);
  }

  const whereSql = `WHERE ${whereClauses.join(" AND ")}`;

  // Determine Order By Clause
  let orderBySql = "p.id DESC";
  switch (sort) {
    case "price_asc":
    case "price-low":
      orderBySql = "effective_price ASC, p.id DESC";
      break;
    case "price_desc":
    case "price-high":
      orderBySql = "effective_price DESC, p.id DESC";
      break;
    case "newest":
    case "new_arrivals":
      orderBySql = "p.created_at DESC, p.id DESC";
      break;
    case "popularity":
      orderBySql = "COALESCE(p.rating, 4.5) DESC, p.id DESC";
      break;
    case "rating":
      orderBySql = "COALESCE(p.rating, 4.5) DESC, p.id DESC";
      break;
    case "discount":
    case "highest_discount":
      orderBySql = "discount_pct DESC, p.id DESC";
      break;
    case "recommended":
    default:
      // Relevance score: exact query match in name gets highest priority
      if (cleanQ) {
        orderBySql = `(
          CASE 
            WHEN LOWER(p.product_name) = '${cleanQ.replace(/'/g, "''")}' THEN 100
            WHEN LOWER(p.product_name) LIKE '${cleanQ.replace(/'/g, "''")}%' THEN 50
            WHEN LOWER(p.product_name) LIKE '%${cleanQ.replace(/'/g, "''")}%' THEN 25
            ELSE 5
          END
        ) DESC, p.id DESC`;
      } else {
        orderBySql = "p.id DESC";
      }
      break;
  }

  // 1. Total matching products count query
  const countQuery = `
    SELECT COUNT(DISTINCT p.id) as total
    FROM products p
    LEFT JOIN categories c ON p.category = c.id
    LEFT JOIN subcategories sc ON p.subcategory = sc.id
    LEFT JOIN vendor_login v ON p.vendor_id = v.id
    ${whereSql}
  `;

  const [countRes] = await sequelize.query(countQuery, {
    replacements,
    type: QueryTypes.SELECT,
  });
  const total = countRes?.total ? parseInt(countRes.total, 10) : 0;
  const totalPages = Math.max(1, Math.ceil(total / limitNum));

  // 2. Fetch paginated products query (Guaranteed unique parent product per card)
  const productsQuery = `
    SELECT 
      p.id,
      p.product_id,
      p.product_name,
      p.description,
      p.hsn_code,
      p.category as category_id,
      c.name as category_name,
      p.subcategory as subcategory_id,
      sc.name as subcategory_name,
      p.gender,
      p.vendor_id,
      COALESCE(v.shop_name, v.seller_name, v.brand_business_name, 'Bespoke Atelier') as brand,
      v.shop_name,
      v.seller_name,
      v.img_path as vendor_image,
      p.is_customizable,
      p.is_alter,
      p.alter_charge,
      p.rating,
      p.created_at,
      COALESCE(
        p.main_image,
        (SELECT pmi.img_path FROM product_material_images pmi WHERE pmi.product_id = p.id AND (pmi.action IS NULL OR pmi.action != '1') ORDER BY pmi.id ASC LIMIT 1),
        (SELECT pm.main_img_path FROM product_materials pm WHERE pm.product_id = p.id AND (pm.action IS NULL OR pm.action != '1') ORDER BY pm.id ASC LIMIT 1)
      ) as image_path,
      (
        SELECT COALESCE(MIN(pp.discount_price), MIN(pp.actual_price), 499)
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
      ) as discount_pct
    FROM products p
    LEFT JOIN categories c ON p.category = c.id
    LEFT JOIN subcategories sc ON p.subcategory = sc.id
    LEFT JOIN vendor_login v ON p.vendor_id = v.id
    ${whereSql}
    GROUP BY p.id
    ORDER BY ${orderBySql}
    LIMIT ? OFFSET ?
  `;

  const queryReplacements = [...replacements, limitNum, offset];

  const rawProducts = await sequelize.query(productsQuery, {
    replacements: queryReplacements,
    type: QueryTypes.SELECT,
  });

  // Auxiliary data: Fetch materials, prices, and sizes for current page products
  const productIds = rawProducts.map((p) => p.id);
  let materialsMap = {};
  let sizesMap = {};

  if (productIds.length > 0) {
    try {
      const [materialsRows, pricesRows] = await Promise.all([
        sequelize.query(
          `SELECT pm.id, pm.product_id, pm.name, pm.material_name, pm.description, pm.main_img_path, mm.name as master_material_name,
                  (SELECT pmi.img_path FROM product_material_images pmi WHERE pmi.product_material_id = pm.id AND (pmi.action IS NULL OR pmi.action != '1') LIMIT 1) as mat_img
           FROM product_materials pm
           LEFT JOIN material_masters mm ON (pm.name = mm.id OR pm.name = mm.name)
           WHERE pm.product_id IN (?) AND (pm.action IS NULL OR pm.action != '1')
           ORDER BY pm.id ASC`,
          { replacements: [productIds], type: QueryTypes.SELECT }
        ),
        sequelize.query(
          `SELECT DISTINCT product_id, size FROM product_prices 
           WHERE product_id IN (?) AND size IS NOT NULL AND size != '' AND (is_out_stock IS NULL OR is_out_stock != '1')`,
          { replacements: [productIds], type: QueryTypes.SELECT }
        ),
      ]);

      materialsRows.forEach((m) => {
        if (!materialsMap[m.product_id]) materialsMap[m.product_id] = [];
        materialsMap[m.product_id].push({
          id: m.id,
          name: m.master_material_name || m.name || "",
          material_name: m.material_name || m.master_material_name || "",
          description: m.description || "",
          image: formatImageUrl(m.mat_img || m.main_img_path),
        });
      });

      pricesRows.forEach((pr) => {
        if (!sizesMap[pr.product_id]) sizesMap[pr.product_id] = [];
        if (!sizesMap[pr.product_id].includes(pr.size)) {
          sizesMap[pr.product_id].push(pr.size);
        }
      });
    } catch (auxErr) {
      console.warn("Auxiliary data fetch warning:", auxErr.message);
    }
  }

  // Format final product cards
  const formattedProducts = rawProducts.map((p) => {
    const pMaterials = materialsMap[p.id] || [];
    const pSizes = sizesMap[p.id] || [];
    const fullImg = formatImageUrl(p.image_path) || "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80";
    const priceVal = parseFloat(p.effective_price || p.original_price || 499);
    const origVal = parseFloat(p.original_price || priceVal);
    const discountVal = parseInt(p.discount_pct || 0, 10);

    const allText = `${p.product_name} ${p.description || ""} ${pMaterials.map((m) => `${m.name} ${m.material_name}`).join(" ")}`;
    const fabrics = extractFabrics(allText, pMaterials);
    const colors = extractColors(allText, pMaterials);
    const occasions = extractOccasions(allText, p.category_name, p.subcategory_name);

    return {
      id: p.id,
      product_id: p.id,
      title: p.product_name,
      product_name: p.product_name,
      description: p.description || "",
      category_id: p.category_id,
      category_name: p.category_name || "Atelier",
      subcategory_id: p.subcategory_id,
      subcategory_name: p.subcategory_name || "",
      brand: p.brand || "Bespoke",
      shop_name: p.shop_name,
      vendor_id: p.vendor_id,
      vendor_name: p.brand,
      vendor_image: formatImageUrl(p.vendor_image),
      image: fullImg,
      main_image: fullImg,
      images: [fullImg],
      price: priceVal,
      original_price: origVal,
      discount_percentage: discountVal,
      discount_label: discountVal > 0 ? `${discountVal}% OFF` : null,
      is_customizable: Boolean(p.is_customizable),
      rating: parseFloat(p.rating || 4.8),
      rating_count: 15,
      sizes: pSizes,
      fabrics,
      fabric: fabrics[0] || "Cotton",
      colors,
      color: colors[0] || "Multicolor",
      occasions,
      occasion: occasions[0] || "Festive",
      materials: pMaterials,
      variant_name: pMaterials[0]?.material_name || null,
    };
  });

  // 3. Dynamic Facets Generation across all matching items
  const facetsQuery = `
    SELECT 
      p.id,
      p.category as category_id,
      c.name as category_name,
      p.subcategory as subcategory_id,
      sc.name as subcategory_name,
      p.vendor_id,
      COALESCE(v.shop_name, v.brand_business_name, 'Bespoke') as brand_name,
      p.is_customizable,
      COALESCE(p.rating, 4.5) as rating,
      (SELECT COALESCE(MIN(pp.discount_price), MIN(pp.actual_price), 0) FROM product_prices pp WHERE pp.product_id = p.id) as price,
      (SELECT GROUP_CONCAT(DISTINCT pp.size) FROM product_prices pp WHERE pp.product_id = p.id AND pp.size IS NOT NULL AND pp.size != '') as all_sizes,
      (SELECT GROUP_CONCAT(DISTINCT CONCAT_WS(' ', pm.name, pm.material_name, mm.name)) FROM product_materials pm LEFT JOIN material_masters mm ON (pm.name = mm.id OR pm.name = mm.name) WHERE pm.product_id = p.id AND (pm.action IS NULL OR pm.action != '1')) as all_materials,
      p.product_name,
      p.description
    FROM products p
    LEFT JOIN categories c ON p.category = c.id
    LEFT JOIN subcategories sc ON p.subcategory = sc.id
    LEFT JOIN vendor_login v ON p.vendor_id = v.id
    ${whereSql}
    GROUP BY p.id
  `;

  let facetProducts = [];
  try {
    facetProducts = await sequelize.query(facetsQuery, {
      replacements,
      type: QueryTypes.SELECT,
    });
  } catch (fErr) {
    console.warn("Facet calculation warning:", fErr.message);
  }

  // Detect category context to hide irrelevant filters
  const sampleCat = (category_id || cleanQ || "").toLowerCase();
  const isSareeContext = sampleCat.includes("saree") || facetProducts.some((fp) => (fp.category_name || "").toLowerCase().includes("saree") || (fp.subcategory_name || "").toLowerCase().includes("saree"));
  const isNonClothing = sampleCat.includes("bottle") || sampleCat.includes("cup") || sampleCat.includes("toy") || facetProducts.every((fp) => (fp.category_name || "").toLowerCase().includes("cup") || (fp.category_name || "").toLowerCase().includes("bottle"));

  // Aggregation dictionaries
  const catCountMap = {};
  const subcatCountMap = {};
  const brandCountMap = {};
  const fabricCountMap = {};
  const colorCountMap = {};
  const sizeCountMap = {};
  const occasionCountMap = {};
  let minPrice = Infinity;
  let maxPrice = 0;
  let customCount = 0;
  let readyMadeCount = 0;

  facetProducts.forEach((p) => {
    // Categories
    if (p.category_id && p.category_name) {
      if (!catCountMap[p.category_id]) {
        catCountMap[p.category_id] = { id: p.category_id, name: p.category_name, count: 0 };
      }
      catCountMap[p.category_id].count++;
    }

    // Subcategories / Styles
    if (p.subcategory_id && p.subcategory_name) {
      if (!subcatCountMap[p.subcategory_id]) {
        subcatCountMap[p.subcategory_id] = { id: p.subcategory_id, name: p.subcategory_name, count: 0 };
      }
      subcatCountMap[p.subcategory_id].count++;
    }

    // Brands
    if (p.vendor_id && p.brand_name) {
      if (!brandCountMap[p.vendor_id]) {
        brandCountMap[p.vendor_id] = { id: p.vendor_id, name: p.brand_name, count: 0 };
      }
      brandCountMap[p.vendor_id].count++;
    }

    // Product Type
    if (p.is_customizable) customCount++;
    else readyMadeCount++;

    // Price range
    const pPrice = parseFloat(p.price || 0);
    if (pPrice > 0) {
      if (pPrice < minPrice) minPrice = pPrice;
      if (pPrice > maxPrice) maxPrice = pPrice;
    }

    // Sizes
    if (p.all_sizes) {
      p.all_sizes.split(",").forEach((sz) => {
        const sTrim = sz.trim();
        if (sTrim) {
          sizeCountMap[sTrim] = (sizeCountMap[sTrim] || 0) + 1;
        }
      });
    }

    // Fabrics and Colors
    const textCorpus = `${p.product_name || ""} ${p.description || ""} ${p.all_materials || ""}`;
    const pFabrics = extractFabrics(textCorpus);
    pFabrics.forEach((f) => {
      fabricCountMap[f] = (fabricCountMap[f] || 0) + 1;
    });

    const pColors = extractColors(textCorpus);
    pColors.forEach((c) => {
      colorCountMap[c] = (colorCountMap[c] || 0) + 1;
    });

    const pOccasions = extractOccasions(textCorpus, p.category_name, p.subcategory_name);
    pOccasions.forEach((o) => {
      occasionCountMap[o] = (occasionCountMap[o] || 0) + 1;
    });
  });

  // Construct Facets Object cleanly omitting irrelevant facets based on category
  const dynamicFilters = {
    categories: Object.values(catCountMap).sort((a, b) => b.count - a.count),
    subcategories: Object.values(subcatCountMap).sort((a, b) => b.count - a.count),
    brands: Object.values(brandCountMap).sort((a, b) => b.count - a.count),
    fabrics: !isNonClothing ? Object.entries(fabricCountMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) : [],
    colors: Object.entries(colorCountMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    sizes: !isNonClothing ? Object.entries(sizeCountMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) : [],
    occasions: !isNonClothing ? Object.entries(occasionCountMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) : [],
    product_types: [
      { type: "customizable", name: "Customizable", count: customCount },
      { type: "ready_made", name: "Ready to Wear", count: readyMadeCount },
    ].filter((pt) => pt.count > 0),
    price_range: {
      min: minPrice === Infinity ? 0 : Math.floor(minPrice),
      max: maxPrice === 0 ? 5000 : Math.ceil(maxPrice),
    },
    context: {
      is_saree: isSareeContext,
      is_non_clothing: isNonClothing,
    },
  };

  return {
    products: formattedProducts,
    total,
    page: pageNum,
    limit: limitNum,
    total_pages: totalPages,
    filters: dynamicFilters,
    applied_filters: {
      q: cleanQ,
      category_id: category_id || null,
      subcategory_id: subcategory_id || null,
      brand_id: brand_id || null,
      material: material || null,
      fabric: fabric || null,
      color: color || null,
      occasion: occasion || null,
      size: size || null,
      min_price: min_price || null,
      max_price: max_price || null,
      min_discount: min_discount || null,
      rating: rating || null,
      product_type: product_type || null,
      sort,
    },
  };
}
