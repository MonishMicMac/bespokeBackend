import * as wishlistService from "../services/wishlistService.js";

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
 * API 1: Retrieve user active wishlist products
 * GET /api/user-favorites/:user_id
 * Method: UserProductController::getUserFavorites
 */
export const getUserFavorites = async (req, res) => {
  try {
    const userId = getParam(req, "user_id", "id") ?? req.user?.id;
    const result = await wishlistService.getUserFavorites(userId);
    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    console.error("Error in getUserFavorites:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
    });
  }
};

/**
 * API 2: Add a product variant to the user's wishlist
 * POST /api/add/favorite
 * Method: FavouritesController::addfavorite
 */
export const addFavorite = async (req, res) => {
  try {
    const userId = getParam(req, "user_id") ?? req.user?.id;
    const priceId = getParam(req, "price_id");
    const productId = getParam(req, "product_id");

    const result = await wishlistService.addFavorite({
      userId,
      priceId,
      productId,
    });
    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    console.error("Error in addFavorite:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
    });
  }
};

/**
 * API 3: Remove a wishlist entry
 * POST /api/remove/favorite
 * Method: FavouritesController::removeFavorite
 */
export const removeFavorite = async (req, res) => {
  try {
    const wishlistId = getParam(req, "wishlist_id", "id");
    const userId = getParam(req, "user_id");
    const productId = getParam(req, "product_id");
    const authenticatedUserId = req.user?.id ?? null;

    const result = await wishlistService.removeFavorite({
      wishlistId,
      userId,
      productId,
      authenticatedUserId,
    });
    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    console.error("Error in removeFavorite:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
    });
  }
};

export default {
  getUserFavorites,
  addFavorite,
  removeFavorite,
};

