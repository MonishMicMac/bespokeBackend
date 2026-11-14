import express from "express";
import {
  userupdatefcm,
  sendNotification,
  sendVendorNotification,
} from "../controllers/firebaseController.js";

const router = express.Router();

// FCM device token registration
router.post("/update-fcm", userupdatefcm);

// Push notifications
router.post("/send-notification", sendNotification);
router.post("/send-vendor-notification", sendVendorNotification);

export default router;

