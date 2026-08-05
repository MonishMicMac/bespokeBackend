import express from "express";
import { getOrderById, updateOrderStatus } from "../controllers/orderController.js";

const router = express.Router();

// Example route: GET /api/orders/:id
router.get("/orders/:id", getOrderById);

// POST route: update order status
router.post("/order/update", updateOrderStatus);

export default router;

