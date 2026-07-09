import Message from "../../models/index.js";
import { Op } from "sequelize";
import { emitToUser } from "../sockets/socket.js";
import sequelize from "../../config/db.js";
import s3ImageUploader from "../services/S3service.js";
export const getChatHistory = async (req, res) => {


  const { userId, otherUserId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10; // default 50 for backward compatibility if not passed
  const offset = (page - 1) * limit;

  console.log(`Fetching chat history between user ${userId} and user ${otherUserId}, page: ${page}, limit: ${limit}`)

  try {
    const messages = await Message.findAll({
      where: [
        {
          [Op.or]: [
            { senderId: userId, receiverId: otherUserId },
            { senderId: otherUserId, receiverId: userId },
          ],
        },
        sequelize.literal(`JSON_EXTRACT(IFNULL(deletedmsges, '{}'), '$."${userId}"') IS NULL`)
      ],
      order: [["createdAt", "DESC"]], // Get latest first for pagination
      limit: limit,
      offset: offset
    });

    // Reverse them to be in chronological order for the frontend
    messages.reverse();

    res.status(200).json(messages);
  } catch (error) {
    console.error("Error fetching chat history:", error);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
};

export const markMessagesAsRead = async (req, res) => {
  const { senderId, receiverId } = req.body;
  try {
    await Message.update(
      { status: "read", isRead: true },
      { where: { senderId, receiverId, isRead: false } }
    );
    res.status(200).json({ success: true, message: "Messages marked as read" });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({ error: "Failed to mark messages as read" });
  }
};

export const uploadImage = async (req, res) => {
  try {
    console.log(req.file);

    const imageUrl = await s3ImageUploader(req.file);

    res.json({
      success: true,
      imageUrl,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId query parameter is required" });
    }

    // Find the message first to know the sender and receiver IDs
    const message = await Message.findByPk(id);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    let deletedObj = message.deletedmsges || {};
    if (typeof deletedObj === 'string') {
      try {
        deletedObj = JSON.parse(deletedObj);
      } catch (e) {
        deletedObj = {};
      }
    }

    // Mark the message as deleted by this specific user
    deletedObj[userId] = new Date().toISOString();

    await Message.update(
      { deletedmsges: deletedObj },
      { where: { id } }
    );

    // Notify only the deleting user's socket about the deletion
    emitToUser(userId, "message_deleted", { messageId: id });

    res.json({
      success: true,
      message: "Message deleted for user"
    });

  } catch (err) {
    console.error("Error deleting message:", err);
    res.status(500).json(err);
  }
};

export const deleteConversation = async (req, res) => {
  try {
    const { userId, otherUserId } = req.params;

    // Find all messages between the two users
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId }
        ]
      }
    });

    const nowStr = new Date().toISOString();

    for (const msg of messages) {
      let deletedObj = msg.deletedmsges || {};
      if (typeof deletedObj === 'string') {
        try {
          deletedObj = JSON.parse(deletedObj);
        } catch (e) {
          deletedObj = {};
        }
      }
      // Mark as deleted for the active user who initiated delete
      deletedObj[userId] = nowStr;

      await Message.update(
        { deletedmsges: deletedObj },
        { where: { id: msg.id } }
      );
    }

    // Notify only the deleting user's socket about the conversation deletion
    emitToUser(userId, "conversation_deleted", { userId: otherUserId });

    res.json({
      success: true,
      message: "Conversation deleted successfully for user"
    });
  } catch (err) {
    console.error("Error deleting conversation:", err);

    res.status(500).json({ error: "Failed to delete conversation" });
  }
};
// jity vcdu hmqq ifqu