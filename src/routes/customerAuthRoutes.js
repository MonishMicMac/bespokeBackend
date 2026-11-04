import express from "express";
import {
  registerCustomer,
  loginCustomer,
  getCustomerProfile,
} from "../controllers/customerAuthController.js";

const router = express.Router();

router.post("/register", registerCustomer);
router.post("/signup", registerCustomer);
router.post("/login", loginCustomer);
router.post("/signin", loginCustomer);
router.get("/profile/:id", getCustomerProfile);
router.get("/me", getCustomerProfile);

export default router;

