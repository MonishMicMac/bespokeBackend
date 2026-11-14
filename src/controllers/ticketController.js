import Ticket from "../../models/Ticket.js";
import TicketMessage from "../../models/TicketMessage.js";
import Message from "../../models/index.js";
import SaleOrder from "../../models/SaleOrder.js";
import VendorLogin from "../../models/VendorLogin.js";
import UserLogin from "../../models/UserLogin.js";
import Notification from "../../models/Notification.js";
import sequelize from "../../config/db.js";
import { Op } from "sequelize";
import { buildFileUrl } from "../utils/fileUrl.js";
import { emitToRoom, emitToUser } from "../sockets/socket.js";
import NotificationService from "../services/notificationService.js";

/**
 * GET /api/ticket-types/list (Admin Complaint.jsx & customer query types)
 */
export const getTicketTypesList = async (req, res) => {
  try {
    const [types] = await sequelize.query(
      "SELECT id, name, action, created_at, updated_at FROM ticket_type_masters ORDER BY id ASC"
    );
    return res.status(200).json({
      status: true,
      data: types || [],
    });
  } catch (err) {
    console.error("Error fetching ticket types:", err);
    return res.status(500).json({ status: false, message: err.message, data: [] });
  }
};

/**
 * GET /api/tickets/list (Admin Complaint.jsx & SupportChat.jsx)
 */
export const getTicketsList = async (req, res) => {
  try {
    const {
      page = 1,
      per_page = 20,
      search = "",
      from_date = "",
      to_date = "",
      type = "",
      priority = "",
      status = "",
    } = req.query;

    const limit = Math.max(1, parseInt(per_page, 10) || 20);
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const offset = (currentPage - 1) * limit;

    const whereConditions = [];

    // 1. Date filters
    if (from_date) {
      whereConditions.push({
        create_date: { [Op.gte]: new Date(`${from_date}T00:00:00.000Z`) },
      });
    }
    if (to_date) {
      whereConditions.push({
        create_date: { [Op.lte]: new Date(`${to_date}T23:59:59.999Z`) },
      });
    }

    // 2. Priority filter
    if (priority && priority !== "all") {
      whereConditions.push({ priority: priority.toLowerCase() });
    }

    // 3. Status filter
    if (status && status !== "all") {
      const sLower = status.toLowerCase();
      if (sLower === "0" || sLower === "open") {
        whereConditions.push({ status: "open" });
      } else if (sLower === "1" || sLower === "2" || sLower === "closed") {
        whereConditions.push({ status: "closed" });
      } else {
        whereConditions.push({ status: sLower });
      }
    }

    // 4. Ticket Type filter
    if (type && type !== "all") {
      whereConditions.push({
        [Op.or]: [{ ticket_type: type }, { ticket_type: String(type) }],
      });
    }

    // 5. Search query filter
    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      const numSearch = parseInt(String(search).trim(), 10);
      const orClauses = [
        { ticket_code: { [Op.like]: q } },
        { ticket_type: { [Op.like]: q } },
        { priority: { [Op.like]: q } },
      ];
      if (!isNaN(numSearch)) {
        orClauses.push({ id: numSearch });
        orClauses.push({ sale_order_id: numSearch });
      }
      whereConditions.push({ [Op.or]: orClauses });
    }

    const { count, rows: tickets } = await Ticket.findAndCountAll({
      where: whereConditions.length > 0 ? { [Op.and]: whereConditions } : {},
      order: [["id", "DESC"]],
      limit,
      offset,
    });

    // Resolve auxiliary information (SaleOrder & Vendor & TicketType & Customer)
    const saleOrderIds = tickets.map((t) => t.sale_order_id).filter(Boolean);
    const vendorIds = tickets.map((t) => t.vendor_id).filter(Boolean);
    const ticketIds = tickets.map((t) => t.id);

    const [saleOrders, vendors, [typeMasters], [ticketCustomers]] = await Promise.all([
      saleOrderIds.length > 0 ? SaleOrder.findAll({ where: { id: saleOrderIds } }) : [],
      vendorIds.length > 0 ? VendorLogin.findAll({ where: { id: vendorIds } }) : [],
      sequelize.query("SELECT id, name FROM ticket_type_masters"),
      ticketIds.length > 0
        ? sequelize.query(
            `SELECT ticket_id, sender_id, receiver_id, sender_type 
             FROM ticket_messages 
             WHERE ticket_id IN (:ticketIds)
             ORDER BY id ASC`,
            { replacements: { ticketIds } }
          )
        : [[]],
    ]);

    // Build customer mapping per ticket
    const ticketCustomerMap = new Map();
    for (const row of ticketCustomers || []) {
      if (!ticketCustomerMap.has(String(row.ticket_id))) {
        if (row.sender_type === "customer" || (row.sender_id && String(row.sender_id) !== "1")) {
          ticketCustomerMap.set(String(row.ticket_id), row.sender_id);
        } else if (row.receiver_id && String(row.receiver_id) !== "1") {
          ticketCustomerMap.set(String(row.ticket_id), row.receiver_id);
        }
      }
    }

    const allCustomerIds = Array.from(new Set(Array.from(ticketCustomerMap.values()))).filter(Boolean);
    const customerUsers = allCustomerIds.length > 0
      ? await UserLogin.findAll({ where: { id: allCustomerIds } })
      : [];
    const custMap = new Map(customerUsers.map((u) => [String(u.id), u]));

    const soMap = new Map(saleOrders.map((s) => [String(s.id), s]));
    const vMap = new Map(vendors.map((v) => [String(v.id), v]));
    const typeMap = new Map((typeMasters || []).map((t) => [String(t.id), t.name]));

    const formattedList = tickets.map((t) => {
      const j = t.toJSON();
      const so = j.sale_order_id ? soMap.get(String(j.sale_order_id)) : null;
      const vendor = j.vendor_id ? vMap.get(String(j.vendor_id)) : null;
      const customerId = ticketCustomerMap.get(String(j.id)) || (so ? so.customer_id || so.user_id : null) || 76;
      const customer = custMap.get(String(customerId));

      let typeName = typeMap.get(String(j.ticket_type)) || j.ticket_type;
      if (typeName === "order") typeName = "Order Inquiry";

      return {
        ...j,
        ticket_type_name: typeName,
        customer_id: customerId,
        user_id: customerId,
        customer: customer
          ? {
              id: customer.id,
              name: customer.name || customer.username || `Customer #${customer.id}`,
              email: customer.email,
              mobile: customer.mobile || customer.phone,
            }
          : { id: customerId, name: `Customer #${customerId}` },
        sale_order: so
          ? {
              id: so.id,
              sale_id: so.sale_id || `SID${so.id}`,
              order_id: so.order_id,
              product_id: so.product_id,
            }
          : null,
        vendor: vendor
          ? {
              id: vendor.id,
              shop_name: vendor.shop_name || vendor.seller_name || vendor.brand_business_name || "Vendor",
              username: vendor.username,
            }
          : null,
      };
    });

    return res.status(200).json({
      status: true,
      data: formattedList,
      total: count,
      current_page: currentPage,
      last_page: Math.ceil(count / limit) || 1,
    });
  } catch (err) {
    console.error("Error listing tickets:", err);
    return res.status(500).json({ status: false, message: err.message, data: [] });
  }
};

/**
 * POST /api/tickets/update/:id
 */
export const updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { priority, status, ticket_type, ticket_type_id } = req.body || {};

    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return res.status(404).json({ status: false, message: "Ticket not found" });
    }

    if (priority) {
      ticket.priority = priority.toLowerCase();
    }
    if (status !== undefined && status !== null && status !== "") {
      const s = String(status).toLowerCase();
      ticket.status = s === "1" || s === "closed" ? "closed" : "open";
    }
    if (ticket_type_id || ticket_type) {
      ticket.ticket_type = String(ticket_type_id || ticket_type);
    }

    await ticket.save();

    return res.status(200).json({
      status: true,
      message: "Ticket updated successfully",
      data: ticket,
    });
  } catch (err) {
    console.error("Error updating ticket:", err);
    return res.status(500).json({ status: false, message: err.message });
  }
};

/**
 * GET /api/ticket-messages/view/:ticket_id
 * and GET /api/ticket-messages/history?ticket_id=...
 * and GET /api/ticket-messages/view?user_id=... (Customer Support / Concierge)
 */
export const getTicketMessagesPhp = async (req, res) => {
  try {
    const params = req.params || {};
    const query = req.query || {};
    const body = req.body || {};

    let ticketId =
      params.ticket_id ||
      params.id ||
      query.ticket_id ||
      query.ticketId ||
      body.ticket_id ||
      body.ticketId;

    const customerId =
      params.customerId ||
      query.user_id ||
      query.userId ||
      query.customer_id ||
      query.customerId ||
      body.user_id ||
      body.customer_id;

    let ticket = null;
    if (ticketId) {
      ticket = await Ticket.findByPk(ticketId);
    } else if (customerId) {
      const cleanCId = parseInt(String(customerId).replace(/[^0-9]/g, ""), 10) || 76;
      // Find open General Inquiry ticket for this customer
      const [openRows] = await sequelize.query(
        `SELECT t.* FROM tickets t
         JOIN ticket_messages tm ON tm.ticket_id = t.id
         WHERE (tm.sender_id = :cid OR tm.receiver_id = :cid)
           AND t.sale_order_id IS NULL
           AND t.status = 'open'
         ORDER BY t.id DESC LIMIT 1`,
        { replacements: { cid: cleanCId } }
      );
      if (openRows && openRows.length > 0) {
        ticket = await Ticket.findByPk(openRows[0].id);
        ticketId = ticket.id;
      }
    }

    if (!ticketId || !ticket) {
      return res.status(200).json({
        status: true,
        ticket: null,
        ticket_id: null,
        ticket_code: null,
        data: [],
      });
    }

    const messages = await TicketMessage.findAll({
      where: {
        ticket_id: ticketId,
        deleted_at: null,
      },
      order: [["id", "ASC"]],
    });

    // Mark messages and support notifications as seen/read for this customer
    const activeCustId = customerId ? parseInt(String(customerId).replace(/[^0-9]/g, ""), 10) : 76;
    if (activeCustId) {
      TicketMessage.update(
        { seen_at: new Date() },
        {
          where: {
            ticket_id: ticketId,
            receiver_id: activeCustId,
            seen_at: null,
          },
        }
      ).catch(() => {});

      Notification.update(
        { is_read: true, read_at: new Date() },
        {
          where: {
            recipient_type: "user",
            recipient_id: String(activeCustId),
            related_ticket_id: ticketId,
            is_read: false,
          },
        }
      ).catch(() => {});
    }

    const formatted = messages.map((m) => {
      const j = m.toJSON();
      const fileUrl = j.file_path ? buildFileUrl(j.file_path) : null;
      return {
        ...j,
        file_url: fileUrl,
        fileUrl: fileUrl,
        message_type: fileUrl ? "image" : "text",
        messageType: fileUrl ? "image" : "text",
        sender_id: String(j.sender_id),
        senderId: String(j.sender_id),
        receiver_id: String(j.receiver_id),
        receiverId: String(j.receiver_id),
        ticket_id: ticket.id,
        ticketId: ticket.id,
        ticket_code: ticket.ticket_code,
      };
    });

    return res.status(200).json({
      status: true,
      ticket,
      ticket_id: ticket.id,
      ticket_code: ticket.ticket_code,
      data: formatted,
    });
  } catch (err) {
    console.error("Error fetching ticket messages:", err);
    return res.status(500).json({ status: false, message: err.message, data: [] });
  }
};

/**
 * POST /api/ticket-messages/send
 */
export const sendTicketMessagePhp = async (req, res) => {
  try {
    const body = req.body || {};
    const {
      ticket_id,
      ticketId,
      sale_order_id,
      saleOrderId,
      vendor_id,
      vendorId,
      sender_id,
      senderId,
      sender_type = "customer",
      senderType,
      receiver_id = 1,
      receiverId,
      receiver_type = "admin",
      receiverType,
      message,
      file_path,
      filePath,
      ticket_type = "General Inquiry",
      priority = "medium",
      temp_id,
      tempId,
    } = body;

    const rawSender = sender_id || senderId;
    const rawReceiver = receiver_id || receiverId || 1;
    const rawMsg = message || body.text || "";
    const rawFile = file_path || filePath || null;
    const resolvedTempId = temp_id || tempId || null;

    if (!rawSender || (!rawMsg && !rawFile)) {
      return res.status(422).json({
        status: false,
        message: "sender_id and message or file_path are required",
      });
    }

    const cleanSenderId = parseInt(String(rawSender).replace(/[^0-9]/g, ""), 10) || 76;
    const cleanReceiverId = parseInt(String(rawReceiver).replace(/[^0-9]/g, ""), 10) || 1;
    const targetSaleOrderId = sale_order_id || saleOrderId || null;

    let ticket = null;
    const targetTicketId = ticket_id || ticketId;
    if (targetTicketId) {
      ticket = await Ticket.findByPk(targetTicketId);
    }

    if (!ticket) {
      if (targetSaleOrderId) {
        // Order-linked ticket
        ticket = await Ticket.findOne({
          where: { sale_order_id: targetSaleOrderId, status: "open" },
          order: [["id", "DESC"]],
        });
      } else {
        // Chat & FAQs (General Support Query): Always reuse customer's existing open ticket!
        const [openRows] = await sequelize.query(
          `SELECT t.* FROM tickets t
           JOIN ticket_messages tm ON tm.ticket_id = t.id
           WHERE (tm.sender_id = :cid OR tm.receiver_id = :cid)
             AND t.sale_order_id IS NULL
             AND t.status = 'open'
           ORDER BY t.id DESC LIMIT 1`,
          { replacements: { cid: cleanSenderId === 1 ? cleanReceiverId : cleanSenderId } }
        );

        if (openRows && openRows.length > 0) {
          ticket = await Ticket.findByPk(openRows[0].id);
        } else {
          // Fallback: check if ANY open General Inquiry ticket exists
          ticket = await Ticket.findOne({
            where: { sale_order_id: null, ticket_type: "General Inquiry", status: "open" },
            order: [["id", "DESC"]],
          });
        }
      }

      // If still no ticket exists, create ONE single new ticket
      if (!ticket) {
        const nextCode = `TKT${Date.now().toString().slice(-4)}`;
        ticket = await Ticket.create({
          sale_order_id: targetSaleOrderId,
          ticket_code: nextCode,
          vendor_id: vendor_id || vendorId || null,
          ticket_type: ticket_type || "General Inquiry",
          priority: priority || "medium",
          status: "open",
        });
      }
    }

    // 1. Check duplicate within 15 seconds in ticket_messages
    const existing = await TicketMessage.findOne({
      where: {
        ticket_id: ticket.id,
        sender_id: cleanSenderId,
        message: rawMsg || "",
        created_at: { [Op.gte]: new Date(Date.now() - 15000) },
      },
    });

    let msgRecord = existing;
    if (!msgRecord) {
      msgRecord = await TicketMessage.create({
        ticket_id: ticket.id,
        sender_id: cleanSenderId,
        sender_type: sender_type || senderType || (cleanSenderId === 1 ? "admin" : "customer"),
        receiver_id: cleanReceiverId,
        receiver_type: receiver_type || receiverType || (cleanReceiverId === 1 ? "admin" : "customer"),
        message: rawMsg || null,
        file_path: rawFile || null,
      });
    }

    // 2. Also sync to messages table with 15-second deduplication for unified chat views
    try {
      const existingChatMessage = await Message.findOne({
        where: {
          senderId: String(cleanSenderId),
          receiverId: String(cleanReceiverId),
          message: rawMsg || "",
          createdAt: { [Op.gte]: new Date(Date.now() - 15000) },
        },
      });

      if (!existingChatMessage) {
        await Message.create({
          senderId: String(cleanSenderId),
          receiverId: String(cleanReceiverId),
          message: rawMsg || rawFile || "",
          chatType: "query",
          senderType: msgRecord.sender_type,
          receiverType: msgRecord.receiver_type,
          messageType: rawFile ? "image" : "text",
          sale_order_id: targetSaleOrderId,
          room_id: null,
          isRead: false,
          status: "sent",
        });
      }
    } catch (syncErr) {
      console.warn("Could not sync ticket message to messages table:", syncErr.message);
    }

    const fileUrl = msgRecord.file_path ? buildFileUrl(msgRecord.file_path) : null;
    const responsePayload = {
      ...msgRecord.toJSON(),
      id: msgRecord.id,
      ticket_id: ticket.id,
      ticketId: ticket.id,
      ticket_code: ticket.ticket_code,
      sender_id: String(msgRecord.sender_id),
      senderId: String(msgRecord.sender_id),
      receiver_id: String(msgRecord.receiver_id),
      receiverId: String(msgRecord.receiver_id),
      file_url: fileUrl,
      fileUrl: fileUrl,
      temp_id: resolvedTempId,
      tempId: resolvedTempId,
      message_type: fileUrl ? "image" : "text",
      messageType: fileUrl ? "image" : "text",
    };

    // Emit realtime notifications to both rooms and direct users
    emitToRoom(`ticket_${ticket.id}`, "receive_ticket_message", responsePayload);
    emitToRoom(`ticket_${ticket.id}`, "receive_message", responsePayload);
    emitToRoom(`ticket_${ticket.id}`, "order_chat_notification", { message: responsePayload });

    emitToUser(String(cleanReceiverId), "receive_ticket_message", responsePayload);
    emitToUser(String(cleanReceiverId), "receive_message", responsePayload);
    emitToUser(String(cleanReceiverId), "order_chat_notification", { message: responsePayload });

    emitToUser(String(cleanSenderId), "receive_ticket_message", responsePayload);
    emitToUser(String(cleanSenderId), "receive_message", responsePayload);

    emitToUser("admin", "receive_ticket_message", responsePayload);
    emitToUser("admin", "receive_message", responsePayload);
    emitToUser("1", "receive_ticket_message", responsePayload);
    emitToUser("1", "receive_message", responsePayload);

    emitToUser("10", "order_chat_notification", { message: responsePayload });
    emitToUser("10", "receive_message", responsePayload);
    emitToRoom("10", "order_chat_notification", { message: responsePayload });
    emitToRoom("10", "receive_message", responsePayload);

    // Trigger persistent notification with built-in idempotency & push
    try {
      if (cleanSenderId === 1 || String(msgRecord.sender_type) === "admin") {
        NotificationService.notifyCustomerSupportReply({
          ticket,
          customerId: cleanReceiverId,
          messageRecord: msgRecord,
          messageText: rawMsg,
        }).catch((e) => console.warn("Notice: customer support reply notif error:", e.message));
      } else {
        NotificationService.notifyAdminNewSupportMessage({
          ticket,
          customerId: cleanSenderId,
          messageRecord: msgRecord,
          messageText: rawMsg,
        }).catch((e) => console.warn("Notice: admin support notif error:", e.message));
      }
    } catch (notifErr) {
      console.warn("Notice: non-blocking support notification error:", notifErr.message);
    }

    return res.status(200).json({
      status: true,
      message: "Message sent successfully",
      data: responsePayload,
      ticket_id: ticket.id,
      ticket_code: ticket.ticket_code,
      ticket,
    });
  } catch (err) {
    console.error("Error sending ticket message:", err);
    return res.status(500).json({ status: false, message: err.message });
  }
};

/**
 * DELETE /api/ticket-messages/delete/:id
 */
export const deleteTicketMessagePhp = async (req, res) => {
  try {
    const { id } = req.params;
    const msg = await TicketMessage.findByPk(id);
    if (!msg) {
      return res.status(404).json({ status: false, message: "Ticket message not found" });
    }

    msg.deleted_at = new Date();
    await msg.save();

    return res.status(200).json({
      status: true,
      message: "Message deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting ticket message:", err);
    return res.status(500).json({ status: false, message: err.message });
  }
};

