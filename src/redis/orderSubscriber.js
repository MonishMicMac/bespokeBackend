import { sendOrderCreatedEvent, sendVendorNotificationEvent } from "../events/orderEvents.js";
import { redisSubscriber } from "./redisClient.js";

// Subscribe to vendor-notifications channel (published by Laravel)
await redisSubscriber.subscribe("vendor-notifications", (message) => {
  try {
    const payload = JSON.parse(message);
    console.log("📩 Redis Event Received (vendor-notifications):", payload);
    sendVendorNotificationEvent(payload);
  } catch (err) {
    console.error("❌ Failed to parse vendor-notifications message as JSON:", err.message);
  }
});

// Subscribe to order-list channel
await redisSubscriber.subscribe("order-list", (message) => {
  try {
    const data = JSON.parse(message);
    console.log("📩 Redis Job Received (order-list):", data);
    sendOrderCreatedEvent(data);
  } catch (err) {
    console.error("Failed to parse order-list message as JSON:", err.message);
  }
});

// Subscribe to test-channel
await redisSubscriber.subscribe("test-channel", (message) => {
  try {
    const data = JSON.parse(message);
    console.log("📩 Redis Job Received (test-channel):", data);
  } catch (e) {
    console.error("Failed to parse test-channel message as JSON:", e.message);
  }
});

console.log("✅ Redis Subscriber active for channels: vendor-notifications, order-list, test-channel");