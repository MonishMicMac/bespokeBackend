import { emitToAll } from "../sockets/socket.js";

export const sendOrderCreatedEvent = (data) => {
  console.log("📤 Emitting order event to clients:", data);
  emitToAll("order-event", data);
};
