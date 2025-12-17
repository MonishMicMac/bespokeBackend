import { createClient } from "redis";
import dotenv from "dotenv";
dotenv.config();

const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = process.env.REDIS_PORT;

export const redisClient = createClient({
    host:"0.0.0.0",
  url: `redis://${REDIS_HOST}:${REDIS_PORT}`
});

export const redisSubscriber = createClient({
  url: `redis://${REDIS_HOST}:${REDIS_PORT}`
});


// Connect
redisClient.on("error", (err) => console.error("Redis Error:", err));
redisSubscriber.on("error", (err) => console.error("Redis Sub Error:", err));

await redisClient.connect();
await redisSubscriber.connect();

console.log("Redis Clients Ready");

export default { redisClient, redisSubscriber };
