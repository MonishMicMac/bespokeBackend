import {
  getHomepageBanners,
  getCategoriesView,
  getCategoriesPaginated,
  getSubcategoriesPaginated,
  getSubcategoryList,
  getSubcategoriesByCategory,
  getSpotlightView,
  getDesignerView,
  getCurrentDealsView,
  getSuperSaveDealsView,
  getWomenWearView,
} from "../services/homepageService.js";
import { validateCategoryIdExists } from "../validators/homepageValidator.js";

/**
 * API 1: Homepage Banners
 * GET /api/homepage/view
 */
export const getHomepageView = async (req, res) => {
  try {
    const userId = req.query.user_id || req.body?.user_id || null;
    const result = await getHomepageBanners(userId);
    return res.status(result.statusCode).json(result.response);
  } catch (error) {
    console.error("❌ [HomepageController::getHomepageView] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "Failed to retrieve homepage banners",
      data: [],
    });
  }
};

/**
 * RESTful Categories List (Matching Laravel GET /api/categories)
 * GET /api/categories
 */
export const getCategories = async (req, res) => {
  try {
    const result = await getCategoriesPaginated(req.query);
    return res.status(result.statusCode).json(result.response);
  } catch (error) {
    console.error("❌ [HomepageController::getCategories] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "Failed to retrieve categories",
      data: [],
      pagination: { current_page: 1, per_page: 10, total: 0, last_page: 1 },
    });
  }
};

/**
 * RESTful Subcategories List (Matching Laravel GET /api/subcategories)
 * GET /api/subcategories
 */
export const getSubcategoriesList = async (req, res) => {
  try {
    const result = await getSubcategoriesPaginated(req.query);
    return res.status(result.statusCode).json(result.response);
  } catch (error) {
    console.error("❌ [HomepageController::getSubcategoriesList] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "Failed to retrieve subcategories",
      data: [],
    });
  }
};

/**
 * API 2: Categories (Customer & Vendor view)
 * GET /api/category/view
 * GET /api/vendor/category/view
 */
export const getCategoryView = async (req, res) => {
  try {
    const result = await getCategoriesView();
    return res.status(result.statusCode).json(result.response);
  } catch (error) {
    console.error("❌ [HomepageController::getCategoryView] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "Failed to retrieve categories",
    });
  }
};

/**
 * API 3: Public Subcategory List
 * GET /api/view/subcategory
 */
export const getSubcategories = async (req, res) => {
  try {
    const categoryId = req.query.category_id || req.query.id || null;
    const result = await getSubcategoryList(categoryId);
    return res.status(result.statusCode).json(result.response);
  } catch (error) {
    console.error("❌ [HomepageController::getSubcategories] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "Failed to retrieve subcategories",
      data: [],
    });
  }
};

/**
 * API 4: Subcategories by Category
 * GET /api/vendor/subcategories/by-category/:category_id
 */
export const getSubcategoriesByCat = async (req, res) => {
  try {
    const { category_id } = req.params;
    const validation = await validateCategoryIdExists(category_id);
    if (!validation.isValid) {
      return res.status(validation.statusCode).json(validation.response);
    }

    const result = await getSubcategoriesByCategory(Number(category_id));
    return res.status(result.statusCode).json(result.response);
  } catch (error) {
    console.error("❌ [HomepageController::getSubcategoriesByCat] error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Failed to retrieve subcategories for category",
    });
  }
};

/**
 * API 5: Spotlight
 * GET /api/spotlight/view
 */
export const getSpotlight = async (req, res) => {
  try {
    const result = await getSpotlightView();
    return res.status(result.statusCode).json(result.response);
  } catch (error) {
    console.error("❌ [HomepageController::getSpotlight] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "Failed to retrieve spotlight items",
      data: [],
    });
  }
};

/**
 * API 6: Designers
 * GET /api/designer/view
 */
export const getDesigners = async (req, res) => {
  try {
    const result = await getDesignerView();
    return res.status(result.statusCode).json(result.response);
  } catch (error) {
    console.error("❌ [HomepageController::getDesigners] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "Failed to retrieve designers",
      data: [],
    });
  }
};

/**
 * API 7: Current Deals
 * GET /api/currentdeals/view
 */
export const getCurrentDeals = async (req, res) => {
  try {
    const userId = req.query.user_id || req.body?.user_id || null;
    const result = await getCurrentDealsView(userId);
    return res.status(result.statusCode).json(result.response);
  } catch (error) {
    console.error("❌ [HomepageController::getCurrentDeals] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "Failed to retrieve current deals",
      data: [],
    });
  }
};

/**
 * API 8: Super Save Deals
 * GET /api/supersavedeals/view
 */
export const getSuperSaveDeals = async (req, res) => {
  try {
    const userId = req.query.user_id || req.body?.user_id || null;
    const result = await getSuperSaveDealsView(userId);
    return res.status(result.statusCode).json(result.response);
  } catch (error) {
    console.error("❌ [HomepageController::getSuperSaveDeals] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "Failed to retrieve super save deals",
      data: [],
    });
  }
};

/**
 * API 9: Womenwear / Top Sellers
 * GET /api/womenwear/view
 */
export const getWomenWear = async (req, res) => {
  try {
    const userId = req.query.user_id || req.body?.user_id || null;
    const allowAutoHeal = req.query.auto_heal === "true";
    const result = await getWomenWearView(userId, allowAutoHeal);
    return res.status(result.statusCode).json(result.response);
  } catch (error) {
    console.error("❌ [HomepageController::getWomenWear] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "Failed to retrieve women wear items",
      data: [],
    });
  }
};

