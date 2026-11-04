import express from "express";
import {
  getWishlist,
  getWishlistIds,
  toggleWishlist,
  removeFromWishlist,
} from "../controllers/wishlistController.js";

const router = express.Router();

router.get("/", getWishlist);
router.get("/ids", getWishlistIds);
router.post("/toggle", toggleWishlist);
router.post("/add", toggleWishlist);
router.delete("/remove", removeFromWishlist);
router.post("/remove", removeFromWishlist);

export default router;

