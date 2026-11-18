import Notification from "../../models/Notification.js";
import Ticket from "../../models/Ticket.js";
import UserLogin from "../../models/UserLogin.js";
import VendorLogin from "../../models/VendorLogin.js";
import SaleOrder from "../../models/SaleOrder.js";
import Order from "../../models/Order.js";
import FirebaseService from "./firebaseService.js";
import { emitToAdmin, emitToVendor, emitToUser } from "../sockets/socket.js";
import { redisClient } from "../redis/redisClient.js";
import { Op } from "sequelize";

// In-flight mutex to prevent concurrent race conditions (e.g. simultaneous HTTP + Socket.IO)
const inFlightNotifications = new Map();

class NotificationService {
  /**
   * Core helper: creates a persistent notification record with idempotency,
   * emits Socket.IO event, sends FCM push, and optionally publishes to Redis.
   *
   * Guaranteed not to throw or disrupt calling operations.
   */
  static async createAndDispatchNotification({
    recipient_type, // 'admin' | 'vendor' | 'user'
    recipient_id = null,
    title,
    message,
    type = "general", // 'support' | 'order' | 'refund' | 'chat' | 'general'
    related_ticket_id = null,
    related_message_id = null,
    related_order_id = null,
    related_sale_order_id = null,
    data = {},
    sendPush = true,
    sendSocket = true,
    publishRedis = true,
  }) {
    const cleanRecipType = String(recipient_type || "user").toLowerCase().trim();
    const cleanRecipId = recipient_id !== null && recipient_id !== undefined ? String(recipient_id).trim() : null;

    // Concurrent race condition deduplication key
    let dedupKey = null;
    if (related_message_id) {
      dedupKey = `msg:${cleanRecipType}:${cleanRecipId}:${related_message_id}`;
    } else if (related_order_id && type) {
      dedupKey = `ord:${cleanRecipType}:${cleanRecipId}:${related_order_id}:${type}`;
    }

    if (dedupKey && inFlightNotifications.has(dedupKey)) {
      console.log(`ℹ️ [In-Flight Idempotency] Awaiting in-flight notification dispatch for ${dedupKey}`);
      return await inFlightNotifications.get(dedupKey);
    }

    const executionPromise = (async () => {
      try {
        // 1. Idempotency Check
        // A: Prevent duplicate notification for the same chat message to the same recipient
        if (related_message_id) {
          const existingForMsg = await Notification.findOne({
            where: {
              related_message_id: parseInt(related_message_id, 10),
              recipient_type: cleanRecipType,
              recipient_id: cleanRecipId,
            },
          });
          if (existingForMsg) {
            console.log(`ℹ️ [Notification Idempotent] Notification already exists for message #${related_message_id} -> ${cleanRecipType}:${cleanRecipId}`);
            return existingForMsg;
          }
        }

        // B: Prevent duplicate notification for the same order event to the same recipient
        if (related_order_id && type) {
          const existingForOrder = await Notification.findOne({
            where: {
              related_order_id: parseInt(related_order_id, 10),
              recipient_type: cleanRecipType,
              recipient_id: cleanRecipId,
              type: type,
            },
          });
          if (existingForOrder) {
            console.log(`ℹ️ [Notification Idempotent] Notification already exists for order #${related_order_id} (${type}) -> ${cleanRecipType}:${cleanRecipId}`);
            return existingForOrder;
          }
        }

        // 2. Persist to MySQL database
        const record = await Notification.create({
          recipient_type: cleanRecipType,
          recipient_id: cleanRecipId,
          title: String(title || "Notification"),
          message: String(message || ""),
          type: String(type || "general"),
          related_ticket_id: related_ticket_id ? parseInt(related_ticket_id, 10) : null,
          related_message_id: related_message_id ? parseInt(related_message_id, 10) : null,
          related_order_id: related_order_id ? parseInt(related_order_id, 10) : null,
          related_sale_order_id: related_sale_order_id ? parseInt(related_sale_order_id, 10) : null,
          data: data || {},
          is_read: false,
        });

        console.log(`💾 [Notification Saved] #${record.id} for ${cleanRecipType}:${cleanRecipId} (${type})`);

        // 3. Build enriched payload for frontend and sockets
        const enrichedPayload = {
          id: record.id,
          notification_id: record.id,
          recipient_type: cleanRecipType,
          recipient_id: cleanRecipId,
          title: record.title,
          message: record.message,
          type: record.type,
          related_ticket_id: record.related_ticket_id,
          related_message_id: record.related_message_id,
          related_order_id: record.related_order_id,
          related_sale_order_id: record.related_sale_order_id,
          ticketId: record.related_ticket_id,
          ticket_id: record.related_ticket_id,
          orderId: record.related_order_id,
          order_id: record.related_order_id,
          orderCode: data?.order_code || (record.related_order_id ? `ORD${record.related_order_id}` : null),
          data: record.data || {},
          is_read: false,
          isRead: false,
          created_at: record.created_at,
          createdAt: record.created_at,
          timestamp: record.created_at ? record.created_at.toISOString() : new Date().toISOString(),
        };

        // 4. Socket.IO Real-time Emissions
        if (sendSocket) {
          if (cleanRecipType === "admin") {
            emitToAdmin("admin-notification", enrichedPayload);
            emitToAdmin("notification:new", enrichedPayload);
            emitToAdmin("notification", enrichedPayload);
            if (type === "order") {
              emitToAdmin("order-notification", enrichedPayload);
            } else if (type === "support" || type === "chat") {
              emitToAdmin("support_notification:new", enrichedPayload);
            }
            NotificationService.getUnreadCountHelper({ recipientType: "admin" }).then((cnt) => {
              emitToAdmin("unread_count:update", { unread_count: cnt });
            }).catch(() => {});
          } else if (cleanRecipType === "vendor" && cleanRecipId) {
            emitToVendor(cleanRecipId, "vendor-notification", enrichedPayload);
            emitToVendor(cleanRecipId, "notification:new", enrichedPayload);
            emitToVendor(cleanRecipId, "notification", enrichedPayload);
            if (type === "order") {
              emitToVendor(cleanRecipId, "order-notification", enrichedPayload);
            }
            NotificationService.getUnreadCountHelper({ recipientType: "vendor", recipientId: cleanRecipId }).then((cnt) => {
              emitToVendor(cleanRecipId, "unread_count:update", { unread_count: cnt });
            }).catch(() => {});
          } else if (cleanRecipId) {
            emitToUser(cleanRecipId, "notification:new", enrichedPayload);
            emitToUser(cleanRecipId, "notification", enrichedPayload);
            if (type === "support" || type === "chat") {
              emitToUser(cleanRecipId, "support_notification:new", enrichedPayload);
            }
            NotificationService.getUnreadCountHelper({ recipientType: "user", recipientId: cleanRecipId }).then((cnt) => {
              emitToUser(cleanRecipId, "unread_count:update", { unread_count: cnt });
            }).catch(() => {});
          }
        }

        // 5. Firebase Cloud Messaging (FCM Push)
        if (sendPush) {
          if (cleanRecipType === "vendor" && cleanRecipId) {
            FirebaseService.sendVendorNotification(cleanRecipId, record.title, record.message, record.data).catch((err) =>
              console.warn("Notice: vendor FCM push skipped:", err.message)
            );
          } else if (cleanRecipType === "user" && cleanRecipId) {
            FirebaseService.sendCustomerNotification(cleanRecipId, record.title, record.message, record.data).catch((err) =>
              console.warn("Notice: customer FCM push skipped:", err.message)
            );
          }
        }

        // 6. Optional Redis Publish (for cross-server / multi-process architectures)
        if (publishRedis && redisClient && redisClient.isReady) {
          try {
            if (cleanRecipType === "admin") {
              redisClient.publish("admin-notifications", JSON.stringify(enrichedPayload)).catch(() => {});
            } else if (cleanRecipType === "vendor") {
              redisClient.publish("vendor-notifications", JSON.stringify(enrichedPayload)).catch(() => {});
            }
          } catch (rErr) {
            // Non-blocking
          }
        }

        return record;
      } catch (err) {
        console.error("❌ [Notification Service Error]:", err.message);
        return null;
      }
    })();

    if (dedupKey) {
      inFlightNotifications.set(dedupKey, executionPromise);
      executionPromise.finally(() => inFlightNotifications.delete(dedupKey));
    }

    return await executionPromise;
  }

  // =========================================================================
  // --- CHAT & SUPPORT NOTIFICATIONS ---
  // =========================================================================

  /**
   * Triggered when a Customer sends a message in Support Chat / General Inquiry.
   * Notifies Admin with customer details, ticket ID/code, preview, and target URL.
   */
  static async notifyAdminNewSupportMessage({ ticket, customerId, messageRecord, messageText }) {
    try {
      if (!ticket || !messageRecord) return null;

      const cleanCustId = customerId || messageRecord.sender_id || 76;
      let customerName = `Customer #${cleanCustId}`;

      try {
        const user = await UserLogin.findByPk(cleanCustId);
        if (user) {
          customerName = user.username || user.email || customerName;
        }
      } catch (e) {
        // Fallback to ID
      }

      const preview = String(messageText || messageRecord.message || "New support message").trim();
      const truncated = preview.length > 80 ? `${preview.substring(0, 77)}...` : preview;
      const ticketCode = ticket.ticket_code || `TKT${ticket.id}`;

      const title = `Support Message • ${ticketCode}`;
      const message = `${customerName}: "${truncated}"`;

      return await this.createAndDispatchNotification({
        recipient_type: "admin",
        recipient_id: "admin",
        title,
        message,
        type: "support",
        related_ticket_id: ticket.id,
        related_message_id: messageRecord.id,
        data: {
          ticket_id: ticket.id,
          ticketId: ticket.id,
          ticket_code: ticketCode,
          ticketCode: ticketCode,
          customer_id: cleanCustId,
          customerId: cleanCustId,
          customer_name: customerName,
          customerName: customerName,
          message_id: messageRecord.id,
          message_preview: truncated,
          targetUrl: `/complaint?ticket_id=${ticket.id}`,
          target_url: `/complaint?ticket_id=${ticket.id}`,
        },
        publishRedis: false, // Dispatched directly via sockets
      });
    } catch (err) {
      console.error("❌ Failed to notify admin of support message:", err.message);
      return null;
    }
  }

  /**
   * Triggered when Admin sends a reply to a Support Ticket.
   * Resolves the actual customer ID (never hardcoded 10) and notifies the customer.
   */
  static async notifyCustomerSupportReply({ ticket, customerId, messageRecord, messageText }) {
    try {
      if (!ticket || !messageRecord) return null;

      let targetCustomerId = customerId;

      // If customerId is missing or is 10 (legacy fallback), resolve from ticket or history
      if (!targetCustomerId || String(targetCustomerId) === "10" || String(targetCustomerId) === "1") {
        if (ticket.sale_order_id) {
          const so = await SaleOrder.findByPk(ticket.sale_order_id, {
            include: [{ model: Order, as: "order" }],
          });
          if (so) {
            targetCustomerId = so.order?.user_id || so.customer_id || so.user_id;
          }
        }
      }

      if (!targetCustomerId || String(targetCustomerId) === "10") {
        targetCustomerId = "76"; // Default active customer fallback
      }

      const cleanCustId = parseInt(String(targetCustomerId).replace(/[^0-9]/g, ""), 10) || 76;
      const preview = String(messageText || messageRecord.message || "New message from support").trim();
      const truncated = preview.length > 80 ? `${preview.substring(0, 77)}...` : preview;
      const ticketCode = ticket.ticket_code || `TKT${ticket.id}`;

      const title = "Bespoke Concierge Support";
      const message = `Admin: "${truncated}"`;

      return await this.createAndDispatchNotification({
        recipient_type: "user",
        recipient_id: String(cleanCustId),
        title,
        message,
        type: "support",
        related_ticket_id: ticket.id,
        related_message_id: messageRecord.id,
        data: {
          ticket_id: ticket.id,
          ticketId: ticket.id,
          ticket_code: ticketCode,
          ticketCode: ticketCode,
          message_id: messageRecord.id,
          message_preview: truncated,
          targetUrl: `/chats?ticket_id=${ticket.id}`,
          target_url: `/chats?ticket_id=${ticket.id}`,
        },
        publishRedis: false,
      });
    } catch (err) {
      console.error("❌ Failed to notify customer of support reply:", err.message);
      return null;
    }
  }

  // =========================================================================
  // --- ORDER NOTIFICATIONS ---
  // =========================================================================

  /**
   * Triggered on Order creation.
   * - Always notifies Admin.
   * - If isCod === true: immediately notifies every distinct vendor involved in the order.
   * - If Razorpay (unverified): does NOT notify vendors prematurely.
   */
  static async notifyNewOrderPlaced({ order, user = null, isCod = false }) {
    try {
      if (!order) return;

      const orderId = order.id;
      const orderCode = order.order_id || `ORD${orderId}`;
      const userId = order.user_id;

      let customerName = "Customer";
      if (!user && userId) {
        user = await UserLogin.findByPk(userId);
      }
      if (user && user.username) {
        customerName = user.username;
      }

      const totalAmount = parseFloat(order.payable_price || order.price || 0);

      // 1. Notify Admin
      await this.createAndDispatchNotification({
        recipient_type: "admin",
        recipient_id: "admin",
        title: "New Order Placed",
        message: `Order #${orderCode} has been placed by Customer ${customerName}`,
        type: "order",
        related_order_id: orderId,
        data: {
          order_id: orderId,
          order_code: orderCode,
          user_id: userId ? parseInt(userId, 10) : null,
          customer_name: customerName,
          total_amount: totalAmount,
          payment_method: isCod ? "COD" : "Online/Razorpay",
          status: String(order.order_history || "Pending"),
          is_cod: Boolean(isCod),
          targetUrl: `/orders/${orderId}`,
          target_url: `/orders/${orderId}`,
        },
        publishRedis: true,
      });

      // 2. If COD, immediately notify all distinct vendors
      if (isCod) {
        await this.notifyDistinctVendorsForOrder({
          order,
          orderCode,
          eventType: "order_created",
        });
      }
    } catch (err) {
      console.error("❌ Failed to process new order placement notifications:", err.message);
    }
  }

  /**
   * Triggered on successful Razorpay payment verification (or Razorpay webhook).
   * Notifies Admin and all distinct vendors.
   * Idempotency ensures vendors and admin are not notified twice if both verify & webhook run.
   */
  static async notifyOrderPaymentConfirmed({ order, user = null }) {
    try {
      if (!order) return;

      const orderId = order.id;
      const orderCode = order.order_id || `ORD${orderId}`;
      const userId = order.user_id;

      let customerName = "Customer";
      if (!user && userId) {
        user = await UserLogin.findByPk(userId);
      }
      if (user && user.username) {
        customerName = user.username;
      }

      // 1. Notify Admin of Payment Confirmation (type: 'order_paid')
      await this.createAndDispatchNotification({
        recipient_type: "admin",
        recipient_id: "admin",
        title: "Payment Confirmed",
        message: `Payment received for Order #${orderCode} (${customerName})`,
        type: "order_paid",
        related_order_id: orderId,
        data: {
          order_id: orderId,
          order_code: orderCode,
          user_id: userId ? parseInt(userId, 10) : null,
          customer_name: customerName,
          status: "Approved",
          targetUrl: `/orders/${orderId}`,
          target_url: `/orders/${orderId}`,
        },
        publishRedis: true,
      });

      // 2. Notify distinct vendors (type: 'order')
      await this.notifyDistinctVendorsForOrder({
        order,
        orderCode,
        eventType: "order_paid",
      });
    } catch (err) {
      console.error("❌ Failed to process order payment confirmed notifications:", err.message);
    }
  }

  /**
   * Helper: fetches all SaleOrders for an order, extracts distinct vendors,
   * and creates a single deduplicated notification per vendor.
   */
  static async notifyDistinctVendorsForOrder({ order, orderCode, eventType = "order" }) {
    try {
      const orderId = order.id;
      const code = orderCode || order.order_id || `ORD${orderId}`;

      const saleOrders = await SaleOrder.findAll({
        where: {
          order_id: orderId,
          vendor_id: { [Op.ne]: null },
        },
      });

      if (!saleOrders || saleOrders.length === 0) {
        console.log(`ℹ️ No sale orders with vendors found for Order #${orderId}`);
        return;
      }

      // Group sale orders by vendor_id
      const vendorMap = new Map();
      for (const so of saleOrders) {
        const vId = String(so.vendor_id);
        if (!vendorMap.has(vId)) {
          vendorMap.set(vId, []);
        }
        vendorMap.get(vId).push(so);
      }

      for (const [vId, items] of vendorMap.entries()) {
        const vendorSaleOrderIds = items.map((i) => i.id);
        const primarySaleOrderId = vendorSaleOrderIds[0] || null;

        await this.createAndDispatchNotification({
          recipient_type: "vendor",
          recipient_id: vId,
          title: "New Order Received",
          message: `You have received a new order #${code}`,
          type: "order",
          related_order_id: orderId,
          related_sale_order_id: primarySaleOrderId,
          data: {
            order_id: orderId,
            order_code: code,
            sale_order_ids: vendorSaleOrderIds,
            sale_order_id: primarySaleOrderId,
            items_count: items.length,
            items: items.map((i) => ({
              id: i.id,
              product_id: i.product_id,
              product_name: i.product_name || `Product #${i.product_id}`,
              quantity: i.quantity || i.qty || 1,
              amount: i.amount || i.sale_price || 0,
            })),
            event_type: eventType,
            targetUrl: `/vendor/orders/${primarySaleOrderId}`,
            target_url: `/vendor/orders/${primarySaleOrderId}`,
          },
          sendPush: true,
          sendSocket: true,
          publishRedis: true,
        });
      }
    } catch (err) {
      console.error(`❌ Failed to notify vendors for order #${order?.id}:`, err.message);
    }
  }

  /**
   * Helper to retrieve unread notification count directly for WebSocket emission
   */
  static async getUnreadCountHelper({ recipientType = "user", recipientId }) {
    if (!recipientId && recipientType !== "admin") return 0;
    try {
      const whereClause = { is_read: false };
      const cleanType = String(recipientType || "user").toLowerCase();
      whereClause.recipient_type = cleanType;

      if (cleanType === "user" && recipientId) {
        const cleanUid = parseInt(String(recipientId).replace(/[^0-9]/g, ""), 10);
        const possibleIds = [String(recipientId)];
        if (cleanUid) {
          possibleIds.push(String(cleanUid), `customer_${cleanUid}`, `user_${cleanUid}`);
        }
        whereClause.recipient_id = { [Op.in]: Array.from(new Set(possibleIds)) };
      } else if (recipientId) {
        whereClause[Op.or] = [
          { recipient_id: String(recipientId) },
          { recipient_id: null },
        ];
      }

      return await Notification.count({ where: whereClause });
    } catch (e) {
      console.warn("Notice: getUnreadCountHelper error:", e.message);
      return 0;
    }
  }

  /**
   * Helper to retrieve paginated notifications directly for WebSocket emission
   */
  static async getNotificationsHelper({ recipientType = "user", recipientId, isRead, type, page = 1, limit = 50 }) {
    try {
      const cleanType = String(recipientType || "user").toLowerCase();
      const whereClause = {};

      if (cleanType === "admin") {
        whereClause.recipient_type = "admin";
      } else {
        whereClause.recipient_type = cleanType;
        if (recipientId) {
          if (cleanType === "user") {
            const cleanUid = parseInt(String(recipientId).replace(/[^0-9]/g, ""), 10);
            const possibleIds = [String(recipientId)];
            if (cleanUid) {
              possibleIds.push(String(cleanUid), `customer_${cleanUid}`, `user_${cleanUid}`);
            }
            whereClause.recipient_id = { [Op.in]: Array.from(new Set(possibleIds)) };
          } else {
            whereClause[Op.or] = [
              { recipient_id: String(recipientId) },
              { recipient_id: null },
            ];
          }
        }
      }

      if (isRead !== undefined && isRead !== "all" && isRead !== "") {
        whereClause.is_read = isRead === "true" || isRead === true || isRead === "1";
      }

      if (type) {
        whereClause.type = type;
      }

      const pageNumber = Math.max(1, parseInt(page, 10) || 1);
      const pageSize = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
      const offset = (pageNumber - 1) * pageSize;

      const { count, rows: notifications } = await Notification.findAndCountAll({
        where: whereClause,
        order: [["created_at", "DESC"]],
        limit: pageSize,
        offset: offset,
      });

      const unreadCount = await this.getUnreadCountHelper({ recipientType: cleanType, recipientId });

      return {
        success: true,
        data: notifications,
        unread_count: unreadCount,
        pagination: {
          total: count,
          page: pageNumber,
          limit: pageSize,
          total_pages: Math.ceil(count / pageSize),
        },
      };
    } catch (e) {
      console.warn("Notice: getNotificationsHelper error:", e.message);
      return { success: false, data: [], unread_count: 0 };
    }
  }

  /**
   * Helper to mark all notifications as read for recipient via WebSocket
   */
  static async markAllAsReadHelper({ recipientType = "user", recipientId }) {
    try {
      const cleanType = String(recipientType || "user").toLowerCase();
      const whereClause = { is_read: false, recipient_type: cleanType };

      if (cleanType === "user" && recipientId) {
        const cleanUid = parseInt(String(recipientId).replace(/[^0-9]/g, ""), 10);
        const possibleIds = [String(recipientId)];
        if (cleanUid) {
          possibleIds.push(String(cleanUid), `customer_${cleanUid}`, `user_${cleanUid}`);
        }
        whereClause.recipient_id = { [Op.in]: Array.from(new Set(possibleIds)) };
      } else if (recipientId) {
        whereClause[Op.or] = [
          { recipient_id: String(recipientId) },
          { recipient_id: null },
        ];
      }

      await Notification.update(
        { is_read: true, read_at: new Date() },
        { where: whereClause }
      );
      return true;
    } catch (e) {
      console.warn("Notice: markAllAsReadHelper error:", e.message);
      return false;
    }
  }

  /**
   * Helper to mark a single notification as read
   */
  static async markAsReadHelper(notificationId) {
    try {
      if (!notificationId) return false;
      await Notification.update(
        { is_read: true, read_at: new Date() },
        { where: { id: notificationId } }
      );
      return true;
    } catch (e) {
      console.warn("Notice: markAsReadHelper error:", e.message);
      return false;
    }
  }
}

export default NotificationService;
