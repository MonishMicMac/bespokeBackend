import { QueryTypes, Op } from "sequelize";
import sequelize from "../../config/db.js";
import AppBanner from "../../models/AppBanner.js";
import Category from "../../models/Category.js";
import Subcategory from "../../models/Subcategory.js";
import Spotlight from "../../models/Spotlight.js";
import Designer from "../../models/Designer.js";
import CurrentDeals from "../../models/CurrentDeals.js";
import SuperSaveDeals from "../../models/SuperSaveDeals.js";
import WomenWear from "../../models/WomenWear.js";
import Product from "../../models/Product.js";
import ProductPrice from "../../models/ProductPrice.js";
import ProductMaterialImage from "../../models/ProductMaterialImage.js";
import UserFavourites from "../../models/UserFavourites.js";
import UserCartItem from "../../models/UserCartItem.js";
import VendorWishlist from "../../models/VendorWishlist.js";
import VendorLogin from "../../models/VendorLogin.js";
import { buildFileUrl } from "../utils/fileUrl.js";

/**
 * API 1: Homepage Banners (AppBannerController::homepageview)
 * GET /api/homepage/view
 */
export async function getHomepageBanners(userId) {
  const banners = await AppBanner.findAll({
    attributes: [
      "id",
      "img_path",
      "type",
      "navigate",
      "searchfield_id",
      "searchfield_text",
    ],
    where: { action: "0" },
  });

  if (!banners || banners.length === 0) {
    return {
      statusCode: 404,
      response: {
        status: "false",
        message: "No data found",
        data: [],
      },
    };
  }

  // Pre-load user wishlist / cart if userId provided
  let designerWishlistSet = new Set();
  let userFavSet = new Set();
  let userCartPriceSet = new Set();

  if (userId) {
    const designerWishlists = await VendorWishlist.findAll({
      attributes: ["designer_id"],
      where: {
        user_id: String(userId),
        action: "0",
      },
    });
    designerWishlistSet = new Set(designerWishlists.map((w) => String(w.designer_id)));

    const favs = await UserFavourites.findAll({
      attributes: ["product_id"],
      where: {
        user_id: userId,
        action: "0",
      },
    });
    userFavSet = new Set(favs.map((f) => String(f.product_id)));

    const carts = await UserCartItem.findAll({
      attributes: ["price_id"],
      where: {
        user_id: userId,
        action: "0",
      },
    });
    userCartPriceSet = new Set(carts.map((c) => String(c.price_id)));
  }

  const formattedBanners = banners.map((b) => {
    const banner = b.toJSON();
    banner.img_path = buildFileUrl(banner.img_path);
    banner.iswishlisted = false;
    banner.iscarted = false;

    if (userId && banner.searchfield_id) {
      const searchId = String(banner.searchfield_id);
      if (String(banner.navigate) === "2") {
        banner.iswishlisted = designerWishlistSet.has(searchId);
      } else if (String(banner.navigate) === "1") {
        banner.iswishlisted = userFavSet.has(searchId);
        banner.iscarted = userCartPriceSet.has(searchId);
      }
    }

    return banner;
  });

  return {
    statusCode: 200,
    response: {
      status: "true",
      message: "Data Retrieved Successfully",
      data: formattedBanners,
    },
  };
}

function formatLaravelTimestamp(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  const utcMs = d.getTime() - 5.5 * 3600000;
  const utcD = new Date(utcMs);
  return utcD.toISOString().replace(/\.\d{3}Z$/, ".000000Z");
}

function formatSqlDate(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * RESTful Categories List (Matching Laravel GET /api/categories)
 * GET /api/categories
 */
export async function getCategoriesPaginated(queryParams = {}) {
  const page = Math.max(1, parseInt(queryParams.page || 1, 10));
  const perPage = Math.max(1, parseInt(queryParams.per_page || 10, 10));
  const offset = (page - 1) * perPage;

  const { count, rows } = await Category.findAndCountAll({
    where: { action: "0" },
    order: [["id", "DESC"]],
    limit: perPage,
    offset,
  });

  const formatted = rows.map((c) => {
    const fullImg = buildFileUrl(c.img_path);
    return {
      id: Number(c.id),
      type: String(c.type ?? ""),
      name: c.name,
      img_path: fullImg,
      action: String(c.action ?? "0"),
      c_date: formatSqlDate(c.c_date),
      created_at: formatLaravelTimestamp(c.created_at),
      updated_at: formatLaravelTimestamp(c.updated_at),
      image: fullImg,
      image_url: fullImg,
      cover_image: fullImg,
      category_name: c.name,
      category_type: String(c.type ?? ""),
    };
  });

  const total = count;
  const lastPage = Math.ceil(total / perPage) || 1;

  return {
    statusCode: 200,
    response: {
      status: "true",
      data: formatted,
      pagination: {
        current_page: page,
        per_page: perPage,
        total: total,
        last_page: lastPage,
      },
    },
  };
}

/**
 * RESTful Subcategories List (Matching Laravel GET /api/subcategories)
 * GET /api/subcategories
 */
export async function getSubcategoriesPaginated(queryParams = {}) {
  const page = Math.max(1, parseInt(queryParams.page || 1, 10));
  const perPage = Math.max(1, parseInt(queryParams.per_page || 10, 10));
  const offset = (page - 1) * perPage;

  const where = { action: "0" };
  if (queryParams.category_id || queryParams.category) {
    where.category_id = Number(queryParams.category_id || queryParams.category);
  }

  const { count, rows } = await Subcategory.findAndCountAll({
    where,
    order: [["id", "DESC"]],
    limit: perPage,
    offset,
  });

  const catIds = [...new Set(rows.map((s) => s.category_id).filter(Boolean))];
  const categories =
    catIds.length > 0
      ? await Category.findAll({
          where: { id: catIds },
        })
      : [];

  const catMap = {};
  for (const c of categories) {
    const fullImg = buildFileUrl(c.img_path);
    catMap[c.id] = {
      id: Number(c.id),
      type: String(c.type ?? ""),
      name: c.name,
      img_path: fullImg,
      action: String(c.action ?? "0"),
      c_date: formatSqlDate(c.c_date),
      created_at: formatLaravelTimestamp(c.created_at),
      updated_at: formatLaravelTimestamp(c.updated_at),
    };
  }

  const formatted = rows.map((s) => {
    const fullImg = buildFileUrl(s.img_path);
    return {
      id: Number(s.id),
      name: s.name,
      category_type: String(s.category_type ?? ""),
      category_id: Number(s.category_id),
      img_path: fullImg,
      action: String(s.action ?? "0"),
      created_at: formatLaravelTimestamp(s.created_at),
      updated_at: formatLaravelTimestamp(s.updated_at),
      image_url: fullImg,
      image: fullImg,
      cover_image: fullImg,
      category: catMap[s.category_id] || null,
      measurements: [],
    };
  });

  const total = count;
  const lastPage = Math.ceil(total / perPage) || 1;

  return {
    statusCode: 200,
    response: {
      status: true,
      data: formatted,
      pagination: {
        current_page: page,
        per_page: perPage,
        total: total,
        last_page: lastPage,
      },
    },
  };
}

/**
 * API 2: Categories (CategoryController::view)
 * GET /api/category/view & GET /api/vendor/category/view
 */
export async function getCategoriesView() {
  const categories = await Category.findAll({
    attributes: ["id", "name", "type", "img_path", "action", "c_date", "created_at", "updated_at"],
    where: { action: "0" },
    order: [["id", "DESC"]],
  });

  const subcategories = await Subcategory.findAll({
    attributes: ["id", "name", "category_id", "category_type", "img_path", "action", "created_at", "updated_at"],
    where: { action: "0" },
    order: [["id", "DESC"]],
  });

  if ((!categories || categories.length === 0) && (!subcategories || subcategories.length === 0)) {
    return {
      statusCode: 200,
      response: {
        status: "false",
        message: "No records found",
      },
    };
  }

  // Format subcategories
  const formattedSubcategories = subcategories.map((sub) => {
    const s = sub.toJSON();
    const fullUrl = buildFileUrl(s.img_path);
    s.img_path = fullUrl;
    s.image = fullUrl;
    s.image_url = fullUrl;
    s.cover_image = fullUrl;
    s.created_at = formatLaravelTimestamp(s.created_at);
    s.updated_at = formatLaravelTimestamp(s.updated_at);
    return s;
  });

  // Group subcategories by category_id
  const subcatByCatId = {};
  for (const s of formattedSubcategories) {
    const cid = String(s.category_id);
    if (!subcatByCatId[cid]) {
      subcatByCatId[cid] = [];
    }
    subcatByCatId[cid].push(s);
  }

  // Format categories
  const formattedCategories = categories.map((cat) => {
    const c = cat.toJSON();
    const fullUrl = buildFileUrl(c.img_path);
    c.img_path = fullUrl;
    c.image = fullUrl;
    c.image_url = fullUrl;
    c.cover_image = fullUrl;
    c.category_name = c.name;
    c.category_type = c.type;
    c.c_date = formatSqlDate(c.c_date);
    c.created_at = formatLaravelTimestamp(c.created_at);
    c.updated_at = formatLaravelTimestamp(c.updated_at);
    c.subcategories = subcatByCatId[String(c.id)] || [];
    return c;
  });

  return {
    statusCode: 200,
    response: {
      status: "true",
      message: "Data retrieved successfully",
      categories: formattedCategories, // Important: uses 'categories' key matching PHP
      data: formattedCategories, // Also provide 'data' key for universal client compatibility
    },
  };
}

/**
 * API 3: Public Subcategory List (SubCatController::subcategorylist)
 * GET /api/view/subcategory
 */
export async function getSubcategoryList(categoryId) {
  const where = { action: "0" };
  if (categoryId !== undefined && categoryId !== null && String(categoryId).trim() !== "") {
    where.category_id = Number(categoryId);
  }

  const subcategories = await Subcategory.findAll({
    attributes: ["id", "name", "category_type", "category_id", "img_path"],
    where,
  });

  if (!subcategories || subcategories.length === 0) {
    return {
      statusCode: 200,
      response: {
        status: "false",
        message: "No Subcategory Found",
        data: [],
      },
    };
  }

  const formatted = subcategories.map((sub) => {
    const s = sub.toJSON();
    const fullUrl = buildFileUrl(s.img_path);
    s.img_path = fullUrl;
    s.image_url = fullUrl;
    s.image = fullUrl;
    s.cover_image = fullUrl;
    return s;
  });

  return {
    statusCode: 200,
    response: {
      status: "true",
      message: "Data retrieved successfully.",
      data: formatted,
    },
  };
}

/**
 * API 4: Subcategories by Category (SubCategoryController::getByCategory)
 * GET /api/vendor/subcategories/by-category/:category_id
 */
export async function getSubcategoriesByCategory(categoryId) {
  const category = await Category.findByPk(categoryId);
  if (!category) {
    return {
      statusCode: 422,
      response: {
        status: false,
        message: "The selected category id is invalid.",
      },
    };
  }

  const subcategories = await Subcategory.findAll({
    where: {
      category_id: categoryId,
      action: "0",
    },
    order: [["name", "ASC"]],
  });

  const formatted = subcategories.map((sub) => {
    const s = sub.toJSON();
    const fullUrl = buildFileUrl(s.img_path);
    s.img_path = fullUrl;
    s.image_url = fullUrl;
    s.image = fullUrl;
    s.cover_image = fullUrl;
    s.category = {
      id: category.id,
      name: category.name,
    };
    return s;
  });

  return {
    statusCode: 200,
    response: {
      status: true,
      data: formatted,
    },
  };
}

/**
 * API 5: Spotlight (SpotlightController::spotlightview)
 * GET /api/spotlight/view
 */
export async function getSpotlightView() {
  const spotlights = await Spotlight.findAll({
    attributes: [
      "id",
      "shop_id",
      "shop_name",
      "background_image",
      "price",
      "title",
      "brand_logo",
    ],
    where: { action: "0" },
  });

  if (!spotlights || spotlights.length === 0) {
    return {
      statusCode: 200,
      response: {
        status: "false",
        message: "No spotlist found.",
        data: [],
      },
    };
  }

  const formatted = spotlights.map((item) => {
    const s = item.toJSON();
    s.background_image = buildFileUrl(s.background_image);
    s.brand_logo = buildFileUrl(s.brand_logo);
    return s;
  });

  return {
    statusCode: 200,
    response: {
      status: "true",
      message: "Data retrieved successfully.",
      data: formatted,
    },
  };
}

/**
 * API 6: Designers (DesignerController::designerview)
 * GET /api/designer/view
 */
export async function getDesignerView() {
  const designers = await Designer.findAll({
    attributes: [
      "id",
      "designer_id",
      "designer_name",
      "designer_image",
      "designer_title",
      "designer_rating",
    ],
    where: { action: "0" },
  });

  if (!designers || designers.length === 0) {
    return {
      statusCode: 200,
      response: {
        status: "false",
        message: "No Top Designer Found",
        data: [],
      },
    };
  }

  const formatted = designers.map((item) => {
    const d = item.toJSON();
    d.designer_image = buildFileUrl(d.designer_image);
    return d;
  });

  return {
    statusCode: 200,
    response: {
      status: "true",
      message: "Data retrieved successfully.",
      data: formatted,
    },
  };
}

/**
 * Helper: Find whether products are in wishlist and cart for given user
 */
async function getUserWishlistAndCartMap(userId, productIds) {
  const wishlistSet = new Set();
  const cartSet = new Set();

  if (!userId || !productIds || productIds.length === 0) {
    return { wishlistSet, cartSet };
  }

  const strProductIds = productIds.map(String);

  // User Favourites (Wishlist)
  const favs = await UserFavourites.findAll({
    attributes: ["product_id"],
    where: {
      user_id: userId,
      product_id: { [Op.in]: strProductIds },
      action: "0",
    },
  });
  favs.forEach((f) => wishlistSet.add(String(f.product_id)));

  // User Cart (joins product_prices on user_cart_items.price_id = product_prices.id)
  const cartItems = await sequelize.query(
    `SELECT pp.product_id
     FROM user_cart_items uci
     JOIN product_prices pp ON uci.price_id = pp.id
     WHERE uci.user_id = ?
       AND pp.product_id IN (?)
       AND uci.action = '0'`,
    {
      replacements: [userId, strProductIds],
      type: QueryTypes.SELECT,
    }
  );
  cartItems.forEach((c) => cartSet.add(String(c.product_id)));

  return { wishlistSet, cartSet };
}

/**
 * API 7: Current Deals (CurrentDealsController::currentdealsview)
 * GET /api/currentdeals/view
 */
export async function getCurrentDealsView(userId) {
  const query = `
    SELECT
      cd.id,
      cd.name,
      cd.product_id,
      p.product_name,
      p.main_image,
      c.name AS category,
      sc.name AS subcategory,
      pp.actual_price
    FROM current_deals cd
    LEFT JOIN products p ON (cd.product_id = p.id OR cd.product_id = p.product_id)
    LEFT JOIN categories c ON p.category = c.id
    LEFT JOIN subcategories sc ON p.subcategory = sc.id
    LEFT JOIN product_prices pp ON pp.id = (
      SELECT MIN(sub_pp.id)
      FROM product_prices sub_pp
      WHERE sub_pp.product_id = p.id
    )
    WHERE cd.action = '0'
      AND cd.product_id IS NOT NULL
      AND cd.product_id != ''
    ORDER BY cd.id DESC
  `;

  const rows = await sequelize.query(query, { type: QueryTypes.SELECT });

  if (!rows || rows.length === 0) {
    return {
      statusCode: 200,
      response: {
        status: "false",
        message: "No Current Deals Found",
        data: [],
      },
    };
  }

  // Deduplicate by product_id preserving descending deal id order
  const seenProducts = new Set();
  const uniqueDeals = [];
  for (const deal of rows) {
    const pid = String(deal.product_id);
    if (!seenProducts.has(pid)) {
      seenProducts.add(pid);
      uniqueDeals.push(deal);
    }
  }

  const productIds = uniqueDeals.map((d) => d.product_id).filter(Boolean);

  // Fetch product material images prioritized by active status and id
  let materialImagesMap = {};
  if (productIds.length > 0) {
    const matImages = await sequelize.query(
      `SELECT product_id, img_path
       FROM product_material_images
       WHERE product_id IN (?)
       ORDER BY (CASE WHEN action = '0' OR action = 0 OR action IS NULL THEN 0 ELSE 1 END) ASC, id ASC`,
      {
        replacements: [productIds],
        type: QueryTypes.SELECT,
      }
    );
    for (const img of matImages) {
      const pid = String(img.product_id);
      if (!materialImagesMap[pid]) {
        materialImagesMap[pid] = img.img_path;
      }
    }
  }

  const { wishlistSet, cartSet } = await getUserWishlistAndCartMap(userId, productIds);

  const formatted = uniqueDeals.map((deal) => {
    const pid = String(deal.product_id);
    const materialImgPath = materialImagesMap[pid] || deal.main_image || null;
    const resolvedImage = buildFileUrl(materialImgPath);

    return {
      id: deal.id,
      name: deal.name,
      product_id: deal.product_id,
      product_name: deal.product_name,
      main_image: resolvedImage,
      category: deal.category || null,
      subcategory: deal.subcategory || null,
      actual_price: deal.actual_price ? String(deal.actual_price) : null,
      iswishlisted: wishlistSet.has(pid),
      iscarted: cartSet.has(pid),
    };
  });

  return {
    statusCode: 200,
    response: {
      status: "true",
      message: "Data Retrieved Successfully",
      data: formatted,
    },
  };
}

/**
 * API 8: Super Saver Deals (SuperSaveDealsController::supersavedealsview)
 * GET /api/supersavedeals/view
 */
export async function getSuperSaveDealsView(userId) {
  const query = `
    SELECT
      ssd.id,
      ssd.name,
      ssd.product_id,
      ssd.title,
      ssd.price,
      ssd.brand_logo,
      p.product_name,
      p.main_image
    FROM super_save_deals ssd
    LEFT JOIN products p ON (ssd.product_id = p.id OR ssd.product_id = p.product_id)
    WHERE ssd.action = '0'
    ORDER BY ssd.id DESC
  `;

  const rows = await sequelize.query(query, { type: QueryTypes.SELECT });

  if (!rows || rows.length === 0) {
    return {
      statusCode: 200,
      response: {
        status: "false",
        message: "No Super Save Deals Found",
        data: [],
      },
    };
  }

  const productIds = rows.map((r) => r.product_id).filter(Boolean);

  let materialImagesMap = {};
  if (productIds.length > 0) {
    const matImages = await sequelize.query(
      `SELECT product_id, img_path
       FROM product_material_images
       WHERE product_id IN (?)
       ORDER BY (CASE WHEN action = '0' OR action = 0 OR action IS NULL THEN 0 ELSE 1 END) ASC, id ASC`,
      {
        replacements: [productIds],
        type: QueryTypes.SELECT,
      }
    );
    for (const img of matImages) {
      const pid = String(img.product_id);
      if (!materialImagesMap[pid]) {
        materialImagesMap[pid] = img.img_path;
      }
    }
  }

  const { wishlistSet, cartSet } = await getUserWishlistAndCartMap(userId, productIds);

  // Fetch active products for fallback if a deal references an orphaned product ID
  const activeProducts = await sequelize.query(
    "SELECT id, product_name, main_image FROM products WHERE action = '0' AND is_active = '1' ORDER BY id DESC LIMIT 10",
    { type: QueryTypes.SELECT }
  );

  const formatted = rows.map((deal, idx) => {
    let pid = String(deal.product_id);
    let prodName = deal.product_name;
    let fallbackImg = null;

    if (!prodName && activeProducts && activeProducts.length > 0) {
      const fallbackProd = activeProducts[idx % activeProducts.length];
      if (fallbackProd) {
        pid = String(fallbackProd.id);
        prodName = fallbackProd.product_name;
        fallbackImg = fallbackProd.main_image;
      }
    }

    const materialImgPath = materialImagesMap[pid] || deal.main_image || fallbackImg || null;

    return {
      id: deal.id,
      name: deal.name,
      product_id: pid,
      title: deal.title,
      price: deal.price,
      brand_logo: buildFileUrl(deal.brand_logo),
      product_name: prodName || null,
      main_image: buildFileUrl(materialImgPath),
      iswishlisted: wishlistSet.has(pid),
      iscarted: cartSet.has(pid),
    };
  });

  return {
    statusCode: 200,
    response: {
      status: "true",
      message: "Data Retrieved Successfully",
      data: formatted,
    },
  };
}

/**
 * Isolated Auto-healing logic for WomenWear product references
 */
export async function autoHealWomenWearReferences() {
  const allWomenWear = await WomenWear.findAll({ where: { action: "0" } });
  let healedCount = 0;

  for (const wear of allWomenWear) {
    const productExists = await Product.findOne({
      where: {
        [Op.or]: [{ id: wear.product_id }, { product_id: wear.product_id }],
      },
    });

    if (!productExists) {
      let matchedProductId = null;

      // 1. Try finding matching product from CurrentDeals
      if (wear.name) {
        const deals = await CurrentDeals.findAll({
          where: {
            name: wear.name,
            product_id: { [Op.ne]: null },
          },
          order: [["id", "DESC"]],
        });
        for (const deal of deals) {
          const dealProd = await Product.findOne({
            where: {
              [Op.or]: [{ id: deal.product_id }, { product_id: deal.product_id }],
            },
          });
          if (dealProd) {
            matchedProductId = deal.product_id;
            break;
          }
        }
      }

      // 2. Try finding matching product from SuperSaveDeals
      if (!matchedProductId && wear.name) {
        const ssds = await SuperSaveDeals.findAll({
          where: {
            name: wear.name,
            product_id: { [Op.ne]: null },
          },
          order: [["id", "DESC"]],
        });
        for (const ssd of ssds) {
          const ssdProd = await Product.findOne({
            where: {
              [Op.or]: [{ id: ssd.product_id }, { product_id: ssd.product_id }],
            },
          });
          if (ssdProd) {
            matchedProductId = ssd.product_id;
            break;
          }
        }
      }

      // 3. Try finding product by vendor name
      if (!matchedProductId && wear.name) {
        const vendor = await VendorLogin.findOne({
          where: {
            [Op.or]: [
              { shop_name: wear.name },
              { seller_name: wear.name },
              { contact_person: wear.name },
            ],
          },
        });
        if (vendor) {
          const vProd = await Product.findOne({
            where: { vendor_id: vendor.id, action: "0" },
            order: [["id", "DESC"]],
          });
          if (vProd) {
            matchedProductId = vProd.id;
          }
        }
      }

      // 4. Ultimate fallback to latest active product
      if (!matchedProductId) {
        const latestProd =
          (await Product.findOne({ where: { action: "0" }, order: [["id", "DESC"]] })) ||
          (await Product.findOne());
        if (latestProd) {
          matchedProductId = latestProd.id;
        }
      }

      if (matchedProductId) {
        await WomenWear.update(
          { product_id: String(matchedProductId) },
          { where: { id: wear.id } }
        );
        healedCount++;
      }
    }
  }

  return healedCount;
}

/**
 * API 9: Womenwear / Top Sellers (WomenWearController::womenwearview)
 * GET /api/womenwear/view
 */
export async function getWomenWearView(userId, allowAutoHeal = false) {
  if (allowAutoHeal) {
    await autoHealWomenWearReferences();
  }

  const query = `
    SELECT
      ww.id,
      ww.type,
      ww.name,
      ww.product_id,
      ww.brand_logo,
      p.product_name,
      p.main_image
    FROM women_wear ww
    LEFT JOIN products p ON (ww.product_id = p.id OR ww.product_id = p.product_id)
    WHERE ww.action = '0'
    ORDER BY ww.id ASC
  `;

  const rows = await sequelize.query(query, { type: QueryTypes.SELECT });

  if (!rows || rows.length === 0) {
    return {
      statusCode: 200,
      response: {
        status: "false",
        message: "No Women Wear Found",
        data: [],
      },
    };
  }

  const productIds = rows.map((r) => r.product_id).filter(Boolean);

  // Fetch product material images
  let materialImagesMap = {};
  if (productIds.length > 0) {
    const matImages = await sequelize.query(
      `SELECT product_id, img_path
       FROM product_material_images
       WHERE product_id IN (?)
       ORDER BY (CASE WHEN action = '0' OR action = 0 OR action IS NULL THEN 0 ELSE 1 END) ASC, id ASC`,
      {
        replacements: [productIds],
        type: QueryTypes.SELECT,
      }
    );
    for (const img of matImages) {
      const pid = String(img.product_id);
      if (!materialImagesMap[pid]) {
        materialImagesMap[pid] = img.img_path;
      }
    }
  }

  // Pre-fetch prices to calculate discount
  let priceMap = {};
  if (productIds.length > 0) {
    const prices = await sequelize.query(
      `SELECT product_id, actual_price, discount_price
       FROM product_prices
       WHERE product_id IN (?)
       ORDER BY id ASC`,
      {
        replacements: [productIds],
        type: QueryTypes.SELECT,
      }
    );
    for (const pr of prices) {
      const pid = String(pr.product_id);
      if (!priceMap[pid]) {
        priceMap[pid] = pr;
      }
    }
  }

  // Fallback material image if an item's image is completely missing
  const [anyMaterialImg] = await sequelize.query(
    `SELECT img_path FROM product_material_images WHERE img_path IS NOT NULL AND img_path != '' LIMIT 1`,
    { type: QueryTypes.SELECT }
  );
  const fallbackMaterialPath = anyMaterialImg?.img_path || null;

  const { wishlistSet, cartSet } = await getUserWishlistAndCartMap(userId, productIds);

  const formatted = rows.map((item) => {
    const pid = String(item.product_id);

    // Dynamic brand logo resolution
    let brandLogoUrl = null;
    if (item.brand_logo && item.brand_logo.trim() !== "") {
      const rawLogo = item.brand_logo.trim();
      if (rawLogo.startsWith("http://") || rawLogo.startsWith("https://")) {
        brandLogoUrl = rawLogo;
      } else {
        brandLogoUrl = buildFileUrl(`womenweartopsellerimages/${rawLogo.replace(/^\/+/, "")}`);
      }
    }

    // Material image priority with safety fallback
    const materialImgPath = materialImagesMap[pid] || item.main_image || fallbackMaterialPath;
    const resolvedImage = buildFileUrl(materialImgPath);

    // Calculate discount percentage
    let discount = 0;
    const pr = priceMap[pid];
    if (pr && Number(pr.actual_price) > 0 && pr.discount_price !== null && pr.discount_price !== undefined) {
      const actual = Number(pr.actual_price);
      const disc = Number(pr.discount_price);
      discount = Math.round(((actual - disc) / actual) * 100);
    }

    return {
      id: item.id,
      type: String(item.type ?? "2"),
      name: item.name,
      product_id: item.product_id,
      brand_logo: brandLogoUrl,
      product_name: item.product_name || null,
      main_image: resolvedImage,
      discount,
      iswishlisted: wishlistSet.has(pid),
      iscarted: cartSet.has(pid),
    };
  });

  // Sort by discount in descending order (matching PHP sortByDesc('discount')->values())
  formatted.sort((a, b) => b.discount - a.discount);

  return {
    statusCode: 200,
    response: {
      status: "true",
      message: "Data Retrieved Successfully",
      data: formatted,
    },
  };
}

