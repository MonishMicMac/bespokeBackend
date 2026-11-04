import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import sequelize from "../config/db.js";
import {
  UserFavourites,
  ProductPrice,
  Product,
  ProductMaterial,
  ProductMaterialImage,
  ProductImage,
  UserLogin,
  VendorLogin,
  UserCartItem,
  Category,
  Subcategory,
} from "../models/setupAssociations.js";
import userWishlistRoutes from "../src/routes/userWishlistRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use("/api", userWishlistRoutes);
app.use("/", userWishlistRoutes);

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
  console.log("  WISHLIST / FAVORITES APIS - COMPREHENSIVE AUTOMATED TEST SUITE                ");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;
  const testCleanups = [];

  try {
    await sequelize.authenticate();
    console.log("✅ Database Connected Successfully for Wishlist Testing\n");

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
    const testInactiveUserId = 88880000 + Math.floor(Math.random() * 10000) + 2;
    const testVendorId = 77770000 + Math.floor(Math.random() * 10000);

    // Setup Test Users
    await UserLogin.create({
      id: testUserId,
      username: `fav_user_${timestamp}`,
      email: `fav_user_${timestamp}@example.com`,
      mobile: `99${timestamp.toString().slice(-8)}`,
      action: "0",
    });
    testCleanups.push(async () => {
      await UserLogin.destroy({ where: { id: testUserId } });
    });

    await UserLogin.create({
      id: testOtherUserId,
      username: `fav_other_${timestamp}`,
      email: `fav_other_${timestamp}@example.com`,
      mobile: `98${timestamp.toString().slice(-8)}`,
      action: "0",
    });
    testCleanups.push(async () => {
      await UserLogin.destroy({ where: { id: testOtherUserId } });
    });

    await UserLogin.create({
      id: testInactiveUserId,
      username: `fav_inactive_${timestamp}`,
      email: `fav_inactive_${timestamp}@example.com`,
      mobile: `97${timestamp.toString().slice(-8)}`,
      action: "1", // Inactive user
    });
    testCleanups.push(async () => {
      await UserLogin.destroy({ where: { id: testInactiveUserId } });
    });

    // Setup Test Vendor
    await VendorLogin.create({
      id: testVendorId,
      shop_name: `Boutique Royal ${timestamp}`,
      username: `boutique_${timestamp}`,
      email: `boutique_${timestamp}@example.com`,
      mobile: `96${timestamp.toString().slice(-8)}`,
      vendor_type: "1",
      approval_status: "1",
      action: "0",
    });
    testCleanups.push(async () => {
      await VendorLogin.destroy({ where: { id: testVendorId } });
    });

    // Setup Active Product 1 (with main image)
    const activeProduct = await Product.create({
      room_id: "1",
      product_id: `PROD_FAV1_${timestamp}`,
      vendor_id: String(testVendorId),
      product_name: `Bespoke Silk Saree ${timestamp}`,
      category: "Women",
      subcategory: "Sarees",
      action: "0",
      main_image: "saree_main.jpg",
    });
    testCleanups.push(async () => {
      await Product.destroy({ where: { id: activeProduct.id } });
    });

    // Variant 1 for Product 1 (Size: Free Size)
    const priceVariant1 = await ProductPrice.create({
      product_id: activeProduct.id,
      size: "Free Size",
      actual_price: 18000,
      discount_price: 14999,
      qty: 12,
      is_out_stock: "0",
    });
    testCleanups.push(async () => {
      await ProductPrice.destroy({ where: { id: priceVariant1.id } });
    });

    // Variant 2 for Product 1 (Size: Custom Stitched)
    const priceVariant2 = await ProductPrice.create({
      product_id: activeProduct.id,
      size: "Custom Stitched",
      actual_price: 22000,
      discount_price: 19999,
      qty: 8,
      is_out_stock: "0",
    });
    testCleanups.push(async () => {
      await ProductPrice.destroy({ where: { id: priceVariant2.id } });
    });

    // Product 2: Inactive Product (action = '1')
    const inactiveProduct = await Product.create({
      room_id: "1",
      product_id: `PROD_INACT_${timestamp}`,
      vendor_id: String(testVendorId),
      product_name: `Inactive Product ${timestamp}`,
      category: "Women",
      action: "1",
    });
    testCleanups.push(async () => {
      await Product.destroy({ where: { id: inactiveProduct.id } });
    });

    const inactivePriceVariant = await ProductPrice.create({
      product_id: inactiveProduct.id,
      size: "M",
      actual_price: 5000,
      discount_price: 4500,
      qty: 5,
      is_out_stock: "0",
    });
    testCleanups.push(async () => {
      await ProductPrice.destroy({ where: { id: inactivePriceVariant.id } });
    });

    // Cleanup Wishlist & Cart records for test users
    testCleanups.push(async () => {
      await UserFavourites.destroy({ where: { user_id: [testUserId, testOtherUserId, testInactiveUserId] } });
      await UserCartItem.destroy({ where: { user_id: [testUserId, testOtherUserId, testInactiveUserId] } });
    });

    // =========================================================================
    // API 1: Get Customer Favorites (GET /api/user-favorites/:user_id)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("API 1: Get Customer Favorites (GET /api/user-favorites/:user_id)");
    console.log("--------------------------------------------------------------------------------");

    // Test 1.1: Empty wishlist returns HTTP 200 with message "No favorite products found"
    try {
      console.log("▶ Test 1.1: Empty wishlist returns HTTP 200 { status: 'false', message: 'No favorite products found' }");
      const res = await makeRequest(`/api/user-favorites/${testUserId}`);
      if (res.status === 200 && res.body?.status === "false" && res.body.message === "No favorite products found") {
        console.log(`   ✅ PASS: Returns HTTP 200 with status='false' and exact Laravel message\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.1]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // API 2: Add Favorite (POST /api/add/favorite)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("API 2: Add Favorite (POST /api/add/favorite)");
    console.log("--------------------------------------------------------------------------------");

    let createdWishlistId = null;

    // Test 2.1: Add valid product variant
    try {
      console.log("▶ Test 2.1: Add a valid product variant to wishlist");
      const res = await makeRequest("/api/add/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: testUserId,
          price_id: priceVariant1.id,
          product_id: activeProduct.id,
        }),
      });

      if (res.status === 200 && res.body?.status === "true" && res.body.message === "Favorite added successfully." && res.body.data?.id) {
        createdWishlistId = res.body.data.id;
        console.log(`   ✅ PASS: Created wishlist record #${createdWishlistId} with price_id ${res.body.data.price_id}\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.1]:", e.message, "\n");
      failed++;
    }

    // Test 2.2: Add the same variant twice (Duplicate prevention)
    try {
      console.log("▶ Test 2.2: Add same variant twice returns 'Favorite already exists.'");
      const res = await makeRequest("/api/add/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: testUserId,
          price_id: priceVariant1.id,
        }),
      });

      if (res.status === 200 && res.body?.status === "true" && res.body.message === "Favorite already exists." && res.body.data?.id === createdWishlistId) {
        console.log(`   ✅ PASS: Preserved duplicate behavior! Returns status='true', 'Favorite already exists.'\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.2]:", e.message, "\n");
      failed++;
    }

    // Test 2.3: Add a different variant of the SAME product
    try {
      console.log("▶ Test 2.3: Add different variant of the same product succeeds");
      const res = await makeRequest("/api/add/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: testUserId,
          price_id: priceVariant2.id, // Custom Stitched variant
        }),
      });

      if (res.status === 200 && res.body?.status === "true" && res.body.message === "Favorite added successfully." && res.body.data?.price_id === priceVariant2.id) {
        console.log(`   ✅ PASS: Variant-level wishlist verified! Created second entry for variant #${priceVariant2.id}\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.3]:", e.message, "\n");
      failed++;
    }

    // Test 2.4: Inactive user rejected
    try {
      console.log("▶ Test 2.4: Inactive user (action = '1') is rejected");
      const res = await makeRequest("/api/add/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: testInactiveUserId,
          price_id: priceVariant1.id,
        }),
      });

      if (res.status === 200 && res.body?.status === "false" && res.body.message === "User is invalid or not active.") {
        console.log(`   ✅ PASS: Inactive user rejected with exact Laravel message\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.4]:", e.message, "\n");
      failed++;
    }

    // Test 2.5: Inactive product rejected
    try {
      console.log("▶ Test 2.5: Inactive product variant is rejected");
      const res = await makeRequest("/api/add/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: testUserId,
          price_id: inactivePriceVariant.id,
        }),
      });

      if (res.status === 200 && res.body?.status === "false" && res.body.message === "Product is invalid or not active.") {
        console.log(`   ✅ PASS: Inactive product rejected with exact Laravel message\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.5]:", e.message, "\n");
      failed++;
    }

    // Test 2.6: Supplied product_id mismatch with price_id
    try {
      console.log("▶ Test 2.6: Mismatched product_id rejected with HTTP 400");
      const res = await makeRequest("/api/add/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: testUserId,
          price_id: priceVariant1.id,
          product_id: 999999, // Mismatched product ID!
        }),
      });

      if (res.status === 400 && res.body?.status === "false" && res.body.message?.includes("does not match")) {
        console.log(`   ✅ PASS: Product/variant mismatch blocked with HTTP 400\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.6]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // Test 1.2: Get Active Wishlist with Items & Cart Check
    // =========================================================================
    try {
      console.log("▶ Test 1.2: Retrieve customer wishlist with active variants and verify iscarted indicator");
      // Add a cart item for activeProduct to verify iscarted = true
      await UserCartItem.create({
        user_id: testUserId,
        price_id: priceVariant1.id,
        cart_qty: 1,
        action: "0",
      });

      const res = await makeRequest(`/api/user-favorites/${testUserId}`);
      if (
        res.status === 200 &&
        res.body?.status === "true" &&
        Array.isArray(res.body.data) &&
        res.body.data.length === 2
      ) {
        const item1 = res.body.data.find((f) => f.price_id === priceVariant1.id);
        if (
          item1 &&
          item1.wishlist_id === createdWishlistId &&
          item1.product_id === activeProduct.id &&
          item1.iscarted === true &&
          item1.vendor_name === `Boutique Royal ${timestamp}` &&
          item1.image?.includes("saree_main.jpg")
        ) {
          console.log(`   ✅ PASS: Wishlist items retrieved! iscarted: ${item1.iscarted}, vendor: "${item1.vendor_name}", image: "${item1.image}"\n`);
          passed++;
        } else {
          throw new Error(`Wishlist item structure mismatch: ${JSON.stringify(item1)}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.2]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // API 3: Remove Favorite (POST /api/remove/favorite)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("API 3: Remove Favorite (POST /api/remove/favorite)");
    console.log("--------------------------------------------------------------------------------");

    // Test 3.1: Remove valid wishlist entry
    try {
      console.log("▶ Test 3.1: Remove a valid wishlist entry");
      const res = await makeRequest("/api/remove/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: testUserId,
          wishlist_id: createdWishlistId,
          product_id: activeProduct.id,
        }),
      });

      if (res.status === 200 && res.body?.status === "true" && res.body.message === "Favorite removed successfully.") {
        const inDb = await UserFavourites.findByPk(createdWishlistId);
        if (inDb === null) {
          console.log(`   ✅ PASS: Entry physically removed from database! HTTP 200 with "Favorite removed successfully."\n`);
          passed++;
        } else {
          throw new Error("Record was not physically deleted from database");
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.1]:", e.message, "\n");
      failed++;
    }

    // Test 3.2: Remove already removed or non-existent favorite
    try {
      console.log("▶ Test 3.2: Remove non-existent favorite returns 'Favorite not found or already removed.'");
      const res = await makeRequest("/api/remove/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: testUserId,
          wishlist_id: createdWishlistId, // already deleted!
        }),
      });

      if (res.status === 200 && res.body?.status === "false" && res.body.message === "Favorite not found or already removed.") {
        console.log(`   ✅ PASS: Preserved exact Laravel response: "Favorite not found or already removed."\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.2]:", e.message, "\n");
      failed++;
    }

    // Test 3.3: Attempt to remove another customer's wishlist entry (Security check)
    try {
      console.log("▶ Test 3.3: Security Check: Unauthorized customer cannot remove another user's favorite");
      // Create a favorite for testUserId
      const userFav = await UserFavourites.create({
        user_id: testUserId,
        price_id: priceVariant1.id,
        product_id: activeProduct.id,
        action: "0",
      });

      // Try removing it with testOtherUserId
      const res = await makeRequest("/api/remove/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: testOtherUserId, // Attacker's user ID!
          wishlist_id: userFav.id,
        }),
      });

      if (res.status === 403 && res.body?.status === "false" && res.body.message?.includes("Unauthorized")) {
        console.log(`   ✅ PASS: Cross-customer IDOR deletion blocked with HTTP 403\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.3]:", e.message, "\n");
      failed++;
    }

    // Test 3.4: Verify product and price are NOT deleted on favorite removal
    try {
      console.log("▶ Test 3.4: Confirm removing favorite does NOT delete product or price variant records");
      const prodCheck = await Product.findByPk(activeProduct.id);
      const priceCheck = await ProductPrice.findByPk(priceVariant1.id);

      if (prodCheck && priceCheck) {
        console.log(`   ✅ PASS: Product and ProductPrice records intact in database\n`);
        passed++;
      } else {
        throw new Error("Product or price record was erroneously deleted");
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.4]:", e.message, "\n");
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
    await sequelize.close();

    console.log("\n================================================================================");
    console.log(`  WISHLIST / FAVORITES TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
    console.log("================================================================================\n");

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runTests();
