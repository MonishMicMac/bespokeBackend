import express from "express";
import {
  getActivePromoCodes,
  applyPromoCode,
  getAdminPromoCodes,
  createAdminPromoCode,
  getAdminPromoCodeById,
  updateAdminPromoCode,
  deleteAdminPromoCode,
} from "../controllers/promoController.js";

const router = express.Router();

/**
 * Customer APIs
 */
// Customer Active Promo Codes list
router.get("/promo-codes", getActivePromoCodes);
router.get("/promocode", getActivePromoCodes);

// Customer Apply / Validate coupon
router.post("/promo-codes/apply", applyPromoCode);
router.post("/promocode/apply", applyPromoCode);

/**
 * Admin APIs (Namespaced & Resource routes)
 */
// Admin collection
router.get("/admin/promo-codes", getAdminPromoCodes);
router.post("/admin/promo-codes", createAdminPromoCode);
router.get("/admin/promo-codes/:id", getAdminPromoCodeById);
router.put("/admin/promo-codes/:id", updateAdminPromoCode);
router.delete("/admin/promo-codes/:id", deleteAdminPromoCode);

// Direct REST resource routes on /promo-codes for admin compatibility
router.post("/promo-codes", createAdminPromoCode);
router.get("/promo-codes/:id", getAdminPromoCodeById);
router.put("/promo-codes/:id", updateAdminPromoCode);
router.delete("/promo-codes/:id", deleteAdminPromoCode);

export default router;

