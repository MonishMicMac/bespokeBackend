import http from "http";
import express from "express";
import sharp from "sharp";
import sequelize from "../config/db.js";
import {
  UserLogin,
  Product,
  Order,
  SaleOrder,
  SaleOrderReview,
  SaleOrderReviewImage,
  CustomerReview,
  ReviewImage,
  ProductReviewAggregate,
} from "../models/setupAssociations.js";
import reviewRoutes from "../src/routes/reviewRoutes.js";

// Helper for making HTTP requests
function makeRequest(serverUrl, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const headers = options.headers || {};

    if (options.body && typeof options.body === "object" && !Buffer.isBuffer(options.body)) {
      headers["Content-Type"] = "application/json";
    }

    const reqOptions = {
      method: options.method || "GET",
      headers,
    };

    const req = http.request(url, reqOptions, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });

    req.on("error", reject);

    if (options.body) {
      if (Buffer.isBuffer(options.body)) {
        req.write(options.body);
      } else if (typeof options.body === "string") {
        req.write(options.body);
      } else {
        req.write(JSON.stringify(options.body));
      }
    }
    req.end();
  });
}

// Multipart helper
function buildMultipartBody(fields = {}, files = []) {
  const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
  const chunks = [];

  for (const [key, val] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`)
    );
  }

  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\nContent-Type: ${file.mimetype}\r\n\r\n`
      )
    );
    chunks.push(file.buffer);
    chunks.push(Buffer.from("\r\n"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat(chunks),
  };
}

async function runTests() {
  console.log("================================================================================");
  console.log("  CUSTOMER REVIEWS APIS - COMPREHENSIVE AUTOMATED TEST SUITE                   ");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  // Initialize express app
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));
  app.use("/api", reviewRoutes);
  app.use("/", reviewRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`📡 In-process test server listening on ${baseUrl}\n`);

  const timestamp = Date.now();
  const cleanupCallbacks = [];
  let testUser = null;
  let testOtherUser = null;

  try {
    // -------------------------------------------------------------------------
    // SEED TEST DATA
    // -------------------------------------------------------------------------
    console.log("🌱 Seeding test database records...");

    // Test User 1
    testUser = await UserLogin.create({
      username: `ReviewUser_${timestamp}`,
      email: `review_${timestamp}@test.com`,
      mobile: `95${String(timestamp).slice(-8)}`,
      action: "0",
    });
    cleanupCallbacks.push(async () => {
      await UserLogin.destroy({ where: { id: testUser.id } });
    });

    // Test User 2 (for authorization / isolation testing)
    testOtherUser = await UserLogin.create({
      username: `OtherReviewUser_${timestamp}`,
      email: `other_rev_${timestamp}@test.com`,
      mobile: `94${String(timestamp).slice(-8)}`,
      action: "0",
    });
    cleanupCallbacks.push(async () => {
      await UserLogin.destroy({ where: { id: testOtherUser.id } });
    });

    // Test Product
    const testProduct = await Product.create({
      room_id: "1",
      category: "Men",
      product_name: `Reviewable Shirt ${timestamp}`,
      product_id: `PROD_REV_${timestamp}`,
      vendor_id: "1",
      product_type: "1",
      is_customizable: "0",
      actual_price: 2000,
      discount_price: 1800,
      is_active: 1,
    });
    cleanupCallbacks.push(async () => {
      await ProductReviewAggregate.destroy({ where: { product_id: testProduct.id } });
      await Product.destroy({ where: { id: testProduct.id } });
    });

    // Test Order for User 1
    const testOrder = await Order.create({
      order_id: `ORD_REV_${timestamp}`,
      user_id: testUser.id,
      address_id: 1,
      price: 1800,
      payable_price: 1850,
      order_history: "Approved",
      payment_mode: "COD",
    });
    cleanupCallbacks.push(async () => {
      await Order.destroy({ where: { id: testOrder.id } });
    });

    // Test SaleOrder for User 1
    const testSaleOrder = await SaleOrder.create({
      order_id: testOrder.id,
      product_id: testProduct.id,
      vendor_id: "1",
      size: "M",
      single_price: 1800,
      single_product_price: 1800,
      quantity: "1",
      amount: "1800",
      total_amount: "1800",
      seller_amount: 1350,
      bespoke_commision_amount: 450,
      bespoke_commision_percentage: "25",
      alter_amount: 0,
      is_customisable: "0",
      is_alter: "0",
      action: "0",
      order_history: "Approved",
    });
    cleanupCallbacks.push(async () => {
      const revs = await SaleOrderReview.findAll({ where: { sale_order_id: testSaleOrder.id } });
      for (const r of revs) {
        await SaleOrderReviewImage.destroy({ where: { review_id: r.id }, force: true });
        await r.destroy({ force: true });
      }
      await SaleOrder.destroy({ where: { id: testSaleOrder.id } });
    });

    // Test Order for Other User
    const otherOrder = await Order.create({
      order_id: `ORD_OTHER_${timestamp}`,
      user_id: testOtherUser.id,
      address_id: 1,
      price: 1800,
      payable_price: 1850,
      order_history: "Approved",
      payment_mode: "COD",
    });
    cleanupCallbacks.push(async () => {
      await Order.destroy({ where: { id: otherOrder.id } });
    });

    // Test SaleOrder for Other User
    const otherSaleOrder = await SaleOrder.create({
      order_id: otherOrder.id,
      product_id: testProduct.id,
      vendor_id: "1",
      size: "M",
      single_price: 1800,
      single_product_price: 1800,
      quantity: "1",
      amount: "1800",
      total_amount: "1800",
      seller_amount: 1350,
      bespoke_commision_amount: 450,
      bespoke_commision_percentage: "25",
      alter_amount: 0,
      is_customisable: "0",
      is_alter: "0",
      action: "0",
      order_history: "Approved",
    });
    cleanupCallbacks.push(async () => {
      const revs = await SaleOrderReview.findAll({ where: { sale_order_id: otherSaleOrder.id } });
      for (const r of revs) {
        await SaleOrderReviewImage.destroy({ where: { review_id: r.id }, force: true });
        await r.destroy({ force: true });
      }
      await SaleOrder.destroy({ where: { id: otherSaleOrder.id } });
    });

    // Generate valid sample image buffer using sharp
    const samplePngBuffer = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const sampleBase64 = `data:image/png;base64,${samplePngBuffer.toString("base64")}`;

    console.log("✅ Seed records created successfully.\n");

    // =========================================================================
    // SECTION 1: SALE-ORDER PRODUCT REVIEWS (POST /api/user/sale-order/review)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("SECTION 1: SALE-ORDER REVIEWS (POST /api/user/sale-order/review)");
    console.log("--------------------------------------------------------------------------------");

    let createdSaleOrderReviewId = null;

    // Test 1.1: Submit valid review
    try {
      console.log("▶ Test 1.1: Submit valid sale-order review returns HTTP 200");
      const res = await makeRequest(baseUrl, "/api/user/sale-order/review", {
        method: "POST",
        body: {
          sale_order_id: testSaleOrder.id,
          user_id: testUser.id,
          ratings: 5,
          review: "Excellent quality and perfect fit!",
        },
      });

      if (
        res.status === 200 &&
        res.body?.status === true &&
        res.body.data?.id &&
        parseFloat(res.body.data.ratings) === 5
      ) {
        createdSaleOrderReviewId = res.body.data.id;
        console.log(`   ✅ PASS: Review created! ID: #${createdSaleOrderReviewId}, Rating: 5/5\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.1]:", e.message, "\n");
      failed++;
    }

    // Test 1.2: Submit review with no comments (optional review text)
    try {
      console.log("▶ Test 1.2: Submit review with no comments succeeds");
      const res = await makeRequest(baseUrl, "/api/user/sale-order/review", {
        method: "POST",
        body: {
          sale_order_id: testSaleOrder.id,
          user_id: testUser.id,
          ratings: 4,
          review: null,
        },
      });

      if (res.status === 200 && res.body?.status === true && parseFloat(res.body.data?.ratings) === 4) {
        console.log(`   ✅ PASS: Review submitted without comments, updated to 4 stars\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.2]:", e.message, "\n");
      failed++;
    }

    // Test 1.3: Submit review with multiple multipart images
    try {
      console.log("▶ Test 1.3: Submit review with multiple multipart images");
      const multipart = buildMultipartBody(
        {
          sale_order_id: testSaleOrder.id,
          user_id: testUser.id,
          ratings: "5",
          review: "With multipart photos",
        },
        [
          {
            fieldname: "images",
            filename: "photo1.png",
            mimetype: "image/png",
            buffer: samplePngBuffer,
          },
          {
            fieldname: "images",
            filename: "photo2.png",
            mimetype: "image/png",
            buffer: samplePngBuffer,
          },
        ]
      );

      const res = await makeRequest(baseUrl, "/api/user/sale-order/review", {
        method: "POST",
        headers: { "Content-Type": multipart.contentType },
        body: multipart.body,
      });

      if (
        res.status === 200 &&
        res.body?.status === true &&
        Array.isArray(res.body.data?.images) &&
        res.body.data.images.length >= 2
      ) {
        console.log(`   ✅ PASS: Multipart images uploaded! Image count: ${res.body.data.images.length}\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.3]:", e.message, "\n");
      failed++;
    }

    // Test 1.4: Submit review with multiple base64 images
    try {
      console.log("▶ Test 1.4: Submit review with multiple base64 images");
      const res = await makeRequest(baseUrl, "/api/user/sale-order/review", {
        method: "POST",
        body: {
          sale_order_id: testSaleOrder.id,
          user_id: testUser.id,
          ratings: 5,
          review: "Updated with base64 images",
          images: [sampleBase64, sampleBase64],
        },
      });

      if (
        res.status === 200 &&
        res.body?.status === true &&
        Array.isArray(res.body.data?.images) &&
        res.body.data.images.length >= 2
      ) {
        console.log(`   ✅ PASS: Base64 images processed! Total review images: ${res.body.data.images.length}\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.4]:", e.message, "\n");
      failed++;
    }

    // Test 1.5: Submit same review again and verify update instead of duplicate
    try {
      console.log("▶ Test 1.5: Duplicate submission updates existing review record");
      const countBefore = await SaleOrderReview.count({
        where: { sale_order_id: testSaleOrder.id, user_id: testUser.id },
      });

      const res = await makeRequest(baseUrl, "/api/user/sale-order/review", {
        method: "POST",
        body: {
          sale_order_id: testSaleOrder.id,
          user_id: testUser.id,
          ratings: 5,
          review: "Final updated review text",
        },
      });

      const countAfter = await SaleOrderReview.count({
        where: { sale_order_id: testSaleOrder.id, user_id: testUser.id },
      });

      if (res.status === 200 && countBefore === 1 && countAfter === 1) {
        console.log(`   ✅ PASS: Review updated idempotently! DB count maintained at ${countAfter}\n`);
        passed++;
      } else {
        throw new Error(`Unexpected count: before=${countBefore}, after=${countAfter}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.5]:", e.message, "\n");
      failed++;
    }

    // Test 1.6: Rating below 1 rejected with HTTP 422
    try {
      console.log("▶ Test 1.6: Rating below 1 rejected with HTTP 422");
      const res = await makeRequest(baseUrl, "/api/user/sale-order/review", {
        method: "POST",
        body: {
          sale_order_id: testSaleOrder.id,
          user_id: testUser.id,
          ratings: 0,
        },
      });

      if (res.status === 422 && res.body?.status === false) {
        console.log(`   ✅ PASS: Rejected rating < 1: "${JSON.stringify(res.body.errors?.ratings)}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.6]:", e.message, "\n");
      failed++;
    }

    // Test 1.7: Rating above 5 rejected with HTTP 422
    try {
      console.log("▶ Test 1.7: Rating above 5 rejected with HTTP 422");
      const res = await makeRequest(baseUrl, "/api/user/sale-order/review", {
        method: "POST",
        body: {
          sale_order_id: testSaleOrder.id,
          user_id: testUser.id,
          ratings: 6,
        },
      });

      if (res.status === 422 && res.body?.status === false) {
        console.log(`   ✅ PASS: Rejected rating > 5: "${JSON.stringify(res.body.errors?.ratings)}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.7]:", e.message, "\n");
      failed++;
    }

    // Test 1.8: Nonexistent sale-order ID returns HTTP 404
    try {
      console.log("▶ Test 1.8: Nonexistent sale-order ID returns HTTP 404");
      const res = await makeRequest(baseUrl, "/api/user/sale-order/review", {
        method: "POST",
        body: {
          sale_order_id: 99999999,
          user_id: testUser.id,
          ratings: 5,
        },
      });

      if (res.status === 404 && res.body?.status === false && res.body.message.includes("Sale Order not found")) {
        console.log(`   ✅ PASS: Rejected invalid sale_order_id with 404: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.8]:", e.message, "\n");
      failed++;
    }

    // Test 1.9: Another customer's sale-order ID rejected with HTTP 403
    try {
      console.log("▶ Test 1.9: Another customer's sale-order ID rejected with HTTP 403");
      const res = await makeRequest(baseUrl, "/api/user/sale-order/review", {
        method: "POST",
        body: {
          sale_order_id: otherSaleOrder.id, // belongs to testOtherUser
          user_id: testUser.id,              // attempted by testUser
          ratings: 5,
        },
      });

      if (res.status === 403 && res.body?.status === false && res.body.message.includes("Unauthorized")) {
        console.log(`   ✅ PASS: Cross-customer review blocked: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.9]:", e.message, "\n");
      failed++;
    }

    // Test 1.10: Invalid image rejected with HTTP 422
    try {
      console.log("▶ Test 1.10: Malformed image rejected with HTTP 422");
      const res = await makeRequest(baseUrl, "/api/user/sale-order/review", {
        method: "POST",
        body: {
          sale_order_id: testSaleOrder.id,
          user_id: testUser.id,
          ratings: 5,
          images: ["not_a_valid_image_string_!@#$%^&*()"],
        },
      });

      if (res.status === 422 && res.body?.status === false) {
        console.log(`   ✅ PASS: Malformed image rejected with 422\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.10]:", e.message, "\n");
      failed++;
    }

    // Test 1.11: Review by other user on other sale order calculates aggregate
    try {
      console.log("▶ Test 1.11: Other user submits 3-star review to test aggregate calculation");
      const res = await makeRequest(baseUrl, "/api/user/sale-order/review", {
        method: "POST",
        body: {
          sale_order_id: otherSaleOrder.id,
          user_id: testOtherUser.id,
          ratings: 3,
          review: "Average product",
        },
      });

      if (res.status === 200 && res.body?.status === true) {
        console.log(`   ✅ PASS: Other customer review submitted!\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.11]:", e.message, "\n");
      failed++;
    }

    // Test 1.12: Verify product aggregate star counts and average
    try {
      console.log("▶ Test 1.12: Verify product aggregate counts in DB");
      const agg = await ProductReviewAggregate.findOne({
        where: { product_id: testProduct.id },
      });

      // User 1 gave 5 stars, User 2 gave 3 stars
      // Total reviews = 2, Total average = (5 + 3) / 2 = 4.00
      // 5_star_count = 1, 3_star_count = 1
      if (
        agg &&
        parseInt(agg.total_reviews, 10) === 2 &&
        parseFloat(agg.total_average) === 4.0 &&
        parseInt(agg.five_star_count, 10) === 1 &&
        parseInt(agg.three_star_count, 10) === 1
      ) {
        console.log(
          `   ✅ PASS: Aggregate verified! Total: ${agg.total_reviews}, Avg: ${agg.total_average}, 5-star: ${agg.five_star_count}, 3-star: ${agg.three_star_count}\n`
        );
        passed++;
      } else {
        throw new Error(`Aggregate mismatch: ${JSON.stringify(agg)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.12]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // SECTION 2: GENERAL PRODUCT REVIEWS (POST /api/store_review)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("SECTION 2: GENERAL PRODUCT REVIEWS (POST /api/store_review)");
    console.log("--------------------------------------------------------------------------------");

    let createdGeneralReviewId = null;

    // Test 2.1: Submit valid general product review
    try {
      console.log("▶ Test 2.1: Submit valid product review returns status: 'true'");
      const res = await makeRequest(baseUrl, "/api/store_review", {
        method: "POST",
        body: {
          product_id: testProduct.id,
          user_id: testUser.id,
          rating: 5,
          comments: "Great product review from store_review",
        },
      });

      if (res.status === 200 && res.body?.status === "true" && res.body.message === "Review stored successfully") {
        console.log(`   ✅ PASS: General review stored successfully with status: "true"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.1]:", e.message, "\n");
      failed++;
    }

    // Test 2.2: Submit review without comments
    try {
      console.log("▶ Test 2.2: Submit review without comments succeeds");
      const res = await makeRequest(baseUrl, "/api/store_review", {
        method: "POST",
        body: {
          product_id: testProduct.id,
          user_id: testUser.id,
          rating: 4,
        },
      });

      if (res.status === 200 && res.body?.status === "true") {
        console.log(`   ✅ PASS: General review stored without comments\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.2]:", e.message, "\n");
      failed++;
    }

    // Test 2.3: Submit review with one base64 image
    try {
      console.log("▶ Test 2.3: Submit review with one base64 image");
      const res = await makeRequest(baseUrl, "/api/store_review", {
        method: "POST",
        body: {
          product_id: testProduct.id,
          user_id: testUser.id,
          rating: 5,
          comments: "With single photo",
          images: sampleBase64,
        },
      });

      if (res.status === 200 && res.body?.status === "true") {
        console.log(`   ✅ PASS: General review stored with single image\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.3]:", e.message, "\n");
      failed++;
    }

    // Test 2.4: Submit review with multiple base64 images
    try {
      console.log("▶ Test 2.4: Submit review with array of base64 images");
      const res = await makeRequest(baseUrl, "/api/store_review", {
        method: "POST",
        body: {
          product_id: testProduct.id,
          user_id: testUser.id,
          rating: 5,
          comments: "With multiple photos",
          images: [sampleBase64, sampleBase64],
        },
      });

      if (res.status === 200 && res.body?.status === "true") {
        console.log(`   ✅ PASS: General review stored with multiple images\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.4]:", e.message, "\n");
      failed++;
    }

    // Test 2.5: Malformed base64 rejected with status: 'false'
    try {
      console.log("▶ Test 2.5: Malformed base64 data rejected with status: 'false'");
      const res = await makeRequest(baseUrl, "/api/store_review", {
        method: "POST",
        body: {
          product_id: testProduct.id,
          user_id: testUser.id,
          rating: 5,
          images: ["malformed_not_base64_data"],
        },
      });

      if (res.status === 422 && res.body?.status === "false" && res.body.message === "Invalid image data") {
        console.log(`   ✅ PASS: Malformed base64 rejected: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.5]:", e.message, "\n");
      failed++;
    }

    // Test 2.6: Nonexistent product ID returns status: 'false'
    try {
      console.log("▶ Test 2.6: Nonexistent product ID returns status: 'false'");
      const res = await makeRequest(baseUrl, "/api/store_review", {
        method: "POST",
        body: {
          product_id: 99999999,
          user_id: testUser.id,
          rating: 5,
        },
      });

      if (res.status === 404 && res.body?.status === "false" && res.body.message === "Invalid product ID") {
        console.log(`   ✅ PASS: Rejected invalid product_id: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.6]:", e.message, "\n");
      failed++;
    }

    // Test 2.7: Nonexistent user ID returns status: 'false'
    try {
      console.log("▶ Test 2.7: Nonexistent user ID returns status: 'false'");
      const res = await makeRequest(baseUrl, "/api/store_review", {
        method: "POST",
        body: {
          product_id: testProduct.id,
          user_id: 99999999,
          rating: 5,
        },
      });

      if (res.status === 422 && res.body?.status === "false") {
        console.log(`   ✅ PASS: Rejected nonexistent user_id: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.7]:", e.message, "\n");
      failed++;
    }

    // Test 2.8: Rating outside 1-5 range rejected with status: 'false'
    try {
      console.log("▶ Test 2.8: Rating outside 1-5 range rejected with status: 'false'");
      const res = await makeRequest(baseUrl, "/api/store_review", {
        method: "POST",
        body: {
          product_id: testProduct.id,
          user_id: testUser.id,
          rating: 6,
        },
      });

      if (res.status === 422 && res.body?.status === "false") {
        console.log(`   ✅ PASS: Rejected rating out of range: "${JSON.stringify(res.body.errors)}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.8]:", e.message, "\n");
      failed++;
    }

    // Test 2.9: Verify CustomerReview and ReviewImage records in DB
    try {
      console.log("▶ Test 2.9: Verify CustomerReview and ReviewImage records created in DB");
      const customerReview = await CustomerReview.findOne({
        where: { product_id: testProduct.id, user_id: testUser.id },
        include: [{ association: "reviewImages" }],
        order: [["id", "DESC"]],
      });

      if (customerReview && customerReview.reviewImages && customerReview.reviewImages.length > 0) {
        createdGeneralReviewId = customerReview.id;
        console.log(
          `   ✅ PASS: Verified in DB! CustomerReview ID: #${customerReview.id}, ReviewImages count: ${customerReview.reviewImages.length}\n`
        );
        passed++;
      } else {
        throw new Error("CustomerReview or ReviewImages not found in DB");
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.9]:", e.message, "\n");
      failed++;
    }

    // Test 2.10: Atomicity check: invalid image does not leave partial records in DB
    try {
      console.log("▶ Test 2.10: Atomicity check: malformed image does not leave orphaned review in DB");
      const countBefore = await CustomerReview.count({ where: { product_id: testProduct.id } });

      await makeRequest(baseUrl, "/api/store_review", {
        method: "POST",
        body: {
          product_id: testProduct.id,
          user_id: testUser.id,
          rating: 5,
          comments: "Should not be stored",
          images: ["corrupted_image_data_here"],
        },
      });

      const countAfter = await CustomerReview.count({ where: { product_id: testProduct.id } });

      if (countBefore === countAfter) {
        console.log(`   ✅ PASS: Atomicity verified! Record count unchanged (${countBefore} === ${countAfter})\n`);
        passed++;
      } else {
        throw new Error(`Orphaned record created! countBefore=${countBefore}, countAfter=${countAfter}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.10]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // SECTION 3: REVIEW RETRIEVAL APIS
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("SECTION 3: REVIEW RETRIEVAL APIS");
    console.log("--------------------------------------------------------------------------------");

    // Test 3.1: Retrieve review by sale_order_id
    try {
      console.log("▶ Test 3.1: GET /api/user/sale-order/review?sale_order_id=... returns review details");
      const res = await makeRequest(baseUrl, `/api/user/sale-order/review?sale_order_id=${testSaleOrder.id}`);

      if (
        res.status === 200 &&
        res.body?.status === true &&
        Array.isArray(res.body.data) &&
        res.body.data.length > 0 &&
        res.body.data[0].sale_order_id === testSaleOrder.id
      ) {
        console.log(`   ✅ PASS: Retrieved review by sale_order_id! Rating: ${res.body.data[0].ratings}\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.1]:", e.message, "\n");
      failed++;
    }

    // Test 3.2: Retrieve review by user_id
    try {
      console.log("▶ Test 3.2: GET /api/user/sale-order/review?user_id=... returns reviews by customer");
      const res = await makeRequest(baseUrl, `/api/user/sale-order/review?user_id=${testUser.id}`);

      if (
        res.status === 200 &&
        res.body?.status === true &&
        Array.isArray(res.body.data) &&
        res.body.data.length > 0 &&
        res.body.data[0].user_id === testUser.id
      ) {
        console.log(`   ✅ PASS: Retrieved reviews by user_id! Items: ${res.body.data.length}\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.2]:", e.message, "\n");
      failed++;
    }

    // Test 3.3: Missing both parameters returns HTTP 422
    try {
      console.log("▶ Test 3.3: GET /api/user/sale-order/review without params returns HTTP 422");
      const res = await makeRequest(baseUrl, "/api/user/sale-order/review");

      if (res.status === 422 && res.body?.status === false && res.body.errors?.sale_order_id) {
        console.log(`   ✅ PASS: Rejected missing required parameters: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.3]:", e.message, "\n");
      failed++;
    }

    // Test 3.4: Product reviews listing (both route variants)
    try {
      console.log("▶ Test 3.4: GET /api/product/reviews and /api/product/:id/reviews return summary & reviews");
      const res1 = await makeRequest(baseUrl, `/api/product/reviews?product_id=${testProduct.id}`);
      const res2 = await makeRequest(baseUrl, `/api/product/${testProduct.id}/reviews`);

      const valid1 = res1.status === 200 && res1.body?.status === true && res1.body.summary && res1.body.data;
      const valid2 = res2.status === 200 && res2.body?.status === true && res2.body.summary && res2.body.data;

      if (valid1 && valid2) {
        console.log(
          `   ✅ PASS: Both product review routes match! Total reviews in summary: ${res1.body.summary.total_reviews}\n`
        );
        passed++;
      } else {
        throw new Error(`Route mismatch: res1=${res1.status}, res2=${res2.status}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.4]:", e.message, "\n");
      failed++;
    }

    // Test 3.5: Pagination
    try {
      console.log("▶ Test 3.5: Pagination params (page=1, per_page=1) honor pagination metadata");
      const res = await makeRequest(baseUrl, `/api/product/reviews?product_id=${testProduct.id}&page=1&per_page=1`);

      if (
        res.status === 200 &&
        res.body?.data?.current_page === 1 &&
        res.body?.data?.per_page === 1 &&
        res.body?.data?.total === 2 &&
        res.body?.data?.last_page === 2 &&
        res.body?.data?.from === 1 &&
        res.body?.data?.to === 1 &&
        res.body?.data?.reviews.length === 1
      ) {
        console.log(`   ✅ PASS: Pagination verified! Page 1/2, 1 item per page\n`);
        passed++;
      } else {
        throw new Error(`Unexpected pagination: ${JSON.stringify(res.body.data)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.5]:", e.message, "\n");
      failed++;
    }

    // Test 3.6: Sorting options
    try {
      console.log("▶ Test 3.6: Test sort=highest_rating and sort=lowest_rating");
      const resHighest = await makeRequest(
        baseUrl,
        `/api/product/reviews?product_id=${testProduct.id}&sort=highest_rating`
      );
      const resLowest = await makeRequest(
        baseUrl,
        `/api/product/reviews?product_id=${testProduct.id}&sort=lowest_rating`
      );

      const topRatingHighest = resHighest.body?.data?.reviews[0]?.ratings;
      const topRatingLowest = resLowest.body?.data?.reviews[0]?.ratings;

      if (topRatingHighest === 5 && topRatingLowest === 3) {
        console.log(`   ✅ PASS: Sorting verified! Highest top: ${topRatingHighest}, Lowest top: ${topRatingLowest}\n`);
        passed++;
      } else {
        throw new Error(`Sorting mismatch: highest=${topRatingHighest}, lowest=${topRatingLowest}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.6]:", e.message, "\n");
      failed++;
    }

    // Test 3.7: Rating filtering
    try {
      console.log("▶ Test 3.7: Test rating=5 filter");
      const res = await makeRequest(baseUrl, `/api/product/reviews?product_id=${testProduct.id}&rating=5`);

      if (
        res.status === 200 &&
        res.body?.data?.total === 1 &&
        res.body?.data?.reviews[0]?.ratings === 5
      ) {
        console.log(`   ✅ PASS: Rating filter verified! 1 review matched 5 stars\n`);
        passed++;
      } else {
        throw new Error(`Unexpected rating filter result: ${JSON.stringify(res.body.data)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.7]:", e.message, "\n");
      failed++;
    }

    // Test 3.8: Has-image filtering
    try {
      console.log("▶ Test 3.8: Test has_image=true filter");
      const res = await makeRequest(baseUrl, `/api/product/reviews?product_id=${testProduct.id}&has_image=true`);

      if (
        res.status === 200 &&
        Array.isArray(res.body?.data?.reviews) &&
        res.body.data.reviews.length > 0 &&
        res.body.data.reviews.every((r) => r.review_images.length > 0)
      ) {
        console.log(
          `   ✅ PASS: has_image filter verified! All returned reviews have review_images (${res.body.data.reviews.length} reviews)\n`
        );
        passed++;
      } else {
        throw new Error(`Unexpected has_image result: ${JSON.stringify(res.body.data)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.8]:", e.message, "\n");
      failed++;
    }

    // Test 3.9: Verify summary aggregates and image gallery in response
    try {
      console.log("▶ Test 3.9: Verify summary star breakdown and all_review_images gallery");
      const res = await makeRequest(baseUrl, `/api/product/reviews?product_id=${testProduct.id}`);

      const summary = res.body?.summary;
      if (
        summary &&
        summary.total_reviews === 2 &&
        summary.total_average === 4.0 &&
        summary.star_counts["5_star"] === 1 &&
        summary.star_counts["3_star"] === 1 &&
        Array.isArray(summary.all_review_images) &&
        summary.all_review_images.length > 0
      ) {
        console.log(
          `   ✅ PASS: Summary verified! Average: ${summary.total_average}, Gallery photos: ${summary.all_review_images.length}\n`
        );
        passed++;
      } else {
        throw new Error(`Summary mismatch: ${JSON.stringify(summary)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.9]:", e.message, "\n");
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

    // Clean up general customer reviews created during testing
    try {
      const custRevs = await CustomerReview.findAll({
        where: { user_id: { [sequelize.Sequelize.Op.in]: [testUser?.id, testOtherUser?.id].filter(Boolean) } },
      });
      for (const cr of custRevs) {
        await ReviewImage.destroy({ where: { customer_review_id: cr.id } });
        await cr.destroy();
      }
    } catch (e) {}

    server.close();

    console.log("\n================================================================================");
    console.log(`  CUSTOMER REVIEWS TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
    console.log("================================================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
    process.exit(0);
  }
}

runTests();
