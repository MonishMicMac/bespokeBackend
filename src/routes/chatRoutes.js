import express from "express";
import {
  getChatHistory,
  getOrderChatHistory,
  getConversations,
  sendMessage,
  markMessagesAsRead,
  uploadImage,
  deleteMessage,
  deleteConversation,
  createTicket,
  sendTicketMessage,
  getTicketMessages,
  getOrderTicketMessages,
  markTicketMessagesSeen
} from "../controllers/chatController.js";
import upload from "../middleware/upload.js";

const router = express.Router();

// --- Ticket Chat Endpoints (using `tickets` and `ticket_messages` tables) ---
// POST /api/chat/ticket (Create a new ticket for sale_order_id with optional first message)
router.post("/ticket", createTicket);

// POST /api/chat/ticket/message (Send message for a ticket or sale_order_id)
router.post("/ticket/message", sendTicketMessage);

// GET /api/chat/ticket/:ticketId/messages (Get messages for a specific ticket)
router.get("/ticket/:ticketId/messages", getTicketMessages);

// GET /api/chat/ticket/order/:saleOrderId (Get ticket and messages for a specific sale order)
router.get("/ticket/order/:saleOrderId", getOrderTicketMessages);

// PUT /api/chat/ticket/mark-seen (Mark messages as seen in ticket_messages)
router.put("/ticket/mark-seen", markTicketMessagesSeen);

// --- General Order & Direct Chat Endpoints ---
// GET /api/chat/order/:saleOrderId (All chat messages for a specific order)
router.get("/order/:saleOrderId", getOrderChatHistory);

// GET /api/chat/conversations/:userId
router.get("/conversations/:userId", getConversations);

// GET /api/chat/:userId/:otherUserId (Supports ?sale_order_id=123)
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
