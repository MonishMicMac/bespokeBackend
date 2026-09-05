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
    upload.single("image"),
    uploadImage
);

// DELETE /api/chat/message/:id
router.delete("/message/:id", deleteMessage);

// DELETE /api/chat/conversation/:userId/:otherUserId
router.delete("/conversation/:userId/:otherUserId", deleteConversation);

export default router;
