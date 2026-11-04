import * as productCatalogService from "../services/productCatalogService.js";

/**
 * GET /api/product/list
 * GET /api/vendor/product/list
 * Method: ProductController::getVendorProducts
 */
export const getVendorProducts = async (req, res) => {
  try {
    const result = await productCatalogService.getVendorProducts(
      req.query,
      req.originalUrl || req.url
    );
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error in getVendorProducts:", err);
    return res.status(500).json({
      status: false,
      message: err.message,
    });
  }
};

/**
 * GET /api/show/product
 * Method: ProductController::productdetails
 */
export const getProductDetails = async (req, res) => {
  try {
    const rawProductId = req.query.product_id ?? req.body?.product_id;
    const rawUserId = req.query.user_id ?? req.body?.user_id;

    if (rawProductId === undefined || rawProductId === null || String(rawProductId).trim() === "") {
      return res.status(200).json({
        status: false,
        message: "The product id field is required.",
      });
    }

    if (!/^-?\d+$/.test(String(rawProductId).trim())) {
      return res.status(200).json({
        status: false,
        message: "The product id must be an integer.",
      });
    }

    if (rawUserId !== undefined && rawUserId !== null && String(rawUserId).trim() !== "") {
      if (!/^-?\d+$/.test(String(rawUserId).trim())) {
        return res.status(200).json({
          status: false,
          message: "The user id must be an integer.",
        });
      }
    }

    const productId = parseInt(rawProductId, 10);
    const userId =
      rawUserId !== undefined && rawUserId !== null && String(rawUserId).trim() !== ""
        ? parseInt(rawUserId, 10)
        : null;

    const result = await productCatalogService.getProductDetails(productId, userId);

    if (result.validationError) {
      return res.status(200).json({
        status: false,
        message: result.message,
      });
    }

    if (!result.success) {
      const statusCode = result.statusCode || 500;
      return res.status(statusCode).json({
        status: false,
        message: result.message || "Failed to retrieve product details",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Product details retrieved with lowest price image and whole product reviews.",
      data: result.data,
    });
  } catch (err) {
    console.error("Error in getProductDetails:", err);
    return res.status(500).json({
      status: false,
      message: err.message,
    });
  }
};

/**
 * GET /api/product-measurements/sizewise/:product_id?
 * POST /api/product-measurements/sizewise/:product_id?
 * And matching aliases:
 * - /api/product/measurement/sizewise/:product_id?
 * - /api/product/size-wise-measurements/:product_id?
 * Method: ProductController::getProductMeasurementSizeWise
 */
export const getProductMeasurementSizeWise = async (req, res) => {
  try {
    const productId =
      req.params.product_id ??
      req.query.product_id ??
      req.body?.product_id ??
      req.query.id ??
      req.body?.id;

    const result = await productCatalogService.getProductMeasurementSizeWise(productId);

    if (!result.success) {
      return res.status(result.statusCode || 500).json({
        status: false,
        message: result.message,
      });
    }

    return res.status(200).json({
      status: true,
      message: "Product measurement details sizewise retrieved successfully.",
      data: result.data,
    });
  } catch (err) {
    console.error("Error in getProductMeasurementSizeWise:", err);
    return res.status(500).json({
      status: false,
      message: `Error fetching measurement details: ${err.message}`,
    });
  }
};

/**
 * GET /api/product-size-details/:product_id
 * Method: ProductController::getProductSizeDetails
 * Delegates directly to getProductMeasurementSizeWise
 */
export const getProductSizeDetails = async (req, res) => {
  return getProductMeasurementSizeWise(req, res);
};

/**
 * GET /api/products/search
 * Method: ProductController::search
 */
export const searchProducts = async (req, res) => {
  try {
    const q = req.query.q;
    const result = await productCatalogService.searchProducts(q);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error in searchProducts:", err);
    return res.status(500).json({
      message: err.message,
      data: [],
    });
  }
};

export default {
  getVendorProducts,
  getProductDetails,
  getProductMeasurementSizeWise,
  getProductSizeDetails,
  searchProducts,
};
