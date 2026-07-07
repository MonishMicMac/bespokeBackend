import Message from "../../models/index.js";

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

  io.on("connection", (socket) => {
    // Register Users on Connect
    socket.on("register", (userId) => {
      connectedUsers[userId] = socket.id;
      console.log(`User ${userId} connected with socket ${socket.id}`);
      // Notify all clients that this user is online
      io.emit("user_status", { userId, status: "online" });
      broadcastOnlineUsers();
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
    const socketId = connectedUsers[userId];
    if (socketId) {
      ioInstance.to(socketId).emit(event, data);
    }
  }
}
function buildFileUrl(path) {
  if (!path) return path;

  if (path.startsWith("http")) {
    return path;
  }

  return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_DEFAULT_REGION}.amazonaws.com/${encodeURI(path)}`;
}

