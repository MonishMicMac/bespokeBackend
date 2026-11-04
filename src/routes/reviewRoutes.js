import express from "express";
import upload from "../middleware/upload.js";
import SaleOrderReviewController from "../controllers/saleOrderReviewController.js";
import ReviewController from "../controllers/reviewController.js";

const router = express.Router();

/**
 * Middleware that safely handles multipart file uploads if Content-Type is multipart,
 * but allows application/json requests to pass straight through.
 */
const safeUploadAny = (req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    return upload.any()(req, res, (err) => {
      if (err) {
        return res.status(422).json({
          status: false,
          message: "File upload failed",
          errors: { images: [err.message] },
        });
      }
      next();
    });
  }
  next();
};

// ============================================================================
// SYSTEM A: SALE ORDER PRODUCT REVIEWS (SaleOrderReviewController)
// ============================================================================

// Submit or update a sale order item review
router.post("/user/sale-order/review", safeUploadAny, SaleOrderReviewController.storeReview);

// Get review details by sale_order_id or user_id
router.get("/user/sale-order/review", SaleOrderReviewController.getReviewDetails);

// Product reviews listing, aggregates, and gallery
router.get("/product/reviews", SaleOrderReviewController.getProductReviews);
router.get("/product/:product_id/reviews", SaleOrderReviewController.getProductReviews);
router.get("/vendor/product/reviews", SaleOrderReviewController.getProductReviews);
router.get("/vendor/product/:product_id/reviews", SaleOrderReviewController.getProductReviews);

// ============================================================================
// SYSTEM B: GENERAL PRODUCT REVIEWS (ReviewContoller)
// ============================================================================

// Store a customer review in customer_reviews
router.post("/store_review", safeUploadAny, ReviewController.storeReview);

export default router;

