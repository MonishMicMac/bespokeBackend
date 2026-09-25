import Message from "../../models/index.js";
import Ticket from "../../models/Ticket.js";
import TicketMessage from "../../models/TicketMessage.js";
import VendorLogin from "../../models/VendorLogin.js";
import UserLogin from "../../models/UserLogin.js";
import { Op } from "sequelize";
import { emitToUser, emitToOrder, emitToTicket, emitToRoom, buildOrderRoomId, saveTicketMessageHelper } from "../sockets/socket.js";
import sequelize from "../../config/db.js";
import s3ImageUploader from "../services/S3service.js";
import { buildFileUrl } from "../utils/fileUrl.js";
export const getUserVariations = (id) => {
  if (!id) return [];
  const strId = String(id).trim();
  const cleanId = strId.replace(/^(customer_|vendor_|admin_)/, "");
  const variations = new Set([strId, cleanId]);
  if (/^\d+$/.test(cleanId)) {
    variations.add(`customer_${cleanId}`);
    variations.add(`vendor_${cleanId}`);
  }
  return Array.from(variations);
};

export const getChatHistory = async (req, res) => {
  const { userId, otherUserId } = req.params;
  const { chatType, sale_order_id, saleOrderId, roomId, room_id, include_order_rooms } = req.query;
  const orderId = sale_order_id || saleOrderId;
  const explicitRoom = roomId || room_id;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;

  console.log(`Fetching chat history between user ${userId} and user ${otherUserId}, order: ${orderId || 'none'}, room: ${explicitRoom || 'direct'}, page: ${page}`);

  try {
    const userVariations = getUserVariations(userId);
    const otherVariations = getUserVariations(otherUserId);
    const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "");

    const whereConditions = [
      {
        [Op.or]: [
          {
            senderId: { [Op.in]: userVariations },
            receiverId: { [Op.in]: otherVariations },
          },
          {
            senderId: { [Op.in]: otherVariations },
            receiverId: { [Op.in]: userVariations },
          },
        ],
      },
      sequelize.literal(`JSON_EXTRACT(IFNULL(deletedmsges, '{}'), '$."${safeUserId}"') IS NULL`)
    ];

    if (chatType && chatType !== 'all') {
      whereConditions.push({ chatType });
    }

    if (explicitRoom) {
      whereConditions.push({ room_id: explicitRoom });
    } else if (orderId && orderId !== 'all') {
      if (orderId === 'null' || orderId === 'none') {
        whereConditions.push({ sale_order_id: null });
      } else {
        whereConditions.push({ sale_order_id: orderId });
      }
    } else if (include_order_rooms !== 'true') {
      // Normal direct chat: strictly exclude order chat rooms!
      whereConditions.push({
        [Op.or]: [
          { room_id: null },
          { room_id: "" }
        ]
      });
    }

    const messages = await Message.findAll({
      where: whereConditions,
      order: [["createdAt", "DESC"]], // Get latest first for pagination
      limit: limit,
      offset: offset
    });

    // Reverse them to be in chronological order for the frontend
    messages.reverse();

    const formattedMessages = messages.map((msg) => {
      const msgData = msg.toJSON ? msg.toJSON() : { ...msg };
      if (
        msgData.messageType === "image" ||
        msgData.messageType === "file" ||
        (typeof msgData.message === "string" && msgData.message.startsWith("chatUploads/"))
      ) {
        msgData.message = buildFileUrl(msgData.message);
      }
      return msgData;
    });

    res.status(200).json(formattedMessages);
  } catch (error) {
    console.error("Error fetching chat history:", error);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
};

export const getOrderRoomChatHistory = async (req, res) => {
  let roomId = req.params.roomId || req.query.roomId || req.query.room_id;
  const { sale_order_id, target_type, target_id, targetType, targetId } = req.query;

  const tType = target_type || targetType;
  const tId = target_id || targetId;

  if (!roomId && sale_order_id && tType && tId) {
    roomId = buildOrderRoomId({
      saleOrderId: sale_order_id,
      targetType: tType,
      targetId: tId
    });
  }

  // Parse order ID and target from roomId if not passed explicitly
  let extractedOrderId = sale_order_id;
  let isVendor = tType ? tType.toLowerCase().includes("vendor") : false;
  if (roomId) {
    const match = roomId.match(/order_chat_(\d+)_(vendor|customer)_to_admin_(\d+)/i);
    if (match) {
      extractedOrderId = match[1];
      isVendor = match[2].toLowerCase() === "vendor";
    } else {
      isVendor = roomId.toLowerCase().includes("vendor");
    }
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 100;
  const offset = (page - 1) * limit;

  console.log(`Fetching isolated order room chat history from ticket_messages for: ${roomId || 'N/A'}, order: ${extractedOrderId}, isVendor: ${isVendor}`);

  try {
    let whereCondition = {};
    if (extractedOrderId) {
      const tickets = await Ticket.findAll({
        where: {
          sale_order_id: extractedOrderId,
        }
      });
      const ticketIds = tickets.map((t) => t.id);

      whereCondition.ticket_id = { [Op.in]: ticketIds.length > 0 ? ticketIds : [-1] };
      if (isVendor) {
        whereCondition[Op.or] = [{ sender_type: "vendor" }, { receiver_type: "vendor" }];
      } else {
        whereCondition[Op.or] = [{ sender_type: "customer" }, { receiver_type: "customer" }];
      }
    }

    const messages = await TicketMessage.findAll({
      where: whereCondition,
      order: [["created_at", "DESC"]],
      limit,
      offset
    });

    messages.reverse();

    const formattedMessages = messages.map((m) => {
      const j = m.toJSON();
      const sId = j.sender_type === "admin" ? "admin" : `${j.sender_type}_${j.sender_id}`;
      const rId = j.receiver_type === "admin" ? "admin" : `${j.receiver_type}_${j.receiver_id}`;
      return {
        id: j.id,
        ticket_id: j.ticket_id,
        roomId: roomId || `order_chat_${extractedOrderId}_${isVendor ? 'vendor' : 'customer'}_to_admin_${j.receiver_id}`,
        room_id: roomId || `order_chat_${extractedOrderId}_${isVendor ? 'vendor' : 'customer'}_to_admin_${j.receiver_id}`,
        sender_id: j.sender_id,
        senderId: sId,
        sender_type: j.sender_type,
        senderType: j.sender_type,
        receiver_id: j.receiver_id,
        receiverId: rId,
        receiver_type: j.receiver_type,
        receiverType: j.receiver_type,
        message: j.message || "",
        text: j.message || "",
        file_path: j.file_path ? buildFileUrl(j.file_path) : null,
        messageType: j.file_path ? "image" : "text",
        created_at: j.created_at,
        timestamp: j.created_at
      };
    });

    res.status(200).json({
      success: true,
      roomId,
      sale_order_id: extractedOrderId,
      messages: formattedMessages
    });
  } catch (error) {
    console.error("Error fetching order room chat history from ticket_messages:", error);
    res.status(500).json({ error: "Failed to fetch order room chat history" });
  }
};

export const getOrderChatHistory = async (req, res) => {
  const { saleOrderId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const offset = (page - 1) * limit;

  console.log(`Fetching chat history for order ${saleOrderId}, page: ${page}, limit: ${limit}`);

  try {
    const messages = await Message.findAll({
      where: {
        sale_order_id: saleOrderId,
      },
      order: [["createdAt", "DESC"]],
      limit: limit,
      offset: offset,
    });

    messages.reverse();

    const formattedMessages = messages.map((msg) => {
      const msgData = msg.toJSON ? msg.toJSON() : { ...msg };
      if (
        msgData.messageType === "image" ||
        msgData.messageType === "file" ||
        (typeof msgData.message === "string" && msgData.message.startsWith("chatUploads/"))
      ) {
        msgData.message = buildFileUrl(msgData.message);
      }
      return msgData;
    });

    res.status(200).json({
      success: true,
      sale_order_id: saleOrderId,
      data: formattedMessages,
    });
  } catch (error) {
    console.error("Error fetching order chat history:", error);
    res.status(500).json({ error: "Failed to fetch order chat history" });
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
      sale_order_id,
      saleOrderId,
      order_id,
      orderId: bodyOrderId,
      roomId,
      room_id,
      room,
      ticket_id,
      ticketId,
      target_type,
      targetType,
      target_id,
      targetId,
    } = req.body;

    if (!senderId || !receiverId || !message) {
      return res.status(400).json({ error: "senderId, receiverId, and message are required" });
    }

    const orderId = sale_order_id || saleOrderId || order_id || bodyOrderId || null;
    let targetRoomId = roomId || room_id || room || null;

    const tType = target_type || targetType;
    const tId = target_id || targetId;

    if (!targetRoomId && orderId && tType && tId) {
      targetRoomId = buildOrderRoomId({
        saleOrderId: orderId,
        targetType: tType,
        targetId: tId
      });
    }

    const isOrderChat = Boolean(
      targetRoomId ||
      orderId ||
      ticket_id ||
      ticketId ||
      chatType === "order" ||
      chat_type === "order" ||
      (targetRoomId && String(targetRoomId).startsWith("order_"))
    );

    // --- A. IF ORDER CHAT: SAVE ONLY IN ticket_messages TABLE ---
    if (isOrderChat) {
      console.log(`🎫 Routing order message strictly to ticket_messages table (Room: ${targetRoomId || 'N/A'}, Order: ${orderId || 'N/A'})`);
      const ticketRes = await saveTicketMessageHelper({
        ticketId: ticket_id || ticketId,
        saleOrderId: orderId,
        senderId,
        senderType: senderType || sender_type,
        receiverId,
        receiverType: receiverType || receiver_type,
        message,
        filePath: (messageType === "image" || messageType === "file") ? message : null,
        targetType: tType || (targetRoomId?.includes("vendor") ? "vendor" : "customer"),
      });

      const orderMsgData = ticketRes?.ticketMessage ? ticketRes.ticketMessage.toJSON() : { ...req.body };
      orderMsgData.roomId = targetRoomId;
      orderMsgData.room_id = targetRoomId;
      orderMsgData.sale_order_id = orderId;
      orderMsgData.text = orderMsgData.message;
      if (ticketRes?.ticket) {
        orderMsgData.ticket_id = ticketRes.ticket.id;
        orderMsgData.ticket_code = ticketRes.ticket.ticket_code;
      }
      if (orderMsgData.file_path) {
        orderMsgData.file_path = buildFileUrl(orderMsgData.file_path);
        orderMsgData.message = orderMsgData.file_path;
      }

      if (targetRoomId) {
        emitToRoom(targetRoomId, "receive_order_message", orderMsgData);
      }

      emitToUser(String(receiverId), "order_chat_notification", {
        roomId: targetRoomId,
        sale_order_id: orderId,
        senderId: String(senderId),
        message: orderMsgData
      });

      return res.status(201).json({
        success: true,
        message: "Order chat message stored successfully in ticket_messages",
        data: orderMsgData,
      });
    }

    // STRICT SAFETY: Do NOT store any order message in messages table
    if (orderId || (targetRoomId && String(targetRoomId).startsWith("order_")) || ticket_id || ticketId) {
      console.warn("⚠️ Blocked order message from reaching messages table!");
      return res.status(400).json({ error: "Order messages must not be stored in messages table" });
    }

    // --- B. NORMAL 1-ON-1 DIRECT CHAT: SAVE ONLY IN messages TABLE ---
    const savedMessage = await Message.create({
      senderId: String(senderId),
      receiverId: String(receiverId),
      message,
      messageType,
      chatType: chatType || chat_type || "private",
      senderType: senderType || sender_type || null,
      receiverType: receiverType || receiver_type || null,
      sale_order_id: null,
      room_id: null,
      isRead: false,
      status: "sent",
    });

    const messageData = savedMessage.toJSON();
    messageData.roomId = targetRoomId;
    messageData.room_id = targetRoomId;

    if (
      messageData.messageType === "image" ||
      messageData.messageType === "file" ||
      (typeof messageData.message === "string" && messageData.message.startsWith("chatUploads/"))
    ) {
      messageData.message = buildFileUrl(messageData.message);
    }

    if (targetRoomId) {
      // Broadcast exclusively to the isolated order chat room
      emitToRoom(targetRoomId, "receive_order_message", messageData);

      // Notification to receiver without cluttering normal 1-on-1 private chat
      emitToUser(String(receiverId), "order_chat_notification", {
        roomId: targetRoomId,
        sale_order_id: orderId,
        senderId: String(senderId),
        message: messageData
      });
    } else {
      // Normal direct chat
      emitToUser(String(receiverId), "receive_message", messageData);
    }

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
    const senderVariations = getUserVariations(senderId);
    const receiverVariations = getUserVariations(receiverId);

    await Message.update(
      { status: "read", isRead: true },
      {
        where: {
          senderId: { [Op.in]: senderVariations },
          receiverId: { [Op.in]: receiverVariations },
          isRead: false,
        },
      }
    );
    res.status(200).json({ success: true, message: "Messages marked as read" });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({ error: "Failed to mark messages as read" });
  }
};

export const uploadImage = async (req, res) => {
  try {
    const file = req.file || (req.files && req.files[0]);
    if (!file) {
      return res.status(400).json({ success: false, error: "No file provided. Field name can be 'image' or 'file'." });
    }

    const key = await s3ImageUploader(file);
    const imageUrl = buildFileUrl(key);

    res.json({
      success: true,
      imageUrl,
      imageKey: key,
    });
  } catch (err) {
    console.error("Error uploading image:", err);

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
    const userVariations = getUserVariations(userId);
    const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "");

    const messages = await Message.findAll({
      where: [
        {
          [Op.or]: [
            { senderId: { [Op.in]: userVariations } },
            { receiverId: { [Op.in]: userVariations } },
          ],
        },
        {
          [Op.or]: [
            { room_id: null },
            { room_id: "" }
          ]
        },
        sequelize.literal(`JSON_EXTRACT(IFNULL(deletedmsges, '{}'), '$."${safeUserId}"') IS NULL`)
      ],
      order: [["createdAt", "DESC"]],
    });

    const conversationMap = new Map();

    for (const msg of messages) {
      const isSender = userVariations.includes(String(msg.senderId));
      const otherId = String(isSender ? msg.receiverId : msg.senderId);
      if (!conversationMap.has(otherId)) {
        conversationMap.set(otherId, {
          lastMsg: msg,
          unreadCount: 0,
        });
      }
      if (userVariations.includes(String(msg.receiverId)) && !msg.isRead) {
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

export const createTicket = async (req, res) => {
  try {
    const {
      sale_order_id,
      vendor_id,
      ticket_type = "order",
      priority = "medium",
      message,
      sender_id,
      sender_type = "customer",
      receiver_id,
      receiver_type = "admin",
      file_path
    } = req.body;

    const generatedCode = `TKT-${sale_order_id || Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const ticket = await Ticket.create({
      sale_order_id: sale_order_id || null,
      ticket_code: generatedCode,
      vendor_id: vendor_id || null,
      ticket_type: ticket_type || "order",
      priority: priority || "medium",
      status: "open",
    });

    let initialMessage = null;
    if (message || file_path) {
      const cleanSenderId = parseInt(String(sender_id || "").replace(/[^0-9]/g, ""), 10) || 1;
      const cleanReceiverId = parseInt(String(receiver_id || "").replace(/[^0-9]/g, ""), 10) || 1;

      initialMessage = await TicketMessage.create({
        ticket_id: ticket.id,
        sender_id: cleanSenderId,
        sender_type: sender_type || "customer",
        receiver_id: cleanReceiverId,
        receiver_type: receiver_type || "admin",
        message: message || null,
        file_path: file_path || null,
      });

      const msgData = initialMessage.toJSON();
      if (msgData.file_path) {
        msgData.file_path = buildFileUrl(msgData.file_path);
      }
      msgData.ticket = ticket.toJSON();

      emitToUser(receiver_id, "receive_ticket_message", msgData);
      emitToUser(receiver_id, "receive_message", msgData);
      emitToTicket(ticket.id, "receive_ticket_message", msgData);
      emitToTicket(ticket.id, "receive_message", msgData);

      if (ticket.sale_order_id) {
        emitToOrder(ticket.sale_order_id, "receive_ticket_message", msgData);
        emitToOrder(ticket.sale_order_id, "receive_message", msgData);
      }
    }

    res.status(201).json({
      success: true,
      message: "Ticket created successfully",
      ticket,
      initialMessage,
    });
  } catch (error) {
    console.error("Error creating ticket:", error);
    res.status(500).json({ error: "Failed to create ticket", details: error.message });
  }
};

export const sendTicketMessage = async (req, res) => {
  try {
    const {
      ticket_id,
      sale_order_id,
      vendor_id,
      sender_id,
      sender_type,
      receiver_id,
      receiver_type,
      message,
      file_path,
      ticket_type = "order",
      priority = "medium",
    } = req.body;

    if (!sender_id || !receiver_id || (!message && !file_path)) {
      return res.status(400).json({ error: "sender_id, receiver_id, and message or file_path are required" });
    }

    let ticket = null;
    if (ticket_id) {
      ticket = await Ticket.findByPk(ticket_id);
    } else if (sale_order_id) {
      ticket = await Ticket.findOne({ where: { sale_order_id, status: "open" } });
      if (!ticket) {
        ticket = await Ticket.create({
          sale_order_id,
          ticket_code: `TKT-${sale_order_id}-${Math.floor(1000 + Math.random() * 9000)}`,
          vendor_id: vendor_id || null,
          ticket_type: ticket_type || "order",
          priority: priority || "medium",
          status: "open",
        });
      }
    }

    const cleanSenderId = parseInt(String(sender_id).replace(/[^0-9]/g, ""), 10) || 1;
    const cleanReceiverId = parseInt(String(receiver_id).replace(/[^0-9]/g, ""), 10) || 1;

    let sType = sender_type ? String(sender_type).toLowerCase() : "customer";
    if (String(sender_id).toLowerCase().includes("admin")) sType = "admin";
    else if (String(sender_id).toLowerCase().includes("vendor")) sType = "vendor";
    else if (String(sender_id).toLowerCase().includes("customer")) sType = "customer";

    let rType = receiver_type ? String(receiver_type).toLowerCase() : "admin";
    if (String(receiver_id).toLowerCase().includes("admin")) rType = "admin";
    else if (String(receiver_id).toLowerCase().includes("vendor")) rType = "vendor";
    else if (String(receiver_id).toLowerCase().includes("customer")) rType = "customer";

    if (!["customer", "vendor", "admin", "user"].includes(rType)) {
      rType = "admin";
    }

    const savedTicketMessage = await TicketMessage.create({
      ticket_id: ticket ? ticket.id : (ticket_id || null),
      sender_id: cleanSenderId,
      sender_type: sType,
      receiver_id: cleanReceiverId,
      receiver_type: rType,
      message: message || null,
      file_path: file_path || null,
    });

    const msgData = savedTicketMessage.toJSON();
    if (msgData.file_path) {
      msgData.file_path = buildFileUrl(msgData.file_path);
    }
    if (ticket) {
      msgData.ticket = ticket.toJSON();
      msgData.sale_order_id = ticket.sale_order_id;
    }

    // Emit real-time events
    emitToUser(receiver_id, "receive_ticket_message", msgData);
    emitToUser(receiver_id, "receive_message", msgData);

    if (ticket?.id) {
      emitToTicket(ticket.id, "receive_ticket_message", msgData);
      emitToTicket(ticket.id, "receive_message", msgData);
    }

    if (ticket?.sale_order_id) {
      emitToOrder(ticket.sale_order_id, "receive_ticket_message", msgData);
      emitToOrder(ticket.sale_order_id, "receive_message", msgData);
    }

    res.status(201).json({
      success: true,
      message: "Ticket message saved successfully",
      data: msgData,
    });
  } catch (error) {
    console.error("Error sending ticket message:", error);
    res.status(500).json({ error: "Failed to send ticket message", details: error.message });
  }
};

export const getTicketMessages = async (req, res) => {
  const { ticketId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const offset = (page - 1) * limit;

  try {
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const messages = await TicketMessage.findAll({
      where: { ticket_id: ticketId },
      order: [["created_at", "DESC"]],
      limit: limit,
      offset: offset,
    });

    messages.reverse();

    const formatted = messages.map((m) => {
      const j = m.toJSON();
      if (j.file_path) j.file_path = buildFileUrl(j.file_path);
      return j;
    });

    res.status(200).json({
      success: true,
      ticket,
      messages: formatted,
    });
  } catch (error) {
    console.error("Error fetching ticket messages:", error);
    res.status(500).json({ error: "Failed to fetch ticket messages" });
  }
};

export const getOrderTicketMessages = async (req, res) => {
  const { saleOrderId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const offset = (page - 1) * limit;

  try {
    const ticket = await Ticket.findOne({
      where: { sale_order_id: saleOrderId },
      order: [["create_date", "DESC"]],
    });

    if (!ticket) {
      return res.status(200).json({
        success: true,
        sale_order_id: saleOrderId,
        ticket: null,
        messages: [],
      });
    }

    const messages = await TicketMessage.findAll({
      where: { ticket_id: ticket.id },
      order: [["created_at", "DESC"]],
      limit: limit,
      offset: offset,
    });

    messages.reverse();

    const formatted = messages.map((m) => {
      const j = m.toJSON();
      if (j.file_path) j.file_path = buildFileUrl(j.file_path);
      return j;
    });

    res.status(200).json({
      success: true,
      sale_order_id: saleOrderId,
      ticket,
      messages: formatted,
    });
  } catch (error) {
    console.error("Error fetching order ticket messages:", error);
    res.status(500).json({ error: "Failed to fetch order ticket messages" });
  }
};

export const markTicketMessagesSeen = async (req, res) => {
  const { ticket_id, receiver_id } = req.body;
  try {
    const cleanReceiverId = parseInt(String(receiver_id || "").replace(/[^0-9]/g, ""), 10);
    const whereCondition = { ticket_id, seen_at: null };
    if (cleanReceiverId) {
      whereCondition.receiver_id = cleanReceiverId;
    }

    await TicketMessage.update(
      { seen_at: new Date() },
      { where: whereCondition }
    );

    res.status(200).json({ success: true, message: "Ticket messages marked as seen" });
  } catch (error) {
    console.error("Error marking ticket messages seen:", error);
    res.status(500).json({ error: "Failed to mark ticket messages as seen" });
  }
};

