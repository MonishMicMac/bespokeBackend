import Notification from "../../models/Notification.js";
import { Op } from "sequelize";
import { emitToVendor, emitToAdmin, emitToUser } from "../sockets/socket.js";

/**
 * Get notifications with filters and pagination
 * GET /api/notifications
 * Query params: recipient_type ('vendor'|'admin'|'user'), recipient_id, is_read (true|false|all), page, limit, type
 */
export const getNotifications = async (req, res) => {
  try {
    const {
      recipient_type,
      recipient_id,
      vendor_id,
      user_id,
      is_read,
      type,
      page = 1,
      limit = 20,
    } = req.query;

    const targetRecipientType = recipient_type || (vendor_id ? "vendor" : (user_id ? "user" : null));
    const targetRecipientId = recipient_id || vendor_id || user_id || null;

    const whereClause = {};

    if (targetRecipientType) {
      if (targetRecipientType === "admin") {
        whereClause.recipient_type = "admin";
      } else {
        whereClause.recipient_type = targetRecipientType;
        if (targetRecipientId) {
          whereClause[Op.or] = [
            { recipient_id: String(targetRecipientId) },
            { recipient_id: null }, // broadcast notifications to all of this type
          ];
        }
      }
    } else if (targetRecipientId) {
      whereClause.recipient_id = String(targetRecipientId);
    }

    if (is_read !== undefined && is_read !== "all" && is_read !== "") {
      whereClause.is_read = is_read === "true" || is_read === true || is_read === "1";
    }

    if (type) {
      whereClause.type = type;
    }

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const offset = (pageNumber - 1) * pageSize;

    const { count, rows: notifications } = await Notification.findAndCountAll({
      where: whereClause,
      order: [["created_at", "DESC"]],
      limit: pageSize,
      offset: offset,
    });

    // Unread count for this recipient
    const unreadWhere = { ...whereClause, is_read: false };
    const unreadCount = await Notification.count({ where: unreadWhere });

    return res.status(200).json({
      success: true,
      data: notifications,
      unread_count: unreadCount,
      pagination: {
        total: count,
        page: pageNumber,
        limit: pageSize,
        total_pages: Math.ceil(count / pageSize),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch notifications",
      details: error.message,
    });
  }
};

/**
 * Get unread notification count
 * GET /api/notifications/unread-count
 */
export const getUnreadCount = async (req, res) => {
  try {
    const { recipient_type, recipient_id, vendor_id, user_id } = req.query;
    const targetRecipientType = recipient_type || (vendor_id ? "vendor" : (user_id ? "user" : null));
    const targetRecipientId = recipient_id || vendor_id || user_id || null;

    const whereClause = { is_read: false };

    if (targetRecipientType) {
      whereClause.recipient_type = targetRecipientType;
    }
    if (targetRecipientId) {
      whereClause[Op.or] = [
        { recipient_id: String(targetRecipientId) },
        { recipient_id: null },
      ];
    }

    const unreadCount = await Notification.count({ where: whereClause });

    return res.status(200).json({
      success: true,
      unread_count: unreadCount,
    });
  } catch (error) {
    console.error("❌ Error counting unread notifications:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to count unread notifications",
      details: error.message,
    });
  }
};

/**
 * Mark a single notification as read / unread
 * PATCH /api/notifications/:id/read
 * Body (optional): { is_read: true/false }
 */
export const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const isReadParam = req.body.is_read !== undefined ? Boolean(req.body.is_read) : true;

    const notification = await Notification.findByPk(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }

    notification.is_read = isReadParam;
    notification.read_at = isReadParam ? new Date() : null;
    await notification.save();

    return res.status(200).json({
      success: true,
      message: `Notification marked as ${isReadParam ? "read" : "unread"}`,
      data: notification,
    });
  } catch (error) {
    console.error("❌ Error marking notification as read:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update notification status",
      details: error.message,
    });
  }
};

/**
 * Mark all notifications as read for a recipient
 * POST /api/notifications/mark-all-read
 * Body: { recipient_type: 'vendor'|'admin'|'user', recipient_id: '12' }
 */
export const markAllNotificationsRead = async (req, res) => {
  try {
    const { recipient_type, recipient_id, vendor_id, user_id } = req.body;
    const targetRecipientType = recipient_type || (vendor_id ? "vendor" : (user_id ? "user" : null));
    const targetRecipientId = recipient_id || vendor_id || user_id || null;

    if (!targetRecipientType && !targetRecipientId) {
      return res.status(400).json({
        success: false,
        error: "recipient_type or recipient_id is required",
      });
    }

    const whereClause = { is_read: false };

    if (targetRecipientType) {
      whereClause.recipient_type = targetRecipientType;
    }
    if (targetRecipientId) {
      whereClause[Op.or] = [
        { recipient_id: String(targetRecipientId) },
        { recipient_id: null },
      ];
    }

    const [updatedCount] = await Notification.update(
      {
        is_read: true,
        read_at: new Date(),
      },
      { where: whereClause }
    );

    return res.status(200).json({
      success: true,
      message: "All matching notifications marked as read",
      updated_count: updatedCount,
    });
  } catch (error) {
    console.error("❌ Error marking all notifications as read:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to mark all notifications as read",
      details: error.message,
    });
  }
};

/**
 * Delete a notification
 * DELETE /api/notifications/:id
 */
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findByPk(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }

    await notification.destroy();

    return res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    console.error("❌ Error deleting notification:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to delete notification",
      details: error.message,
    });
  }
};

/**
 * Create a new notification manually / via API
 * POST /api/notifications
 */
export const createNotification = async (req, res) => {
  try {
    const {
      recipient_type = "vendor",
      recipient_id = null,
      title,
      message,
      type = "general",
      data = null,
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: "title and message are required",
      });
    }

    const newNotification = await Notification.create({
      recipient_type,
      recipient_id: recipient_id ? String(recipient_id) : null,
      title,
      message,
      type,
      data,
      is_read: false,
    });

    const payload = newNotification.toJSON();

    // Emit socket event to the recipient
    if (recipient_type === "admin") {
      emitToAdmin("admin-notification", payload);
    } else if (recipient_type === "vendor" && recipient_id) {
      emitToVendor(recipient_id, "vendor-notification", payload);
    } else if (recipient_id) {
      emitToUser(recipient_id, "notification", payload);
    }

    return res.status(201).json({
      success: true,
      message: "Notification created successfully",
      data: newNotification,
    });
  } catch (error) {
    console.error("❌ Error creating notification:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create notification",
      details: error.message,
    });
  }
};
