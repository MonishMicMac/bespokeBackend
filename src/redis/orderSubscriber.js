import { sendOrderCreatedEvent } from "../events/orderEvents.js";
import redisClients from "./redisClient.js";

const { redisSubscriber } = redisClients;

await redisSubscriber.subscribe("order-list", (message) => {
  const data = JSON.parse(message);
  console.log("📩 Redis Job Received (order-list):", data);

  sendOrderCreatedEvent(data)
});
