import express from "express";
import {
  getChatHistory,
  getConversations,
  sendMessage,
  markMessagesAsRead,
  uploadImage,
  deleteMessage,
  deleteConversation
} from "../controllers/chatController.js";
import upload from "../middleware/upload.js";

const router = express.Router();

// GET /api/chat/conversations/:userId
router.get("/conversations/:userId", getConversations);

// GET /api/chat/:userId/:otherUserId
router.get("/:userId/:otherUserId", getChatHistory);

// POST /api/chat/send
router.post("/send", sendMessage);
router.post("/message", sendMessage);

// PUT /api/chat/mark-read
router.put("/mark-read", markMessagesAsRead);

// POST /api/chat/upload
router.post(
  "/upload",
  (req, res, next) => {
    upload.any()(req, res, (err) => {
      if (err) {
        console.error("Multer upload error:", err);
        return res.status(400).json({ success: false, error: err.message });
      }
      if (req.files && req.files.length > 0) {
        req.file = req.files[0];
      }
      next();
    });
  },
  uploadImage
);

// DELETE /api/chat/message/:id
router.delete("/message/:id", deleteMessage);

// DELETE /api/chat/conversation/:userId/:otherUserId
router.delete("/conversation/:userId/:otherUserId", deleteConversation);

export default router;
