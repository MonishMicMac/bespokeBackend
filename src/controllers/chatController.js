import "../../models/setupAssociations.js";
import Message from "../../models/index.js";
import Ticket from "../../models/Ticket.js";
import TicketMessage from "../../models/TicketMessage.js";
import VendorLogin from "../../models/VendorLogin.js";
import UserLogin from "../../models/UserLogin.js";
import SaleOrder from "../../models/SaleOrder.js";
import Product from "../../models/Product.js";
import Order from "../../models/Order.js";
import ProductMaterial from "../../models/ProductMaterial.js";
import ProductMaterialImage from "../../models/ProductMaterialImage.js";
import { Op } from "sequelize";
import { emitToUser, emitToAdmin, emitToOrder, emitToTicket, emitToRoom, buildOrderRoomId, saveTicketMessageHelper } from "../sockets/socket.js";
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
    variations.add(`admin_${cleanId}`);
  }
  if (cleanId === "1" || strId === "1" || strId.toLowerCase().includes("admin")) {
    variations.add("admin");
    variations.add("1");
    variations.add("admin_1");
  }
  return Array.from(variations);
};

export const getChatHistory = async (req, res) => {
  const { userId, otherUserId } = req.params;
  const { chatType, sale_order_id, saleOrderId, roomId, room_id, include_order_rooms } = req.query;
  const orderId = sale_order_id || saleOrderId;
  const explicitRoom = roomId || room_id;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 100;
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
    } else {
      // Normal direct chat: exclude isolated rooms if any, but include all conversation messages
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
      let fileUrl = null;
      if (
        msgData.messageType === "image" ||
        msgData.messageType === "file" ||
        (typeof msgData.message === "string" && msgData.message.startsWith("chatUploads/"))
      ) {
        fileUrl = buildFileUrl(msgData.message);
        msgData.message = fileUrl;
      }
      return {
        ...msgData,
        id: msgData.id,
        sender_id: String(msgData.senderId),
        senderId: String(msgData.senderId),
        receiver_id: String(msgData.receiverId),
        receiverId: String(msgData.receiverId),
        created_at: msgData.createdAt,
        createdAt: msgData.createdAt,
        message_type: msgData.messageType || "text",
        messageType: msgData.messageType || "text",
        file_path: fileUrl,
      };
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
  const limit = parseInt(req.query.limit, 10) || 100;
  const offset = (page - 1) * limit;

  console.log(`Fetching chat history for order ${saleOrderId}, page: ${page}, limit: ${limit}`);

  try {
    const cleanId = String(saleOrderId || "").trim();

    // 1. Fetch SaleOrder metadata for pinned garment card & header
    let saleOrder = null;
    if (/^\d+$/.test(cleanId)) {
      saleOrder = await SaleOrder.findByPk(parseInt(cleanId, 10), {
        include: [
          { model: Order, as: "order" },
          { model: Product, as: "product" },
          { model: VendorLogin, as: "vendor" },
          {
            model: ProductMaterial,
            as: "material",
            include: [{ model: ProductMaterialImage, as: "images" }],
          },
        ],
      });
    }

    if (!saleOrder) {
      // Look up parent Order by order_id (e.g. 'ORD1117')
      const matchedOrder = await Order.findOne({ where: { order_id: cleanId } });
      if (matchedOrder) {
        saleOrder = await SaleOrder.findOne({
          where: { order_id: matchedOrder.id },
          include: [
            { model: Order, as: "order" },
            { model: Product, as: "product" },
            { model: VendorLogin, as: "vendor" },
            {
              model: ProductMaterial,
              as: "material",
              include: [{ model: ProductMaterialImage, as: "images" }],
            },
          ],
        });
      }
    }

    if (!saleOrder && /^\d+$/.test(cleanId)) {
      saleOrder = await SaleOrder.findOne({
        where: { order_id: parseInt(cleanId, 10) },
        include: [
          { model: Order, as: "order" },
          { model: Product, as: "product" },
          { model: VendorLogin, as: "vendor" },
          {
            model: ProductMaterial,
            as: "material",
            include: [{ model: ProductMaterialImage, as: "images" }],
          },
        ],
      });
    }

    const actualSaleOrderId = saleOrder ? saleOrder.id : (parseInt(cleanId, 10) || cleanId);
    const lookupIds = Array.from(new Set([cleanId, String(actualSaleOrderId), actualSaleOrderId])).filter(Boolean);

    let orderInfo = null;
    if (saleOrder) {
      let productImage = null;
      if (saleOrder.material?.images?.length > 0) {
        productImage = buildFileUrl(saleOrder.material.images[0].img_path);
      } else if (saleOrder.product?.image_path) {
        productImage = buildFileUrl(saleOrder.product.image_path);
      }

      const statusMap = {
        "0": "Order Placed",
        "1": "Confirmed",
        "2": "Atelier Stitching",
        "3": "Dispatched",
        "4": "Cancelled",
        "5": "Delivered",
        "6": "Return Initiated",
        "7": "Product Collected",
        "8": "Refund Processed",
      };
      const statusLabel =
        saleOrder.order_history ||
        statusMap[String(saleOrder.order_status)] ||
        (saleOrder.cancelled_at ? "Cancelled" : "Order Placed");

      orderInfo = {
        sale_order_id: saleOrder.id,
        order_id: saleOrder.order?.order_id || `ORD${saleOrder.order_id}`,
        product_name: saleOrder.product?.product_name || "Garment",
        product_image: productImage,
        size: saleOrder.size || "Standard",
        quantity: parseInt(saleOrder.quantity || 1, 10),
        status: statusLabel,
        order_status: statusLabel,
        vendor_id: saleOrder.vendor_id || (saleOrder.vendor?.id) || 1,
        vendor_name: saleOrder.vendor?.brand_business_name || saleOrder.vendor?.shop_name || saleOrder.vendor?.seller_name || "Bespoke Vendor",
        vendor_shop_name: saleOrder.vendor?.shop_name || "Bespoke Support",
        vendor_image: saleOrder.vendor?.img_path ? buildFileUrl(saleOrder.vendor.img_path) : null,
      };
    }

    // 2. Fetch all messages from ticket_messages for tickets associated with this sale_order_id
    const tickets = await Ticket.findAll({
      where: {
        sale_order_id: { [Op.in]: lookupIds },
      },
      order: [["id", "ASC"]],
    });
    const ticketIds = tickets.map((t) => t.id);

    let ticketMessages = [];
    if (ticketIds.length > 0) {
      ticketMessages = await TicketMessage.findAll({
        where: { ticket_id: { [Op.in]: ticketIds }, deleted_at: null },
        order: [["id", "ASC"]],
      });
    }

    // 3. Fallback to `messages` table ONLY if ticket_messages is empty
    let legacyMessages = [];
    if (ticketMessages.length === 0) {
      legacyMessages = await Message.findAll({
        where: {
          sale_order_id: { [Op.in]: lookupIds },
        },
        order: [["id", "ASC"]],
      });
    }

    const normalizeDate = (rawDate) => {
      if (!rawDate) return new Date().toISOString();
      const d = new Date(rawDate);
      if (d.getTime() > Date.now() + 60000) {
        return new Date(d.getTime() - (5.5 * 60 * 60 * 1000)).toISOString();
      }
      return d.toISOString();
    };

    // 4. Combine and format messages
    const sourceList = ticketMessages.length > 0
      ? ticketMessages.map((m) => {
          const j = m.toJSON();
          const fileUrl = j.file_path ? buildFileUrl(j.file_path) : null;
          const normDate = normalizeDate(j.created_at);
          return {
            id: `tkt_${j.id}`,
            raw_id: j.id,
            ticket_id: j.ticket_id,
            sale_order_id: actualSaleOrderId,
            sender_id: String(j.sender_id),
            senderId: String(j.sender_id),
            sender_type: j.sender_type,
            senderType: j.sender_type,
            receiver_id: String(j.receiver_id),
            receiverId: String(j.receiver_id),
            receiver_type: j.receiver_type,
            receiverType: j.receiver_type,
            message: j.message || fileUrl || "",
            message_type: fileUrl ? "image" : "text",
            messageType: fileUrl ? "image" : "text",
            file_path: fileUrl,
            created_at: normDate,
            createdAt: normDate,
          };
        })
      : legacyMessages.map((msg) => {
          const j = msg.toJSON();
          const isImg = j.messageType === "image" || (typeof j.message === "string" && j.message.startsWith("chatUploads/"));
          const fileUrl = isImg ? buildFileUrl(j.message) : null;
          const normDate = normalizeDate(j.createdAt);
          return {
            id: `msg_${j.id}`,
            raw_id: j.id,
            sale_order_id: actualSaleOrderId,
            sender_id: String(j.senderId),
            senderId: String(j.senderId),
            sender_type: j.senderType || "customer",
            senderType: j.senderType || "customer",
            receiver_id: String(j.receiverId),
            receiverId: String(j.receiverId),
            receiver_type: j.receiverType || "vendor",
            receiverType: j.receiverType || "vendor",
            message: fileUrl || j.message,
            message_type: fileUrl ? "image" : (j.messageType || "text"),
            messageType: fileUrl ? "image" : (j.messageType || "text"),
            file_path: fileUrl,
            created_at: normDate,
            createdAt: normDate,
          };
        });

    // Strictly sort by raw auto-increment id ASC for guaranteed chronological order
    sourceList.sort((a, b) => (a.raw_id || 0) - (b.raw_id || 0));

    // Deduplicate consecutive identical messages
    const uniqueFormatted = [];
    for (let i = 0; i < sourceList.length; i++) {
      const curr = sourceList[i];
      const prev = uniqueFormatted[uniqueFormatted.length - 1];
      if (
        prev &&
        prev.message === curr.message &&
        prev.sender_id === curr.sender_id &&
        Math.abs(new Date(prev.created_at).getTime() - new Date(curr.created_at).getTime()) < 15000
      ) {
        continue;
      }
      uniqueFormatted.push(curr);
    }

    const activeTicket = tickets[tickets.length - 1] || tickets[0] || null;
    if (orderInfo && activeTicket) {
      orderInfo.ticket_id = activeTicket.id;
      orderInfo.ticket_code = activeTicket.ticket_code;
    }

    res.status(200).json({
      success: true,
      sale_order_id: actualSaleOrderId,
      ticket_id: activeTicket?.id || null,
      ticket_code: activeTicket?.ticket_code || null,
      order: orderInfo,
      messages: uniqueFormatted,
      data: uniqueFormatted,
    });
  } catch (error) {
    console.error("Error fetching order chat history:", error);
    res.status(500).json({ error: "Failed to fetch order chat history" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const senderId = req.body.senderId || req.body.sender_id || req.body.sender;
    const receiverId = req.body.receiverId || req.body.receiver_id || req.body.receiver;
    const message = req.body.message || req.body.text || req.body.msg || "";
    const filePath = req.body.file_path || req.body.filePath || null;
    const messageType = req.body.messageType || req.body.message_type || (filePath ? "image" : "text");
    const chatType = req.body.chatType || req.body.chat_type || "private";
    const senderType = req.body.senderType || req.body.sender_type || (String(senderId).toLowerCase().includes("admin") ? "admin" : "customer");
    const receiverType = req.body.receiverType || req.body.receiver_type || (String(receiverId).toLowerCase().includes("admin") ? "admin" : "vendor");
    const orderId = req.body.sale_order_id || req.body.saleOrderId || req.body.order_id || req.body.orderId || null;
    let targetRoomId = req.body.roomId || req.body.room_id || req.body.room || null;
    const ticketId = req.body.ticket_id || req.body.ticketId || null;
    const vendorId = req.body.vendor_id || req.body.vendorId || null;

    if (!senderId || !receiverId || (!message && !filePath)) {
      return res.status(400).json({ error: "senderId, receiverId, and message (or filePath) are required" });
    }

    const isOrderChat = Boolean(
      orderId ||
      ticketId ||
      chatType === "order" ||
      (targetRoomId && String(targetRoomId).startsWith("order_"))
    );

    // --- A. ORDER CHAT: STORE IN messages TABLE (FOR ADMIN CHAT PANEL) & ticket_messages ---
    if (isOrderChat && orderId) {
      console.log(`🎫 Processing order chat for Admin & Customer (Order: ${orderId})`);

      const cleanOrderId = String(orderId).trim();
      let saleOrder = null;
      if (/^\d+$/.test(cleanOrderId)) {
        try {
          saleOrder = await SaleOrder.findByPk(parseInt(cleanOrderId, 10));
        } catch (e) {}
      }
      if (!saleOrder) {
        try {
          const matchedOrder = await Order.findOne({ where: { order_id: cleanOrderId } });
          if (matchedOrder) {
            saleOrder = await SaleOrder.findOne({
              where: { order_id: matchedOrder.id },
              include: [{ model: Order, as: "order" }],
            });
          }
        } catch (e) {}
      }

      const actualSaleOrderId = saleOrder ? saleOrder.id : (parseInt(cleanOrderId, 10) || cleanOrderId);
      const resolvedVendorId = vendorId || saleOrder?.vendor_id || 1;
      const cleanSenderId = parseInt(String(senderId).replace(/[^0-9]/g, ""), 10) || 76;
      const cleanReceiverId = parseInt(String(receiverId).replace(/[^0-9]/g, ""), 10) || 1;

      // 1. Deduplication check in messages table
      let savedOrderMsg = await Message.findOne({
        where: {
          senderId: String(senderId),
          sale_order_id: actualSaleOrderId,
          message: message || (filePath ? filePath : ""),
          createdAt: { [Op.gte]: new Date(Date.now() - 3000) },
        },
      });

      if (!savedOrderMsg) {
        savedOrderMsg = await Message.create({
          senderId: String(senderId),
          receiverId: String(receiverId || "1"),
          message: message || (filePath ? filePath : ""),
          messageType: messageType || (filePath ? "image" : "text"),
          chatType: "customer_and_admin",
          senderType: senderType || "customer",
          receiverType: receiverType || "admin",
          sale_order_id: actualSaleOrderId,
          room_id: null,
          isRead: false,
          status: "sent",
        });
      }

      // 2. Also ensure ticket record exists
      let ticket = null;
      if (ticketId) {
        ticket = await Ticket.findByPk(ticketId);
      }
      if (!ticket) {
        ticket = await Ticket.findOne({
          where: {
            sale_order_id: { [Op.in]: [actualSaleOrderId, cleanOrderId] },
            status: "open",
          },
        });
      }
      if (!ticket) {
        ticket = await Ticket.create({
          sale_order_id: actualSaleOrderId,
          ticket_code: `TKT-${actualSaleOrderId}-${Math.floor(1000 + Math.random() * 9000)}`,
          vendor_id: resolvedVendorId,
          ticket_type: "order",
          priority: "medium",
          status: "open",
        });
      }

      // 3. Save ticket message record
      let savedTicketMessage = await TicketMessage.findOne({
        where: {
          ticket_id: ticket.id,
          sender_id: cleanSenderId,
          message: message || null,
          created_at: { [Op.gte]: new Date(Date.now() - 3000) },
        },
      });

      if (!savedTicketMessage) {
        savedTicketMessage = await TicketMessage.create({
          ticket_id: ticket.id,
          sender_id: cleanSenderId,
          sender_type: senderType,
          receiver_id: cleanReceiverId,
          receiver_type: receiverType,
          message: message || null,
          file_path: filePath || null,
        });
      }

      const fileUrl = (savedOrderMsg.messageType === "image" || savedOrderMsg.messageType === "file" || (typeof savedOrderMsg.message === "string" && savedOrderMsg.message.startsWith("chatUploads/")))
        ? buildFileUrl(savedOrderMsg.message)
        : (savedTicketMessage.file_path ? buildFileUrl(savedTicketMessage.file_path) : null);

      const orderMsgData = {
        id: savedOrderMsg.id,
        message_id: savedOrderMsg.id,
        ticket_id: ticket.id,
        ticket_code: ticket.ticket_code,
        sale_order_id: actualSaleOrderId,
        saleOrderId: actualSaleOrderId,
        sender_id: String(senderId),
        senderId: String(senderId),
        sender_type: senderType,
        senderType: senderType,
        receiver_id: String(receiverId || "1"),
        receiverId: String(receiverId || "1"),
        receiver_type: receiverType,
        receiverType: receiverType,
        message: savedOrderMsg.message || fileUrl || "",
        text: savedOrderMsg.message || fileUrl || "",
        file_path: fileUrl,
        message_type: fileUrl ? "image" : "text",
        messageType: fileUrl ? "image" : "text",
        created_at: savedOrderMsg.createdAt,
        createdAt: savedOrderMsg.createdAt,
      };

      // Realtime broadcasts
      emitToOrder(actualSaleOrderId, "receive_order_message", orderMsgData);
      emitToOrder(actualSaleOrderId, "receive_message", orderMsgData);
      emitToRoom(`order_vendor_${actualSaleOrderId}`, "receive_order_message", orderMsgData);
      emitToRoom(`order_${actualSaleOrderId}`, "receive_order_message", orderMsgData);
      if (cleanOrderId && cleanOrderId !== String(actualSaleOrderId)) {
        emitToOrder(cleanOrderId, "receive_order_message", orderMsgData);
        emitToRoom(`order_vendor_${cleanOrderId}`, "receive_order_message", orderMsgData);
      }
      emitToUser(String(receiverId), "receive_order_message", orderMsgData);
      emitToUser(String(receiverId), "receive_message", orderMsgData);
      emitToUser("admin", "receive_order_message", orderMsgData);
      emitToUser("admin", "receive_message", orderMsgData);
      emitToUser("1", "receive_order_message", orderMsgData);
      emitToUser("1", "receive_message", orderMsgData);
      emitToUser(String(senderId), "receive_order_message", orderMsgData);
      emitToUser(String(senderId), "receive_message", orderMsgData);

      return res.status(201).json({
        success: true,
        message: "Order chat message stored successfully",
        data: orderMsgData,
      });
    }

    // --- B. CUSTOMER SUPPORT CHAT (ADMIN <-> CUSTOMER): STORE STRICTLY IN messages TABLE ---
    const cleanSenderStr = String(senderId);
    const cleanReceiverStr = String(receiverId);
    const rawMsgContent = message || (filePath ? filePath : "");
    const resolvedTempId = req.body.temp_id || req.body.tempId || null;

    let savedMessage = await Message.findOne({
      where: {
        senderId: cleanSenderStr,
        receiverId: cleanReceiverStr,
        message: rawMsgContent,
        createdAt: { [Op.gte]: new Date(Date.now() - 3000) },
      },
    });

    if (!savedMessage) {
      savedMessage = await Message.create({
        senderId: cleanSenderStr,
        receiverId: cleanReceiverStr,
        message: rawMsgContent,
        messageType: messageType || (filePath ? "image" : "text"),
        chatType: chatType || "private",
        senderType: senderType || "customer",
        receiverType: receiverType || "admin",
        sale_order_id: null,
        room_id: null,
        isRead: false,
        status: "sent",
      });
    }

    const fileUrl = (savedMessage.messageType === "image" || savedMessage.messageType === "file" || (typeof savedMessage.message === "string" && savedMessage.message.startsWith("chatUploads/")))
      ? buildFileUrl(savedMessage.message)
      : null;

    const messageData = {
      ...savedMessage.toJSON(),
      id: savedMessage.id,
      sender_id: String(savedMessage.senderId),
      senderId: String(savedMessage.senderId),
      receiver_id: String(savedMessage.receiverId),
      receiverId: String(savedMessage.receiverId),
      message: fileUrl || savedMessage.message,
      text: savedMessage.message,
      file_path: fileUrl,
      created_at: savedMessage.createdAt,
      createdAt: savedMessage.createdAt,
      message_type: savedMessage.messageType,
      messageType: savedMessage.messageType,
      temp_id: resolvedTempId,
      tempId: resolvedTempId,
    };

    // If receiver is admin or 1, emit to admin channel
    const cleanRId = String(receiverId).replace(/^(customer_|vendor_|admin_)/, "");
    if (cleanRId === "1" || String(receiverId).toLowerCase().includes("admin")) {
      emitToAdmin("receive_message", messageData);
      emitToUser("1", "receive_message", messageData);
      emitToUser("admin", "receive_message", messageData);
    }
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
        sale_order_id: lastMsg.sale_order_id || null,
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

