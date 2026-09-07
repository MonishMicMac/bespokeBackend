import express from "express";
import { refundOrder } from "../controllers/refundController.js";

const router = express.Router();

router.post("/refund", refundOrder);
router.post("/", refundOrder);

export default router;
