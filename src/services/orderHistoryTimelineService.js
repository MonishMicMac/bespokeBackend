import { Op } from "sequelize";
import { SaleOrder, SaleOrderHistory, Refund } from "../../models/setupAssociations.js";

class OrderHistoryTimelineService {
  /**
   * Get the full history timeline for a specific Sale Order.
   *
   * @param {number} saleOrderId
   * @param {string|null} [orderHistoryFilter]
   * @param {string} [direction='desc']
   * @returns {Promise<Object>}
   */
  static async getHistory(saleOrderId, orderHistoryFilter = null, direction = "desc") {
    try {
      const saleOrder = await SaleOrder.findByPk(saleOrderId, {
        include: [
          { association: "order" },
          { association: "product" },
          { association: "refund" },
        ],
      });

      if (!saleOrder) {
        return {
          success: false,
          code: 404,
          message: `Sale order not found with ID: ${saleOrderId}`,
          data: null,
        };
      }

      const where = { sale_order_id: saleOrderId };

      if (orderHistoryFilter && orderHistoryFilter.toLowerCase() !== "all") {
        const filter = orderHistoryFilter.trim();
        where[Op.or] = [
          { order_history: filter },
          { order_status: filter },
        ];
      }

      const sortDir = direction && direction.toLowerCase() === "asc" ? "ASC" : "DESC";

      const historyRecords = await SaleOrderHistory.findAll({
        where,
        order: [["id", sortDir]],
      });

      const timeline = historyRecords.map((item) => ({
        history_id: item.id,
        sale_order_id: item.sale_order_id,
        order_status: String(item.order_status || ""),
        order_history: String(item.order_history || ""),
        remark: String(item.remarks || ""),
        created_at: item.created_at ? new Date(item.created_at).toISOString().replace("T", " ").substring(0, 19) : null,
        updated_at: item.updated_at ? new Date(item.updated_at).toISOString().replace("T", " ").substring(0, 19) : null,
      }));

      const latestRecord = await this.getLatestRecord(saleOrderId);
      const currentStatus = latestRecord
        ? latestRecord.order_history || latestRecord.order_status || "Placed"
        : "Placed";

      const latestHistory = historyRecords.length > 0 ? historyRecords[0] : null;

      return {
        success: true,
        code: 200,
        message: `Sale order history retrieved successfully in ${sortDir} order.`,
        data: {
          sale_order_id: saleOrder.id,
          order_id: saleOrder.order_id,
          order_code: saleOrder.order ? saleOrder.order.order_id : null,
          product_id: saleOrder.product_id,
          product_name: saleOrder.product ? saleOrder.product.product_name : "N/A",
          size: saleOrder.size,
          quantity: parseInt(saleOrder.quantity || 1, 10),
          total_amount: parseFloat(saleOrder.total_amount || 0),
          current_status: currentStatus,
          cancelled_by: saleOrder.cancelled_by || null,
          cancelled_type: saleOrder.cancelled_type || null,
          cancelled_at: saleOrder.cancelled_at || null,
          cancel_remark: saleOrder.cancel_remark || null,
          tracking_number: saleOrder.tracking_number || null,
          shipping_provider: saleOrder.shipping_provider || null,
          estimated_delivery: saleOrder.estimated_delivery || null,
          filtered_by_status: orderHistoryFilter || "all",
          sort_order: sortDir,
          history_count: historyRecords.length,
          latest_history_entry: latestHistory
            ? {
                order_status: latestHistory.order_status,
                order_history: latestHistory.order_history,
                remark: latestHistory.remarks,
                created_at: latestHistory.created_at,
              }
            : null,
          history_timeline: timeline,
        },
      };
    } catch (err) {
      return {
        success: false,
        code: 500,
        message: `Failed to retrieve sale order history: ${err.message}`,
        data: null,
      };
    }
  }

  /**
   * Get the delivery date timestamp for a given sale order.
   *
   * @param {number} saleOrderId
   * @returns {Promise<Date|null>}
   */
  static async getDeliveryDate(saleOrderId) {
    const deliveryHistory = await SaleOrderHistory.findOne({
      where: {
        sale_order_id: saleOrderId,
        [Op.or]: [
          { order_status: { [Op.in]: ["delivered", "5", "completed", "Delivered", "Completed"] } },
          { order_history: { [Op.in]: ["delivered", "5", "completed", "Delivered", "Completed"] } },
        ],
      },
      order: [["id", "DESC"]],
    });

    if (deliveryHistory && deliveryHistory.created_at) {
      return new Date(deliveryHistory.created_at);
    }
    return null;
  }

  /**
   * Get latest record for a sale order.
   *
   * @param {number} saleOrderId
   * @returns {Promise<Object|null>}
   */
  static async getLatestRecord(saleOrderId) {
    return await SaleOrderHistory.findOne({
      where: { sale_order_id: saleOrderId },
      order: [["id", "DESC"]],
    });
  }

  /**
   * Get current status of a sale order.
   *
   * @param {number} saleOrderId
   * @param {string} [defaultStatus='Placed']
   * @returns {Promise<string>}
   */
  static async getCurrentStatus(saleOrderId, defaultStatus = "Placed") {
    const latest = await this.getLatestRecord(saleOrderId);
    if (latest) {
      return latest.order_history || latest.order_status || defaultStatus;
    }
    return defaultStatus;
  }

  /**
   * Check if a sale order has already been dispatched.
   *
   * @param {number} saleOrderId
   * @returns {Promise<boolean>}
   */
  static async isDispatched(saleOrderId) {
    const saleOrder = await SaleOrder.findByPk(saleOrderId);
    if (saleOrder) {
      const dispatchedStatuses = [3, 5, 6, 7];
      const dispatchedHistories = [
        "dispatched",
        "vendor_dispatched",
        "vendor dispatched",
        "hub-delivered",
        "hub_delivered",
        "hub delivered",
        "arrived at hub",
        "arrived_at_hub",
        "hub_arrived",
        "hub-arrived",
        "delivered to hub",
        "delivered_to_hub",
        "hub-dispatched",
        "hub_dispatched",
        "hub dispatched",
        "dispatched from hub",
        "dispatched_from_hub",
        "delivered",
      ];

      const currentStatusCode = parseInt(saleOrder.order_status, 10);
      const currentHistory = String(saleOrder.order_history || "").toLowerCase().trim();

      if (dispatchedStatuses.includes(currentStatusCode) || dispatchedHistories.includes(currentHistory)) {
        return true;
      }
    }

    const dispatchedTimeline = [
      "dispatched",
      "vendor_dispatched",
      "vendor dispatched",
      "3",
      "hub-delivered",
      "hub_delivered",
      "hub delivered",
      "arrived at hub",
      "arrived_at_hub",
      "hub_arrived",
      "hub-arrived",
      "delivered to hub",
      "delivered_to_hub",
      "6",
      "hub-dispatched",
      "hub_dispatched",
      "hub dispatched",
      "dispatched from hub",
      "dispatched_from_hub",
      "7",
      "delivered",
      "5",
    ];

    const exists = await SaleOrderHistory.findOne({
      where: {
        sale_order_id: saleOrderId,
        [Op.or]: [
          { order_status: { [Op.in]: dispatchedTimeline } },
          { order_history: { [Op.in]: dispatchedTimeline } },
        ],
      },
    });

    return !!exists;
  }

  /**
   * Check if a sale order has been delivered.
   *
   * @param {number} saleOrderId
   * @returns {Promise<boolean>}
   */
  static async isDelivered(saleOrderId) {
    const currentStatus = (await this.getCurrentStatus(saleOrderId)).toLowerCase().trim();
    if (["delivered", "5", "completed"].includes(currentStatus)) {
      return true;
    }
    const deliveryDate = await this.getDeliveryDate(saleOrderId);
    return deliveryDate !== null;
  }

  /**
   * Check if a sale order is already cancelled, returned, or refunded.
   *
   * @param {number} saleOrderId
   * @returns {Promise<boolean>}
   */
  static async isCancelledOrReturned(saleOrderId) {
    const terminalStatuses = ["cancelled", "refunded", "returned", "decline_order", "4", "Cancelled", "Returned", "Refunded", "Decline_Order"];

    const exists = await SaleOrderHistory.findOne({
      where: {
        sale_order_id: saleOrderId,
        [Op.or]: [
          { order_status: { [Op.in]: terminalStatuses } },
          { order_history: { [Op.in]: terminalStatuses } },
        ],
      },
    });

    return !!exists;
  }

  /**
   * Get cancellation/return/refund history entry if one exists.
   *
   * @param {number} saleOrderId
   * @returns {Promise<Object|null>}
   */
  static async getCancellationOrRefundRecord(saleOrderId) {
    const terminalStatuses = ["cancelled", "refunded", "returned", "decline_order", "4", "Cancelled", "Returned", "Refunded", "Decline_Order"];

    return await SaleOrderHistory.findOne({
      where: {
        sale_order_id: saleOrderId,
        [Op.or]: [
          { order_status: { [Op.in]: terminalStatuses } },
          { order_history: { [Op.in]: terminalStatuses } },
        ],
      },
      order: [["id", "DESC"]],
    });
  }

  /**
   * Check if a sale order is eligible for return within return window (default: 14 days).
   *
   * @param {number} saleOrderId
   * @param {number} [maxDays=14]
   * @returns {Promise<Object>}
   */
  static async checkReturnEligibility(saleOrderId, maxDays = 14) {
    const saleOrder = await SaleOrder.findByPk(saleOrderId);
    if (!saleOrder) {
      return {
        is_eligible: false,
        is_delivered: false,
        current_status: "Unknown",
        delivered_at: null,
        days_since_delivery: 0,
        max_allowed_days: maxDays,
        message: `Sale order not found with ID: ${saleOrderId}`,
      };
    }

    const rawStatus = await this.getCurrentStatus(saleOrderId);
    const currentStatus = rawStatus.toLowerCase().trim();
    const isDelivered = ["delivered", "5", "completed"].includes(currentStatus);
    const deliveredAt = await this.getDeliveryDate(saleOrderId);

    if (!isDelivered && !deliveredAt) {
      return {
        is_eligible: true,
        is_delivered: false,
        current_status: rawStatus,
        delivered_at: null,
        days_since_delivery: 0,
        max_allowed_days: maxDays,
        message: "Product has not been delivered yet (cancellation applicable).",
      };
    }

    const now = new Date();
    const deliveryTime = deliveredAt ? deliveredAt.getTime() : now.getTime();
    const daysSinceDelivery = Math.floor((now.getTime() - deliveryTime) / (1000 * 60 * 60 * 24));
    const isEligible = daysSinceDelivery <= maxDays;

    return {
      is_eligible: isEligible,
      is_delivered: true,
      current_status: rawStatus,
      delivered_at: deliveredAt ? deliveredAt.toISOString().replace("T", " ").substring(0, 19) : null,
      days_since_delivery: daysSinceDelivery,
      max_allowed_days: maxDays,
      message: isEligible
        ? `Eligible for return (${daysSinceDelivery}/${maxDays} days elapsed).`
        : `Return period expired. Returns are only accepted within ${maxDays} days of delivery.`,
    };
  }

  /**
   * Record a new status update entry in SaleOrderHistory.
   *
   * @param {number} saleOrderId
   * @param {string} orderStatus
   * @param {string|null} [remark=null]
   * @param {string|null} [orderHistory=null]
   * @param {Object} [transaction=null]
   * @returns {Promise<Object>}
   */
  static async recordHistory(saleOrderId, orderStatus, remark = null, orderHistory = null, transaction = null) {
    return await SaleOrderHistory.create(
      {
        sale_order_id: saleOrderId,
        order_status: String(orderStatus),
        order_history: String(orderHistory || orderStatus),
        remarks: remark || `Status updated to ${orderStatus}`,
      },
      { transaction }
    );
  }
}

export default OrderHistoryTimelineService;

