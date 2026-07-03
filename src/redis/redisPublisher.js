import redisClients from "./redisClient.js";

const { redisClient } = redisClients;

export const publishTestEvent = async (data) => {
  await redisClient.publish("order-events", JSON.stringify(data));
  console.log("📨 Published test event:", data);
};
