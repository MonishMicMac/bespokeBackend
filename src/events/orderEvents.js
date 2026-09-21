import { emitToAll, emitToVendor } from "../sockets/socket.js";

export const sendOrderCreatedEvent = (data) => {
  console.log("📤 Emitting order event to clients:", data);
  emitToAll("order-event", data);
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
};

