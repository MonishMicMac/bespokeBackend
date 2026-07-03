import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    connectTimeout: 5000,
  },
});

const redisSubscriber = createClient({
  socket: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    connectTimeout: 5000,
  },
});

redisClient.on("error", (err) =>
  console.error("❌ Redis Client Error:", err)
);

redisSubscriber.on("error", (err) =>
  console.error("❌ Redis Subscriber Error:", err)
);

await redisClient.connect();
await redisSubscriber.connect();

console.log("✅ Redis Clients Ready");

export { redisClient, redisSubscriber };
