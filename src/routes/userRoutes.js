import express from "express";
import {
  signup,
  login,
  view,
  details,
  update,
  sendOtp,
  verifyOtp,
  resetPassword,
} from "../controllers/userController.js";

const router = express.Router();

// 1. Customer Signup
router.post("/user/signup", signup);

// 2. Customer Login (Preserving original GET method)
router.get("/user/login", login);

// 3. Customer Profile View & Details
router.get("/user/view/:id", view);
router.get("/user/details/:id", details);

// 4. Customer Profile Update
router.post("/user/edit/:id", update);

// 5. Forgot Password OTP (GET & POST)
router.get("/user/forgot/password/otp", sendOtp);
router.post("/user/forgot/password/otp", sendOtp);

// 5B. Forgot Password OTP Verify (GET & POST)
router.get("/user/forgot/password/verify", verifyOtp);
router.post("/user/forgot/password/verify", verifyOtp);

// 6. Forgot Password Reset (GET & POST)
router.get("/user/forgot/password/set", resetPassword);
router.post("/user/forgot/password/set", resetPassword);

export default router;

