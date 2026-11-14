import CustomerReviewService from "../services/customerReviewService.js";
import SaleOrderReviewController from "./saleOrderReviewController.js";

/**
 * Controller for General Customer Reviews (System B).
 * Reproduces App\Http\Controllers\api\ReviewContoller.
 */
class ReviewController {
  /**
   * POST /api/store_review
   * Store general product review in customer_reviews.
   * If sale_order_id is provided, delegates to SaleOrderReviewController.
   */
  static async storeReview(req, res) {
    try {
      const body = req.body || {};
      const query = req.query || {};

      const saleOrderId = body.sale_order_id || query.sale_order_id || body.saleOrderId || query.saleOrderId;
      if (saleOrderId) {
        return SaleOrderReviewController.storeReview(req, res);
      }

      const productId = body.product_id || query.product_id || body.productId || query.productId;
      const userId = body.user_id || query.user_id || req.user?.id;
      const rating = body.rating !== undefined ? body.rating : (body.ratings !== undefined ? body.ratings : query.rating);
      const comments = body.comments !== undefined ? body.comments : (body.comment !== undefined ? body.comment : (body.review !== undefined ? body.review : query.comments));
      const images = body.images !== undefined ? body.images : body.image;

      const result = await CustomerReviewService.storeReview({
        product_id: productId,
        user_id: userId,
        rating,
        comments,
        images,
        authenticatedUserId: req.user?.id || null,
      });

      return res.status(result.statusCode).json(result.body);
    } catch (err) {
      console.error("ReviewController.storeReview error:", err);
      return res.status(500).json({
        status: "false",
        message: err.message,
      });
    }
  }
}

export default ReviewController;
export { ReviewController };


