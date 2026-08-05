import { redisClient } from "./src/redis/redisClient.js";

async function publishTest() {
  const message = JSON.stringify({
    event: "test-event",
    data: {
      message: "Hello from Redis!",
      timestamp: new Date().toISOString()
    }
  });

  console.log("Publishing message to test-channel...");
  await redisClient.publish("test-channel", message);
  console.log("Message published successfully!");
  
  // Exit script
  process.exit(0);
}

publishTest().catch((err) => {
  console.error("Error publishing message:", err);
  process.exit(1);
});
