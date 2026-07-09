import { sendOrderCreatedEvent } from "../events/orderEvents.js";
import { redisSubscriber } from "./redisClient.js";

await redisSubscriber.subscribe("order-list", (message) => {
  const data = JSON.parse(message);

  console.log("📩 Redis Job Received (order-list):", data);

  sendOrderCreatedEvent(data);
});

await redisSubscriber.subscribe("test-channel", (message) => {
  const data = JSON.parse(message);

  console.log("📩 Redis Job Received (test-channel):", data);

  sendOrderCreatedEvent(data);
});