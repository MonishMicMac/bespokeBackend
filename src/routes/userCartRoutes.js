import { Router } from "express";
import {
  getUserCart,
  addToCart,
  deleteCart,
  storeCartMeasurement,
  editCart,
} from "../controllers/userCartController.js";

const router = Router();

// API 1: Get Customer Cart
router.get("/user-cart/:user_id", getUserCart);
router.get("/cart/:user_id", getUserCart);

// API 2: Add Product to Cart (Supports both GET and POST per Laravel match(['get', 'post']))
router.get("/add/cart", addToCart);
router.post("/add/cart", addToCart);

// API 3: Delete Cart Item
router.post("/delete/cart", deleteCart);

// API 4: Store Bespoke Measurements
router.post("/user-cart/store-measurement", storeCartMeasurement);
router.post("/cart/store-measurement", storeCartMeasurement);

// API 5: Edit Cart (Supports both GET and POST per Laravel match(['get', 'post']))
router.get("/edit/cart", editCart);
router.post("/edit/cart", editCart);

export default router;

