import * as recommendationService from "../services/recommendationService.js";

/**
 * GET /api/products/:productId/recommendations
 * GET /api/product/:productId/recommendations
 * GET /api/show/product/recommendations?product_id=...
 */
export const getProductRecommendations = async (req, res) => {
  try {
    const rawProductId =
      req.params.productId ??
      req.params.id ??
      req.query.product_id ??
      req.query.productId ??
      req.body?.product_id;

    if (!rawProductId || String(rawProductId).trim() === "") {
      return res.status(200).json({
        status: false,
        message: "The product id field is required.",
        recommendations: [],
      });
    }

    const productId = String(rawProductId).trim();
    const limit = parseInt(req.query.limit, 10) || 12;

    const result = await recommendationService.getRecommendedProducts(productId, { limit });

    return res.status(200).json(result);
  } catch (err) {
    console.error("Error in getProductRecommendations:", err);
    return res.status(500).json({
      status: false,
      message: "Internal server error fetching recommendations: " + err.message,
      recommendations: [],
    });
  }
};

