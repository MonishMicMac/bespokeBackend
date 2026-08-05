import express from "express";
import { saleOrderController } from "../controllers/saleOrderController.js";

const router = express.Router();

router.post("/sale_order_history", saleOrderController);
// router.post("/order", saleOrderController);

export default router;
