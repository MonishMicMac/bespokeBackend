import { emitToAll, emitToVendor, emitToAdmin } from "../sockets/socket.js";

export const sendOrderCreatedEvent = (data) => {
  console.log("📤 Emitting order event to clients & admin:", data);
  emitToAll("order-event", data);
  emitToAdmin("order-event", data);
  emitToAdmin("admin-order-notification", data);
};

export const sendVendorNotificationEvent = (payload) => {
  const vendorId = payload?.vendor_id ?? payload?.data?.vendor_id;
  console.log(`📤 Emitting real-time vendor notification to vendor [${vendorId}]:`, payload);

  if (vendorId) {
    // Emit vendor specific events
    emitToVendor(vendorId, "vendor-notification", payload);
    emitToVendor(vendorId, "order-notification", payload);
    emitToVendor(vendorId, "order-event", payload);
    emitToVendor(vendorId, "notification", payload);
  } else {
    // If no vendorId provided, broadcast
    emitToAll("vendor-notification", payload);
    emitToAll("order-event", payload);
  }

  // Also notify admin room of this vendor notification
  emitToAdmin("admin-notification", payload);
  emitToAdmin("vendor-notification", payload);
};

export const sendAdminNotificationEvent = (payload) => {
  console.log("📤 Emitting real-time notification to admin:", payload);
  emitToAdmin("admin-notification", payload);
  emitToAdmin("order-notification", payload);
  emitToAdmin("order-event", payload);
  emitToAdmin("notification", payload);
};


