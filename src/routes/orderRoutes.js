import express from "express";
import { getOrderById } from "../controllers/orderController.js";

const router = express.Router();

// Example route: GET /api/orders/:id
router.get("/orders/:id", getOrderById);

export default router;
