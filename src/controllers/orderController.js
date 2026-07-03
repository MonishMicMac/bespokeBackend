import { redisClient } from "../redis/redisClient.js";

export const getOrderById = async (req, res) => {
  const { id } = req.params;

  const order = {
    id,
    amount: 500,
    status: "created",
    time: new Date().toISOString(),
  };

  // publish the order
  await redisClient.publish("order-list", JSON.stringify(order));

  return res.json(order);
};
