import * as vendorDesignerService from "../services/vendorDesignerService.js";

/**
 * Helper to extract parameter from query, body, or params
 */
const getParam = (req, ...keys) => {
  for (const key of keys) {
    if (req.params && req.params[key] !== undefined && req.params[key] !== "") {
      return req.params[key];
    }
    if (req.query && req.query[key] !== undefined && req.query[key] !== "") {
      return req.query[key];
    }
    if (req.body && req.body[key] !== undefined && req.body[key] !== "") {
      return req.body[key];
    }
  }
  return null;
};

/**
 * API 1: Boutique Listing
 * GET /api/shoplist/view
 * Method: VendorController::shoplistview
 */
export const getShopListView = async (req, res) => {
  try {
    const userId = getParam(req, "user_id");
    const result = await vendorDesignerService.getShopListView(userId);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error in getShopListView:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
    });
  }
};

/**
 * API 2: Boutique Product Listing
 * GET /api/shoplist/product
 * Method: VendorController::shopProductList
 */
export const getShopProductList = async (req, res) => {
  try {
    const params = {
      ...req.query,
      ...req.body,
    };
    // Ensure shop_id and user_id are set
    params.shop_id = getParam(req, "shop_id");
    params.user_id = getParam(req, "user_id");

    const result = await vendorDesignerService.getShopProductList(params);
    if (result.statusCode) {
      return res.status(result.statusCode).json(result.body);
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error in getShopProductList:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
    });
  }
};

/**
 * API 3: Designer Listing
 * GET /api/designerlist/view/{user_id?}
 * Method: DesignerController::designerlistview
 */
export const getDesignerListView = async (req, res) => {
  try {
    const userId = getParam(req, "user_id");
    const result = await vendorDesignerService.getDesignerListView(userId);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error in getDesignerListView:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
    });
  }
};

/**
 * API 4: Designer Product Listing
 * GET /api/designer/product
 * Method: DesignerController::designerProductList
 */
export const getDesignerProductList = async (req, res) => {
  try {
    const params = {
      ...req.query,
      ...req.body,
    };
    params.designer_id = getParam(req, "designer_id", "id");
    params.user_id = getParam(req, "user_id");

    const result = await vendorDesignerService.getDesignerProductList(params);
    if (result.statusCode) {
      return res.status(result.statusCode).json(result.body);
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error in getDesignerProductList:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
    });
  }
};

/**
 * API 5: Vendor Portfolio
 * GET /api/vendor/portfolio/{vendor_id}
 * Method: VendorController::getVendorPortfolio
 */
export const getVendorPortfolio = async (req, res) => {
  try {
    const vendorId = getParam(req, "vendor_id", "id");
    const result = await vendorDesignerService.getVendorPortfolio(vendorId);
    if (result.statusCode) {
      return res.status(result.statusCode).json(result.body);
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error in getVendorPortfolio:", err);
    return res.status(500).json({
      status: false,
      message: err.message,
    });
  }
};

/**
 * API 6: Add Vendor to Favorites
 * POST /api/favorite/vendor
 * Method: DesignerWishlistController::addToWishlist
 */
export const addVendorToFavorites = async (req, res) => {
  try {
    const userId = getParam(req, "user_id");
    const vendorId = getParam(req, "vendor_id", "designer_id");

    const result = await vendorDesignerService.addVendorToFavorites(userId, vendorId);
    if (result.statusCode) {
      return res.status(result.statusCode).json(result.body);
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error in addVendorToFavorites:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
    });
  }
};

/**
 * API 7: Remove Vendor from Favorites
 * POST /api/remove/favorite/vendor
 * Method: DesignerWishlistController::removeFromWishlist
 */
export const removeVendorFromFavorites = async (req, res) => {
  try {
    const userId = getParam(req, "user_id");
    const vendorId = getParam(req, "vendor_id", "designer_id");

    const result = await vendorDesignerService.removeVendorFromFavorites(userId, vendorId);
    if (result.statusCode) {
      return res.status(result.statusCode).json(result.body);
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error in removeVendorFromFavorites:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
    });
  }
};

/**
 * API 8: Add Boutique to Shop Wishlist
 * POST /api/addtoshopwishlist
 * Method: ShopWishlistController::addToShopWishlist
 */
export const addShopToWishlist = async (req, res) => {
  try {
    const userId = getParam(req, "user_id");
    const shopId = getParam(req, "shop_id", "vendor_id");

    const result = await vendorDesignerService.addShopToWishlist(userId, shopId);
    if (result.statusCode) {
      return res.status(result.statusCode).json(result.body);
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error in addShopToWishlist:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
    });
  }
};

export default {
  getShopListView,
  getShopProductList,
  getDesignerListView,
  getDesignerProductList,
  getVendorPortfolio,
  addVendorToFavorites,
  removeVendorFromFavorites,
  addShopToWishlist,
};

