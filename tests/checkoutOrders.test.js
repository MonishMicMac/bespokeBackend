import http from "http";
import crypto from "crypto";
import dotenv from "dotenv";
import express from "express";
import { Op } from "sequelize";
import sequelize from "../config/db.js";
import {
  Order,
  SaleOrder,
  SaleOrderHistory,
  ProductPrice,
  Product,
  ProductMaterial,
  ProductAddon,
  OrderAddon,
  UserLogin,
  VendorLogin,
  UserAddress,
  UserCartItem,
  CartAddon,
  Promocode,
  PromoCode,
  DeliveryCharge,
  Commission,
  Refund,
  ReturnProduct,
} from "../models/setupAssociations.js";
import orderRoutes from "../src/routes/orderRoutes.js";

dotenv.config();

// Ensure test port
const TEST_PORT = 62399;
let serverInstance;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    const reqOptions = {
      hostname: "127.0.0.1",
      port: TEST_PORT,
      path,
      method: options.method || "GET",
      headers: { ...defaultHeaders, ...(options.headers || {}) },
    };

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
        });
      });
    });

    req.on("error", reject);

    if (options.body) {
      if (typeof options.body === "string" || Buffer.isBuffer(options.body)) {
        req.write(options.body);
      } else {
        req.write(JSON.stringify(options.body));
      }
    }

    req.end();
  });
}

async function runCheckoutOrdersTestSuite() {
  console.log("================================================================================");
  console.log("  CHECKOUT & ORDERS APIS - COMPREHENSIVE AUTOMATED TEST SUITE                  ");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;
  const cleanupCallbacks = [];

  try {
    await sequelize.authenticate();
    console.log("✅ Database Connected Successfully for Checkout & Orders Testing\n");

    // Initialize express app
    const app = express();
    app.use(
      express.json({
        verify: (req, res, buf) => {
          req.rawBody = buf;
        },
      })
    );
    app.use(express.urlencoded({ extended: true }));
    app.use("/api", orderRoutes);
    app.use("/bespoke-api", orderRoutes);
    app.use("/", orderRoutes);

    await new Promise((resolve) => {
      serverInstance = app.listen(TEST_PORT, () => {
        console.log(`📡 In-process test server listening on http://127.0.0.1:${TEST_PORT}\n`);
        resolve();
      });
    });

    const timestamp = Date.now();

    // 1. Setup Test User
    const testUser = await UserLogin.create({
      username: `Customer_${timestamp}`,
      email: `customer_${timestamp}@test.com`,
      mobile: `98${String(timestamp).slice(-8)}`,
      action: "0",
    });
    cleanupCallbacks.push(async () => {
      await UserLogin.destroy({ where: { id: testUser.id } });
    });

    // 2. Setup Test Other User (for isolation tests)
    const testOtherUser = await UserLogin.create({
      username: `OtherUser_${timestamp}`,
      email: `other_${timestamp}@test.com`,
      mobile: `97${String(timestamp).slice(-8)}`,
      action: "0",
    });
    cleanupCallbacks.push(async () => {
      await UserLogin.destroy({ where: { id: testOtherUser.id } });
    });

    // 2b. Setup Inactive User (action = '1')
    const testInactiveUser = await UserLogin.create({
      username: `InactiveUser_${timestamp}`,
      email: `inactive_${timestamp}@test.com`,
      mobile: `95${String(timestamp).slice(-8)}`,
      action: "1",
    });
    cleanupCallbacks.push(async () => {
      await UserLogin.destroy({ where: { id: testInactiveUser.id } });
    });

    // 2c. Setup Banned User (is_banned = '1')
    const testBannedUser = await UserLogin.create({
      username: `BannedUser_${timestamp}`,
      email: `banned_${timestamp}@test.com`,
      mobile: `94${String(timestamp).slice(-8)}`,
      action: "0",
      is_banned: "1",
    });
    cleanupCallbacks.push(async () => {
      await UserLogin.destroy({ where: { id: testBannedUser.id } });
    });

    // 3. Setup Test Address
    const testAddress = await UserAddress.create({
      user_id: testUser.id,
      name: "John Doe",
      phone: "9876543210",
      house_building_name: "Apt 101",
      area_colony: "MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560001",
      action: "0",
    });
    cleanupCallbacks.push(async () => {
      await UserAddress.destroy({ where: { id: testAddress.id } });
    });

    // 4. Setup Test Vendor
    const testVendor = await VendorLogin.create({
      username: `Vendor_${timestamp}`,
      email: `vendor_${timestamp}@test.com`,
      mobile: `96${String(timestamp).slice(-8)}`,
      shop_name: `Boutique_${timestamp}`,
      action: "0",
    });
    cleanupCallbacks.push(async () => {
      await VendorLogin.destroy({ where: { id: testVendor.id } });
    });

    // 5. Setup Ready-made Product
    const testProductReady = await Product.create({
      room_id: "1",
      category: "Men",
      product_name: `ReadyMade Shirt ${timestamp}`,
      product_id: `PROD_R_${timestamp}`,
      vendor_id: String(testVendor.id),
      product_type: "1", // Ready-made
      is_customizable: "0",
      alter_charge: 150,
      actual_price: 2500,
      offer_price: 2000,
      action: "0",
    });
    cleanupCallbacks.push(async () => {
      await Product.destroy({ where: { id: testProductReady.id } });
    });

    // 6. Setup Customizable Product
    const testProductCustom = await Product.create({
      room_id: "1",
      category: "Men",
      product_name: `Custom Suit ${timestamp}`,
      product_id: `PROD_C_${timestamp}`,
      vendor_id: String(testVendor.id),
      product_type: "0", // Customizable
      is_customizable: "1",
      alter_charge: 200,
      actual_price: 15000,
      offer_price: 12000,
      action: "0",
    });
    cleanupCallbacks.push(async () => {
      await Product.destroy({ where: { id: testProductCustom.id } });
    });

    // 7. Setup Price Variants
    const testPriceReady = await ProductPrice.create({
      product_id: testProductReady.id,
      product_type: 1, // Ready-made variant
      size: "L",
      actual_price: 2500,
      discount_price: 2000,
      qty: 10,
      is_out_stock: "0",
      action: "0",
    });
    cleanupCallbacks.push(async () => {
      await ProductPrice.destroy({ where: { id: testPriceReady.id } });
    });

    const testPriceCustom = await ProductPrice.create({
      product_id: testProductCustom.id,
      size: "Custom",
      actual_price: 15000,
      discount_price: 12000,
      qty: 1,
      is_out_stock: "0",
      action: "0",
    });
    cleanupCallbacks.push(async () => {
      await ProductPrice.destroy({ where: { id: testPriceCustom.id } });
    });

    // 8. Setup Product Addon
    const testAddon = await ProductAddon.create({
      product_id: testProductReady.id,
      name: "Silk Pocket Square",
      amount: 400,
      action: "0",
    });
    cleanupCallbacks.push(async () => {
      await ProductAddon.destroy({ where: { id: testAddon.id } });
    });

    // 9. Ensure Delivery Charge exists
    let deliveryChargeRow = await DeliveryCharge.findOne();
    if (!deliveryChargeRow) {
      deliveryChargeRow = await DeliveryCharge.create({
        delivery_amount: 50.0,
      });
      cleanupCallbacks.push(async () => {
        await DeliveryCharge.destroy({ where: { id: deliveryChargeRow.id } });
      });
    }

    // 10. Ensure Commission exists
    let commRow = await Commission.findOne();
    if (!commRow) {
      commRow = await Commission.create({
        commission_percentage: "25",
        action: "0",
      });
      cleanupCallbacks.push(async () => {
        await Commission.destroy({ where: { id: commRow.id } });
      });
    }

    // 11. Setup Test Promo Code (Flat 300 discount)
    const testPromoCode = `ORDPROMO_${timestamp}`;
    const testPromo = await PromoCode.create({
      code: testPromoCode,
      type: "flat",
      value: 300,
      min_order_value: 1000,
      status: "1",
      start_date: "2020-01-01",
      end_date: "2030-12-31",
      used_count: 0,
      usage_limit: 100,
    });
    cleanupCallbacks.push(async () => {
      await PromoCode.destroy({ where: { id: testPromo.id } });
    });

    // Track orders to clean up
    const testOrderIds = [];
    cleanupCallbacks.push(async () => {
      if (testOrderIds.length > 0) {
        const saleOrders = await SaleOrder.findAll({
          where: { order_id: { [Op.in]: testOrderIds } },
          attributes: ["id"],
        });
        const soIds = saleOrders.map((so) => so.id);
        if (soIds.length > 0) {
          await SaleOrderHistory.destroy({ where: { sale_order_id: { [Op.in]: soIds } } });
          await OrderAddon.destroy({ where: { sale_id: { [Op.in]: soIds.map(String) } } });
          await ReturnProduct.destroy({ where: { sale_order_id: { [Op.in]: soIds } }, force: true });
          await Refund.destroy({ where: { sale_order_id: { [Op.in]: soIds } } });
          await SaleOrder.destroy({ where: { id: { [Op.in]: soIds } } });
        }
        await Order.destroy({ where: { id: { [Op.in]: testOrderIds } } });
      }
    });

    // =========================================================================
    // SECTION 1: ORDER PLACEMENT (POST /api/order/add)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("SECTION 1: ORDER PLACEMENT (POST /api/order/add)");
    console.log("--------------------------------------------------------------------------------");

    // Test 1.1: Missing payment mode rejected
    try {
      console.log("▶ Test 1.1: Missing payment mode returns HTTP 400");
      const res = await makeRequest("/api/order/add", {
        method: "POST",
        body: {
          user_id: testUser.id,
          address_id: testAddress.id,
          product: [{ price_id: testPriceReady.id, quantity: 1 }],
        },
      });

      if (res.status === 400 && res.body?.status === false && res.body.message.includes("Payment mode is required")) {
        console.log(`   ✅ PASS: Rejected missing payment mode: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.1]:", e.message, "\n");
      failed++;
    }

    // Test 1.1b: Missing user ID rejected
    try {
      console.log("▶ Test 1.1b: Missing user ID returns HTTP 400");
      const res = await makeRequest("/api/order/add", {
        method: "POST",
        body: {
          address_id: testAddress.id,
          payment_mode: "COD",
          product: [{ price_id: testPriceReady.id, quantity: 1 }],
        },
      });

      if (res.status === 400 && res.body?.status === false && res.body.message.includes("User ID is required")) {
        console.log(`   ✅ PASS: Rejected missing user ID: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.1b]:", e.message, "\n");
      failed++;
    }

    // Test 1.2: Inactive/Nonexistent user rejected
    try {
      console.log("▶ Test 1.2: Nonexistent user returns HTTP 400");
      const res = await makeRequest("/api/order/add", {
        method: "POST",
        body: {
          user_id: 99999999,
          address_id: testAddress.id,
          payment_mode: "COD",
          product: [{ price_id: testPriceReady.id, quantity: 1 }],
        },
      });

      if (res.status === 400 && res.body?.status === false && res.body.message.includes("Invalid user")) {
        console.log(`   ✅ PASS: Rejected invalid user: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.2]:", e.message, "\n");
      failed++;
    }

    // Test 1.2b: Inactive customer (action = '1') rejected
    try {
      console.log("▶ Test 1.2b: Inactive customer account rejected with HTTP 400");
      const res = await makeRequest("/api/order/add", {
        method: "POST",
        body: {
          user_id: testInactiveUser.id,
          address_id: testAddress.id,
          payment_mode: "COD",
          product: [{ price_id: testPriceReady.id, quantity: 1 }],
        },
      });

      if (res.status === 400 && res.body?.status === false && res.body.message.includes("Invalid user or inactive account")) {
        console.log(`   ✅ PASS: Inactive customer rejected: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.2b]:", e.message, "\n");
      failed++;
    }

    // Test 1.2c: Banned customer (is_banned = '1') rejected
    try {
      console.log("▶ Test 1.2c: Banned customer account rejected with HTTP 400");
      const res = await makeRequest("/api/order/add", {
        method: "POST",
        body: {
          user_id: testBannedUser.id,
          address_id: testAddress.id,
          payment_mode: "COD",
          product: [{ price_id: testPriceReady.id, quantity: 1 }],
        },
      });

      if (res.status === 400 && res.body?.status === false && res.body.message.includes("Invalid user or inactive account")) {
        console.log(`   ✅ PASS: Banned customer rejected: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.2c]:", e.message, "\n");
      failed++;
    }

    // Test 1.2d: Route alias /bespoke-api/order/add works for active user
    try {
      console.log("▶ Test 1.2d: Order placement via /bespoke-api/order/add succeeds for active customer");
      const res = await makeRequest("/bespoke-api/order/add", {
        method: "POST",
        body: {
          user_id: testUser.id,
          address_id: testAddress.id,
          payment_mode: "COD",
          product: [{ price_id: testPriceReady.id, quantity: 1 }],
        },
      });

      if (res.status === 200 && (res.body?.status === true || res.body?.status === "true")) {
        console.log(`   ✅ PASS: /bespoke-api/order/add succeeded, order_id: ${res.body.order?.order_id}\n`);
        testOrderIds.push(res.body.order.id);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.2d]:", e.message, "\n");
      failed++;
    }

    // Test 1.3: Insufficient stock rejected
    try {
      console.log("▶ Test 1.3: Insufficient stock rejected with HTTP 400");
      const res = await makeRequest("/api/order/add", {
        method: "POST",
        body: {
          user_id: testUser.id,
          address_id: testAddress.id,
          payment_mode: "COD",
          product: [{ price_id: testPriceReady.id, quantity: 999 }],
        },
      });

      if (res.status === 400 && res.body?.status === false && res.body.message.includes("Stock not available")) {
        console.log(`   ✅ PASS: Insufficient stock rejected: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.3]:", e.message, "\n");
      failed++;
    }

    // Test 1.4: Successful COD order placement
    let codOrderId = null;
    let codSaleOrderId = null;
    try {
      console.log("▶ Test 1.4: Successful COD order placement with addons & alteration");
      await testPriceReady.reload();
      const initialStock = parseInt(testPriceReady.qty, 10);
      const orderQty = 2;

      const res = await makeRequest("/api/order/add", {
        method: "POST",
        body: {
          user_id: testUser.id,
          address_id: testAddress.id,
          payment_mode: "COD",
          product: [
            {
              price_id: testPriceReady.id,
              quantity: orderQty,
              is_alter: "1",
              addon: [testAddon.id],
            },
          ],
        },
      });

      if (res.status === 200 && res.body?.status === true && res.body.order?.id) {
        codOrderId = res.body.order.id;
        testOrderIds.push(codOrderId);

        // Verification in database
        const dbOrder = await Order.findByPk(codOrderId);
        const saleOrders = await SaleOrder.findAll({ where: { order_id: codOrderId } });
        codSaleOrderId = saleOrders[0].id;

        // Stock verification
        const refreshedPrice = await ProductPrice.findByPk(testPriceReady.id);
        const expectedStock = initialStock - orderQty;

        // Financial calculations
        // single_price = 2000, qty = 2 -> 4000
        // addon = 400 * 2 = 800
        // alter = 150 * 2 = 300
        // subtotal = 4000 + 800 + 300 = 5100
        // commission = 25% of 5100 = 1275
        // seller_amount = 5100 - 1275 = 3825
        // delivery = 50
        // payable = 5100 + 50 = 5150
        const itemTotal = 5100;
        const expectedPayable = 5150;

        const isStockDecremented = refreshedPrice.qty === expectedStock;
        const isOrderApproved = dbOrder.order_history === "Approved";
        const isCodTxn = dbOrder.transaction_id === "COD";
        const isPayableCorrect = parseFloat(dbOrder.payable_price) === expectedPayable;

        // Check Addon in order_addon
        const orderAddonEntry = await OrderAddon.findOne({
          where: { sale_id: String(codSaleOrderId), addon_id: testAddon.id },
        });

        // Check SaleOrderHistory
        const historyEntry = await SaleOrderHistory.findOne({
          where: { sale_order_id: codSaleOrderId, order_history: "Pending" },
        });

        if (
          isStockDecremented &&
          isOrderApproved &&
          isCodTxn &&
          isPayableCorrect &&
          orderAddonEntry &&
          historyEntry
        ) {
          console.log(`   ✅ PASS: COD Order placed! Order: #${dbOrder.order_id}, Subtotal: ₹${dbOrder.price}, Payable: ₹${dbOrder.payable_price}, Stock: ${initialStock} -> ${refreshedPrice.qty}\n`);
          passed++;
        } else {
          throw new Error(
            `COD verification failed: stock=${refreshedPrice.qty} (expected ${expectedStock}), status=${dbOrder.order_history}, payable=${dbOrder.payable_price}`
          );
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.4]:", e.message, "\n");
      failed++;
    }

    // Test 1.5: Successful ONLINE order placement
    let onlineOrderId = null;
    let onlineRazorpayId = null;
    try {
      console.log("▶ Test 1.5: Successful ONLINE order placement returns razorpay_order_id");
      const res = await makeRequest("/api/order/add", {
        method: "POST",
        body: {
          user_id: testUser.id,
          address_id: testAddress.id,
          payment_mode: "ONLINE",
          product: [
            {
              price_id: testPriceReady.id,
              quantity: 1,
            },
          ],
        },
      });

      if (res.status === 200 && res.body?.status === true && res.body.razorpay_order_id) {
        onlineOrderId = res.body.order.id;
        onlineRazorpayId = res.body.razorpay_order_id;
        testOrderIds.push(onlineOrderId);

        const dbOrder = await Order.findByPk(onlineOrderId);
        if (dbOrder.razorpay_order_id === onlineRazorpayId && dbOrder.razorpay_status === "created") {
          console.log(`   ✅ PASS: ONLINE Order created with Razorpay ID: ${onlineRazorpayId}\n`);
          passed++;
        } else {
          throw new Error("DB verification failed for online order creation");
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.5]:", e.message, "\n");
      failed++;
    }

    // Test 1.6: Order placement with Promo Code (discount absorbed exclusively by bespoke commission)
    let promoOrderId = null;
    try {
      console.log("▶ Test 1.6: Order with promo code deducts discount ONLY from bespoke commission");
      const res = await makeRequest("/api/order/add", {
        method: "POST",
        body: {
          user_id: testUser.id,
          address_id: testAddress.id,
          payment_mode: "COD",
          coupen_id: testPromoCode,
          product: [
            {
              price_id: testPriceReady.id,
              quantity: 1, // single_price = 2000
            },
          ],
        },
      });

      if (res.status === 200 && res.body?.status === true && res.body.order?.id) {
        promoOrderId = res.body.order.id;
        testOrderIds.push(promoOrderId);

        const dbOrder = await Order.findByPk(promoOrderId);
        const saleOrder = await SaleOrder.findOne({ where: { order_id: promoOrderId } });

        // Pricing:
        // single_price = 2000
        // subtotal = 2000
        // discount = 300 (flat promo)
        // commission before discount = 25% of 2000 = 500
        // seller_amount = 2000 - 500 = 1500 (MUST REMAIN INTACT)
        // bespoke_commision_amount after discount = 500 - 300 = 200
        // total_amount of sale order = 2000 - 300 = 1700
        // delivery = 50
        // payable = (2000 - 300) + 50 = 1750
        const isSellerAmountIntact = parseFloat(saleOrder.seller_amount) === 1500;
        const isBespokeCommReduced = parseFloat(saleOrder.bespoke_commision_amount) === 200;
        const isSaleOrderDiscountRecorded = parseFloat(saleOrder.discount_amount) === 300;
        const isPayableCorrect = parseFloat(dbOrder.payable_price) === 1750;

        if (isSellerAmountIntact && isBespokeCommReduced && isSaleOrderDiscountRecorded && isPayableCorrect) {
          console.log(`   ✅ PASS: Promo discount correctly deducted exclusively from Bespoke commission! Seller amount remained ₹1500 intact.\n`);
          passed++;
        } else {
          throw new Error(
            `Promo calculations mismatch: seller_amount=${saleOrder.seller_amount} (expected 1500), bespoke_comm=${saleOrder.bespoke_commision_amount} (expected 200), payable=${dbOrder.payable_price} (expected 1750)`
          );
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.6]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // SECTION 2: PAYMENT VERIFICATION (POST /api/order/verify-payment)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("SECTION 2: PAYMENT VERIFICATION (POST /api/order/verify-payment)");
    console.log("--------------------------------------------------------------------------------");

    // Test 2.1: Missing verification parameters rejected
    try {
      console.log("▶ Test 2.1: Missing verification parameters returns HTTP 400");
      const res = await makeRequest("/api/order/verify-payment", {
        method: "POST",
        body: { razorpay_order_id: "order_123" },
      });

      if (res.status === 400 && res.body?.status === false) {
        console.log(`   ✅ PASS: Rejected missing verification fields\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.1]:", e.message, "\n");
      failed++;
    }

    // Test 2.2: Invalid signature rejected
    try {
      console.log("▶ Test 2.2: Invalid payment signature returns HTTP 400");
      const res = await makeRequest("/api/order/verify-payment", {
        method: "POST",
        body: {
          razorpay_order_id: onlineRazorpayId,
          razorpay_payment_id: "pay_test_12345",
          razorpay_signature: "invalid_signature_hash",
        },
      });

      if (res.status === 400 && res.body?.status === false && res.body.message.includes("Invalid payment signature")) {
        console.log(`   ✅ PASS: Rejected invalid signature: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.2]:", e.message, "\n");
      failed++;
    }

    // Test 2.3: Valid payment verification succeeds
    try {
      console.log("▶ Test 2.3: Valid payment verification approves order");
      const secret = process.env.RAZORPAY_SECRET || "rzp_secret_test";
      process.env.RAZORPAY_SECRET = secret;

      const testPaymentId = "pay_test_valid_99999";
      const validSignature = crypto
        .createHmac("sha256", secret)
        .update(`${onlineRazorpayId}|${testPaymentId}`)
        .digest("hex");

      const res = await makeRequest("/api/order/verify-payment", {
        method: "POST",
        body: {
          razorpay_order_id: onlineRazorpayId,
          razorpay_payment_id: testPaymentId,
          razorpay_signature: validSignature,
        },
      });

      if (res.status === 200 && res.body?.status === true && res.body.order) {
        const dbOrder = await Order.findByPk(onlineOrderId);
        const saleOrders = await SaleOrder.findAll({ where: { order_id: onlineOrderId } });

        const isOrderApproved = dbOrder.order_history === "Approved";
        const isPaid = dbOrder.razorpay_status === "paid";
        const isSaleOrderPending = saleOrders.every((so) => so.order_history === "Pending");

        if (isOrderApproved && isPaid && isSaleOrderPending) {
          console.log(`   ✅ PASS: Payment verified! Order marked Approved, payment_id=${dbOrder.payment_id}\n`);
          passed++;
        } else {
          throw new Error("DB status mismatch after payment verification");
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.3]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // SECTION 3: PAYMENT FAILED (POST /api/order/payment-failed)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("SECTION 3: PAYMENT FAILED (POST /api/order/payment-failed)");
    console.log("--------------------------------------------------------------------------------");

    // Test 3.1: Payment failure marks order Decline_Order and restores stock
    try {
      console.log("▶ Test 3.1: Payment failure marks Decline_Order & restores inventory");
      // Create a new online order to test failure
      const createRes = await makeRequest("/api/order/add", {
        method: "POST",
        body: {
          user_id: testUser.id,
          address_id: testAddress.id,
          payment_mode: "ONLINE",
          product: [{ price_id: testPriceReady.id, quantity: 2 }],
        },
      });

      const failOrderId = createRes.body.order.id;
      const failRzpId = createRes.body.razorpay_order_id;
      testOrderIds.push(failOrderId);

      const stockBeforeFail = (await ProductPrice.findByPk(testPriceReady.id)).qty;

      const failRes = await makeRequest("/api/order/payment-failed", {
        method: "POST",
        body: { razorpay_order_id: failRzpId },
      });

      if (failRes.status === 200 && failRes.body?.status === true) {
        const dbOrder = await Order.findByPk(failOrderId);
        const saleOrders = await SaleOrder.findAll({ where: { order_id: failOrderId } });
        const stockAfterFail = (await ProductPrice.findByPk(testPriceReady.id)).qty;

        const isOrderDeclined = dbOrder.order_history === "Decline_Order";
        const isSaleOrderDeclined = saleOrders.every((so) => so.order_history === "Decline_Order");
        const isStockRestored = stockAfterFail === stockBeforeFail + 2;

        if (isOrderDeclined && isSaleOrderDeclined && isStockRestored) {
          console.log(`   ✅ PASS: Payment failed handled! Status set to Decline_Order, stock restored from ${stockBeforeFail} to ${stockAfterFail}\n`);
          passed++;
        } else {
          throw new Error("DB verification failed for payment failure flow");
        }
      } else {
        throw new Error(`Unexpected response: ${failRes.status} ${JSON.stringify(failRes.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.1]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // SECTION 4: RAZORPAY WEBHOOK (POST /api/razorpay-webhook)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("SECTION 4: RAZORPAY WEBHOOK (POST /api/razorpay-webhook)");
    console.log("--------------------------------------------------------------------------------");

    // Test 4.1: Webhook payment.captured marks order Approved
    try {
      console.log("▶ Test 4.1: Webhook payment.captured handles payment and approves order");
      // Create a fresh online order
      const createRes = await makeRequest("/api/order/add", {
        method: "POST",
        body: {
          user_id: testUser.id,
          address_id: testAddress.id,
          payment_mode: "ONLINE",
          product: [{ price_id: testPriceReady.id, quantity: 1 }],
        },
      });

      const webhookOrderId = createRes.body.order.id;
      const webhookRzpOrderId = createRes.body.razorpay_order_id;
      testOrderIds.push(webhookOrderId);

      const webhookSecret = "test_webhook_secret_123";
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;

      const eventPayload = JSON.stringify({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_webhook_99999",
              order_id: webhookRzpOrderId,
              amount: 205000,
              status: "captured",
            },
          },
        },
      });

      const signature = crypto
        .createHmac("sha256", webhookSecret)
        .update(eventPayload)
        .digest("hex");

      const webhookRes = await makeRequest("/api/razorpay-webhook", {
        method: "POST",
        headers: { "X-Razorpay-Signature": signature },
        body: eventPayload,
      });

      if (webhookRes.status === 200 && webhookRes.body?.status === true) {
        const dbOrder = await Order.findByPk(webhookOrderId);
        if (dbOrder.order_history === "Approved" && dbOrder.payment_id === "pay_webhook_99999") {
          console.log(`   ✅ PASS: Webhook processed! Order marked Approved with payment_id=${dbOrder.payment_id}\n`);
          passed++;
        } else {
          throw new Error("DB verification failed for webhook payment.captured");
        }
      } else {
        throw new Error(`Unexpected response: ${webhookRes.status} ${JSON.stringify(webhookRes.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 4.1]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // SECTION 5: CUSTOMER ORDER LISTING (GET /api/order/list)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("SECTION 5: CUSTOMER ORDER LISTING (GET /api/order/list)");
    console.log("--------------------------------------------------------------------------------");

    // Test 5.1: Missing user_id returns HTTP 400
    try {
      console.log("▶ Test 5.1: Missing user_id returns HTTP 400");
      const res = await makeRequest("/api/order/list");
      if (res.status === 400 && res.body?.status === "false") {
        console.log(`   ✅ PASS: Rejected missing user_id\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 5.1]:", e.message, "\n");
      failed++;
    }

    // Test 5.2: Customer order listing with pagination and isolation
    try {
      console.log("▶ Test 5.2: Retrieve customer orders with pagination & customer isolation");
      const res = await makeRequest(`/api/order/list?user_id=${testUser.id}&per_page=5&page=1`);

      if (
        res.status === 200 &&
        res.body?.status === "true" &&
        Array.isArray(res.body.orders) &&
        res.body.orders.length > 0 &&
        res.body.pagination
      ) {
        const orderItem = res.body.orders[0];
        const hasRequiredKeys =
          orderItem.id !== undefined &&
          orderItem.sale_id !== undefined &&
          orderItem.order_history_with_date !== undefined;

        if (hasRequiredKeys) {
          console.log(`   ✅ PASS: Retrieved ${res.body.orders.length} orders for customer! Formatted status: "${orderItem.order_history_with_date}"\n`);
          passed++;
        } else {
          throw new Error(`Missing expected keys in order list item: ${JSON.stringify(orderItem)}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 5.2]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // SECTION 6: MOBILE COMPOSITE ORDER DETAIL (GET /api/order/detail-mobile)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("SECTION 6: MOBILE COMPOSITE ORDER DETAIL (GET /api/order/detail-mobile)");
    console.log("--------------------------------------------------------------------------------");

    // Test 6.1: Retrieve detail by sale_order_id
    try {
      console.log("▶ Test 6.1: Retrieve composite mobile details by sale_order_id");
      const res = await makeRequest(`/api/order/detail-mobile?sale_order_id=${codSaleOrderId}`);

      if (res.status === 200 && res.body?.status === true && res.body.data) {
        const data = res.body.data;

        const hasProduct = data.product_name !== undefined;
        const hasAddress = data.deliveried_address && data.deliveried_address.full_address;
        const hasPricing = data.price_details && data.price_details.total_amount !== undefined;
        const hasCycle = Array.isArray(data.order_cycle) && data.order_cycle.length >= 5;
        const hasAddons = Array.isArray(data.order_addon_products);
        const hasEligibility = data.cancel !== undefined && data.return !== undefined;

        if (hasProduct && hasAddress && hasPricing && hasCycle && hasAddons && hasEligibility) {
          console.log(`   ✅ PASS: Composite details retrieved! Stages: ${data.order_cycle.length}, Address: "${data.deliveried_address.full_address}", Total: ₹${data.price_details.total_amount}\n`);
          passed++;
        } else {
          throw new Error("Composite details structure incomplete");
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 6.1]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // SECTION 7: CUSTOMER ORDER CANCELLATION (POST /api/customer/order/cancel)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("SECTION 7: CUSTOMER ORDER CANCELLATION (POST /api/customer/order/cancel)");
    console.log("--------------------------------------------------------------------------------");

    // Test 7.1: Pre-delivery cancellation restocks stock and creates refund
    try {
      console.log("▶ Test 7.1: Pre-delivery cancellation restocks inventory & records refund");
      const stockBeforeCancel = (await ProductPrice.findByPk(testPriceReady.id)).qty;

      const res = await makeRequest("/api/customer/order/cancel", {
        method: "POST",
        body: {
          sale_order_id: codSaleOrderId,
          user_id: testUser.id,
          reason: "Ordered by mistake",
        },
      });

      if (res.status === 200 && res.body?.status === true) {
        const saleOrder = await SaleOrder.findByPk(codSaleOrderId);
        const refundRecord = await Refund.findOne({ where: { sale_order_id: codSaleOrderId } });
        const historyRecord = await SaleOrderHistory.findOne({
          where: { sale_order_id: codSaleOrderId, order_history: "Cancelled" },
        });
        const stockAfterCancel = (await ProductPrice.findByPk(testPriceReady.id)).qty;

        const isCancelled = saleOrder.order_history === "Cancelled";
        const isStockRestored = stockAfterCancel === stockBeforeCancel + parseInt(saleOrder.quantity, 10);
        const isRefundCreated = refundRecord !== null && parseFloat(refundRecord.amount) > 0;
        const isHistoryRecorded = historyRecord !== null;

        if (isCancelled && isStockRestored && isRefundCreated && isHistoryRecorded) {
          console.log(`   ✅ PASS: Order cancelled! Status: Cancelled, Stock: ${stockBeforeCancel} -> ${stockAfterCancel}, Refund ID: #${refundRecord.id}\n`);
          passed++;
        } else {
          throw new Error("DB verification failed for order cancellation");
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 7.1]:", e.message, "\n");
      failed++;
    }

    // Test 7.2: Already cancelled order item rejected
    try {
      console.log("▶ Test 7.2: Repeated cancellation on already cancelled item returns HTTP 400");
      const res = await makeRequest("/api/customer/order/cancel", {
        method: "POST",
        body: {
          sale_order_id: codSaleOrderId,
          user_id: testUser.id,
        },
      });

      if (res.status === 400 && res.body?.status === false && res.body.message.includes("already been cancelled")) {
        console.log(`   ✅ PASS: Repeated cancellation rejected: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 7.2]:", e.message, "\n");
      failed++;
    }

    // Test 7.3: Cancellation rejected if order is dispatched
    try {
      console.log("▶ Test 7.3: Dispatched order item cancellation rejected");
      // Create new order and mark it as dispatched in history
      const createRes = await makeRequest("/api/order/add", {
        method: "POST",
        body: {
          user_id: testUser.id,
          address_id: testAddress.id,
          payment_mode: "COD",
          product: [{ price_id: testPriceReady.id, quantity: 1 }],
        },
      });

      const dispOrderId = createRes.body.order.id;
      testOrderIds.push(dispOrderId);
      const dispSaleOrder = await SaleOrder.findOne({ where: { order_id: dispOrderId } });

      await SaleOrderHistory.create({
        sale_order_id: dispSaleOrder.id,
        order_status: "3",
        order_history: "Dispatched",
        remarks: "Handed over to courier",
      });

      const cancelRes = await makeRequest("/api/customer/order/cancel", {
        method: "POST",
        body: {
          sale_order_id: dispSaleOrder.id,
          user_id: testUser.id,
        },
      });

      if (
        cancelRes.status === 400 &&
        cancelRes.body?.status === false &&
        cancelRes.body.message.includes("Once the order is dispatched, it cannot be declined or cancelled")
      ) {
        console.log(`   ✅ PASS: Dispatched cancellation correctly rejected: "${cancelRes.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${cancelRes.status} ${JSON.stringify(cancelRes.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 7.3]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // SECTION 8: CUSTOMER ORDER RETURN (POST /api/customer/order/return)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("SECTION 8: CUSTOMER ORDER RETURN (POST /api/customer/order/return)");
    console.log("--------------------------------------------------------------------------------");

    // Test 8.1: Return on non-delivered order item rejected
    try {
      console.log("▶ Test 8.1: Return on non-delivered item rejected with HTTP 400");
      // Create pending order
      const createRes = await makeRequest("/api/order/add", {
        method: "POST",
        body: {
          user_id: testUser.id,
          address_id: testAddress.id,
          payment_mode: "COD",
          product: [{ price_id: testPriceReady.id, quantity: 1 }],
        },
      });

      const nonDelivOrderId = createRes.body.order.id;
      testOrderIds.push(nonDelivOrderId);
      const nonDelivSaleOrder = await SaleOrder.findOne({ where: { order_id: nonDelivOrderId } });

      const returnRes = await makeRequest("/api/customer/order/return", {
        method: "POST",
        body: {
          sale_order_id: nonDelivSaleOrder.id,
          user_id: testUser.id,
        },
      });

      if (
        returnRes.status === 400 &&
        returnRes.body?.status === false &&
        returnRes.body.message.includes("Product has not been delivered yet")
      ) {
        console.log(`   ✅ PASS: Return rejected for non-delivered item: "${returnRes.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${returnRes.status} ${JSON.stringify(returnRes.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 8.1]:", e.message, "\n");
      failed++;
    }

    // Test 8.2: Return on delivered item within 14 days accepted (creates return_products entry)
    try {
      console.log("▶ Test 8.2: Return within 14 days accepted, creates return_products record");
      // Create order and mark delivered
      const createRes = await makeRequest("/api/order/add", {
        method: "POST",
        body: {
          user_id: testUser.id,
          address_id: testAddress.id,
          payment_mode: "COD",
          product: [{ price_id: testPriceReady.id, quantity: 1 }],
        },
      });

      const delivOrderId = createRes.body.order.id;
      testOrderIds.push(delivOrderId);
      const delivSaleOrder = await SaleOrder.findOne({ where: { order_id: delivOrderId } });

      // Mark delivered in history (2 days ago)
      const deliveryDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      await SaleOrderHistory.create({
        sale_order_id: delivSaleOrder.id,
        order_status: "5",
        order_history: "Delivered",
        remarks: "Delivered to customer",
        created_at: deliveryDate,
      });

      const returnRes = await makeRequest("/api/customer/order/return", {
        method: "POST",
        body: {
          sale_order_id: delivSaleOrder.id,
          user_id: testUser.id,
          reason: "Product size or fitting mismatch",
        },
      });

      if (returnRes.status === 200 && returnRes.body?.status === true && returnRes.body.data?.return_product) {
        const updatedSaleOrder = await SaleOrder.findByPk(delivSaleOrder.id);
        const returnProductRecord = await ReturnProduct.findOne({
          where: { sale_order_id: delivSaleOrder.id },
        });

        const isReturned = updatedSaleOrder.order_history === "Returned";
        const isReturnProductInitiated = returnProductRecord && returnProductRecord.return_status === "initiate";

        if (isReturned && isReturnProductInitiated) {
          console.log(`   ✅ PASS: Return request accepted! ReturnProduct ID: #${returnProductRecord.id}, Status: "${returnProductRecord.return_status}"\n`);
          passed++;
        } else {
          throw new Error("DB verification failed for return product creation");
        }
      } else {
        throw new Error(`Unexpected response: ${returnRes.status} ${JSON.stringify(returnRes.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 8.2]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // SECTION 9: CANCELLATION & RETURN HELPER OPTIONS
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("SECTION 9: CANCELLATION & RETURN HELPER OPTIONS");
    console.log("--------------------------------------------------------------------------------");

    // Test 9.1: Cancel reasons API
    try {
      console.log("▶ Test 9.1: GET /api/customer/order/cancel-reasons returns reason options");
      const res = await makeRequest("/api/customer/order/cancel-reasons");

      if (res.status === 200 && res.body?.status === true && Array.isArray(res.body.reasons) && res.body.reasons.length > 0) {
        console.log(`   ✅ PASS: Retrieved ${res.body.reasons.length} cancellation reason options\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 9.1]:", e.message, "\n");
      failed++;
    }

    // Test 9.2: Return reasons API
    try {
      console.log("▶ Test 9.2: GET /api/customer/order/return-reasons returns return options");
      const res = await makeRequest("/api/customer/order/return-reasons");

      if (
        res.status === 200 &&
        res.body?.status === true &&
        res.body.return_window_days === 14 &&
        Array.isArray(res.body.reasons) &&
        res.body.reasons.length > 0
      ) {
        console.log(`   ✅ PASS: Retrieved return options with 14-day policy verified\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 9.2]:", e.message, "\n");
      failed++;
    }

    // Test 9.3: Order history timeline API
    try {
      console.log("▶ Test 9.3: GET /api/customer/order/history returns timeline entries");
      const res = await makeRequest(`/api/customer/order/history?sale_order_id=${codSaleOrderId}`);

      if (res.status === 200 && res.body?.status === true && Array.isArray(res.body.data?.history_timeline)) {
        console.log(`   ✅ PASS: Retrieved history timeline with ${res.body.data.history_timeline.length} events\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 9.3]:", e.message, "\n");
      failed++;
    }

  } catch (err) {
    console.error("Fatal Test Suite Error:", err);
  } finally {
    console.log("🧹 Cleaning up temporary test records...");
    for (const callback of cleanupCallbacks.reverse()) {
      try {
        await callback();
      } catch (e) {
        // ignore cleanup error
      }
    }

    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }

    console.log("\n================================================================================");
    console.log(`  CHECKOUT & ORDERS TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
    console.log("================================================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
    process.exit(0);
  }
}

runCheckoutOrdersTestSuite();
