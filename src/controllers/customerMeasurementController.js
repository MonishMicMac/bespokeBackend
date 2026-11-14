import * as customerMeasurementService from "../services/customerMeasurementService.js";

/**
 * Helper to safely extract parameters
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
 * API 1: Show Measurement List
 * GET /api/customer-measurement/list
 * Method: CustomerMeasurementController::getMeasurementList()
 */
export const getMeasurementList = async (req, res) => {
  try {
    const gender = getParam(req, "gender");
    const type = getParam(req, "type");
    const userId = getParam(req, "user_id");
    const custId = getParam(req, "cust_id");
    const customerId = getParam(req, "customer_id");
    const customerMeasurementNameId = getParam(req, "customer_measurement_name_id");
    const nameId = getParam(req, "name_id");

    const result = await customerMeasurementService.getMeasurementList({
      gender,
      type,
      userId,
      custId,
      customerId,
      customerMeasurementNameId,
      nameId,
    });

    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    console.error("Error in getMeasurementList:", err);
    return res.status(500).json({
      status: false,
      message: err.message,
      data: [],
    });
  }
};

/**
 * API 2: View Customer Measurements by cust_id / user_id
 * GET /api/customer-measurement/view/:user_id
 * Method: CustomerMeasurementController::show()
 */
export const show = async (req, res) => {
  try {
    const userId = getParam(req, "user_id", "cust_id", "customer_id", "id") || req.params.user_id || req.params.cust_id || req.user?.id;
    const customerMeasurementNameId = getParam(req, "customer_measurement_name_id");
    const nameId = getParam(req, "name_id");
    const authenticatedUserId = req.user?.id;

    const result = await customerMeasurementService.showCustomerMeasurements({
      userId,
      custId: userId,
      customerMeasurementNameId,
      nameId,
      authenticatedUserId,
    });

    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    console.error("Error in showCustomerMeasurements:", err);
    return res.status(500).json({
      status: false,
      message: err.message,
      data: [],
    });
  }
};

/**
 * API 3: Create Customer Measurement Profile & Add Bulk Measurements
 * POST /api/customer-measurement/create
 * Method: CustomerMeasurementController::store()
 */
export const store = async (req, res) => {
  try {
    const userId = req.body?.user_id || req.body?.cust_id || req.user?.id;
    const authenticatedUserId = req.user?.id;

    const result = await customerMeasurementService.createCustomerMeasurements({
      userId,
      data: req.body || {},
      authenticatedUserId,
    });

    return res.status(result.statusCode || 201).json(result.body);
  } catch (err) {
    console.error("Error in createCustomerMeasurements:", err);
    return res.status(500).json({
      status: false,
      message: err.message,
    });
  }
};

/**
 * API 4: Edit/Update Single or Multiple Measurements
 * POST /api/customer-measurement/update/{cust_measurement_id?}
 * Method: CustomerMeasurementController::update()
 */
export const update = async (req, res) => {
  try {
    const targetId = req.params.cust_measurement_id || req.body?.cust_measurement_id || req.body?.id;
    const authenticatedUserId = req.user?.id;

    const result = await customerMeasurementService.updateCustomerMeasurements({
      targetId,
      data: req.body || {},
      authenticatedUserId,
    });

    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    console.error("Error in updateCustomerMeasurements:", err);
    return res.status(500).json({
      status: false,
      message: err.message,
    });
  }
};

/**
 * Get measurement profiles for a given user
 * GET /api/customer-measurement/names/{user_id}
 * Method: CustomerMeasurementController::getMeasurementNames()
 */
export const getMeasurementNames = async (req, res) => {
  try {
    const userId = req.params.user_id || req.params.cust_measurement_id || req.user?.id;
    const result = await customerMeasurementService.getMeasurementNames(userId);
    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    console.error("Error in getMeasurementNames:", err);
    return res.status(500).json({
      status: false,
      message: err.message,
      data: [],
    });
  }
};

/**
 * Delete an entire measurement profile and its linked measurements
 * POST /api/customer-measurement/delete?profile_id=...
 */
export const deleteProfile = async (req, res) => {
  try {
    const profileId =
      req.query?.profile_id ||
      req.body?.profile_id ||
      req.params?.id ||
      req.body?.id;
    const result = await customerMeasurementService.deleteProfile(profileId);
    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    console.error("Error in deleteProfile:", err);
    return res.status(500).json({
      status: false,
      message: err.message,
    });
  }
};
