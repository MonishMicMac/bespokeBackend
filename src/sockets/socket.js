import Message from "../../models/index.js";
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
    const cleanId = strId.replace(/^(vendor_|customer_)/, "");

    connectedUsers[strId] = socket.id;
    connectedUsers[cleanId] = socket.id;
    connectedUsers[`vendor_${cleanId}`] = socket.id;

    // Join rooms for multi-tab and room-based emitting
    socket.join(strId);
    socket.join(cleanId);
    socket.join(`vendor_${cleanId}`);

    console.log(`User/Vendor ${strId} (clean: ${cleanId}) registered with socket ${socket.id}`);
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

    // Send the list of currently online users to the requesting client
    socket.on("get_online_users", () => {
      socket.emit("online_users", Object.keys(connectedUsers));
    });

    // Handle Sending Messages
    socket.on("send_message", async (data) => {
      console.log("Received send_message payload:", data);
      
      const receiverSocketId = connectedUsers[data.receiverId];
      let initialStatus = "sent";
      if (receiverSocketId) {
          initialStatus = "delivered";
      }

      const savedMessage = await Message.create({
          senderId: data.senderId,
          receiverId: data.receiverId,
          message: data.message,
          chatType: data.chatType || data.chat_type || "private",
          senderType: data.senderType || data.sender_type || null,
          receiverType: data.receiverType || data.receiver_type || null,
          messageType: data.messageType || "text",
          isRead: false,
          status: initialStatus,
      });
      const messageData = savedMessage.toJSON();

if (messageData.messageType === "image") {
  messageData.message = buildFileUrl(messageData.message);
}
   console.log(messageData)
      if (receiverSocketId) {
          io.to(receiverSocketId).emit("receive_message", messageData);
      }
 



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
    const cleanId = strId.replace(/^(vendor_|customer_)/, "");
    ioInstance.to(strId).emit(event, data);
    ioInstance.to(cleanId).emit(event, data);
    const socketId = connectedUsers[strId] || connectedUsers[cleanId];
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


