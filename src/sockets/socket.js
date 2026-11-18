import Message from "../../models/index.js";
import Ticket from "../../models/Ticket.js";
import TicketMessage from "../../models/TicketMessage.js";
import SaleOrder from "../../models/SaleOrder.js";
import Order from "../../models/Order.js";
import sequelize from "../../config/db.js";
import { Op } from "sequelize";
import { buildFileUrl } from "../utils/fileUrl.js";
import NotificationService from "../services/notificationService.js";

let ioInstance = null;

// Map to track connected users: userId -> socket.id
const connectedUsers = {};

function broadcastOnlineUsers() {
  if (ioInstance) {
    const onlineUserIds = Object.keys(connectedUsers);
    ioInstance.emit("online_users", onlineUserIds);
  }
}

export function initSocket(io) {
  ioInstance = io;

  function registerUser(socket, userId) {
    if (!userId) return;
    const strId = String(userId);
    const cleanId = strId.replace(/^(vendor_|customer_|admin_)/, "");

    connectedUsers[strId] = socket.id;
    connectedUsers[cleanId] = socket.id;
    connectedUsers[`vendor_${cleanId}`] = socket.id;

    if (strId.toLowerCase().includes("admin") || cleanId.toLowerCase() === "admin") {
      connectedUsers["admin"] = socket.id;
      socket.join("admin");
      socket.join("admin_room");
    }

    // Join rooms for multi-tab and room-based emitting
    socket.join(strId);
    socket.join(cleanId);
    socket.join(`vendor_${cleanId}`);

    console.log(`User/Vendor/Admin ${strId} (clean: ${cleanId}) registered with socket ${socket.id}`);
    io.emit("user_status", { userId: strId, status: "online" });
    broadcastOnlineUsers();
  }

  io.on("connection", (socket) => {
    // Automatically register if userId passed in query params (e.g. io(url, { query: { userId } }))
    const queryUserId = socket.handshake.query?.userId;
    if (queryUserId) {
      registerUser(socket, queryUserId);
    }

    // Register Users on explicit Connect event
    socket.on("register", (userId) => {
      registerUser(socket, userId);
    });

    // Explicit Admin join event
    socket.on("join_admin", () => {
      socket.join("admin");
      socket.join("admin_room");
      connectedUsers["admin"] = socket.id;
      console.log(`🛡️ Socket ${socket.id} joined admin room`);
    });

    // Send the list of currently online users to the requesting client
    socket.on("get_online_users", () => {
      socket.emit("online_users", Object.keys(connectedUsers));
    });

    // Generic Room Join / Leave (supports order_chat_${saleOrderId}_... rooms)
    socket.on("join", (roomId) => {
      if (!roomId) return;
      socket.join(roomId);
      console.log(`🚪 Socket ${socket.id} joined room (via join): ${roomId}`);
    });

    socket.on("join_room", (roomId) => {
      if (!roomId) return;
      socket.join(roomId);
      console.log(`🚪 Socket ${socket.id} joined room: ${roomId}`);
    });

    socket.on("leave_room", (roomId) => {
      if (!roomId) return;
      socket.leave(roomId);
      console.log(`🚪 Socket ${socket.id} left room: ${roomId}`);
    });

    // Join order chat room (for order-specific chat between admin, vendor, customer)
    socket.on("join_order", (saleOrderId) => {
      if (!saleOrderId) return;
      const orderRoom = `order_${saleOrderId}`;
      socket.join(orderRoom);
      console.log(`📦 Socket ${socket.id} joined order room: ${orderRoom}`);
    });

    // Leave order chat room
    socket.on("leave_order", (saleOrderId) => {
      if (!saleOrderId) return;
      const orderRoom = `order_${saleOrderId}`;
      socket.leave(orderRoom);
      console.log(`📦 Socket ${socket.id} left order room: ${orderRoom}`);
    });

    // Join ticket chat room
    socket.on("join_ticket", (ticketId) => {
      if (!ticketId) return;
      const ticketRoom = `ticket_${ticketId}`;
      socket.join(ticketRoom);
      console.log(`🎫 Socket ${socket.id} joined ticket room: ${ticketRoom}`);
    });

    // Leave ticket chat room
    socket.on("leave_ticket", (ticketId) => {
      if (!ticketId) return;
      const ticketRoom = `ticket_${ticketId}`;
      socket.leave(ticketRoom);
      console.log(`🎫 Socket ${socket.id} left ticket room: ${ticketRoom}`);
    });

    // Handle Sending Ticket Messages directly to ticket_messages table
    socket.on("send_ticket_message", async (data) => {
      console.log("Received send_ticket_message payload:", data);
      const ticketRes = await saveTicketMessageHelper({
        ticketId: data.ticket_id || data.ticketId,
        saleOrderId: data.sale_order_id || data.saleOrderId,
        vendorId: data.vendor_id || data.vendorId,
        senderId: data.sender_id || data.senderId,
        senderType: data.sender_type || data.senderType,
        receiverId: data.receiver_id || data.receiverId,
        receiverType: data.receiver_type || data.receiverType,
        message: data.message,
        filePath: data.file_path || data.filePath,
        ticketType: data.ticket_type || data.ticketType || "order",
        priority: data.priority || "n/a",
      });

      if (ticketRes && ticketRes.ticketMessage) {
        const msgJson = ticketRes.ticketMessage.toJSON();
        if (msgJson.file_path) {
          msgJson.file_path = buildFileUrl(msgJson.file_path);
        }
        if (ticketRes.ticket) {
          msgJson.ticket = ticketRes.ticket.toJSON();
          msgJson.sale_order_id = ticketRes.ticket.sale_order_id;
        }

        msgJson.id = `tkt_${ticketRes.ticketMessage.id}`;
        msgJson.ticket_id = ticketRes.ticket?.id;
        msgJson.ticket_code = ticketRes.ticket?.ticket_code;
        msgJson.sale_order_id = ticketRes.ticket?.sale_order_id;
        msgJson.saleOrderId = ticketRes.ticket?.sale_order_id;
        msgJson.sender_id = String(data.sender_id || data.senderId);
        msgJson.senderId = String(data.sender_id || data.senderId);
        msgJson.receiver_id = String(data.receiver_id || data.receiverId);
        msgJson.receiverId = String(data.receiver_id || data.receiverId);
        msgJson.text = msgJson.message;

        const targetSaleOrderId = ticketRes.ticket?.sale_order_id;

        // Emit to receiver and sender directly
        emitToUser(data.receiver_id || data.receiverId, "receive_ticket_message", msgJson);
        emitToUser(data.receiver_id || data.receiverId, "receive_order_message", msgJson);
        emitToUser(data.receiver_id || data.receiverId, "receive_message", msgJson);
        emitToUser(data.sender_id || data.senderId, "receive_order_message", msgJson);
        emitToUser(data.sender_id || data.senderId, "receive_message", msgJson);

        // Emit to ticket room
        if (ticketRes.ticket?.id) {
          emitToTicket(ticketRes.ticket.id, "receive_ticket_message", msgJson);
          emitToTicket(ticketRes.ticket.id, "receive_order_message", msgJson);
          emitToTicket(ticketRes.ticket.id, "receive_message", msgJson);
        }

        // Emit to order rooms
        if (targetSaleOrderId) {
          emitToOrder(targetSaleOrderId, "receive_ticket_message", msgJson);
          emitToOrder(targetSaleOrderId, "receive_order_message", msgJson);
          emitToOrder(targetSaleOrderId, "receive_message", msgJson);
          emitToRoom(`order_${targetSaleOrderId}`, "receive_order_message", msgJson);
          emitToRoom(`order_${targetSaleOrderId}`, "receive_message", msgJson);
          emitToRoom(`order_vendor_${targetSaleOrderId}`, "receive_order_message", msgJson);
          emitToRoom(`order_vendor_${targetSaleOrderId}`, "receive_message", msgJson);
        }

        socket.emit("ticket_message_status", {
          status: "sent",
          messageId: ticketRes.ticketMessage.id,
          ticketId: ticketRes.ticket?.id,
          sale_order_id: ticketRes.ticket?.sale_order_id
        });
      }
    });

    // Handle Sending Messages
    socket.on("send_message", async (data) => {
      console.log("Received send_message payload:", data);

      const rawSender = data.senderId || data.sender_id || "";
      const rawReceiver = data.receiverId || data.receiver_id || "1";
      const cleanSender = String(rawSender).trim();
      let cleanReceiver = String(rawReceiver).trim();
      const resolvedTempId = data.temp_id || data.tempId || null;

      const saleOrderId = data.sale_order_id || data.saleOrderId || data.order_id || data.orderId || null;
      let ticketId = data.ticket_id || data.ticketId || null;

      // Check if message belongs to an isolated order chat room
      let explicitRoomId = data.roomId || data.room_id || data.room || null;
      if (!explicitRoomId && saleOrderId && (data.target_type || data.targetType) && (data.target_id || data.targetId)) {
        explicitRoomId = buildOrderRoomId({
          saleOrderId,
          targetType: data.target_type || data.targetType,
          targetId: data.target_id || data.targetId
        });
      }

      // Check if this ticket belongs to an order
      let ticketForOrder = null;
      if (ticketId) {
        ticketForOrder = await Ticket.findByPk(ticketId);
      }

      const isOrderChat = Boolean(
        explicitRoomId ||
        saleOrderId ||
        ticketForOrder?.sale_order_id ||
        data.chatType === "order" ||
        data.chat_type === "order" ||
        (explicitRoomId && String(explicitRoomId).startsWith("order_"))
      );

      // =========================================================================
      // --- CASE A: ORDER CHAT (Order-specific chat between Admin, Vendor, Customer) ---
      // =========================================================================
      if (isOrderChat) {
        const resolvedOrderId = saleOrderId || ticketForOrder?.sale_order_id || null;
        console.log(`🎫 Processing order message for Order: ${resolvedOrderId || 'N/A'}`);

        // Resolve customer ID from sale order
        let orderCustomerId = "76";
        if (resolvedOrderId) {
          try {
            const so = await SaleOrder.findByPk(resolvedOrderId, {
              include: [{ model: Order, as: "order" }]
            });
            if (so) {
              orderCustomerId = String(so.order?.user_id || so.customer_id || so.user_id || "76");
            }
          } catch (e) {
            console.warn("Could not resolve SaleOrder customer:", e.message);
          }
        }

        const isAdminSender = cleanSender === "admin" || cleanSender === "1" || cleanSender.toLowerCase().includes("admin");
        if (isAdminSender) {
          if (!cleanReceiver || cleanReceiver === "10" || cleanReceiver === "admin") {
            cleanReceiver = orderCustomerId;
          }
        }

        const senderType = isAdminSender ? "admin" : (cleanSender.toLowerCase().includes("vendor") ? "vendor" : "customer");
        const receiverType = cleanReceiver === "1" || cleanReceiver === "admin" ? "admin" : (cleanReceiver.toLowerCase().includes("vendor") ? "vendor" : "customer");

        // 1. Deduplication check in messages table (15s)
        let savedMessage = await Message.findOne({
          where: {
            senderId: cleanSender,
            sale_order_id: resolvedOrderId || null,
            message: data.message || "",
            createdAt: { [Op.gte]: new Date(Date.now() - 15000) },
          },
          order: [["id", "DESC"]],
        });

        if (!savedMessage) {
          savedMessage = await Message.create({
            senderId: cleanSender,
            receiverId: cleanReceiver,
            message: data.message || "",
            chatType: "customer_and_admin",
            senderType: senderType,
            receiverType: receiverType,
            messageType: data.messageType || (data.file_path ? "image" : "text"),
            sale_order_id: resolvedOrderId || null,
            room_id: explicitRoomId || null,
            isRead: false,
            status: connectedUsers[cleanReceiver] ? "delivered" : "sent",
          });
        }

        // 2. Ensure ticket and ticket_messages record
        let orderTicket = ticketForOrder;
        if (!orderTicket && resolvedOrderId) {
          orderTicket = await Ticket.findOne({
            where: { sale_order_id: resolvedOrderId, status: "open" },
            order: [["id", "DESC"]],
          });
          if (!orderTicket) {
            orderTicket = await Ticket.create({
              sale_order_id: resolvedOrderId,
              ticket_code: `TKT-${resolvedOrderId}-${Math.floor(1000 + Math.random() * 9000)}`,
              ticket_type: "order",
              priority: "medium",
              status: "open",
            });
          }
        }

        const cleanSenderNum = isAdminSender ? 1 : (parseInt(cleanSender.replace(/[^0-9]/g, ""), 10) || parseInt(orderCustomerId, 10));
        const cleanReceiverNum = (cleanReceiver === "1" || cleanReceiver === "admin") ? 1 : (parseInt(cleanReceiver.replace(/[^0-9]/g, ""), 10) || parseInt(orderCustomerId, 10));

        let tktMsg = null;
        if (orderTicket) {
          tktMsg = await TicketMessage.findOne({
            where: {
              ticket_id: orderTicket.id,
              sender_id: cleanSenderNum,
              message: data.message || "",
              created_at: { [Op.gte]: new Date(Date.now() - 15000) },
            },
            order: [["id", "DESC"]],
          });

          if (!tktMsg) {
            tktMsg = await TicketMessage.create({
              ticket_id: orderTicket.id,
              sender_id: cleanSenderNum,
              sender_type: senderType,
              receiver_id: cleanReceiverNum,
              receiver_type: receiverType,
              message: data.message || null,
              file_path: data.file_path || null,
            });
          }
        }

        const isoNow = new Date().toISOString();
        const orderMsgData = {
          id: tktMsg ? `tkt_${tktMsg.id}` : (savedMessage ? `msg_${savedMessage.id}` : Date.now()),
          ticket_id: orderTicket?.id || null,
          ticketId: orderTicket?.id || null,
          ticket_code: orderTicket?.ticket_code || null,
          sale_order_id: resolvedOrderId,
          saleOrderId: resolvedOrderId,
          sender_id: cleanSender,
          senderId: cleanSender,
          receiver_id: cleanReceiver,
          receiverId: cleanReceiver,
          sender_type: senderType,
          senderType: senderType,
          receiver_type: receiverType,
          receiverType: receiverType,
          message: data.message || "",
          text: data.message || "",
          message_type: data.messageType || (data.file_path ? "image" : "text"),
          messageType: data.messageType || (data.file_path ? "image" : "text"),
          file_path: data.file_path || null,
          temp_id: resolvedTempId,
          tempId: resolvedTempId,
          created_at: isoNow,
          createdAt: isoNow,
        };

        // Broadcast to order rooms
        if (resolvedOrderId) {
          emitToRoom(`order_${resolvedOrderId}`, "receive_order_message", orderMsgData);
          emitToRoom(`order_${resolvedOrderId}`, "receive_message", orderMsgData);
          emitToRoom(`order_vendor_${resolvedOrderId}`, "receive_order_message", orderMsgData);
          emitToRoom(`order_vendor_${resolvedOrderId}`, "receive_message", orderMsgData);
          emitToRoom(`order_chat_${resolvedOrderId}_customer_to_admin_${orderCustomerId}`, "receive_order_message", orderMsgData);
          emitToRoom(`order_chat_${resolvedOrderId}_customer_to_admin_${orderCustomerId}`, "receive_message", orderMsgData);
        }

        if (explicitRoomId) {
          emitToRoom(explicitRoomId, "receive_order_message", orderMsgData);
          emitToRoom(explicitRoomId, "receive_message", orderMsgData);
        }

        // Direct participant emission (Admin and Customer)
        emitToUser(cleanReceiver, "receive_order_message", orderMsgData);
        emitToUser(cleanReceiver, "receive_message", orderMsgData);
        if (orderCustomerId) {
          emitToUser(orderCustomerId, "receive_order_message", orderMsgData);
          emitToUser(orderCustomerId, "receive_message", orderMsgData);
          emitToUser(`customer_${orderCustomerId}`, "receive_order_message", orderMsgData);
          emitToUser(`customer_${orderCustomerId}`, "receive_message", orderMsgData);
        }
        emitToUser("admin", "receive_order_message", orderMsgData);
        emitToUser("admin", "receive_message", orderMsgData);
        emitToUser("1", "receive_order_message", orderMsgData);
        emitToUser("1", "receive_message", orderMsgData);

        // Persistent notification for order chat message (idempotent)
        if (cleanReceiver && cleanReceiver !== cleanSender) {
          try {
            const isVendor = receiverType === "vendor";
            const isAdmin = cleanReceiver === "1" || cleanReceiver === "admin";
            const recipType = isAdmin ? "admin" : (isVendor ? "vendor" : "user");
            NotificationService.createAndDispatchNotification({
              recipient_type: recipType,
              recipient_id: cleanReceiver,
              title: isVendor ? "New Order Chat Message" : (isAdmin ? "Order Chat Message" : "Order Update Message"),
              message: `${cleanSender}: "${data.message || 'New order message'}"`,
              type: "order",
              related_order_id: resolvedOrderId,
              related_sale_order_id: resolvedOrderId,
              related_message_id: tktMsg?.id || savedMessage?.id,
              data: {
                order_id: resolvedOrderId,
                sender_id: cleanSender,
                sender_type: senderType,
                message: data.message,
                room_id: explicitRoomId,
              },
            }).catch((e) => console.warn("Notice: order chat notification error:", e.message));
          } catch (e) {}
        }

        // Acknowledge back to sender
        socket.emit("message_status", {
          status: "sent",
          messageId: orderMsgData.id,
          temp_id: resolvedTempId,
          sale_order_id: resolvedOrderId,
        });
        return;
      }

      // =========================================================================
      // --- CASE B: GENERAL SUPPORT QUERY / CONCIERGE CHAT (/chats) ---
      // =========================================================================
      console.log(`💬 Processing General Inquiry / Concierge message`);

      // Determine sender and receiver
      const isAdminSender = cleanSender === "admin" || cleanSender === "1" || cleanSender.toLowerCase().includes("admin");

      let ticket = ticketForOrder;
      let actualCustomerId = "76";

      // If ticketId is given, load ticket and resolve real customer ID from previous messages
      if (ticketId && !ticket) {
        ticket = await Ticket.findByPk(ticketId);
      }

      if (ticket) {
        try {
          const [tktCust] = await sequelize.query(
            `SELECT sender_id, receiver_id FROM ticket_messages 
             WHERE ticket_id = :tId AND sender_id != 1 
             ORDER BY id ASC LIMIT 1`,
            { replacements: { tId: ticket.id } }
          );
          if (tktCust && tktCust.length > 0) {
            actualCustomerId = String(tktCust[0].sender_id || tktCust[0].receiver_id || "76");
          }
        } catch (e) {
          console.warn("Could not query ticket customer:", e.message);
        }
      } else {
        // Find existing open General Inquiry ticket for customer
        const custLookupId = isAdminSender ? (parseInt(cleanReceiver, 10) || 76) : (parseInt(cleanSender, 10) || 76);
        actualCustomerId = String(custLookupId);

        const [openRows] = await sequelize.query(
          `SELECT t.* FROM tickets t
           JOIN ticket_messages tm ON tm.ticket_id = t.id
           WHERE (tm.sender_id = :cid OR tm.receiver_id = :cid)
             AND t.sale_order_id IS NULL
             AND t.status = 'open'
           ORDER BY t.id DESC LIMIT 1`,
          { replacements: { cid: custLookupId } }
        );

        if (openRows && openRows.length > 0) {
          ticket = await Ticket.findByPk(openRows[0].id);
        } else {
          // Check if ANY open General Inquiry ticket exists
          ticket = await Ticket.findOne({
            where: { sale_order_id: null, ticket_type: "General Inquiry", status: "open" },
            order: [["id", "DESC"]],
          });

          if (!ticket) {
            const nextCode = `TKT${Date.now().toString().slice(-4)}`;
            ticket = await Ticket.create({
              sale_order_id: null,
              ticket_code: nextCode,
              vendor_id: null,
              ticket_type: "General Inquiry",
              priority: "medium",
              status: "open",
            });
          }
        }
      }

      if (isAdminSender) {
        cleanReceiver = actualCustomerId;
      }

      const senderNum = isAdminSender ? 1 : (parseInt(cleanSender.replace(/[^0-9]/g, ""), 10) || 76);
      const receiverNum = (cleanReceiver === "1" || cleanReceiver === "admin") ? 1 : (parseInt(cleanReceiver.replace(/[^0-9]/g, ""), 10) || 76);

      // Deduplicate ticket_messages (15 seconds)
      let tktMsg = await TicketMessage.findOne({
        where: {
          ticket_id: ticket.id,
          sender_id: senderNum,
          message: data.message || "",
          created_at: { [Op.gte]: new Date(Date.now() - 15000) },
        },
        order: [["id", "DESC"]],
      });

      if (!tktMsg) {
        tktMsg = await TicketMessage.create({
          ticket_id: ticket.id,
          sender_id: senderNum,
          sender_type: isAdminSender ? "admin" : "customer",
          receiver_id: receiverNum,
          receiver_type: receiverNum === 1 ? "admin" : "customer",
          message: data.message || null,
          file_path: data.file_path || null,
        });
      }

      // Deduplicate messages table (15 seconds)
      let savedMessage = await Message.findOne({
        where: {
          senderId: cleanSender,
          message: data.message || "",
          createdAt: { [Op.gte]: new Date(Date.now() - 15000) },
        },
        order: [["id", "DESC"]],
      });

      if (!savedMessage) {
        savedMessage = await Message.create({
          senderId: cleanSender,
          receiverId: cleanReceiver,
          message: data.message || "",
          chatType: "query",
          senderType: isAdminSender ? "admin" : "customer",
          receiverType: receiverNum === 1 ? "admin" : "customer",
          messageType: data.messageType || "text",
          sale_order_id: null,
          room_id: null,
          isRead: false,
          status: connectedUsers[cleanReceiver] ? "delivered" : "sent",
        });
      }

      const isoNow = new Date().toISOString();
      const messagePayload = {
        id: tktMsg.id,
        ticket_id: ticket.id,
        ticketId: ticket.id,
        ticket_code: ticket.ticket_code,
        sender_id: String(senderNum),
        senderId: String(senderNum),
        receiver_id: String(receiverNum),
        receiverId: String(receiverNum),
        sender_type: isAdminSender ? "admin" : "customer",
        senderType: isAdminSender ? "admin" : "customer",
        receiver_type: receiverNum === 1 ? "admin" : "customer",
        receiverType: receiverNum === 1 ? "admin" : "customer",
        message: data.message || "",
        text: data.message || "",
        message_type: data.messageType || (data.file_path ? "image" : "text"),
        messageType: data.messageType || (data.file_path ? "image" : "text"),
        file_path: data.file_path || null,
        temp_id: resolvedTempId,
        tempId: resolvedTempId,
        created_at: isoNow,
        createdAt: isoNow,
      };

      // Realtime broadcast to ticket room and direct recipient
      emitToRoom(`ticket_${ticket.id}`, "receive_ticket_message", messagePayload);

      // Clean single emission to actual recipient (deduplicated)
      if (isAdminSender) {
        emitToUser(cleanReceiver, "receive_ticket_message", messagePayload);
      } else {
        emitToUser("1", "receive_ticket_message", messagePayload);
        emitToUser("admin", "receive_ticket_message", messagePayload);
      }

      // Trigger persistent notification with built-in idempotency & push
      try {
        if (isAdminSender) {
          NotificationService.notifyCustomerSupportReply({
            ticket,
            customerId: cleanReceiver,
            messageRecord: tktMsg,
            messageText: data.message,
          }).catch((e) => console.warn("Notice: socket customer support reply notif error:", e.message));
        } else {
          // Customer replied: mark earlier admin messages on this ticket as seen & support notifs as read
          const cleanCustIdNum = parseInt(cleanSender.replace(/[^0-9]/g, ""), 10) || 76;
          TicketMessage.update(
            { seen_at: new Date() },
            {
              where: {
                ticket_id: ticket.id,
                receiver_id: cleanCustIdNum,
                seen_at: null,
              },
            }
          ).catch(() => {});

          Notification.update(
            { is_read: true, read_at: new Date() },
            {
              where: {
                recipient_type: "user",
                recipient_id: { [Op.in]: [String(cleanCustIdNum), `customer_${cleanCustIdNum}`, `user_${cleanCustIdNum}`] },
                related_ticket_id: ticket.id,
                is_read: false,
              },
            }
          ).catch(() => {});

          emitToUser(String(cleanCustIdNum), "unread_count:update", { unread_count: 0 });

          NotificationService.notifyAdminNewSupportMessage({
            ticket,
            customerId: cleanSender,
            messageRecord: tktMsg,
            messageText: data.message,
          }).catch((e) => console.warn("Notice: socket admin support notif error:", e.message));
        }
      } catch (notifErr) {
        console.warn("Notice: non-blocking socket notification error:", notifErr.message);
      }

      // Status acknowledgment to sender
      socket.emit("message_status", {
        messageId: tktMsg.id,
        status: "sent",
        temp_id: resolvedTempId,
        tempId: resolvedTempId,
        ticket_id: ticket.id,
        ticketId: ticket.id,
      });
    });

    // Mark messages as read
    socket.on("mark_read", async ({ senderId, receiverId }) => {
      try {
        await Message.update(
          { status: "read", isRead: true },
          { where: { senderId, receiverId, isRead: false } }
        );
        const senderSocketId = connectedUsers[senderId];
        if (senderSocketId) {
          io.to(senderSocketId).emit("messages_read", { readerId: receiverId });
        }
      } catch (err) {
        console.error("Error marking messages as read:", err);
      }
    });

    // Handle message deletion socket event
    socket.on("delete_message", async ({ messageId, userId }) => {
      try {
        if (!messageId || !userId) return;
        const message = await Message.findByPk(messageId);
        if (message && userId) {
          let deletedObj = message.deletedmsges || {};
          if (typeof deletedObj === 'string') {
            try {
              deletedObj = JSON.parse(deletedObj);
            } catch (e) {
              deletedObj = {};
            }
          }
          deletedObj[userId] = new Date().toISOString();

          await Message.update(
            { deletedmsges: deletedObj },
            { where: { id: messageId } }
          );

          const deletingUserSocketId = connectedUsers[userId];
          if (deletingUserSocketId) {
            io.to(deletingUserSocketId).emit("message_deleted", { messageId });
          }
        }
      } catch (err) {
        console.error("Error in delete_message socket event:", err);
      }
    });
    // Cleanup on Disconnect
    socket.on("disconnect", () => {
      for (const [userId, socketId] of Object.entries(connectedUsers)) {
        if (socketId === socket.id) {
          delete connectedUsers[userId];
          console.log(`User ${userId} disconnected.`);
          // Notify all clients that this user is offline
          io.emit("user_status", { userId, status: "offline" });
          broadcastOnlineUsers();
          break;
        }
      }
    });
  });
}

export function emitToAll(event, data) {
  if (ioInstance) {
    ioInstance.emit(event, data);
  }
}

export function emitToUser(userId, event, data) {
  if (ioInstance && userId) {
    const strId = String(userId);
    const cleanId = strId.replace(/^(vendor_|customer_|admin_)/, "");
    const targets = new Set();

    targets.add(strId);
    if (cleanId) targets.add(cleanId);

    if (strId.toLowerCase().includes("admin") || cleanId.toLowerCase() === "admin") {
      targets.add("admin");
      targets.add("admin_room");
    }

    for (const target of targets) {
      ioInstance.to(target).emit(event, data);
    }
  }
}

export function emitToVendor(vendorId, event, data) {
  if (!ioInstance) {
    console.warn("⚠️ Cannot emit to vendor, ioInstance is not initialized");
    return;
  }

  const strId = String(vendorId);
  const cleanId = strId.replace(/^(vendor_|customer_)/, "");

  console.log(`📢 Emitting '${event}' to vendor ${cleanId} (rooms: vendor_${cleanId}, ${cleanId})`);

  // Emit to socket rooms (supports multiple browser tabs / devices for same vendor)
  ioInstance.to(`vendor_${cleanId}`).emit(event, data);
  ioInstance.to(cleanId).emit(event, data);
  ioInstance.to(strId).emit(event, data);

  // Also emit to direct socket ID if registered in connectedUsers
  const directSocketId = connectedUsers[cleanId] || connectedUsers[`vendor_${cleanId}`] || connectedUsers[strId];
  if (directSocketId) {
    ioInstance.to(directSocketId).emit(event, data);
  }
}

export function emitToAdmin(event, data) {
  if (!ioInstance) {
    console.warn("⚠️ Cannot emit to admin, ioInstance is not initialized");
    return;
  }

  console.log(`🛡️ Emitting '${event}' to admin room`);

  // Emit to admin rooms
  ioInstance.to("admin").emit(event, data);
  ioInstance.to("admin_room").emit(event, data);

  // Also emit to direct socket ID if registered in connectedUsers under admin
  const directSocketId = connectedUsers["admin"] || connectedUsers["admin_1"];
  if (directSocketId) {
    ioInstance.to(directSocketId).emit(event, data);
  }
}

export function emitToOrder(orderId, event, data) {
  if (!ioInstance) {
    console.warn("⚠️ Cannot emit to order room, ioInstance is not initialized");
    return;
  }
  if (!orderId) return;

  const room = `order_${orderId}`;
  console.log(`📦 Emitting '${event}' to order room: ${room}`);
  ioInstance.to(room).emit(event, data);
}

export function emitToTicket(ticketId, event, data) {
  if (!ioInstance) {
    console.warn("⚠️ Cannot emit to ticket room, ioInstance is not initialized");
    return;
  }
  if (!ticketId) return;

  const room = `ticket_${ticketId}`;
  console.log(`🎫 Emitting '${event}' to ticket room: ${room}`);
  ioInstance.to(room).emit(event, data);
}

export async function saveTicketMessageHelper({
  ticketId,
  saleOrderId,
  vendorId,
  senderId,
  senderType,
  receiverId,
  receiverType,
  message,
  filePath,
  ticketType = "order",
  priority = "n/a",
}) {
  try {
    let ticket = null;
    if (ticketId) {
      ticket = await Ticket.findByPk(ticketId);
    } else if (saleOrderId) {
      ticket = await Ticket.findOne({ where: { sale_order_id: saleOrderId, status: "open" } });
      if (!ticket) {
        ticket = await Ticket.create({
          sale_order_id: saleOrderId,
          ticket_code: `TKT-${saleOrderId}-${Math.floor(1000 + Math.random() * 9000)}`,
          vendor_id: vendorId || null,
          ticket_type: ticketType || "order",
          priority: priority || "medium",
          status: "open",
        });
      }
    }

    const cleanSenderId = parseInt(String(senderId || "").replace(/[^0-9]/g, ""), 10) || 1;
    const cleanReceiverId = parseInt(String(receiverId || "").replace(/[^0-9]/g, ""), 10) || 1;

    let sType = senderType ? String(senderType).toLowerCase() : "customer";
    if (String(senderId) === "1" || String(senderId) === "admin" || String(senderId).toLowerCase().includes("admin") || cleanSenderId === 1) {
      sType = "admin";
    } else if (String(senderId).toLowerCase().includes("vendor")) {
      sType = "vendor";
    } else if (String(senderId).toLowerCase().includes("customer")) {
      sType = "customer";
    }

    let rType = receiverType ? String(receiverType).toLowerCase() : "admin";
    if (String(receiverId).toLowerCase().includes("admin") || cleanReceiverId === 1) {
      rType = "admin";
    } else if (String(receiverId).toLowerCase().includes("vendor")) {
      rType = "vendor";
    } else if (String(receiverId).toLowerCase().includes("customer")) {
      rType = "customer";
    }

    const targetTktId = ticket ? ticket.id : (ticketId || null);
    let targetReceiverId = cleanReceiverId;

    if (sType === "admin") {
      rType = "customer";
      if (!targetReceiverId || targetReceiverId === 10 || targetReceiverId === 1) {
        if (ticket?.sale_order_id) {
          try {
            const so = await SaleOrder.findByPk(ticket.sale_order_id, {
              include: [{ model: Order, as: "order" }],
            });
            if (so) targetReceiverId = so.order?.user_id || so.customer_id || so.user_id || 76;
          } catch (e) {}
        } else if (targetTktId) {
          try {
            const [tktCust] = await sequelize.query(
              `SELECT sender_id, receiver_id FROM ticket_messages 
               WHERE ticket_id = :tId AND sender_id != 1 AND sender_id != 10 
               ORDER BY id ASC LIMIT 1`,
              { replacements: { tId: targetTktId } }
            );
            if (tktCust && tktCust.length > 0) {
              targetReceiverId = parseInt(tktCust[0].sender_id || tktCust[0].receiver_id, 10) || 76;
            }
          } catch (e) {}
        }
      }
      targetReceiverId = targetReceiverId || 76;
    }

    // Valid receiver_type enum: 'customer','vendor','admin','user'
    if (!["customer", "vendor", "admin", "user"].includes(rType)) {
      rType = "admin";
    }

    // 15-second deduplication in ticket_messages (with timezone offset resilience)
    if (targetTktId) {
      const candidates = await TicketMessage.findAll({
        where: {
          ticket_id: targetTktId,
          message: message || "",
        },
        order: [["id", "DESC"]],
        limit: 5,
      });
      const nowMs = Date.now();
      for (const cand of candidates) {
        const diffMs = Math.abs(nowMs - new Date(cand.created_at).getTime());
        const isRecent = diffMs < 20000 || Math.abs(diffMs - 5.5 * 3600 * 1000) < 20000;
        if (isRecent && (cand.sender_id === cleanSenderId || (sType === "admin" && cand.sender_type === "admin"))) {
          return { ticket, ticketMessage: cand, isDuplicate: true };
        }
      }
    }

    const savedTicketMessage = await TicketMessage.create({
      ticket_id: targetTktId,
      sender_id: cleanSenderId,
      sender_type: sType,
      receiver_id: targetReceiverId,
      receiver_type: rType,
      message: message || null,
      file_path: filePath || null,
    });

    return { ticket, ticketMessage: savedTicketMessage };
  } catch (err) {
    console.error("Error saving ticket message in helper:", err);
    return null;
  }
}

export function buildOrderRoomId({ saleOrderId, targetType, targetId }) {
  const cleanOrderId = String(saleOrderId || "").trim();
  const cleanTargetId = String(targetId || "").replace(/^(customer_|vendor_|admin_)/, "").trim();
  const cleanType = String(targetType || "").toLowerCase().trim();

  if (cleanType.includes("customer")) {
    return `order_chat_${cleanOrderId}_customer_to_admin_${cleanTargetId}`;
  } else if (cleanType.includes("vendor")) {
    return `order_chat_${cleanOrderId}_vendor_to_admin_${cleanTargetId}`;
  }
  return `order_chat_${cleanOrderId}_${cleanType}_${cleanTargetId}`;
}

export function emitToRoom(roomId, event, data) {
  if (!ioInstance) {
    console.warn("⚠️ Cannot emit to room, ioInstance is not initialized");
    return;
  }
  if (!roomId) return;

  console.log(`📢 Emitting '${event}' to room: ${roomId}`);
  ioInstance.to(roomId).emit(event, data);
}



