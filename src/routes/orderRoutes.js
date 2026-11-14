import express from "express";
import {
  getOrderById,
  updateOrderStatus,
  order,
  verifyPayment,
  paymentFailed,
  getUserOrders,
  getUserOrderDetailMobile,
  handleRazorpayWebhook,
  getDeliveryCharge,
} from "../controllers/orderController.js";
import CustomerOrderCancelController from "../controllers/customerOrderCancelController.js";
import upload from "../middleware/upload.js";

const router = express.Router();

// Middleware to parse multipart/form-data for endpoints without file uploads
const handleFormData = (req, res, next) => {
  if (req.is("multipart/form-data")) {
    return upload.none()(req, res, next);
  }
  next();
};

// 1. Order Placement (Online & COD)
router.post("/order/add", order);

// Delivery Charge from DB (Matching Laravel /api/delivery-charge)
router.get(["/delivery-charge", "/delivery_charge"], getDeliveryCharge);

// 2. Payment Verification (Razorpay)
router.post("/order/verify-payment", verifyPayment);

// 3. Payment Failure (Razorpay)
router.post("/order/payment-failed", paymentFailed);

// 4. Customer Order List
router.get("/order/list", getUserOrders);

// 5. Mobile Order Details Composite View
router.get("/order/detail-mobile", getUserOrderDetailMobile);

// 6. Razorpay Webhook
router.post("/razorpay-webhook", handleRazorpayWebhook);

// 7. Cancellation Routes (Pre-Delivery Only)
router.post("/customer/order/cancel", handleFormData, CustomerOrderCancelController.cancelOrder);
router.get("/customer/order/cancel", CustomerOrderCancelController.cancelOrder);
router.post("/order/cancel", handleFormData, CustomerOrderCancelController.cancelOrder);

// 8. Return Routes (Delivered Within 14 Days)
router.post("/customer/order/return", handleFormData, CustomerOrderCancelController.returnOrder);
router.get("/customer/order/return", CustomerOrderCancelController.returnOrder);
router.post("/order/return", handleFormData, CustomerOrderCancelController.returnOrder);

// 9. Cancellation & Return Helper Options
router.get("/customer/order/cancel-reasons", CustomerOrderCancelController.getCancelReasons);
router.get("/customer/order/return-reasons", CustomerOrderCancelController.getReturnReasons);
router.get("/customer/order/history", CustomerOrderCancelController.getOrderHistory);
router.get("/sale-order/history", CustomerOrderCancelController.getOrderHistory);

// Legacy routes preserved
router.get("/orders/:id", getOrderById);
router.post("/order/update", updateOrderStatus);

export default router;
