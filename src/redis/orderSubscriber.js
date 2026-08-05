import { sendOrderCreatedEvent } from "../events/orderEvents.js";
import { redisSubscriber } from "./redisClient.js";

await redisSubscriber.subscribe("order-list", (message) => {
  const data = JSON.parse(message);

  console.log("📩 Redis Job Received (order-list):", data);

  sendOrderCreatedEvent(data);
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