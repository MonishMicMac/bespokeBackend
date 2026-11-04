import * as addressService from "../services/addressService.js";

/**
 * Helper to safely extract parameters from query, body, or params
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
 * API 1: Retrieve saved delivery addresses
 * GET /api/view/address?user_id={user_id}
 * Method: UserAddressController::index()
 */
export const index = async (req, res) => {
  try {
    const userId = getParam(req, "user_id", "id");
    const authenticatedUserId = req.user?.id;

    const result = await addressService.getUserAddresses({
      userId,
      authenticatedUserId,
    });

    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    console.error("Error in userAddressController.index:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
      data: [],
    });
  }
};

/**
 * API 2: Add a new delivery address
 * POST /api/add/address
 * Method: UserAddressController::store()
 */
export const store = async (req, res) => {
  try {
    const userId = req.body?.user_id || req.user?.id;
    const authenticatedUserId = req.user?.id;

    const result = await addressService.addAddress({
      userId,
      data: req.body || {},
      authenticatedUserId,
    });

    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    console.error("Error in userAddressController.store:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
    });
  }
};

/**
 * API 3: Update an existing delivery address
 * POST /api/edit/address
 * Method: UserAddressController::update()
 */
export const update = async (req, res) => {
  try {
    const addressId = getParam(req, "address_id", "id");
    const userId = getParam(req, "user_id") || req.user?.id;
    const authenticatedUserId = req.user?.id;

    const result = await addressService.editAddress({
      addressId,
      userId,
      data: req.body || {},
      authenticatedUserId,
    });

    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    console.error("Error in userAddressController.update:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
      data: [],
    });
  }
};

/**
 * API 4: Soft-delete a delivery address
 * POST /api/delete/address
 * Method: UserAddressController::destroy()
 */
export const destroy = async (req, res) => {
  try {
    const addressId = getParam(req, "address_id", "id");
    const userId = getParam(req, "user_id") || req.user?.id;
    const authenticatedUserId = req.user?.id;

    const result = await addressService.deleteAddress({
      addressId,
      userId,
      authenticatedUserId,
    });

    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    console.error("Error in userAddressController.destroy:", err);
    return res.status(500).json({
      status: "false",
      message: err.message,
      data: [],
    });
  }
};

