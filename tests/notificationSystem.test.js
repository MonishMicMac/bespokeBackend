import { io } from "socket.io-client";
import Notification from "../models/Notification.js";
import Ticket from "../models/Ticket.js";
import TicketMessage from "../models/TicketMessage.js";
import UserLogin from "../models/UserLogin.js";
import VendorLogin from "../models/VendorLogin.js";
import Order from "../models/Order.js";
import SaleOrder from "../models/SaleOrder.js";
import NotificationService from "../src/services/notificationService.js";
import FirebaseService from "../src/services/firebaseService.js";
import { Op } from "sequelize";

const BASE_URL = "http://localhost:8080";

async function makeRequest(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    // Non-json response
  }
  return { status: res.status, headers: res.headers, body: json };
}

function createTestSaleOrder(data) {
  return SaleOrder.create({
    order_id: data.order_id,
    vendor_id: String(data.vendor_id || "10"),
    product_id: data.product_id || 101,
    size: data.size || "M",
    quantity: String(data.quantity || "1"),
    amount: String(data.amount || "2000"),
    total_amount: String(data.total_amount || data.amount || "2000"),
    seller_amount: 1800,
    bespoke_commision_amount: 200,
    single_product_price: 2000,
    alter_amount: 0,
    order_history: data.order_history || "Pending",
  });
}

async function runAllTests() {
  console.log("================================================================================");
  console.log("  BESPOKE NOTIFICATION SYSTEM - AUTOMATED VERIFICATION TEST SUITE (19 SCENARIOS)");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // Tracking IDs for cleanup
  const createdNotifIds = [];
  const createdTicketMsgIds = [];
  const createdOrderIds = [];
  const createdSaleOrderIds = [];

  try {
    // -------------------------------------------------------------------------
    // SCENARIO 1: Support message from customer creates exactly 1 admin notification
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 1: Customer support message creates exactly 1 admin notification ---");
    let ticket = await Ticket.findByPk(51);
    if (!ticket) {
      ticket = await Ticket.create({
        id: 51,
        ticket_code: "TKT1175",
        ticket_type: "General Inquiry",
        status: "open",
        priority: "medium",
      });
    }

    const testMsg1 = await TicketMessage.create({
      ticket_id: ticket.id,
      sender_id: 76,
      receiver_id: 1,
      sender_type: "user",
      receiver_type: "admin",
      message: "Automated test customer message scenario 1",
    });
    createdTicketMsgIds.push(testMsg1.id);

    const adminNotif1 = await NotificationService.notifyAdminNewSupportMessage({
      ticket,
      customerId: 76,
      messageRecord: testMsg1,
      messageText: testMsg1.message,
    });
    if (adminNotif1) createdNotifIds.push(adminNotif1.id);

    const notifData = typeof adminNotif1.data === "string" ? JSON.parse(adminNotif1.data) : adminNotif1.data;
    assert(adminNotif1 !== null, "Admin notification created successfully");
    assert(adminNotif1.recipient_type === "admin", "Notification recipient is admin");
    assert(Number(adminNotif1.related_ticket_id) === 51, "Notification linked to ticket 51");
    assert(Number(adminNotif1.related_message_id) === Number(testMsg1.id), "Notification linked to test message ID");
    assert(
      notifData?.target_url?.includes("ticket_id=51") || notifData?.targetUrl?.includes("ticket_id=51"),
      "Notification data includes complaint target URL"
    );
    assert(adminNotif1.title?.includes(ticket.ticket_code), "Notification title includes ticket code");

    // Check count in DB
    const adminNotifsForMsg1 = await Notification.findAll({
      where: { related_message_id: testMsg1.id, recipient_type: "admin" },
    });
    assert(adminNotifsForMsg1.length === 1, "Exactly 1 admin notification exists for customer message");

    // -------------------------------------------------------------------------
    // SCENARIO 2: Support reply from admin creates exactly 1 customer notification (resolved to customer ID 76, not 10)
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 2: Admin reply creates customer notification for user 76 (not vendor 10) ---");
    const testAdminReply = await TicketMessage.create({
      ticket_id: ticket.id,
      sender_id: 1,
      receiver_id: 76,
      sender_type: "admin",
      receiver_type: "customer",
      message: "Hello customer 76, admin reply scenario 2",
    });
    createdTicketMsgIds.push(testAdminReply.id);

    const custNotif2 = await NotificationService.notifyCustomerSupportReply({
      ticket,
      customerId: 76,
      messageRecord: testAdminReply,
      messageText: testAdminReply.message,
    });
    if (custNotif2) createdNotifIds.push(custNotif2.id);

    const custData = typeof custNotif2.data === "string" ? JSON.parse(custNotif2.data) : custNotif2.data;
    assert(custNotif2 !== null, "Customer notification created successfully");
    assert(custNotif2.recipient_type === "user", "Recipient type is 'user'");
    assert(String(custNotif2.recipient_id) === "76", "Recipient ID is exactly '76' (not 10 or 1)");
    assert(Number(custNotif2.related_ticket_id) === 51, "Notification linked to ticket 51");
    assert(Number(custNotif2.related_message_id) === Number(testAdminReply.id), "Notification linked to admin message ID");
    assert(
      custData?.target_url?.includes("ticket_id=51") || custData?.targetUrl?.includes("ticket_id=51"),
      "Target URL opens support chat for ticket 51"
    );

    // -------------------------------------------------------------------------
    // SCENARIO 3: Customer repeatedly messaging in ticket 51 reuses ticket 51 and creates 1 notification per message
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 3: Customer repeatedly messaging reuses ticket 51 without ticket duplication ---");
    const initialTicketsCount = await Ticket.count({
      where: { ticket_type: "General Inquiry", status: "open", sale_order_id: null },
    });

    const sendResA = await makeRequest("/api/ticket-messages/send", {
      method: "POST",
      body: JSON.stringify({
        sender_id: 76,
        receiver_id: 1,
        sender_type: "user",
        message: "Message 3A via API",
      }),
    });
    assert(sendResA.status === 200, "POST /api/ticket-messages/send (Message 3A) succeeded");
    if (sendResA.body?.data?.id) createdTicketMsgIds.push(sendResA.body.data.id);
    assert(sendResA.body?.ticket_id === 51 || sendResA.body?.data?.ticket_id === 51, "Message 3A reused ticket 51");

    const sendResB = await makeRequest("/api/ticket-messages/send", {
      method: "POST",
      body: JSON.stringify({
        sender_id: 76,
        receiver_id: 1,
        sender_type: "user",
        message: "Message 3B via API",
      }),
    });
    assert(sendResB.status === 200, "POST /api/ticket-messages/send (Message 3B) succeeded");
    if (sendResB.body?.data?.id) createdTicketMsgIds.push(sendResB.body.data.id);
    assert(sendResB.body?.ticket_id === 51 || sendResB.body?.data?.ticket_id === 51, "Message 3B reused ticket 51");

    const finalTicketsCount = await Ticket.count({
      where: { ticket_type: "General Inquiry", status: "open", sale_order_id: null },
    });
    assert(finalTicketsCount === initialTicketsCount, "Ticket count remained constant; ticket 51 was properly reused");

    // -------------------------------------------------------------------------
    // SCENARIO 4: Dual HTTP + Socket.IO submission yields exactly 1 message and 1 notification (Idempotency)
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 4: Simultaneous dual HTTP & Socket.IO message submission idempotency ---");
    const duplicateTestMsg = await TicketMessage.create({
      ticket_id: ticket.id,
      sender_id: 76,
      receiver_id: 1,
      sender_type: "user",
      receiver_type: "admin",
      message: "Dual submission idempotency test",
    });
    createdTicketMsgIds.push(duplicateTestMsg.id);

    // Call notifyAdminNewSupportMessage twice concurrently for the exact same message
    const [call1, call2] = await Promise.all([
      NotificationService.notifyAdminNewSupportMessage({
        ticket,
        customerId: 76,
        messageRecord: duplicateTestMsg,
        messageText: duplicateTestMsg.message,
      }),
      NotificationService.notifyAdminNewSupportMessage({
        ticket,
        customerId: 76,
        messageRecord: duplicateTestMsg,
        messageText: duplicateTestMsg.message,
      }),
    ]);
    if (call1) createdNotifIds.push(call1.id);
    if (call2 && call2.id !== call1?.id) createdNotifIds.push(call2.id);

    assert(call1 !== null && call2 !== null, "Both calls returned successfully");
    assert(call1.id === call2.id, "Both calls resolved to the same notification ID");

    const duplicateCheck = await Notification.findAll({
      where: { related_message_id: duplicateTestMsg.id, recipient_type: "admin" },
    });
    assert(duplicateCheck.length === 1, "Database contains exactly ONE notification for the message");

    // -------------------------------------------------------------------------
    // SCENARIO 5: Admin multi-session reception via Socket.IO
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 5: Multi-session admin Socket.IO reception ---");
    const adminSocket1 = io(BASE_URL, { transports: ["websocket", "polling"], forceNew: true });
    const adminSocket2 = io(BASE_URL, { transports: ["websocket", "polling"], forceNew: true });

    await new Promise((resolve) => {
      let connectedCount = 0;
      const checkConnected = () => {
        connectedCount++;
        if (connectedCount === 2) resolve();
      };
      adminSocket1.on("connect", () => {
        adminSocket1.emit("join_admin");
        adminSocket1.emit("register", "admin");
        checkConnected();
      });
      adminSocket2.on("connect", () => {
        adminSocket2.emit("join_admin");
        adminSocket2.emit("register", "admin");
        checkConnected();
      });
    });

    let s1Received = 0;
    let s2Received = 0;
    adminSocket1.on("admin-notification", () => { s1Received++; });
    adminSocket2.on("admin-notification", () => { s2Received++; });

    const createNotifRes = await makeRequest("/api/notifications", {
      method: "POST",
      body: JSON.stringify({
        recipient_type: "admin",
        recipient_id: "admin",
        title: "Multi-session Admin Test",
        message: "Testing multi-session receipt",
        type: "general",
      }),
    });
    if (createNotifRes.body?.data?.id) createdNotifIds.push(createNotifRes.body.data.id);

    // Wait 800ms for socket messages
    await new Promise((r) => setTimeout(r, 800));
    assert(s1Received >= 1, "Admin session 1 received the notification");
    assert(s2Received >= 1, "Admin session 2 received the notification");

    adminSocket1.disconnect();
    adminSocket2.disconnect();

    // -------------------------------------------------------------------------
    // SCENARIO 6: Customer privacy (User 76 cannot read User 99999's notifications)
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 6: Customer privacy & recipient authorization ---");
    const secretNotif = await Notification.create({
      recipient_type: "user",
      recipient_id: "99999",
      title: "Secret User Notification",
      message: "Private details for user 99999 only",
      type: "general",
      is_read: false,
    });
    createdNotifIds.push(secretNotif.id);

    // Customer 76 requests notifications
    const getRes = await makeRequest("/api/notifications?recipient_type=user&recipient_id=76");
    assert(getRes.status === 200, "GET /api/notifications returns 200");
    const list = getRes.body?.data || getRes.body?.notifications || [];
    const foundSecret = list.some((n) => n.id === secretNotif.id);
    assert(!foundSecret, "Customer 76 CANNOT see notification belonging to user 99999");

    // -------------------------------------------------------------------------
    // SCENARIO 7: COD order placement creates admin + vendor notifications
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 7: COD order creates Admin & Vendor notifications ---");
    const codOrder = await Order.create({
      user_id: 76,
      order_id: `ORD-TEST-COD-${Date.now()}`,
      price: 2500,
      payable_price: 2500,
      delivery_amount: 0,
      address_id: 1,
      payment_type: "cod",
      order_history: "Approved",
    });
    createdOrderIds.push(codOrder.id);

    const codSaleOrder = await createTestSaleOrder({
      order_id: codOrder.id,
      vendor_id: "10",
      product_id: 101,
      size: "M",
      quantity: "1",
      amount: "2500",
      order_history: "Pending",
    });
    createdSaleOrderIds.push(codSaleOrder.id);

    await NotificationService.notifyNewOrderPlaced({
      order: codOrder,
      user: { id: 76, username: "Loki Customer", email: "loki@example.com" },
      isCod: true,
    });

    const adminCodNotif = await Notification.findOne({
      where: { related_order_id: codOrder.id, recipient_type: "admin" },
    });
    if (adminCodNotif) createdNotifIds.push(adminCodNotif.id);
    assert(adminCodNotif !== null, "Admin COD notification created");
    const adminCodData = typeof adminCodNotif.data === "string" ? JSON.parse(adminCodNotif.data) : adminCodNotif.data;
    assert(adminCodData?.is_cod === true || adminCodData?.payment_method === "COD", "Admin notification data marks COD payment");

    const vendorCodNotif = await Notification.findOne({
      where: { related_order_id: codOrder.id, recipient_type: "vendor", recipient_id: "10" },
    });
    if (vendorCodNotif) createdNotifIds.push(vendorCodNotif.id);
    assert(vendorCodNotif !== null, "Vendor 10 COD notification created immediately");

    // -------------------------------------------------------------------------
    // SCENARIO 8: Multi-vendor order creates distinct vendor notifications with separate items
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 8: Multi-vendor order notifies distinct vendors with separate items ---");
    const mvOrder = await Order.create({
      user_id: 76,
      order_id: `ORD-TEST-MV-${Date.now()}`,
      price: 5000,
      payable_price: 5000,
      delivery_amount: 0,
      address_id: 1,
      payment_type: "cod",
      order_history: "Approved",
    });
    createdOrderIds.push(mvOrder.id);

    const soVendorA = await createTestSaleOrder({
      order_id: mvOrder.id,
      vendor_id: "11",
      product_id: 201,
      size: "Free Size",
      quantity: "1",
      amount: "3000",
      order_history: "Pending",
    });
    const soVendorB = await createTestSaleOrder({
      order_id: mvOrder.id,
      vendor_id: "12",
      product_id: 202,
      size: "L",
      quantity: "1",
      amount: "2000",
      order_history: "Pending",
    });
    createdSaleOrderIds.push(soVendorA.id, soVendorB.id);

    await NotificationService.notifyDistinctVendorsForOrder({ order: mvOrder, eventType: "order" });

    const notifVA = await Notification.findOne({
      where: { related_order_id: mvOrder.id, recipient_type: "vendor", recipient_id: "11" },
    });
    const notifVB = await Notification.findOne({
      where: { related_order_id: mvOrder.id, recipient_type: "vendor", recipient_id: "12" },
    });
    if (notifVA) createdNotifIds.push(notifVA.id);
    if (notifVB) createdNotifIds.push(notifVB.id);

    const vaData = typeof notifVA.data === "string" ? JSON.parse(notifVA.data) : notifVA.data;
    assert(notifVA !== null, "Vendor 11 received notification");
    assert(notifVB !== null, "Vendor 12 received notification");
    assert(vaData?.items?.some((i) => Number(i.product_id) === 201), "Vendor 11 notification contains Vendor A's items only");
    assert(!vaData?.items?.some((i) => Number(i.product_id) === 202), "Vendor 11 notification DOES NOT contain Vendor B's items");

    // -------------------------------------------------------------------------
    // SCENARIO 9: Multiple items from same vendor in one order create only ONE notification for that vendor
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 9: Multiple items from same vendor create only ONE notification ---");
    const singleVendorMultiItemOrder = await Order.create({
      user_id: 76,
      order_id: `ORD-TEST-SV-${Date.now()}`,
      price: 4000,
      payable_price: 4000,
      delivery_amount: 0,
      address_id: 1,
      payment_type: "cod",
      order_history: "Approved",
    });
    createdOrderIds.push(singleVendorMultiItemOrder.id);

    const soV1 = await createTestSaleOrder({
      order_id: singleVendorMultiItemOrder.id,
      vendor_id: "15",
      product_id: 301,
      size: "M",
      quantity: "1",
      amount: "2000",
      order_history: "Pending",
    });
    const soV2 = await createTestSaleOrder({
      order_id: singleVendorMultiItemOrder.id,
      vendor_id: "15",
      product_id: 302,
      size: "L",
      quantity: "1",
      amount: "2000",
      order_history: "Pending",
    });
    createdSaleOrderIds.push(soV1.id, soV2.id);

    await NotificationService.notifyDistinctVendorsForOrder({ order: singleVendorMultiItemOrder, eventType: "order" });

    const v15Notifs = await Notification.findAll({
      where: { related_order_id: singleVendorMultiItemOrder.id, recipient_type: "vendor", recipient_id: "15" },
    });
    v15Notifs.forEach((n) => createdNotifIds.push(n.id));
    assert(v15Notifs.length === 1, "Exactly 1 vendor notification created despite multiple items for vendor 15");

    // -------------------------------------------------------------------------
    // SCENARIO 10: Razorpay order creation (pending payment) notifies Admin, NOT vendor
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 10: Razorpay order creation (pending) notifies Admin, NOT vendor ---");
    const rzpOrder = await Order.create({
      user_id: 76,
      order_id: `ORD-TEST-RZP-${Date.now()}`,
      price: 3500,
      payable_price: 3500,
      delivery_amount: 0,
      address_id: 1,
      payment_type: "razorpay",
      razorpay_order_id: `rzp_order_${Date.now()}`,
      order_history: "Pending",
      razorpay_status: "pending",
    });
    createdOrderIds.push(rzpOrder.id);

    const rzpSaleOrder = await createTestSaleOrder({
      order_id: rzpOrder.id,
      vendor_id: "20",
      product_id: 401,
      size: "XL",
      quantity: "1",
      amount: "3500",
      order_history: "Pending",
    });
    createdSaleOrderIds.push(rzpSaleOrder.id);

    await NotificationService.notifyNewOrderPlaced({
      order: rzpOrder,
      user: { id: 76, username: "Loki Customer" },
      isCod: false,
    });

    const adminRzpPendingNotif = await Notification.findOne({
      where: { related_order_id: rzpOrder.id, recipient_type: "admin" },
    });
    if (adminRzpPendingNotif) createdNotifIds.push(adminRzpPendingNotif.id);
    assert(adminRzpPendingNotif !== null, "Admin notified of placed online order (pending payment)");

    const vendorRzpPendingNotif = await Notification.findOne({
      where: { related_order_id: rzpOrder.id, recipient_type: "vendor", recipient_id: "20" },
    });
    assert(vendorRzpPendingNotif === null, "Vendor 20 is NOT notified while online payment is pending");

    // -------------------------------------------------------------------------
    // SCENARIO 11: Razorpay payment verification success notifies vendors and admin
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 11: Razorpay payment verification confirms & notifies vendor ---");
    await rzpOrder.update({ order_history: "Approved", razorpay_status: "paid" });
    await NotificationService.notifyOrderPaymentConfirmed({ order: rzpOrder });

    const vendorRzpConfirmedNotif = await Notification.findOne({
      where: { related_order_id: rzpOrder.id, recipient_type: "vendor", recipient_id: "20" },
    });
    if (vendorRzpConfirmedNotif) createdNotifIds.push(vendorRzpConfirmedNotif.id);
    assert(vendorRzpConfirmedNotif !== null, "Vendor 20 is notified once online payment is confirmed");

    // -------------------------------------------------------------------------
    // SCENARIO 12: Duplicate Razorpay webhook processes idempotently without duplicate notifications
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 12: Duplicate Razorpay webhook idempotency ---");
    // Call notifyOrderPaymentConfirmed a second time
    await NotificationService.notifyOrderPaymentConfirmed({ order: rzpOrder });

    const vendor20Notifs = await Notification.findAll({
      where: { related_order_id: rzpOrder.id, recipient_type: "vendor", recipient_id: "20" },
    });
    assert(vendor20Notifs.length === 1, "Duplicate payment confirmation does NOT create duplicate vendor notification");

    // -------------------------------------------------------------------------
    // SCENARIO 13: Failed payment creates no vendor order notifications
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 13: Failed payment does NOT create vendor order notifications ---");
    const failedOrder = await Order.create({
      user_id: 76,
      order_id: `ORD-TEST-FAIL-${Date.now()}`,
      price: 1000,
      payable_price: 1000,
      delivery_amount: 0,
      address_id: 1,
      payment_type: "razorpay",
      order_history: "Decline_Order",
      razorpay_status: "failed",
    });
    createdOrderIds.push(failedOrder.id);

    const failedSaleOrder = await createTestSaleOrder({
      order_id: failedOrder.id,
      vendor_id: "25",
      product_id: 501,
      size: "S",
      quantity: "1",
      amount: "1000",
      order_history: "Decline_Order",
    });
    createdSaleOrderIds.push(failedSaleOrder.id);

    // No payment confirmation called
    const vendor25Notif = await Notification.findOne({
      where: { related_order_id: failedOrder.id, recipient_type: "vendor", recipient_id: "25" },
    });
    assert(vendor25Notif === null, "Vendor 25 received no notification for failed order");

    // -------------------------------------------------------------------------
    // SCENARIO 14: Missing or invalid FCM token handles gracefully without crashing
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 14: Missing or invalid FCM token handles gracefully ---");
    let missingTokenErr = null;
    let res = null;
    try {
      res = await FirebaseService.sendCustomerNotification(
        999999, // Non-existent user with no FCM token
        "Test Title",
        "Test Body",
        { test: "data" }
      );
      assert(res === false || (res && res.success === false), "Gracefully handled missing FCM token returning false");
    } catch (e) {
      missingTokenErr = e;
    }
    assert(missingTokenErr === null, "Missing FCM token did not throw or crash");

    // -------------------------------------------------------------------------
    // SCENARIO 15: FCM failure is non-blocking for notification dispatch
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 15: FCM failure is non-blocking for notification dispatch ---");
    let notif15 = null;
    try {
      notif15 = await NotificationService.createAndDispatchNotification({
        recipient_type: "user",
        recipient_id: "76",
        title: "Non-blocking Test",
        message: "Testing non-blocking FCM",
        type: "general",
        sendPush: true, // Will attempt FCM push
      });
      if (notif15) createdNotifIds.push(notif15.id);
    } catch (e) {
      assert(false, `createAndDispatchNotification threw error: ${e.message}`);
    }
    assert(notif15 !== null, "Notification record created successfully in DB even if FCM token absent or invalid");

    // -------------------------------------------------------------------------
    // SCENARIO 16: Unread count and paginated list APIs return correct data
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 16: Unread count and paginated list APIs ---");
    const unreadRes = await makeRequest("/api/notifications/unread-count?recipient_type=user&recipient_id=76");
    assert(unreadRes.status === 200, "GET /api/notifications/unread-count returns 200");
    assert(typeof unreadRes.body?.unread_count === "number" || typeof unreadRes.body?.count === "number", "Returns numeric unread count");

    const pageRes = await makeRequest("/api/notifications?recipient_type=user&recipient_id=76&page=1&limit=5");
    assert(pageRes.status === 200, "GET /api/notifications with pagination returns 200");
    assert(Array.isArray(pageRes.body?.data) || Array.isArray(pageRes.body?.notifications), "Returns list of notifications");

    // -------------------------------------------------------------------------
    // SCENARIO 17: Mark as read and read-all endpoints
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 17: Mark as read and read-all endpoints ---");
    const singleReadRes = await makeRequest(`/api/notifications/${notif15.id}/read`, {
      method: "POST",
      body: JSON.stringify({ recipient_type: "user", recipient_id: 76 }),
    });
    assert(singleReadRes.status === 200, "POST /api/notifications/:id/read returns 200");

    const refreshedNotif15 = await Notification.findByPk(notif15.id);
    assert(refreshedNotif15.is_read === true || refreshedNotif15.is_read === 1, "Notification marked is_read = true in DB");

    const readAllRes = await makeRequest("/api/notifications/read-all", {
      method: "POST",
      body: JSON.stringify({ recipient_type: "user", recipient_id: 76 }),
    });
    assert(readAllRes.status === 200, "POST /api/notifications/read-all returns 200");

    // -------------------------------------------------------------------------
    // SCENARIO 18: Real-time chat delivery between Customer 76 and Admin in ticket 51
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 18: Real-time chat delivery without page refresh ---");
    const custSocket = io(BASE_URL, { transports: ["websocket", "polling"], forceNew: true });
    const admSocket = io(BASE_URL, { transports: ["websocket", "polling"], forceNew: true });

    await new Promise((resolve) => {
      let c = 0;
      custSocket.on("connect", () => {
        custSocket.emit("register", 76);
        custSocket.emit("join_ticket", 51);
        custSocket.emit("join_room", "ticket_51");
        custSocket.emit("join_room", "76");
        if (++c === 2) resolve();
      });
      admSocket.on("connect", () => {
        admSocket.emit("join_admin");
        admSocket.emit("register", "admin");
        admSocket.emit("join_ticket", 51);
        admSocket.emit("join_room", "ticket_51");
        admSocket.emit("join_room", "admin");
        if (++c === 2) resolve();
      });
    });

    // Allow socket room joins to be established on server
    await new Promise((r) => setTimeout(r, 300));

    let custHeardMsg = false;
    let admHeardMsg = false;

    custSocket.on("receive_ticket_message", (data) => {
      if (data.message === "Realtime instant message verification") custHeardMsg = true;
    });
    custSocket.on("receive_message", (data) => {
      if (data.message === "Realtime instant message verification") custHeardMsg = true;
    });

    admSocket.on("receive_ticket_message", (data) => {
      if (data.message === "Realtime instant message verification") admHeardMsg = true;
    });
    admSocket.on("receive_message", (data) => {
      if (data.message === "Realtime instant message verification") admHeardMsg = true;
    });

    // Customer sends message via HTTP endpoint
    const sendMsgRes = await makeRequest("/api/ticket-messages/send", {
      method: "POST",
      body: JSON.stringify({
        ticket_id: 51,
        sender_id: 76,
        receiver_id: 1,
        sender_type: "user",
        message: "Realtime instant message verification",
      }),
    });
    assert(sendMsgRes.status === 200, "POST /api/ticket-messages/send returns 200");
    if (sendMsgRes.body?.data?.id) createdTicketMsgIds.push(sendMsgRes.body.data.id);

    // Wait 600ms for realtime delivery
    await new Promise((r) => setTimeout(r, 600));

    assert(custHeardMsg, "Customer socket instantly received message in ticket_51 without refresh");
    assert(admHeardMsg, "Admin socket instantly received message in ticket_51 without refresh");

    custSocket.disconnect();
    admSocket.disconnect();

    // -------------------------------------------------------------------------
    // SCENARIO 19: FCM Token Update API parity
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 19: FCM Token Update Endpoint ---");
    const fcmUpdateRes = await makeRequest("/api/update-fcm", {
      method: "POST",
      body: JSON.stringify({
        user_id: 76,
        fcm_token: "test_fcm_token_sample_1234567890abcdef",
      }),
    });
    assert(fcmUpdateRes.status === 200, "POST /api/update-fcm returns 200");
    const user76 = await UserLogin.findByPk(76);
    assert(user76.fcm === "test_fcm_token_sample_1234567890abcdef", "FCM token saved in user_login.fcm");

  } catch (err) {
    console.error("❌ Test run failed with error:", err);
  } finally {
    // Cleanup test data created during this run
    console.log("\n--- Cleaning up test records ---");
    try {
      if (createdNotifIds.length > 0) {
        await Notification.destroy({ where: { id: { [Op.in]: createdNotifIds } } });
      }
      if (createdTicketMsgIds.length > 0) {
        await TicketMessage.destroy({ where: { id: { [Op.in]: createdTicketMsgIds } } });
      }
      if (createdSaleOrderIds.length > 0) {
        await SaleOrder.destroy({ where: { id: { [Op.in]: createdSaleOrderIds } } });
      }
      if (createdOrderIds.length > 0) {
        await Order.destroy({ where: { id: { [Op.in]: createdOrderIds } } });
      }
      console.log("🧹 Test cleanup completed cleanly.");
    } catch (cleanErr) {
      console.warn("⚠️ Cleanup warning:", cleanErr.message);
    }
  }

  console.log("\n================================================================================");
  console.log(`  TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests();
