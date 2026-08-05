import express from "express";
import { signup } from "../controllers/signupController.js";
import { sendOrderMail } from "../controllers/mailController.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/send-mail", sendOrderMail);

export default router;