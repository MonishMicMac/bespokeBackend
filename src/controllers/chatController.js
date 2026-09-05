import Message from "../../models/index.js";
import VendorLogin from "../../models/VendorLogin.js";
import UserLogin from "../../models/UserLogin.js";
import { Op } from "sequelize";
import { emitToUser } from "../sockets/socket.js";
import sequelize from "../../config/db.js";
import s3ImageUploader from "../services/S3service.js";
export const getChatHistory = async (req, res) => {


  const { userId, otherUserId } = req.params;
  const { chatType } = req.query;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10; // default 50 for backward compatibility if not passed
  const offset = (page - 1) * limit;

  console.log(`Fetching chat history between user ${userId} and user ${otherUserId}, page: ${page}, limit: ${limit}, chatType: ${chatType || 'all'}`);

  try {
    const whereConditions = [
      {
        [Op.or]: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId },
        ],
      },
      sequelize.literal(`JSON_EXTRACT(IFNULL(deletedmsges, '{}'), '$."${userId}"') IS NULL`)
    ];

    if (chatType) {
      whereConditions.push({ chatType });
    }

    const messages = await Message.findAll({
      where: whereConditions,
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

export const sendMessage = async (req, res) => {
  try {
    const {
      senderId,
      receiverId,
      message,
      messageType = "text",
      chatType = "private",
      senderType,
      receiverType,
      sender_type,
      receiver_type,
      chat_type,
    } = req.body;

    if (!senderId || !receiverId || !message) {
      return res.status(400).json({ error: "senderId, receiverId, and message are required" });
    }

    const savedMessage = await Message.create({
      senderId: String(senderId),
      receiverId: String(receiverId),
      message,
      messageType,
      chatType: chatType || chat_type || "private",
      senderType: senderType || sender_type || null,
      receiverType: receiverType || receiver_type || null,
      isRead: false,
      status: "sent",
    });

    const messageData = savedMessage.toJSON();

    // Emit via socket to receiver if connected
    emitToUser(String(receiverId), "receive_message", messageData);

    res.status(201).json({
      success: true,
      message: "Message stored successfully",
      data: messageData,
    });
  } catch (error) {
    console.error("Error storing message:", error);
    res.status(500).json({ error: "Failed to store message", details: error.message });
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

export const getConversations = async (req, res) => {
  const { userId } = req.params;
  try {
    const messages = await Message.findAll({
      where: [
        {
          [Op.or]: [
            { senderId: userId },
            { receiverId: userId },
          ],
        },
        sequelize.literal(`JSON_EXTRACT(IFNULL(deletedmsges, '{}'), '$."${userId}"') IS NULL`)
      ],
      order: [["createdAt", "DESC"]],
    });

    const conversationMap = new Map();

    for (const msg of messages) {
      const otherId = String(msg.senderId === userId ? msg.receiverId : msg.senderId);
      if (!conversationMap.has(otherId)) {
        conversationMap.set(otherId, {
          lastMsg: msg,
          unreadCount: 0,
        });
      }
      if (String(msg.receiverId) === String(userId) && !msg.isRead) {
        const entry = conversationMap.get(otherId);
        entry.unreadCount += 1;
      }
    }

    // Collect numeric IDs for vendors and customers
    const vendorNumericIds = [];
    const customerNumericIds = [];

    for (const [otherId, { lastMsg }] of conversationMap.entries()) {
      const isCustomer = lastMsg.chatType === "customer_and_admin" ||
        otherId.startsWith("customer_") ||
        lastMsg.senderType === "customer" ||
        lastMsg.receiverType === "customer";

      const cleanId = otherId.replace(/^(vendor_|customer_)/, '');
      const numId = Number(cleanId);
      if (!isNaN(numId)) {
        if (isCustomer) {
          customerNumericIds.push(numId);
        } else {
          vendorNumericIds.push(numId);
        }
      }
    }

    // Fetch profile details from database
    const [vendors, customers] = await Promise.all([
      vendorNumericIds.length > 0 ? VendorLogin.findAll({ where: { id: vendorNumericIds } }) : [],
      customerNumericIds.length > 0 ? UserLogin.findAll({ where: { id: customerNumericIds } }) : []
    ]);

    const vendorMap = new Map(vendors.map(v => [String(v.id), v]));
    const customerMap = new Map(customers.map(c => [String(c.id), c]));

    const conversations = [];

    for (const [otherId, { lastMsg, unreadCount }] of conversationMap.entries()) {
      const isCustomer = lastMsg.chatType === "customer_and_admin" ||
        otherId.startsWith("customer_") ||
        lastMsg.senderType === "customer" ||
        lastMsg.receiverType === "customer";

      const mappedId = (otherId.startsWith("vendor_") || otherId.startsWith("customer_"))
        ? otherId
        : (isCustomer ? `customer_${otherId}` : `vendor_${otherId}`);

      const cleanId = otherId.replace(/^(vendor_|customer_)/, '');

      let name = isCustomer ? `Customer #${cleanId}` : `Vendor ${cleanId}`;
      let receiverName = name;
      let avatar = null;
      let email = "";
      let mobile = "";
      let description = "";

      if (isCustomer) {
        const customer = customerMap.get(cleanId);
        if (customer) {
          name = customer.username || customer.email || `Customer #${cleanId}`;
          receiverName = name;
          avatar = customer.img_path || null;
          email = customer.email || "";
          mobile = customer.mobile || "";
          description = customer.address || "";
        }
      } else {
        const vendor = vendorMap.get(cleanId);
        if (vendor) {
          name = vendor.shop_name || vendor.seller_name || `Vendor ${cleanId}`;
          receiverName = name;
          avatar = vendor.img_path || null;
          email = vendor.email || "";
          mobile = vendor.mobile || "";
          description = vendor.description || "";
        }
      }

      conversations.push({
        id: mappedId,
        rawId: otherId,
        name: name,
        receiverName: receiverName,
        avatar: avatar,
        mobile: mobile,
        role: isCustomer ? "customer" : "vendor",
        chatType: lastMsg.chatType || (isCustomer ? "customer_and_admin" : "vendor_and_customer"),
        username: otherId,
        status: "offline",
        unreadCount: unreadCount,
        lastMessage: lastMsg.messageType === "image" ? "📷 Image" : lastMsg.message,
        lastMessageTime: new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        email: email,
        description: description,
        updatedAt: lastMsg.createdAt
      });
    }

    res.status(200).json(conversations);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
};
