import express from "express";
import {
  getSuggestions,
  searchProducts,
} from "../controllers/searchController.js";

const router = express.Router();

// Autocomplete suggestions: GET /api/search/suggestions?q=
router.get("/suggestions", getSuggestions);

// Dynamic Faceted Search: GET /api/search/products
router.get("/products", searchProducts);

export default router;

