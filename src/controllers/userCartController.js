import * as cartService from "../services/cartService.js";

/**
 * Helper to extract parameters from req.params, req.query, or req.body
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
 * API 1: Get Customer Cart
 * GET /api/user-cart/:user_id
 * Method: UserProductController::getUserCart
 */
export const getUserCart = async (req, res) => {
  try {
    const userId = getParam(req, "user_id", "id");
    const result = await cartService.getUserCart(userId);
    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    console.error("Error in getUserCart:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
    });
  }
};

/**
 * API 2: Add Product to Cart
 * GET & POST /api/add/cart
 * Method: UserProductController::addcart
 */
export const addToCart = async (req, res) => {
  try {
    const payload = {
      ...req.query,
      ...req.body,
    };
    payload.user_id = getParam(req, "user_id", "userId");
    payload.price_id = getParam(req, "price_id", "priceId");
    payload.product_id = getParam(req, "product_id", "productId", "id");
    payload.size = getParam(req, "size");
    const rawQty = getParam(req, "qty", "quantity", "cart_qty");
    payload.qty = rawQty !== null && rawQty !== undefined ? rawQty : 1;
    payload.addon_id = getParam(req, "addon_id", "addonId");
    payload.vendor_id = getParam(req, "vendor_id", "vendorId");

    const result = await cartService.addToCart(payload);
    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    console.error("Error in addToCart:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
    });
  }
};

/**
 * API 3: Delete Cart Item
 * POST /api/delete/cart
 * Method: UserProductController::deleteCart
 */
export const deleteCart = async (req, res) => {
  try {
    const userId = getParam(req, "user_id");
    const cartId = getParam(req, "cart_id", "id");

    const result = await cartService.deleteCartItem(userId, cartId);
    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    console.error("Error in deleteCart:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
    });
  }
};

/**
 * API 4: Store Bespoke Measurements
 * POST /api/user-cart/store-measurement
 * Method: UserProductController::storeCartMeasurement
 */
export const storeCartMeasurement = async (req, res) => {
  try {
    const cartId = getParam(req, "cart_id");
    const measurmentDetails = req.body?.measurment_details ?? req.body?.measurement_details ?? req.body?.measurements;
    // Authenticated user if provided via middleware or token
    const authenticatedUserId = req.user?.id ?? req.body?.authenticated_user_id ?? null;

    const result = await cartService.storeCartMeasurement(cartId, measurmentDetails, authenticatedUserId);
    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    console.error("Error in storeCartMeasurement:", err);
    return res.status(500).json({
      status: false,
      message: err.message,
    });
  }
};

/**
 * API 5: Edit Cart
 * GET & POST /api/edit/cart
 * Method: UserProductController::editCart
 */
export const editCart = async (req, res) => {
  try {
    const payload = {
      ...req.query,
      ...req.body,
    };
    payload.user_id = getParam(req, "user_id");
    payload.cart_id = getParam(req, "cart_id");
    payload.price_id = getParam(req, "price_id");
    payload.qty = getParam(req, "qty", "quantity");
    payload.addon_id = getParam(req, "addon_id");

    const result = await cartService.editCart(payload);
    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    console.error("Error in editCart:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
    });
  }
};

export default {
  getUserCart,
  addToCart,
  deleteCart,
  storeCartMeasurement,
  editCart,
};

