import { emitToAll, emitToVendor, emitToAdmin } from "../sockets/socket.js";
import Notification from "../../models/Notification.js";

export const sendOrderCreatedEvent = (data) => {
  console.log("📤 Emitting order event to clients & admin:", data);
  emitToAll("order-event", data);
  emitToAdmin("order-event", data);
  emitToAdmin("admin-order-notification", data);
};

export const sendVendorNotificationEvent = async (payload) => {
  const vendorId = payload?.vendor_id ?? payload?.data?.vendor_id;
  console.log(`📤 Emitting real-time vendor notification to vendor [${vendorId}]:`, payload);

  let savedRecord = null;
  try {
    savedRecord = await Notification.create({
      recipient_type: "vendor",
      recipient_id: vendorId ? String(vendorId) : null,
      title: payload.title || "New Order Notification",
      message: payload.message || payload.body || "You have received a new notification",
      type: payload.type || "order",
      data: payload.data || payload,
      is_read: false,
    });
    console.log(`💾 Saved vendor notification to DB (id: ${savedRecord.id})`);
  } catch (dbErr) {
    console.error("❌ Failed to save vendor notification to DB:", dbErr.message);
  }

  const enrichedPayload = savedRecord
    ? { ...payload, id: savedRecord.id, is_read: false, created_at: savedRecord.created_at }
    : payload;

  if (vendorId) {
    // Emit vendor specific events
    emitToVendor(vendorId, "vendor-notification", enrichedPayload);
    emitToVendor(vendorId, "order-notification", enrichedPayload);
    emitToVendor(vendorId, "order-event", enrichedPayload);
    emitToVendor(vendorId, "notification", enrichedPayload);
  } else {
    // If no vendorId provided, broadcast
    emitToAll("vendor-notification", enrichedPayload);
    emitToAll("order-event", enrichedPayload);
  }

  // Also notify admin room of this vendor notification
  emitToAdmin("admin-notification", enrichedPayload);
  emitToAdmin("vendor-notification", enrichedPayload);
};

export const sendAdminNotificationEvent = async (payload) => {
  console.log("📤 Emitting real-time notification to admin:", payload);

  let savedRecord = null;
  try {
    savedRecord = await Notification.create({
      recipient_type: "admin",
      recipient_id: "admin",
      title: payload.title || "Admin Notification",
      message: payload.message || payload.body || "New admin notification received",
      type: payload.type || "order",
      data: payload.data || payload,
      is_read: false,
    });
    console.log(`💾 Saved admin notification to DB (id: ${savedRecord.id})`);
  } catch (dbErr) {
    console.error("❌ Failed to save admin notification to DB:", dbErr.message);
  }

  const enrichedPayload = savedRecord
    ? { ...payload, id: savedRecord.id, is_read: false, created_at: savedRecord.created_at }
    : payload;

  emitToAdmin("admin-notification", enrichedPayload);
  emitToAdmin("order-notification", enrichedPayload);
  emitToAdmin("order-event", enrichedPayload);
  emitToAdmin("notification", enrichedPayload);
};



