import sequelize from "../../config/db.js";
import Ticket from "../../models/Ticket.js";
import TicketMessage from "../../models/TicketMessage.js";
import SaleOrder from "../../models/SaleOrder.js";
import Order from "../../models/Order.js";
import NotificationService from "./notificationService.js";
import { emitToRoom, emitToUser } from "../sockets/socket.js";
import { buildFileUrl } from "../utils/fileUrl.js";

let lastProcessedMessageId = 0;
let watcherInterval = null;
let isPolling = false;

/**
 * Initializes the TicketWatcher daemon.
 * Watches MySQL ticket_messages table to detect when Admin manually sends messages from Admin portal,
 * normalizes customer recipient, cleans inverted duplicates, creates persistent notifications,
 * and emits real-time events to the customer without requiring a page refresh.
 */
export async function initTicketWatcher() {
  try {
    const [maxRow] = await sequelize.query(
      "SELECT MAX(id) AS max_id FROM ticket_messages"
    );
    lastProcessedMessageId = Number(maxRow?.[0]?.max_id) || 0;
    console.log(`🎫 [TicketWatcher] Initialized with last message ID: ${lastProcessedMessageId}`);

    if (watcherInterval) clearInterval(watcherInterval);
    watcherInterval = setInterval(pollNewTicketMessages, 1500);
  } catch (err) {
    console.error("❌ [TicketWatcher] Failed to initialize:", err.message);
  }
}

export async function pollNewTicketMessages() {
  if (isPolling) return;
  isPolling = true;

  try {
    const [newMsgs] = await sequelize.query(
      `SELECT tm.*, t.ticket_code, t.sale_order_id, t.ticket_type 
       FROM ticket_messages tm
       JOIN tickets t ON t.id = tm.ticket_id
       WHERE tm.id > :lastId
       ORDER BY tm.id ASC LIMIT 50`,
      { replacements: { lastId: lastProcessedMessageId } }
    );

    if (!newMsgs || newMsgs.length === 0) {
      isPolling = false;
      return;
    }

    for (const msg of newMsgs) {
      if (msg.id > lastProcessedMessageId) {
        lastProcessedMessageId = msg.id;
      }

      const sId = String(msg.sender_id);
      const sType = String(msg.sender_type || "").toLowerCase();

      // 1. Detect and safely remove inverted admin duplicates
      // (When sender_id is 1 but sender_type was stored as customer)
      if (sId === "1" && sType === "customer") {
        console.log(`🧹 [TicketWatcher] Removing inverted duplicate message #${msg.id}`);
        try {
          await sequelize.query("DELETE FROM ticket_messages WHERE id = :id", {
            replacements: { id: msg.id },
          });
        } catch (delErr) {
          console.warn("Could not delete duplicate message:", delErr.message);
        }
        continue;
      }

      // 2. Process Admin replies (sender_id === 1 or sender_type === 'admin')
      if (sId === "1" || sType === "admin") {
        console.log(`🛡️ [TicketWatcher] Detected manual Admin message #${msg.id} on ticket #${msg.ticket_id}`);

        // Resolve real customer ID
        let resolvedCustId = 76;
        if (msg.sale_order_id) {
          try {
            const so = await SaleOrder.findByPk(msg.sale_order_id, {
              include: [{ model: Order, as: "order" }],
            });
            if (so) {
              resolvedCustId = so.order?.user_id || so.customer_id || so.user_id || 76;
            }
          } catch (e) {}
        } else {
          try {
            const [tktCust] = await sequelize.query(
              `SELECT sender_id, receiver_id FROM ticket_messages 
               WHERE ticket_id = :tId AND sender_id != 1 AND sender_id != 10 
               ORDER BY id ASC LIMIT 1`,
              { replacements: { tId: msg.ticket_id } }
            );
            if (tktCust && tktCust.length > 0) {
              resolvedCustId = parseInt(tktCust[0].sender_id || tktCust[0].receiver_id, 10) || 76;
            }
          } catch (e) {}
        }

        resolvedCustId = resolvedCustId || 76;

        // If receiver_id on this message is 10 or 1, fix it to actual customer
        if (msg.receiver_id === 10 || msg.receiver_id === 1 || !msg.receiver_id) {
          try {
            await sequelize.query(
              "UPDATE ticket_messages SET receiver_id = :cid WHERE id = :id",
              { replacements: { cid: resolvedCustId, id: msg.id } }
            );
          } catch (e) {}
        }

        // Trigger persistent notification (built-in idempotency by related_message_id)
        try {
          await NotificationService.notifyCustomerSupportReply({
            ticket: {
              id: msg.ticket_id,
              ticket_code: msg.ticket_code,
              sale_order_id: msg.sale_order_id,
            },
            customerId: resolvedCustId,
            messageRecord: msg,
            messageText: msg.message,
          });
        } catch (notifErr) {
          console.warn("Notice: watcher customer support notif error:", notifErr.message);
        }

        // Realtime dispatch via Socket.IO
        const fileUrl = msg.file_path ? buildFileUrl(msg.file_path) : null;
        const payload = {
          id: msg.id,
          ticket_id: msg.ticket_id,
          ticketId: msg.ticket_id,
          ticket_code: msg.ticket_code,
          sender_id: "1",
          senderId: "1",
          receiver_id: String(resolvedCustId),
          receiverId: String(resolvedCustId),
          sender_type: "admin",
          senderType: "admin",
          receiver_type: "customer",
          receiverType: "customer",
          message: msg.message,
          text: msg.message,
          message_type: fileUrl ? "image" : "text",
          messageType: fileUrl ? "image" : "text",
          file_path: msg.file_path,
          file_url: fileUrl,
          fileUrl: fileUrl,
          created_at: msg.created_at,
          createdAt: msg.created_at,
        };

        emitToRoom(`ticket_${msg.ticket_id}`, "receive_ticket_message", payload);
        emitToUser(String(resolvedCustId), "receive_ticket_message", payload);

        if (String(resolvedCustId) !== "76") {
          emitToUser("76", "receive_ticket_message", payload);
        }
      }
    }
  } catch (err) {
    console.error("❌ [TicketWatcher] Error polling messages:", err.message);
  } finally {
    isPolling = false;
  }
}

