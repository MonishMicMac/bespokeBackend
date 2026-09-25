import Message from "../../models/index.js";
import Ticket from "../../models/Ticket.js";
import TicketMessage from "../../models/TicketMessage.js";
import { buildFileUrl } from "../utils/fileUrl.js";

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

        // Emit to receiver directly
        emitToUser(data.receiver_id || data.receiverId, "receive_ticket_message", msgJson);

        // Emit to ticket room
        if (ticketRes.ticket?.id) {
          emitToTicket(ticketRes.ticket.id, "receive_ticket_message", msgJson);
        }

        // Emit to order room
        if (ticketRes.ticket?.sale_order_id) {
          emitToOrder(ticketRes.ticket.sale_order_id, "receive_ticket_message", msgJson);
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

      const receiverSocketId = connectedUsers[data.receiverId];
      let initialStatus = "sent";
      if (receiverSocketId) {
        initialStatus = "delivered";
      }

      const saleOrderId = data.sale_order_id || data.saleOrderId || data.order_id || data.orderId || null;
      const ticketId = data.ticket_id || data.ticketId || null;

      // Check if message belongs to an isolated order chat room
      let explicitRoomId = data.roomId || data.room_id || data.room || null;
      if (!explicitRoomId && saleOrderId && (data.target_type || data.targetType) && (data.target_id || data.targetId)) {
        explicitRoomId = buildOrderRoomId({
          saleOrderId,
          targetType: data.target_type || data.targetType,
          targetId: data.target_id || data.targetId
        });
      }

      const isOrderChat = Boolean(
        explicitRoomId ||
        saleOrderId ||
        ticketId ||
        data.chatType === "order" ||
        data.chat_type === "order" ||
        (explicitRoomId && String(explicitRoomId).startsWith("order_"))
      );

      // --- A. IF ORDER / TICKET CHAT: SAVE ONLY IN ticket_messages TABLE ---
      if (isOrderChat) {
        console.log(`🎫 Routing order message strictly to ticket_messages table (Room: ${explicitRoomId || 'N/A'}, Order: ${saleOrderId || 'N/A'})`);
        const ticketRes = await saveTicketMessageHelper({
          ticketId,
          saleOrderId,
          vendorId: data.vendor_id || data.vendorId,
          senderId: data.senderId || data.sender_id,
          senderType: data.senderType || data.sender_type,
          receiverId: data.receiverId || data.receiver_id,
          receiverType: data.receiverType || data.receiver_type,
          message: data.message,
          filePath: data.messageType === "image" ? data.message : (data.file_path || null),
          targetType: data.target_type || data.targetType || (explicitRoomId?.includes("vendor") ? "vendor" : "customer"),
        });

        const orderMsgData = ticketRes?.ticketMessage ? ticketRes.ticketMessage.toJSON() : { ...data };
        orderMsgData.roomId = explicitRoomId;
        orderMsgData.room_id = explicitRoomId;
        orderMsgData.sale_order_id = saleOrderId;
        orderMsgData.text = orderMsgData.message;
        if (ticketRes?.ticket) {
          orderMsgData.ticket_id = ticketRes.ticket.id;
          orderMsgData.ticket_code = ticketRes.ticket.ticket_code;
        }
        if (orderMsgData.file_path) {
          orderMsgData.file_path = buildFileUrl(orderMsgData.file_path);
          orderMsgData.message = orderMsgData.file_path;
        }

        // Broadcast exclusively to the order room
        if (explicitRoomId) {
          console.log(`📢 Broadcasting message exclusively to order room: ${explicitRoomId}`);
          io.to(explicitRoomId).emit("receive_order_message", orderMsgData);
        }

        // Notification to receiver without injecting into normal direct chat
        emitToUser(data.receiverId, "order_chat_notification", {
          roomId: explicitRoomId,
          sale_order_id: saleOrderId,
          senderId: data.senderId,
          message: orderMsgData
        });

        socket.emit("message_status", {
          messageId: orderMsgData.id,
          status: "sent",
          receiverId: data.receiverId,
          sale_order_id: saleOrderId,
          roomId: explicitRoomId,
          ticket_id: orderMsgData.ticket_id || null
        });
        return; // NEVER continue to Message.create!
      }

      // STRICT SAFETY: Do NOT store any order message in messages table
      if (data.sale_order_id || data.saleOrderId || data.order_id || data.orderId || data.ticket_id || data.ticketId || (explicitRoomId && String(explicitRoomId).startsWith("order_"))) {
        console.warn("⚠️ Blocked order message from reaching messages table!");
        return;
      }

      // --- B. NORMAL 1-ON-1 CHAT: SAVE ONLY IN messages TABLE ---
      const savedMessage = await Message.create({
        senderId: data.senderId,
        receiverId: data.receiverId,
        message: data.message,
        chatType: data.chatType || data.chat_type || "private",
        senderType: data.senderType || data.sender_type || null,
        receiverType: data.receiverType || data.receiver_type || null,
        messageType: data.messageType || "text",
        sale_order_id: null,
        room_id: null,
        isRead: false,
        status: initialStatus,
      });
      const messageData = savedMessage.toJSON();
      if (messageData.messageType === "image") {
        messageData.message = buildFileUrl(messageData.message);
      }

      console.log("Emitting normal message data:", messageData);
      emitToUser(data.receiverId, "receive_message", messageData);

      // Notify sender of the delivery status
      socket.emit("message_status", {
        messageId: savedMessage.id,
        status: initialStatus,
        receiverId: data.receiverId
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
  if (ioInstance) {
    const strId = String(userId);
    const cleanId = strId.replace(/^(vendor_|customer_|admin_)/, "");
    ioInstance.to(strId).emit(event, data);
    ioInstance.to(cleanId).emit(event, data);

    if (strId.toLowerCase().includes("admin") || cleanId.toLowerCase() === "admin") {
      ioInstance.to("admin").emit(event, data);
      ioInstance.to("admin_room").emit(event, data);
    }

    const socketId =
      connectedUsers[strId] ||
      connectedUsers[cleanId] ||
      (strId.toLowerCase().includes("admin") ? connectedUsers["admin"] : null);

    if (socketId) {
      ioInstance.to(socketId).emit(event, data);
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
    if (String(senderId).toLowerCase().includes("admin")) sType = "admin";
    else if (String(senderId).toLowerCase().includes("vendor")) sType = "vendor";
    else if (String(senderId).toLowerCase().includes("customer")) sType = "customer";

    let rType = receiverType ? String(receiverType).toLowerCase() : "admin";
    if (String(receiverId).toLowerCase().includes("admin")) rType = "admin";
    else if (String(receiverId).toLowerCase().includes("vendor")) rType = "vendor";
    else if (String(receiverId).toLowerCase().includes("customer")) rType = "customer";

    // Valid receiver_type enum: 'customer','vendor','admin','user'
    if (!["customer", "vendor", "admin", "user"].includes(rType)) {
      rType = "admin";
    }

    const savedTicketMessage = await TicketMessage.create({
      ticket_id: ticket ? ticket.id : (ticketId || null),
      sender_id: cleanSenderId,
      sender_type: sType,
      receiver_id: cleanReceiverId,
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



