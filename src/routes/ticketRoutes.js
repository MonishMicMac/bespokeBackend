import express from "express";
import {
  getTicketTypesList,
  getTicketsList,
  updateTicket,
  getTicketMessagesPhp,
  sendTicketMessagePhp,
  deleteTicketMessagePhp,
} from "../controllers/ticketController.js";

const router = express.Router();

// Ticket types
router.get("/ticket-types/list", getTicketTypesList);

// Tickets list & updates
router.get("/tickets/list", getTicketsList);
router.post("/tickets/update/:id", updateTicket);
router.put("/tickets/update/:id", updateTicket);

// Ticket Messages
router.get("/ticket-messages/view/:ticket_id", getTicketMessagesPhp);
router.get("/ticket-messages/view", getTicketMessagesPhp);
router.get("/ticket-messages/history", getTicketMessagesPhp);
router.get("/ticket-messages/:ticket_id", getTicketMessagesPhp);
router.post("/ticket-messages/view", getTicketMessagesPhp);
router.post("/ticket-messages/list", getTicketMessagesPhp);
router.post("/ticket-messages/send", sendTicketMessagePhp);
router.delete("/ticket-messages/delete/:id", deleteTicketMessagePhp);

export default router;

