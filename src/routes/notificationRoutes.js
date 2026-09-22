import express from "express";
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  createNotification,
} from "../controllers/notificationController.js";

const router = express.Router();

// Fetch notifications (filters: recipient_type, recipient_id, is_read, page, limit, type)
router.get("/", getNotifications);
router.get("/list", getNotifications);

// Get unread notification count
router.get("/unread-count", getUnreadCount);

// Mark a single notification as read / unread
router.patch("/:id/read", markNotificationRead);
router.put("/:id/read", markNotificationRead);
router.post("/:id/read", markNotificationRead);

// Mark all notifications as read for a recipient
router.post("/mark-all-read", markAllNotificationsRead);
router.put("/mark-all-read", markAllNotificationsRead);

// Create notification (optional / manual API)
router.post("/", createNotification);

// Delete notification
router.delete("/:id", deleteNotification);

export default router;
