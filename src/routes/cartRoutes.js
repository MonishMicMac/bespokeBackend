import express from "express";
import {
  getCart,
  addToCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
} from "../controllers/cartController.js";

const router = express.Router();

router.get("/", getCart);
router.post("/add", addToCart);
router.put("/update", updateCartQuantity);
router.post("/update", updateCartQuantity);
router.delete("/remove", removeFromCart);
router.post("/remove", removeFromCart);
router.post("/clear", clearCart);

export default router;

