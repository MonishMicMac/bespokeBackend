import OrderCancelReturnService from "../services/orderCancelReturnService.js";
import OrderHistoryTimelineService from "../services/orderHistoryTimelineService.js";

class CustomerOrderCancelController {
  /**
   * GET /api/customer/order/cancel-reasons
   */
  static async getCancelReasons(req, res) {
    try {
      const info = OrderCancelReturnService.getReasons();
      return res.status(200).json({
        status: true,
        message: "Cancellation options retrieved successfully.",
        cancelled_by_options: info.cancelled_by_options,
        workflow: info.workflow_info.cancel,
        reasons: info.cancel_reasons,
      });
    } catch (err) {
      return res.status(500).json({
        status: false,
        message: err.message,
      });
    }
  }

  /**
   * GET /api/customer/order/return-reasons
   */
  static async getReturnReasons(req, res) {
    try {
      const info = OrderCancelReturnService.getReasons();
      return res.status(200).json({
        status: true,
        message: "Return options retrieved successfully.",
        cancelled_by_options: info.cancelled_by_options,
        return_window_days: info.return_window_days,
        return_status_options: info.return_status_options,
        workflow: info.workflow_info.return,
        reasons: info.return_reasons,
      });
    } catch (err) {
      return res.status(500).json({
        status: false,
        message: err.message,
      });
    }
  }

  /**
   * GET /api/customer/order/history
   */
  static async getOrderHistory(req, res) {
    try {
      const query = req.query || {};
      const body = req.body || {};
      const saleOrderId = parseInt(query.sale_order_id || body.sale_order_id, 10);
      const orderHistory = query.order_history || body.order_history || null;
      const direction = query.direction || body.direction || "desc";

      if (!saleOrderId || isNaN(saleOrderId)) {
        return res.status(422).json({
          status: false,
          message: "sale_order_id is required and must be an integer",
        });
      }

      const result = await OrderHistoryTimelineService.getHistory(saleOrderId, orderHistory, direction);
      return res.status(result.code || (result.success ? 200 : 400)).json({
        status: result.success,
        message: result.message,
        data: result.data,
      });
    } catch (err) {
      return res.status(500).json({
        status: false,
        message: err.message,
      });
    }
  }

  /**
   * POST /api/customer/order/cancel (and GET description helper)
   */
  static async cancelOrder(req, res) {
    try {
      const query = req.query || {};
      const body = req.body || {};

      if (req.method === "GET" && !query.sale_order_id) {
        const info = OrderCancelReturnService.getReasons();
        return res.status(200).json({
          status: true,
          message: "Customer Order Cancellation API (Pre-delivery cancellation with automatic refund).",
          required_params: {
            sale_order_id: "required|integer",
            user_id: "optional|integer",
            reason: "optional|string",
            cancelled_by: "optional|string|in:admin,vendor,customer (default: customer)",
          },
          cancel_reasons: info.cancel_reasons,
        });
      }

      const saleOrderId = parseInt(body.sale_order_id || query.sale_order_id, 10);
      if (!saleOrderId || isNaN(saleOrderId)) {
        return res.status(422).json({
          status: false,
          message: "The sale order id field is required.",
          errors: { sale_order_id: ["The sale order id field is required."] },
        });
      }

      const userId = req.user?.id || body.user_id || body.cust_id || null;
      const reason = body.reason || "";
      const cancelledBy = body.cancelled_by || "customer";

      // Pre-check dispatched
      const isDispatched = await OrderHistoryTimelineService.isDispatched(saleOrderId);
      if (isDispatched) {
        const isDelivered = await OrderHistoryTimelineService.isDelivered(saleOrderId);
        const currentStatus = await OrderHistoryTimelineService.getCurrentStatus(saleOrderId);
        return res.status(400).json({
          status: false,
          message: "Once the order is dispatched, it cannot be declined or cancelled.",
          data: {
            sale_order_id: saleOrderId,
            order_status: currentStatus,
            allowed_action: isDelivered ? "return" : "track",
          },
        });
      }

      const result = await OrderCancelReturnService.processCancel({
        sale_order_id: saleOrderId,
        user_id: userId ? parseInt(userId, 10) : null,
        reason,
        cancelled_by: cancelledBy,
        payment_id: body.payment_id,
        transaction_id: body.transaction_id,
      });

      return res.status(result.code || (result.success ? 200 : 400)).json({
        status: result.success,
        message: result.message,
        data: result.data,
      });
    } catch (err) {
      return res.status(500).json({
        status: false,
        message: err.message,
      });
    }
  }

  /**
   * POST /api/customer/order/return (and GET description helper)
   */
  static async returnOrder(req, res) {
    try {
      const query = req.query || {};
      const body = req.body || {};

      if (req.method === "GET" && !query.sale_order_id) {
        const info = OrderCancelReturnService.getReasons();
        return res.status(200).json({
          status: true,
          message: "Customer Product Return API (Post-delivery return within 14 days; stores in return_products table).",
          return_window: "Returns are accepted within 14 days of delivery.",
          required_params: {
            sale_order_id: "required|integer",
            user_id: "optional|integer",
            reason: "optional|string",
            cancelled_by: "optional|string|in:admin,vendor,customer (default: customer)",
          },
          return_reasons: info.return_reasons,
        });
      }

      const saleOrderId = parseInt(body.sale_order_id || query.sale_order_id, 10);
      if (!saleOrderId || isNaN(saleOrderId)) {
        return res.status(422).json({
          status: false,
          message: "The sale order id field is required.",
          errors: { sale_order_id: ["The sale order id field is required."] },
        });
      }

      // Check return eligibility
      const eligibility = await OrderHistoryTimelineService.checkReturnEligibility(saleOrderId, 14);

      if (!eligibility.is_delivered) {
        return res.status(400).json({
          status: false,
          message: "Product has not been delivered yet and cannot be returned. Please use the Cancel Order API instead (/api/customer/order/cancel).",
          data: {
            sale_order_id: saleOrderId,
            allowed_action: "cancel",
          },
        });
      }

      if (!eligibility.is_eligible) {
        return res.status(400).json({
          status: false,
          message: eligibility.message,
          data: {
            sale_order_id: saleOrderId,
            delivered_at: eligibility.delivered_at,
            days_since_delivery: eligibility.days_since_delivery,
            max_allowed_days: eligibility.max_allowed_days,
          },
        });
      }

      const userId = req.user?.id || body.user_id || body.cust_id || null;
      const reason = body.reason || "";
      const cancelledBy = body.cancelled_by || "customer";

      const result = await OrderCancelReturnService.processReturn({
        sale_order_id: saleOrderId,
        user_id: userId ? parseInt(userId, 10) : null,
        reason,
        cancelled_by: cancelledBy,
      });

      return res.status(result.code || (result.success ? 200 : 400)).json({
        status: result.success,
        message: result.message,
        data: result.data,
      });
    } catch (err) {
      return res.status(500).json({
        status: false,
        message: err.message,
      });
    }
  }
}

export default CustomerOrderCancelController;
export { CustomerOrderCancelController };
