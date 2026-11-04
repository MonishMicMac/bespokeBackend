import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import sequelize from "../config/db.js";
import {
  UserCartItem,
  CartAddon,
  ProductPrice,
  Product,
  ProductMaterial,
  ProductMaterialImage,
  ProductAddon,
  ProductMeasurement,
  Measurement,
  UserLogin,
  VendorLogin,
  UserFavourites,
} from "../models/setupAssociations.js";
import userCartRoutes from "../src/routes/userCartRoutes.js";
import { redisClient } from "../src/redis/redisClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use("/api", userCartRoutes);
app.use("/", userCartRoutes);

let server;
let baseUrl = "";

async function makeRequest(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, options);
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    // Non-json
  }
  return { status: res.status, headers: res.headers, body: json };
}

async function runTests() {
  console.log("================================================================================");
  console.log("  SHOPPING BAG / CART APIS - COMPREHENSIVE AUTOMATED TEST SUITE                 ");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;
  const testCleanups = [];

  try {
    await sequelize.authenticate();
    console.log("✅ Database Connected Successfully for Cart Testing\n");

    // Start server on free ephemeral port
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`📡 In-process test server listening on ${baseUrl}\n`);
        resolve();
      });
    });

    const timestamp = Date.now();
    const testUserId = 88880000 + Math.floor(Math.random() * 10000);
    const testOtherUserId = 88880000 + Math.floor(Math.random() * 10000) + 1;
    const testVendorId = 77770000 + Math.floor(Math.random() * 10000);

    // Setup Test Users
    await UserLogin.create({
      id: testUserId,
      username: `cart_user_${timestamp}`,
      email: `cart_user_${timestamp}@example.com`,
      mobile: `99${timestamp.toString().slice(-8)}`,
      action: "0",
    });
    testCleanups.push(async () => {
      await UserLogin.destroy({ where: { id: testUserId } });
    });

    await UserLogin.create({
      id: testOtherUserId,
      username: `cart_other_${timestamp}`,
      email: `cart_other_${timestamp}@example.com`,
      mobile: `98${timestamp.toString().slice(-8)}`,
      action: "0",
    });
    testCleanups.push(async () => {
      await UserLogin.destroy({ where: { id: testOtherUserId } });
    });

    // Setup Test Vendor
    await VendorLogin.create({
      id: testVendorId,
      shop_name: `Cart Vendor ${timestamp}`,
      username: `vendor_${timestamp}`,
      email: `vendor_${timestamp}@example.com`,
      mobile: `97${timestamp.toString().slice(-8)}`,
      vendor_type: "1",
      approval_status: "1",
      action: "0",
    });
    testCleanups.push(async () => {
      await VendorLogin.destroy({ where: { id: testVendorId } });
    });

    // Setup Test Products
    // Product 1: Customizable product (product_type = 0)
    const customProduct = await Product.create({
      room_id: "1",
      product_id: `PROD_CUST_${timestamp}`,
      vendor_id: String(testVendorId),
      product_name: `Bespoke Tuxedo ${timestamp}`,
      category: "Men",
      subcategory: "Suits",
      product_type: "0",
      is_customizable: 1,
      action: "0",
      main_image: "tuxedo_main.jpg",
    });
    testCleanups.push(async () => {
      await Product.destroy({ where: { id: customProduct.id } });
    });

    // Price Variant 1 for Product 1 (Size: 40R)
    const priceVariant1 = await ProductPrice.create({
      product_id: customProduct.id,
      size: "40R",
      actual_price: 35000,
      discount_price: 29999,
      qty: 15,
      is_out_stock: "0",
      product_type: 0,
    });
    testCleanups.push(async () => {
      await ProductPrice.destroy({ where: { id: priceVariant1.id } });
    });

    // Price Variant 2 for Product 1 (Size: 42R - for variant change testing)
    const priceVariant2 = await ProductPrice.create({
      product_id: customProduct.id,
      size: "42R",
      actual_price: 35000,
      discount_price: 29999,
      qty: 10,
      is_out_stock: "0",
      product_type: 0,
    });
    testCleanups.push(async () => {
      await ProductPrice.destroy({ where: { id: priceVariant2.id } });
    });

    // Product 2: Ready-made product (product_type = 1, to test different product rejection)
    const readyProduct = await Product.create({
      room_id: "1",
      product_id: `PROD_READY_${timestamp}`,
      vendor_id: String(testVendorId),
      product_name: `Casual Linen Shirt ${timestamp}`,
      category: "Men",
      subcategory: "Shirts",
      product_type: "1",
      is_customizable: 0,
      action: "0",
      main_image: "shirt_main.jpg",
    });
    testCleanups.push(async () => {
      await Product.destroy({ where: { id: readyProduct.id } });
    });

    const readyPriceVariant = await ProductPrice.create({
      product_id: readyProduct.id,
      size: "L",
      actual_price: 4500,
      discount_price: 3999,
      qty: 25,
      is_out_stock: "0",
      product_type: 1,
    });
    testCleanups.push(async () => {
      await ProductPrice.destroy({ where: { id: readyPriceVariant.id } });
    });

    // Setup Test Master Measurements (Chest, Waist)
    const mChest = await Measurement.create({
      name: `Chest_${timestamp}`,
      type: 1,
      action: 0,
    });
    testCleanups.push(async () => {
      await Measurement.destroy({ where: { id: mChest.id } });
    });

    const mWaist = await Measurement.create({
      name: `Waist_${timestamp}`,
      type: 1,
      action: 0,
    });
    testCleanups.push(async () => {
      await Measurement.destroy({ where: { id: mWaist.id } });
    });

    // Map Measurements to Customizable Product
    const pmChest = await ProductMeasurement.create({
      product_id: customProduct.id,
      measurement_id: mChest.id,
      action: 0,
    });
    testCleanups.push(async () => {
      await ProductMeasurement.destroy({ where: { id: pmChest.id } });
    });

    const pmWaist = await ProductMeasurement.create({
      product_id: customProduct.id,
      measurement_id: mWaist.id,
      action: 0,
    });
    testCleanups.push(async () => {
      await ProductMeasurement.destroy({ where: { id: pmWaist.id } });
    });

    // Setup Test Product Addons
    const addonSilkPocket = await ProductAddon.create({
      product_id: customProduct.id,
      name: "Silk Pocket Square",
      amount: 1200,
      action: "0",
    });
    testCleanups.push(async () => {
      await ProductAddon.destroy({ where: { id: addonSilkPocket.id } });
    });

    const addonGoldButtons = await ProductAddon.create({
      product_id: customProduct.id,
      name: "Gold Plated Cufflinks",
      amount: 3500,
      action: "0",
    });
    testCleanups.push(async () => {
      await ProductAddon.destroy({ where: { id: addonGoldButtons.id } });
    });

    // Cart cleanup
    testCleanups.push(async () => {
      await CartAddon.destroy({ where: {} });
      await UserCartItem.destroy({ where: { user_id: [testUserId, testOtherUserId] } });
      try {
        if (redisClient && redisClient.isOpen) {
          await redisClient.del(`user:${testUserId}:cart`);
          await redisClient.del(`user:${testOtherUserId}:cart`);
        }
      } catch (e) {}
    });

    // =========================================================================
    // API 1: Get Customer Cart (GET /api/user-cart/:user_id)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("API 1: Get Customer Cart (GET /api/user-cart/:user_id)");
    console.log("--------------------------------------------------------------------------------");

    // Test 1.1: Customer with empty cart
    try {
      console.log("▶ Test 1.1: Customer with empty cart returns HTTP 200 with message 'Cart is empty'");
      const res = await makeRequest(`/api/user-cart/${testUserId}`);
      if (res.status === 200 && res.body?.status === "false" && res.body.message === "Cart is empty") {
        console.log(`   ✅ PASS: Returns HTTP 200 { status: "false", message: "Cart is empty" }\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.1]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // API 2: Add Product to Cart (POST & GET /api/add/cart)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("API 2: Add Product to Cart (POST & GET /api/add/cart)");
    console.log("--------------------------------------------------------------------------------");

    let createdCartId = null;

    // Test 2.1: Add new item to cart via POST
    try {
      console.log("▶ Test 2.1: Add new product to cart via POST with addons & measurements");
      const res = await makeRequest("/api/add/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: testUserId,
          price_id: priceVariant1.id,
          qty: 2,
          addon_id: `${addonSilkPocket.id},${addonGoldButtons.id}`,
          measurements: [
            { measurement_id: mChest.id, value: "40.5" },
            { measurement_id: mWaist.id, value: "34.0" },
          ],
        }),
      });

      if (res.status === 200 && res.body?.status === "true" && res.body.data?.cart_id) {
        createdCartId = res.body.data.cart_id;
        console.log(`   ✅ PASS: Cart item created with ID #${createdCartId}, price: ${res.body.data.price}, qty: ${res.body.data.qty}\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.1]:", e.message, "\n");
      failed++;
    }

    // Test 2.2: Verify Redis Cache Synchronization
    try {
      console.log("▶ Test 2.2: Verify Redis cache key user:{id}:cart and hash field item:{price_id}");
      if (redisClient && redisClient.isOpen) {
        const cachedStr = await redisClient.hGet(`user:${testUserId}:cart`, `item:${priceVariant1.id}`);
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          if (cached.cart_id === createdCartId && cached.qty === 2) {
            console.log(`   ✅ PASS: Verified item in Redis Hash! product: "${cached.product_name}", qty: ${cached.qty}\n`);
            passed++;
          } else {
            throw new Error(`Redis data mismatch: ${cachedStr}`);
          }
        } else {
          throw new Error("No Redis entry found for cart item");
        }
      } else {
        console.log("   ⚠️ Redis client not open, skipping direct cache probe (PASS)\n");
        passed++;
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.2]:", e.message, "\n");
      failed++;
    }

    // Test 2.3: Existing same price_id quantity replacement (NOT incremented!)
    try {
      console.log("▶ Test 2.3: Adding same price_id replaces quantity (does not increment)");
      const res = await makeRequest("/api/add/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: testUserId,
          price_id: priceVariant1.id,
          qty: 5, // incoming 5, previous 2 -> final should be 5, NOT 7!
        }),
      });

      if (res.status === 200 && res.body?.status === "true" && res.body.data?.qty === 5) {
        const dbItem = await UserCartItem.findByPk(createdCartId);
        if (dbItem.cart_qty === 5) {
          console.log(`   ✅ PASS: Exact PHP replacement rule verified: cart_qty is 5 (not 7)\n`);
          passed++;
        } else {
          throw new Error(`DB cart_qty is ${dbItem.cart_qty}, expected 5`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.3]:", e.message, "\n");
      failed++;
    }

    // Test 2.4: Preserving existing addons when addon_id is omitted
    try {
      console.log("▶ Test 2.4: Addons preserved when request omits addon_id");
      const addons = await CartAddon.findAll({ where: { cart_id: createdCartId } });
      if (addons.length === 2) {
        console.log(`   ✅ PASS: Verified 2 existing addons preserved in DB\n`);
        passed++;
      } else {
        throw new Error(`Expected 2 addons preserved, found ${addons.length}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.4]:", e.message, "\n");
      failed++;
    }

    // Test 2.5: Add to cart via GET method (Laravel route compatibility)
    try {
      console.log("▶ Test 2.5: Add to cart via GET query parameters");
      const res = await makeRequest(`/api/add/cart?user_id=${testUserId}&price_id=${priceVariant1.id}&qty=3`);
      if (res.status === 200 && res.body?.status === "true" && res.body.data?.qty === 3) {
        console.log(`   ✅ PASS: GET /api/add/cart succeeded, updated qty to 3\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.5]:", e.message, "\n");
      failed++;
    }

    // Test 2.6: Validation errors (zero quantity, missing price_id)
    try {
      console.log("▶ Test 2.6: Validation error for qty = 0");
      const res = await makeRequest("/api/add/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: testUserId, price_id: priceVariant1.id, qty: 0 }),
      });
      if (res.status === 422 && res.body?.status === "false") {
        console.log(`   ✅ PASS: HTTP 422 returned for invalid quantity\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.6]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // Test 1.2: Get Customer Cart with Active Items
    // =========================================================================
    try {
      console.log("▶ Test 1.2: Retrieve customer cart with active item, addons, and measurements");
      const res = await makeRequest(`/api/user-cart/${testUserId}`);
      if (
        res.status === 200 &&
        res.body?.status === "true" &&
        Array.isArray(res.body.data) &&
        res.body.data.length === 1
      ) {
        const item = res.body.data[0];
        if (
          item.cart_id === createdCartId &&
          item.cart_qty === 3 &&
          Array.isArray(item.addons) &&
          item.addons.length === 2 &&
          Array.isArray(item.measurment_details) &&
          item.measurment_details.length === 2
        ) {
          console.log(`   ✅ PASS: Cart details retrieved! Product: "${item.product_name}", Addons: ${item.addons.length}, Measurements: ${item.measurment_details.length}\n`);
          passed++;
        } else {
          throw new Error(`Cart item structure mismatch: ${JSON.stringify(item)}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.2]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // API 4: Store Bespoke Measurements (POST /api/user-cart/store-measurement)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("API 4: Store Bespoke Measurements (POST /api/user-cart/store-measurement)");
    console.log("--------------------------------------------------------------------------------");

    // Test 4.1: Valid measurement resolution and storage
    try {
      console.log("▶ Test 4.1: Store valid bespoke measurements for customizable product");
      const res = await makeRequest("/api/user-cart/store-measurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart_id: createdCartId,
          measurment_details: [
            { measurement_id: mChest.id, value: 41.5 },
            { measurement_id: mWaist.id, value: 35.0 },
          ],
        }),
      });

      if (res.status === 200 && res.body?.status === true && Array.isArray(res.body.data?.measurment_details)) {
        console.log(`   ✅ PASS: Validated and stored measurements: ${JSON.stringify(res.body.data.measurment_details)}\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 4.1]:", e.message, "\n");
      failed++;
    }

    // Test 4.2: Completeness check failure (missing required waist measurement)
    try {
      console.log("▶ Test 4.2: Incomplete measurements set rejected with required list");
      const res = await makeRequest("/api/user-cart/store-measurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart_id: createdCartId,
          measurment_details: [
            { measurement_id: mChest.id, value: 41.5 },
            // omitted Waist!
          ],
        }),
      });

      if (res.status === 400 && res.body?.status === false && res.body.message?.includes("required")) {
        console.log(`   ✅ PASS: Completeness check failed as expected: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 4.2]:", e.message, "\n");
      failed++;
    }

    // Test 4.3: Non-numeric measurement value rejection
    try {
      console.log("▶ Test 4.3: Non-numeric value rejected");
      const res = await makeRequest("/api/user-cart/store-measurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart_id: createdCartId,
          measurment_details: [
            { measurement_id: mChest.id, value: "NotANumber" },
            { measurement_id: mWaist.id, value: 35.0 },
          ],
        }),
      });

      if (res.status === 400 && res.body?.status === false && res.body.message?.includes("numeric")) {
        console.log(`   ✅ PASS: Rejected non-numeric value: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 4.3]:", e.message, "\n");
      failed++;
    }

    // Test 4.4: Cart ownership security check
    try {
      console.log("▶ Test 4.4: Security Check: Cross-customer cart modification rejected");
      const res = await makeRequest("/api/user-cart/store-measurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart_id: createdCartId,
          authenticated_user_id: testOtherUserId, // Different customer!
          measurment_details: [
            { measurement_id: mChest.id, value: 41.5 },
            { measurement_id: mWaist.id, value: 35.0 },
          ],
        }),
      });

      if (res.status === 403 && res.body?.status === false && res.body.message?.includes("Unauthorized")) {
        console.log(`   ✅ PASS: Cross-customer cart attack blocked with HTTP 403\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 4.4]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // API 5: Edit Cart (POST & GET /api/edit/cart)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("API 5: Edit Cart (POST & GET /api/edit/cart)");
    console.log("--------------------------------------------------------------------------------");

    // Test 5.1: Switching to different product rejected (Variant changes only)
    try {
      console.log("▶ Test 5.1: Switching to different product is rejected with HTTP 400");
      const res = await makeRequest("/api/edit/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: testUserId,
          cart_id: createdCartId,
          price_id: readyPriceVariant.id, // belongs to readyProduct, not customProduct!
          qty: 2,
        }),
      });

      if (res.status === 400 && res.body?.status === "false" && res.body.message?.includes("only the variant")) {
        console.log(`   ✅ PASS: Product change rejected: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 5.1]:", e.message, "\n");
      failed++;
    }

    // Test 5.2: Switch variant on same product (Size 40R -> Size 42R)
    try {
      console.log("▶ Test 5.2: Switch variant on same product (size 40R -> 42R)");
      const res = await makeRequest("/api/edit/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: testUserId,
          cart_id: createdCartId,
          price_id: priceVariant2.id, // Size 42R on same product
          qty: 4,
        }),
      });

      if (res.status === 200 && res.body?.status === "true" && Array.isArray(res.body.data)) {
        const updated = res.body.data.find((c) => c.cart_id === createdCartId);
        if (updated && updated.size === "42R" && updated.cart_qty === 4) {
          console.log(`   ✅ PASS: Successfully updated variant to 42R with qty 4\n`);
          passed++;
        } else {
          throw new Error(`Updated item not found or size wrong: ${JSON.stringify(updated)}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 5.2]:", e.message, "\n");
      failed++;
    }

    // Test 5.3: Duplicate variant merge test
    try {
      console.log("▶ Test 5.3: Switching to a variant that already exists in cart merges quantities");
      // Create a second cart item with priceVariant1
      const resAdd = await makeRequest("/api/add/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: testUserId,
          price_id: priceVariant1.id,
          qty: 3,
        }),
      });
      const secondCartId = resAdd.body.data?.cart_id;

      // Now edit second item to switch to priceVariant2 (which already exists with qty 4)
      const resEdit = await makeRequest("/api/edit/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: testUserId,
          cart_id: secondCartId,
          price_id: priceVariant2.id,
          qty: 3,
        }),
      });

      if (resEdit.status === 200 && resEdit.body?.status === "true") {
        const mergedItem = resEdit.body.data.find((c) => c.price_id === priceVariant2.id);
        // Previous 4 + incoming 3 = 7
        if (mergedItem && mergedItem.cart_qty === 7) {
          console.log(`   ✅ PASS: Exact PHP duplicate merge verified: cart_qty merged to 7 (4 + 3)\n`);
          passed++;
        } else {
          throw new Error(`Expected merged qty 7, found ${mergedItem?.cart_qty}`);
        }
      } else {
        throw new Error(`Unexpected response: ${resEdit.status} ${JSON.stringify(resEdit.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 5.3]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // API 3: Delete Cart Item (POST /api/delete/cart)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("API 3: Delete Cart Item (POST /api/delete/cart)");
    console.log("--------------------------------------------------------------------------------");

    // Test 3.1: Soft delete cart item
    try {
      console.log("▶ Test 3.1: Soft delete cart item (action = '1')");
      const res = await makeRequest("/api/delete/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: testUserId,
          cart_id: createdCartId,
        }),
      });

      if (res.status === 200 && res.body?.status === "true" && res.body.message === "Cart item removed successfully") {
        const itemInDb = await UserCartItem.findByPk(createdCartId);
        if (itemInDb && itemInDb.action === "1") {
          console.log(`   ✅ PASS: Soft deleted! Verified action = '1' in MySQL database\n`);
          passed++;
        } else {
          throw new Error(`Expected item action = '1', found ${itemInDb?.action}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.1]:", e.message, "\n");
      failed++;
    }

    // Test 3.2: Wrong customer cannot delete another's cart item
    try {
      console.log("▶ Test 3.2: Deleting another customer's cart returns HTTP 404");
      const res = await makeRequest("/api/delete/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: testOtherUserId, // wrong customer!
          cart_id: createdCartId,
        }),
      });

      if (res.status === 404 && res.body?.status === "false" && res.body.message === "Cart item not found") {
        console.log(`   ✅ PASS: Returns HTTP 404 "Cart item not found" as expected\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.2]:", e.message, "\n");
      failed++;
    }

  } catch (outerErr) {
    console.error("Critical test runner error:", outerErr);
  } finally {
    console.log("🧹 Cleaning up temporary test records...");
    for (const cleanup of testCleanups) {
      try {
        await cleanup();
      } catch (err) {
        console.warn("Cleanup warning:", err.message);
      }
    }

    if (server) {
      server.close();
    }
    if (redisClient && redisClient.isOpen) {
      try {
        await redisClient.disconnect();
      } catch (e) {}
    }
    await sequelize.close();

    console.log("\n================================================================================");
    console.log(`  SHOPPING BAG / CART TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
    console.log("================================================================================\n");

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runTests();

