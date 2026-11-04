import SaleOrderReviewService from "../services/saleOrderReviewService.js";

/**
 * Controller for Sale Order Customer Reviews (System A).
 * Reproduces App\Http\Controllers\api\SaleOrderReviewController.
 */
class SaleOrderReviewController {
  /**
   * POST /api/user/sale-order/review
   * Store or update a customer review for a sale order.
   */
  static async storeReview(req, res) {
    try {
      const body = req.body || {};
      const query = req.query || {};

      const saleOrderId = body.sale_order_id || query.sale_order_id;
      const userId = body.user_id || query.user_id || req.user?.id;
      const ratings = body.ratings !== undefined ? body.ratings : (body.rating !== undefined ? body.rating : query.ratings);
      const reviewText = body.review !== undefined ? body.review : (body.comments !== undefined ? body.comments : query.review);

      // Collect multipart files if present
      let files = [];
      if (req.files) {
        if (Array.isArray(req.files)) {
          files = req.files;
        } else if (typeof req.files === "object") {
          for (const key of Object.keys(req.files)) {
            const val = req.files[key];
            if (Array.isArray(val)) files.push(...val);
            else if (val) files.push(val);
          }
        }
      } else if (req.file) {
        files = [req.file];
      }

      // Collect base64 images if present in body (and not multipart)
      let base64Images = [];
      if (body.images && files.length === 0) {
        base64Images = Array.isArray(body.images) ? body.images : [body.images];
      } else if (body.image && files.length === 0) {
        base64Images = [body.image];
      }

      const result = await SaleOrderReviewService.storeReview({
        sale_order_id: saleOrderId,
        user_id: userId,
        ratings,
        review: reviewText,
        files,
        base64Images,
        authenticatedUserId: req.user?.id || null,
      });

      return res.status(result.statusCode).json(result.body);
    } catch (err) {
      console.error("SaleOrderReviewController.storeReview error:", err);
      return res.status(500).json({
        status: false,
        message: err.message,
      });
    }
  }

  /**
   * GET /api/user/sale-order/review
   * Get review details for a specific sale order or user.
   */
  static async getReviewDetails(req, res) {
    try {
      const query = req.query || {};
      const body = req.body || {};

      const saleOrderId = query.sale_order_id || body.sale_order_id;
      const userId = query.user_id || body.user_id;

      const result = await SaleOrderReviewService.getReviewDetails({
        sale_order_id: saleOrderId,
        user_id: userId,
        authenticatedUserId: req.user?.id || null,
      });

      return res.status(result.statusCode).json(result.body);
    } catch (err) {
      console.error("SaleOrderReviewController.getReviewDetails error:", err);
      return res.status(500).json({
        status: false,
        message: err.message,
      });
    }
  }

  /**
   * GET /api/product/reviews
   * GET /api/product/:product_id/reviews
   * GET /api/vendor/product/reviews
   * GET /api/vendor/product/:product_id/reviews
   * Get paginated reviews, summary aggregate, star breakdowns, and gallery images.
   */
  static async getProductReviews(req, res) {
    try {
      const params = req.params || {};
      const query = req.query || {};

      const productId = params.product_id || query.product_id || query.productId;

      const filters = {
        page: query.page,
        per_page: query.per_page,
        rating: query.rating,
        has_image: query.has_image,
        sort: query.sort,
      };

      const result = await SaleOrderReviewService.getProductReviews(productId, filters);
      return res.status(result.statusCode).json(result.body);
    } catch (err) {
      console.error("SaleOrderReviewController.getProductReviews error:", err);
      return res.status(500).json({
        status: false,
        message: err.message,
      });
    }
  }
}

export default SaleOrderReviewController;
export { SaleOrderReviewController };

