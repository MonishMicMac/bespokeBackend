import { Router } from "express";
import {
  getUserFavorites,
  addFavorite,
  removeFavorite,
} from "../controllers/userWishlistController.js";

const router = Router();

// API 1: Retrieve user active wishlist products
router.get("/user-favorites/:user_id", getUserFavorites);

// API 2: Add a product variant to the user's wishlist (POST primary, GET fallback for legacy callers)
router.post("/add/favorite", addFavorite);
router.get("/add/favorite", addFavorite);

// API 3: Remove a wishlist entry (POST primary, GET fallback for legacy callers)
router.post("/remove/favorite", removeFavorite);
router.get("/remove/favorite", removeFavorite);

export default router;

