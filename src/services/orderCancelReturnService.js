import sequelize from "../../config/db.js";
import { Op } from "sequelize";
import {
  SaleOrder,
  SaleOrderHistory,
  ProductPrice,
  Product,
  Order,
  Refund,
  ReturnProduct,
} from "../../models/setupAssociations.js";
import PaymentService from "./paymentService.js";
import OrderHistoryTimelineService from "./orderHistoryTimelineService.js";
import { emitToAll } from "../sockets/socket.js";

const DEFAULT_CANCEL_REASONS = [
  "Ordered by mistake",
  "Found cheaper elsewhere",
  "Delivery time is too long",
  "Need to change shipping address",
  "Need to change product size or fabric",
  "Delayed processing",
  "Other",
];

const DEFAULT_RETURN_REASONS = [
  "Defective / Damaged product received",
  "Product size or fitting mismatch",
  "Product different from image / description",
  "Quality not as expected",
  "Received wrong item",
  "Ordered by mistake",
  "Other",
];

class OrderCancelReturnService {
  static getReasons() {
    return {
      cancelled_by_options: ["admin", "vendor", "customer"],
      cancelled_type_options: ["cancel", "return", "refund"],
      return_window_days: 14,
      return_status_options: [
        "initiate",
        "refund processed",
        "product collected",
        "delivered to vendor",
      ],
      workflow_info: {
        cancel:
          "Before delivery cancellation: Restocks inventory and triggers immediate automatic Razorpay refund.",
        return:
          "After delivery return (within 14 days): Creates return_products record with status initiate (No refund triggered immediately).",
      },
      cancel_reasons: DEFAULT_CANCEL_REASONS,
      return_reasons: DEFAULT_RETURN_REASONS,
      reasons: Array.from(new Set([...DEFAULT_CANCEL_REASONS, ...DEFAULT_RETURN_REASONS])),
    };
  }

  /**
   * 1. CANCEL ORDER SERVICE (Pre-Delivery Only)
   *
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  static async processCancel(params) {
    const saleOrderId = parseInt(params.sale_order_id, 10);
    const userId = params.user_id ? parseInt(params.user_id, 10) : null;
    let cancelReason = (params.reason || "").trim();
    let cancelledBy = (params.cancelled_by || "customer").toLowerCase();
    if (!["admin", "vendor", "customer"].includes(cancelledBy)) {
      cancelledBy = "customer";
    }

    const t = await sequelize.transaction();

    try {
      let saleOrder = await SaleOrder.findByPk(saleOrderId, {
        include: [
          { association: "order" },
          { association: "product" },
          { association: "priceRelation" },
        ],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!saleOrder) {
        // Fallback: Check if saleOrderId is parent order_id
        saleOrder = await SaleOrder.findOne({
          where: { order_id: saleOrderId },
          include: [
            { association: "order" },
            { association: "product" },
            { association: "priceRelation" },
          ],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
      }

      if (!saleOrder) {
        await t.rollback();
        return {
          success: false,
          code: 404,
          message: `Sale order not found with ID: ${saleOrderId}`,
          data: null,
        };
      }

      const order = saleOrder.order;
      if (!order) {
        await t.rollback();
        return {
          success: false,
          code: 404,
          message: "Parent order details not found for this sale order.",
          data: null,
        };
      }

      // Verify User ownership
      if (userId && parseInt(order.user_id, 10) !== userId && cancelledBy === "customer") {
        await t.rollback();
        return {
          success: false,
          code: 403,
          message: "Unauthorized. This order does not belong to the specified user.",
          data: null,
        };
      }

      // Check previous status history
      const rawStatus = await OrderHistoryTimelineService.getCurrentStatus(saleOrderId, "Placed");
      const isDelivered = await OrderHistoryTimelineService.isDelivered(saleOrderId);
      const isCancelled = await OrderHistoryTimelineService.isCancelledOrReturned(saleOrderId);

      if (isCancelled) {
        const cancellationRecord = await OrderHistoryTimelineService.getCancellationOrRefundRecord(saleOrderId);
        await t.rollback();
        return {
          success: false,
          code: 400,
          message: "This product item has already been cancelled/returned/refunded.",
          data: {
            sale_order_id: saleOrderId,
            current_status: cancellationRecord
              ? cancellationRecord.order_history || cancellationRecord.order_status
              : rawStatus,
            cancelled_at: cancellationRecord ? cancellationRecord.created_at : new Date(),
            remark: cancellationRecord ? cancellationRecord.remarks : null,
          },
        };
      }

      // Reject cancellation if product was already dispatched or delivered
      const isDispatched = await OrderHistoryTimelineService.isDispatched(saleOrderId);
      if (isDispatched) {
        await t.rollback();
        return {
          success: false,
          code: 400,
          message: "Once the order is dispatched, it cannot be cancelled or declined.",
          data: {
            sale_order_id: saleOrderId,
            current_status: rawStatus,
            allowed_action: isDelivered ? "return" : "track",
          },
        };
      }

      if (!cancelReason) {
        cancelReason = "Cancelled by customer before delivery";
      }

      // Restock inventory
      if (saleOrder.price_id) {
        const qtyToRestore = parseInt(saleOrder.quantity || 1, 10);
        const priceRow = await ProductPrice.findByPk(saleOrder.price_id, { transaction: t });
        if (priceRow) {
          const currentQty = parseInt(priceRow.qty || 0, 10);
          await priceRow.update(
            {
              qty: currentQty + qtyToRestore,
              is_out_stock: "0",
            },
            { transaction: t }
          );
        }
      }

      // Resolve Payment and Trigger Razorpay Refund API
      const refundAmount = parseFloat(saleOrder.total_amount || saleOrder.amount || saleOrder.single_product_price || 0);

      let resolvedPaymentId =
        order.payment_id ||
        params.payment_id ||
        order.transaction_id ||
        params.transaction_id ||
        null;

      // If resolvedPaymentId does not start with "pay_", but order has razorpay_order_id, query Razorpay for payment id
      if ((!resolvedPaymentId || !String(resolvedPaymentId).startsWith("pay_")) && order.razorpay_order_id) {
        try {
          const razorpay = PaymentService.getRazorpayInstance();
          if (razorpay) {
            const payments = await razorpay.orders.fetchPayments(order.razorpay_order_id);
            if (payments && payments.items && payments.items.length > 0) {
              const successfulPayment = payments.items.find(
                (p) => p.status === "captured" || p.status === "authorized"
              ) || payments.items[0];
              if (successfulPayment && successfulPayment.id) {
                resolvedPaymentId = successfulPayment.id;
                await order.update({ payment_id: resolvedPaymentId }, { transaction: t });
              }
            }
          }
        } catch (fetchErr) {
          console.warn("Could not fetch payments from Razorpay for order:", order.razorpay_order_id, fetchErr.message);
        }
      }

      const isCod =
        ["COD", "cod"].includes(String(order.payment_id)) ||
        ["COD", "cod"].includes(String(order.transaction_id)) ||
        ["COD", "cod"].includes(String(params.payment_id)) ||
        (!resolvedPaymentId && !order.razorpay_order_id && order.razorpay_status !== "paid");

      let refundStatus = isCod ? "not_applicable" : "initiated";
      let refundTxnId = resolvedPaymentId || (isCod ? "COD" : null);

      let existingRefund = await Refund.findOne({
        where: { sale_order_id: saleOrder.id },
        transaction: t,
      });

      let refundRecord = null;

      if (!existingRefund) {
        if (!isCod) {
          const targetPaymentId = resolvedPaymentId || order.razorpay_order_id;
          if (targetPaymentId) {
            const razorpayResponse = await PaymentService.refundPayment(targetPaymentId, refundAmount, {
              sale_order_id: String(saleOrder.id),
              order_id: String(order.id),
              reason: `Cancel by ${cancelledBy}: ${cancelReason}`,
            });

            if (razorpayResponse.success) {
              refundTxnId = razorpayResponse.refund_id || refundTxnId;
              refundStatus = razorpayResponse.status || "processed";
            } else {
              console.error("Razorpay refund error:", razorpayResponse.error);
              refundStatus = "initiated";
            }
          }
        }

        refundRecord = await Refund.create(
          {
            sale_order_id: saleOrder.id,
            order_id: order.id,
            user_id: order.user_id,
            amount: refundAmount,
            refund_status: refundStatus,
            reason: `Cancel by ${cancelledBy}: ${cancelReason}`,
            transaction_id: refundTxnId,
          },
          { transaction: t }
        );
      } else {
        refundRecord = existingRefund;
        refundStatus = existingRefund.refund_status;
        refundTxnId = existingRefund.transaction_id;
      }

      // Update Sale Order Status (Do NOT modify orders table)
      await saleOrder.update(
        {
          order_history: "Cancelled",
          order_status: "4",
          cancel_remark: cancelReason,
          cancelled_at: new Date(),
          cancelled_by: cancelledBy,
          cancelled_type: "cancel",
        },
        { transaction: t }
      );

      // Timeline Entries
      await SaleOrderHistory.create(
        {
          sale_order_id: saleOrder.id,
          order_status: "Cancelled",
          order_history: "Cancelled",
          remarks: `Cancelled by ${cancelledBy.charAt(0).toUpperCase() + cancelledBy.slice(1)}: ${cancelReason}`,
        },
        { transaction: t }
      );

      if (refundRecord) {
        await SaleOrderHistory.create(
          {
            sale_order_id: saleOrder.id,
            order_status: "Refund initiated",
            order_history: "Refund initiated",
            remarks: `Refund ${refundStatus}. Amount: ₹${refundAmount}. Txn ID: ${refundTxnId}`,
          },
          { transaction: t }
        );
      }

      // If all items for this parent order are cancelled, update parent order history
      const remainingActiveItems = await SaleOrder.count({
        where: {
          order_id: order.id,
          id: { [Op.ne]: saleOrder.id },
          order_status: { [Op.notIn]: ["4", 4, "cancelled", "Cancelled"] },
          order_history: { [Op.notIn]: ["Cancelled", "cancelled", "Decline_Order"] },
        },
        transaction: t,
      });

      if (remainingActiveItems === 0) {
        await order.update(
          {
            order_history: "Decline_Order",
            decline_remarks: cancelReason,
          },
          { transaction: t }
        );
      }

      await t.commit();

      try {
        emitToAll("order_status_update", {
          sale_order_id: saleOrder.id,
          order_id: order.id,
          order_code: order.order_id,
          status: "Cancelled",
          order_history: "Cancelled",
          refund_status: refundStatus,
          refund_amount: refundAmount,
          action_by: cancelledBy,
        });
      } catch (sockErr) {
        console.warn("Socket broadcast error on cancel:", sockErr.message);
      }

      return {
        success: true,
        code: 200,
        message: "Order item cancelled successfully and refund initiated.",
        data: {
          sale_order_id: saleOrder.id,
          order_id: order.id,
          order_code: order.order_id,
          product_id: saleOrder.product_id,
          product_name: saleOrder.product ? saleOrder.product.product_name : "N/A",
          quantity: parseInt(saleOrder.quantity || 1, 10),
          total_amount: parseFloat(saleOrder.total_amount || 0),
          order_status: "Cancelled",
          delivery_state: "pre_delivery",
          cancelled_by: cancelledBy,
          cancelled_type: "cancel",
          is_refund_initiated: true,
          refund: {
            refund_id: refundRecord.id,
            amount: parseFloat(refundRecord.amount || 0),
            refund_status: refundRecord.refund_status,
            transaction_id: refundRecord.transaction_id,
            reason: refundRecord.reason,
            created_at: refundRecord.created_at,
          },
          action_at: new Date().toISOString(),
          reason: cancelReason,
        },
      };
    } catch (err) {
      await t.rollback();
      return {
        success: false,
        code: 500,
        message: `Failed to process cancellation: ${err.message}`,
        data: null,
      };
    }
  }

  /**
   * 2. RETURN PRODUCT SERVICE (Post-Delivery within 14 days)
   *
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  static async processReturn(params) {
    const saleOrderId = parseInt(params.sale_order_id, 10);
    const userId = params.user_id ? parseInt(params.user_id, 10) : null;
    let returnReason = (params.reason || "").trim();
    let cancelledBy = (params.cancelled_by || "customer").toLowerCase();
    if (!["admin", "vendor", "customer"].includes(cancelledBy)) {
      cancelledBy = "customer";
    }

    const t = await sequelize.transaction();

    try {
      let saleOrder = await SaleOrder.findByPk(saleOrderId, {
        include: [
          { association: "order" },
          { association: "product" },
          { association: "priceRelation" },
        ],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!saleOrder) {
        // Fallback: Check if saleOrderId is parent order_id
        saleOrder = await SaleOrder.findOne({
          where: { order_id: saleOrderId },
          include: [
            { association: "order" },
            { association: "product" },
            { association: "priceRelation" },
          ],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
      }

      if (!saleOrder) {
        await t.rollback();
        return {
          success: false,
          code: 404,
          message: `Sale order not found with ID: ${saleOrderId}`,
          data: null,
        };
      }

      const order = saleOrder.order;
      if (!order) {
        await t.rollback();
        return {
          success: false,
          code: 404,
          message: "Parent order details not found for this sale order.",
          data: null,
        };
      }

      // Verify User ownership
      if (userId && parseInt(order.user_id, 10) !== userId && cancelledBy === "customer") {
        await t.rollback();
        return {
          success: false,
          code: 403,
          message: "Unauthorized. This order does not belong to the specified user.",
          data: null,
        };
      }

      // Check previous status history
      const rawStatus = await OrderHistoryTimelineService.getCurrentStatus(saleOrderId, "Placed");
      const isDelivered = await OrderHistoryTimelineService.isDelivered(saleOrderId);
      const isCancelled = await OrderHistoryTimelineService.isCancelledOrReturned(saleOrderId);

      if (isCancelled) {
        const cancellationRecord = await OrderHistoryTimelineService.getCancellationOrRefundRecord(saleOrderId);
        await t.rollback();
        return {
          success: false,
          code: 400,
          message: "This product item has already been cancelled/returned/refunded.",
          data: {
            sale_order_id: saleOrderId,
            current_status: cancellationRecord
              ? cancellationRecord.order_history || cancellationRecord.order_status
              : rawStatus,
            cancelled_at: cancellationRecord ? cancellationRecord.created_at : new Date(),
            remark: cancellationRecord ? cancellationRecord.remarks : null,
          },
        };
      }

      // Check delivery state (Returns ONLY allowed for delivered products)
      if (!isDelivered) {
        await t.rollback();
        return {
          success: false,
          code: 400,
          message: "Product has not been delivered yet and cannot be returned",
          data: {
            sale_order_id: saleOrderId,
            current_status: rawStatus,
            allowed_action: "cancel",
          },
        };
      }

      // Enforce 14-day Return Window
      const deliveredAt = await OrderHistoryTimelineService.getDeliveryDate(saleOrderId);
      if (deliveredAt) {
        const now = new Date();
        const daysSinceDelivery = Math.floor((now.getTime() - deliveredAt.getTime()) / (1000 * 60 * 60 * 24));

        if (daysSinceDelivery > 14) {
          await t.rollback();
          return {
            success: false,
            code: 400,
            message: "Return period expired. Returns are only accepted within 14 days of delivery.",
            data: {
              sale_order_id: saleOrderId,
              delivered_at: deliveredAt.toISOString(),
              days_since_delivery: daysSinceDelivery,
              max_allowed_days: 14,
            },
          };
        }
      }

      if (!returnReason) {
        returnReason = "Returned by customer after delivery";
      }

      // Store in return_products table with return_status = 'initiate'
      let returnProductRecord = await ReturnProduct.findOne({
        where: { sale_order_id: saleOrder.id },
        transaction: t,
      });

      if (!returnProductRecord) {
        returnProductRecord = await ReturnProduct.create(
          {
            sale_order_id: saleOrder.id,
            refund_id: null,
            return_status: "initiate",
          },
          { transaction: t }
        );
      }

      // Update Sale Order Status (Do NOT modify orders table)
      await saleOrder.update(
        {
          order_history: "Returned",
          order_status: "8",
          cancel_remark: returnReason,
          cancelled_at: new Date(),
          cancelled_by: cancelledBy,
          cancelled_type: "return",
        },
        { transaction: t }
      );

      // Timeline Entries in SaleOrderHistory
      await SaleOrderHistory.create(
        {
          sale_order_id: saleOrder.id,
          order_status: "Returned",
          order_history: "Returned",
          remarks: `Return requested by ${cancelledBy.charAt(0).toUpperCase() + cancelledBy.slice(1)}: ${returnReason}`,
        },
        { transaction: t }
      );

      await SaleOrderHistory.create(
        {
          sale_order_id: saleOrder.id,
          order_status: "Returned",
          order_history: "Returned",
          remarks: `Return request created. Return record #${returnProductRecord.id} status: ${returnProductRecord.return_status}`,
        },
        { transaction: t }
      );

      await t.commit();

      return {
        success: true,
        code: 200,
        message: `Return request submitted successfully. Return status: ${returnProductRecord.return_status || "initiate"}.`,
        data: {
          sale_order_id: saleOrder.id,
          order_id: order.id,
          order_code: order.order_id,
          product_id: saleOrder.product_id,
          product_name: saleOrder.product ? saleOrder.product.product_name : "N/A",
          quantity: parseInt(saleOrder.quantity || 1, 10),
          total_amount: parseFloat(saleOrder.total_amount || 0),
          order_status: "Returned",
          delivery_state: "delivered",
          cancelled_by: cancelledBy,
          cancelled_type: "return",
          is_refund_initiated: false,
          return_product: {
            id: returnProductRecord.id,
            sale_order_id: returnProductRecord.sale_order_id,
            refund_id: returnProductRecord.refund_id,
            return_status: returnProductRecord.return_status,
            created_at: returnProductRecord.created_at,
          },
          action_at: new Date().toISOString(),
          reason: returnReason,
        },
      };
    } catch (err) {
      await t.rollback();
      return {
        success: false,
        code: 500,
        message: `Failed to process return: ${err.message}`,
        data: null,
      };
    }
  }

  /**
   * Universal Dispatcher
   */
  static async processCancelOrReturn(params) {
    let cancelledType = (params.cancelled_type || "").toLowerCase();
    const saleOrderId = parseInt(params.sale_order_id, 10);

    if (!cancelledType) {
      const isDelivered = await OrderHistoryTimelineService.isDelivered(saleOrderId);
      cancelledType = isDelivered ? "return" : "cancel";
    }

    if (["return", "returned"].includes(cancelledType)) {
      return await this.processReturn(params);
    } else {
      return await this.processCancel(params);
    }
  }
}

export default OrderCancelReturnService;

