import { redisClient } from "../redis/redisClient.js";
import SaleOrderHistory from "../../models/SaleOrderHistory.js";
import SaleOrder from "../../models/SaleOrder.js";
import { emitToAll } from "../sockets/socket.js";
import sequelize from "../../config/db.js";
import { QueryTypes } from "sequelize";
import OrderService from "../services/orderService.js";

const ENUM_MAPPING = {
  pending: "Pending",
  placed: "Pending",
  "order accepted": "Pending",
  approved: "Approved",
  "ready to ship": "Ready_to_Ship",
  ready_to_ship: "Ready_to_Ship",
  dispatched: "Dispatched",
  "decline order": "Decline_Order",
  decline_order: "Decline_Order",
  declined: "Decline_Order",
  material_procurement: "material_procurement",
  "material procurement": "material_procurement",
  design_approved: "Design_Approved",
  "design approved": "Design_Approved",
  production_started: "Production_Started",
  "production started": "Production_Started",
};

const INT_TO_ENUM = {
  0: "Pending",
  1: "Approved",
  2: "Ready_to_Ship",
  3: "Dispatched",
  4: "Decline_Order",
  7: "material_procurement",
  8: "Design_Approved",
  9: "Production_Started",
};

export const resolveOrderHistoryEnum = (status) => {
  if (status === undefined || status === null) {
    return "Pending";
  }

  if (typeof status === "number" || (typeof status === "string" && status.trim() !== "" && !isNaN(Number(status)))) {
    const intVal = Number(status);
    if (INT_TO_ENUM[intVal] !== undefined) {
      return INT_TO_ENUM[intVal];
    }
  }

  if (typeof status === "string") {
    const normalized = status.trim().toLowerCase();
    if (ENUM_MAPPING[normalized] !== undefined) {
      return ENUM_MAPPING[normalized];
    }
  }

  return "Pending";
};

export const getOrderById = async (req, res) => {
  const { id } = req.params;

  const order = {
    id,
    amount: 500,
    status: "created",
    time: new Date().toISOString(),
  };

  if (redisClient && redisClient.isReady) {
    await redisClient.publish("order-list", JSON.stringify(order)).catch(() => {});
  }

  return res.json(order);
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { id, order_history, cancel_remark } = req.body;

    if (!id || order_history === undefined) {
      return res.status(400).json({ error: "Missing id or order_status in request body" });
    }

    const resolvedEnum = resolveOrderHistoryEnum(order_history);

    const newRecord = await SaleOrderHistory.create({
      sale_order_id: id,
      order_history: resolvedEnum,
      remarks: cancel_remark || null,
    });

    await SaleOrder.update(
      {
        order_history: resolvedEnum,
        ...(resolvedEnum === "Decline_Order" && { cancel_remark: cancel_remark || null }),
      },
      {
        where: { id: id },
      }
    );

    const saleOrderRecord = await SaleOrder.findByPk(id);
    if (saleOrderRecord && saleOrderRecord.order_id) {
      await sequelize.query(
        `UPDATE orders SET order_history = ?, decline_remarks = ? WHERE order_id = ?`,
        {
          replacements: [
            resolvedEnum,
            resolvedEnum === "Decline_Order" ? (cancel_remark || null) : null,
            String(saleOrderRecord.order_id),
          ],
          type: QueryTypes.UPDATE,
        }
      );
    }

    emitToAll("order-status-updated", {
      id: id,
      order_history: resolvedEnum,
      remarks: cancel_remark || null,
    });

    return res.json({
      success: true,
      message: "Order status update recorded successfully",
      data: newRecord,
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

/**
 * Customer Order APIs
 */

/**
 * POST /api/order/add
 */
export const order = async (req, res) => {
  try {
    const userId =
      req.user?.id ||
      req.user?.user_id ||
      req.body.user_id ||
      req.body.userId ||
      req.body.customer_id ||
      req.query.user_id ||
      req.query.userId;
    const productsData = req.body.product || [];
    const cartIds = req.body.cart_id || [];
    const addressId = req.body.address_id;
    const couponCode = req.body.coupen_id || req.body.coupon_code || null;
    const paymentMode = req.body.payment_mode;

    const result = await OrderService.createOrder({
      userId,
      productsData,
      cartIds,
      addressId,
      couponCode,
      paymentMode,
    });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({
      status: false,
      message: err.message,
    });
  }
};

/**
 * POST /api/order/verify-payment
 */
export const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        status: false,
        message: "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required",
      });
    }

    const result = await OrderService.verifyPayment({
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({
      status: false,
      message: err.message,
    });
  }
};

/**
 * POST /api/order/payment-failed
 */
export const paymentFailed = async (req, res) => {
  try {
    const { razorpay_order_id } = req.body;

    if (!razorpay_order_id) {
      return res.status(400).json({
        status: false,
        message: "The razorpay order id field is required.",
      });
    }

    const result = await OrderService.paymentFailed({
      razorpayOrderId: razorpay_order_id,
    });

    const statusCode = result.status ? 200 : 404;
    return res.status(statusCode).json(result);
  } catch (err) {
    return res.status(400).json({
      status: false,
      message: err.message,
    });
  }
};

/**
 * GET /api/order/list
 */
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id;
    const status = req.query.status !== undefined ? req.query.status : null;
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = parseInt(req.query.per_page, 10) || 10;

    if (!userId) {
      return res.status(400).json({
        status: "false",
        message: "User ID is required",
      });
    }

    const result = await OrderService.getUserOrders({
      userId,
      status,
      page,
      perPage,
    });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({
      status: "false",
      message: err.message,
    });
  }
};

/**
 * GET /api/order/detail-mobile
 */
export const getUserOrderDetailMobile = async (req, res) => {
  try {
    const saleOrderId = req.query.sale_order_id || req.query.id;
    const orderId = req.query.order_id;
    const userId = req.user?.id || req.query.user_id || null;

    if (!saleOrderId && !orderId) {
      return res.status(400).json({
        status: false,
        message: "Sale Order ID (sale_order_id) or Order ID (order_id) is required",
      });
    }

    const result = await OrderService.getUserOrderDetailMobile({
      saleOrderId,
      orderId,
      userId,
    });

    return res.status(200).json(result);
  } catch (err) {
    const status = err.statusCode || 400;
    return res.status(status).json({
      status: false,
      message: err.message,
    });
  }
};

/**
 * POST /api/razorpay-webhook
 */
export const handleRazorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const eventData = req.body;

    const result = await OrderService.handleRazorpayWebhook({
      rawBody,
      signature,
      eventData,
    });

    return res.status(200).json(result);
  } catch (err) {
    const status = err.statusCode || 400;
    return res.status(status).json({
      status: false,
      message: err.message,
    });
  }
};

export default {
  resolveOrderHistoryEnum,
  getOrderById,
  updateOrderStatus,
  order,
  verifyPayment,
  paymentFailed,
  getUserOrders,
  getUserOrderDetailMobile,
  handleRazorpayWebhook,
};
