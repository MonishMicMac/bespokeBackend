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
} from "../controllers/orderController.js";
import CustomerOrderCancelController from "../controllers/customerOrderCancelController.js";

const router = express.Router();

// 1. Order Placement (Online & COD)
router.post("/order/add", order);

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
router.post("/customer/order/cancel", CustomerOrderCancelController.cancelOrder);
router.get("/customer/order/cancel", CustomerOrderCancelController.cancelOrder);
router.post("/order/cancel", CustomerOrderCancelController.cancelOrder);

// 8. Return Routes (Delivered Within 14 Days)
router.post("/customer/order/return", CustomerOrderCancelController.returnOrder);
router.get("/customer/order/return", CustomerOrderCancelController.returnOrder);
router.post("/order/return", CustomerOrderCancelController.returnOrder);

// 9. Cancellation & Return Helper Options
router.get("/customer/order/cancel-reasons", CustomerOrderCancelController.getCancelReasons);
router.get("/customer/order/return-reasons", CustomerOrderCancelController.getReturnReasons);
router.get("/customer/order/history", CustomerOrderCancelController.getOrderHistory);
router.get("/sale-order/history", CustomerOrderCancelController.getOrderHistory);

// Legacy routes preserved
router.get("/orders/:id", getOrderById);
router.post("/order/update", updateOrderStatus);

export default router;
