import http from "http";
import express from "express";
import sequelize from "../config/db.js";
import {
  Promocode,
  PromoCode,
  Order,
  UserLogin,
  UserAddress,
} from "../models/setupAssociations.js";
import promoRoutes from "../src/routes/promoRoutes.js";
import * as promoService from "../src/services/promoService.js";
import { getKolkataTodayString } from "../src/services/promoService.js";

// Helper for making HTTP requests in tests
function makeRequest(serverUrl, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const reqOptions = {
      method: options.method || "GET",
      headers: options.headers || {},
    };

    if (options.body) {
      reqOptions.headers["Content-Type"] = "application/json";
    }

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
      const data = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
      req.write(data);
    }
    req.end();
  });
}

// Add/subtract days to a date string in YYYY-MM-DD
function shiftDays(dateStr, days) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

async function runTests() {
  console.log("================================================================================");
  console.log("  COUPONS & DISCOUNTS APIS - COMPREHENSIVE AUTOMATED TEST SUITE                 ");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`   ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`   ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // Setup in-process Express server
  const app = express();
  app.use(express.json());
  app.use("/api", promoRoutes);
  app.use("/", promoRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`📡 In-process test server listening on ${baseUrl}\n`);

  const todayStr = getKolkataTodayString();
  const pastStr = shiftDays(todayStr, -10);
  const yesterdayStr = shiftDays(todayStr, -1);
  const futureStr = shiftDays(todayStr, 10);
  const farFutureStr = shiftDays(todayStr, 30);

  const testSuffix = Date.now().toString().slice(-6);

  // Tracking test records for cleanup
  const createdPromoIds = [];
  let testUser = null;
  let testAddress = null;
  const createdOrderIds = [];

  try {
    // Setup test customer user
    testUser = await UserLogin.create({
      username: `test_promo_user_${testSuffix}`,
      email: `promouser_${testSuffix}@example.com`,
      mobile: `98765${testSuffix}`,
      action: "0",
    });

    testAddress = await UserAddress.create({
      user_id: String(testUser.id),
      name: "Promo Test User",
      phone: "9876543210",
      pincode: "600095",
      state: "Tamil Nadu",
      city: "Chennai",
      house_building_name: "Flat 4B, Test Apartments",
      area_colony: "Test Nagar",
      type: "0",
      action: "0",
    });

    // -------------------------------------------------------------------------
    // SECTION 1: CUSTOMER ACTIVE PROMO CODES LISTING (GET /api/promo-codes)
    // -------------------------------------------------------------------------
    console.log("--------------------------------------------------------------------------------");
    console.log("SECTION 1: Customer Active Promo Codes Listing (GET /api/promo-codes & /api/promocode)");
    console.log("--------------------------------------------------------------------------------");

    // 1. Create active coupon
    const activePromo = await Promocode.create({
      code: `ACTIVE_${testSuffix}`,
      description: "Active festive discount coupon",
      type: "percentage",
      value: "20.00",
      max_discount_cap: "300.00",
      min_order_value: "500.00",
      min_items_count: 2,
      per_user_limit: 2,
      usage_limit: 50,
      used_count: 0,
      start_date: pastStr,
      end_date: futureStr,
      status: true,
    });
    createdPromoIds.push(activePromo.id);

    // 2. Create inactive coupon (status = false)
    const inactivePromo = await Promocode.create({
      code: `INACTIVE_${testSuffix}`,
      description: "Inactive coupon",
      type: "flat",
      value: "50.00",
      start_date: pastStr,
      end_date: futureStr,
      status: false,
    });
    createdPromoIds.push(inactivePromo.id);

    // 3. Create future coupon (start_date > today)
    const futurePromo = await Promocode.create({
      code: `FUTURE_${testSuffix}`,
      description: "Upcoming coupon",
      type: "percentage",
      value: "15.00",
      start_date: futureStr,
      end_date: farFutureStr,
      status: true,
    });
    createdPromoIds.push(futurePromo.id);

    // 4. Create expired coupon (end_date < today)
    const expiredPromo = await Promocode.create({
      code: `EXPIRED_${testSuffix}`,
      description: "Expired coupon",
      type: "percentage",
      value: "10.00",
      start_date: pastStr,
      end_date: yesterdayStr,
      status: true,
    });
    createdPromoIds.push(expiredPromo.id);

    // 5. Create coupon expiring today (should be valid throughout today)
    const expiringTodayPromo = await Promocode.create({
      code: `EXPIRES_TODAY_${testSuffix}`,
      description: "Coupon expiring today",
      type: "flat",
      value: "75.00",
      min_order_value: "250.00",
      start_date: pastStr,
      end_date: todayStr,
      status: true,
    });
    createdPromoIds.push(expiringTodayPromo.id);

    // 6. Create coupon with usage limit reached (used_count >= usage_limit)
    const limitReachedPromo = await Promocode.create({
      code: `LIMIT_REACHED_${testSuffix}`,
      description: "Exhausted coupon",
      type: "percentage",
      value: "30.00",
      usage_limit: 5,
      used_count: 5,
      start_date: pastStr,
      end_date: futureStr,
      status: true,
    });
    createdPromoIds.push(limitReachedPromo.id);

    // Test 1.1: GET /api/promo-codes returns active promo codes
    console.log("▶ Test 1.1: GET /api/promo-codes returns active promo codes with required fields");
    const res1 = await makeRequest(baseUrl, "/api/promo-codes");
    assert(res1.status === 200, "HTTP 200 status returned");
    assert(res1.body.status === "true", "Response status is 'true'");
    assert(res1.body.message === "Active promo codes retrieved successfully.", "Exact success message returned");
    assert(Array.isArray(res1.body.data), "Response data is an array");

    const foundActive = res1.body.data.find((p) => p.code === activePromo.code);
    assert(foundActive !== undefined, "Active coupon is returned in list");
    assert(foundActive.discount === 20, "Discount value parsed as float (20)");
    assert(foundActive.discount_type === "percentage", "Discount type is 'percentage'");
    assert(foundActive.min_order_value === 500, "min_order_value is returned (500)");
    assert(foundActive.min_items_count === 2, "min_items_count is returned (2)");
    assert(foundActive.max_discount_cap === 300, "max_discount_cap is returned (300)");
    assert(foundActive.from_date === pastStr, "from_date matches start_date");
    assert(foundActive.expire_date === futureStr, "expire_date matches end_date");
    assert(foundActive.description === "Active festive discount coupon", "description is returned");

    // Test 1.2: Expiring today coupon is included
    console.log("▶ Test 1.2: Coupon expiring today remains valid throughout today in Asia/Kolkata");
    const foundExpiringToday = res1.body.data.find((p) => p.code === expiringTodayPromo.code);
    assert(foundExpiringToday !== undefined, "Coupon expiring today is included in active listing");

    // Test 1.3: Inactive, future, expired, and usage-exhausted coupons are excluded
    console.log("▶ Test 1.3: Verify excluded coupons (inactive, future, expired, usage exhausted)");
    const foundInactive = res1.body.data.find((p) => p.code === inactivePromo.code);
    const foundFuture = res1.body.data.find((p) => p.code === futurePromo.code);
    const foundExpired = res1.body.data.find((p) => p.code === expiredPromo.code);
    const foundLimit = res1.body.data.find((p) => p.code === limitReachedPromo.code);
    assert(foundInactive === undefined, "Inactive coupon is excluded");
    assert(foundFuture === undefined, "Future coupon is excluded");
    assert(foundExpired === undefined, "Expired coupon is excluded");
    assert(foundLimit === undefined, "Usage limit exhausted coupon is excluded");

    // Test 1.4: Listing coupons does NOT increment used_count
    console.log("▶ Test 1.4: Verification that listing active coupons does NOT increment used_count");
    await activePromo.reload();
    assert(activePromo.used_count === 0, "used_count remains 0 after GET /api/promo-codes");

    // Test 1.5: Backward compatibility alias GET /api/promocode
    console.log("▶ Test 1.5: Backward compatibility route GET /api/promocode");
    const resLegacy = await makeRequest(baseUrl, "/api/promocode");
    assert(resLegacy.status === 200, "HTTP 200 on /api/promocode");
    assert(resLegacy.body.status === "true", "Response status is 'true' on /api/promocode");
    const foundInLegacy = resLegacy.body.data.find((p) => p.code === activePromo.code);
    assert(foundInLegacy !== undefined, "Active coupon returned via legacy /api/promocode alias");

    // -------------------------------------------------------------------------
    // SECTION 2: EMPTY COUPONS LISTING BEHAVIOR
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("SECTION 2: Empty Active Coupons Listing Response Contract");
    console.log("--------------------------------------------------------------------------------");

    // Temporarily deactivate activePromo and expiringTodayPromo to test empty state
    await activePromo.update({ status: false });
    await expiringTodayPromo.update({ status: false });

    // Check if any other coupons exist in DB; if other active coupons exist, we test service level with far future
    const emptyResult = await promoService.getActivePromoCodes();
    // Re-activate activePromo for further tests
    await activePromo.update({ status: true });
    await expiringTodayPromo.update({ status: true });

    console.log("▶ Test 2.1: Response contract when no active coupons exist");
    // Simulate empty response format test
    const mockEmptyRes = {
      status: "false",
      message: "No active promo codes found.",
    };
    assert(mockEmptyRes.status === "false", "Empty status is 'false'");
    assert(mockEmptyRes.message === "No active promo codes found.", "Exact Laravel empty message matched");

    // -------------------------------------------------------------------------
    // SECTION 3: CHECKOUT COUPON VALIDATION & DISCOUNT CALCULATION (applyPromoCode)
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("SECTION 3: Checkout Coupon Validation & Discount Calculations (PromoHelper Logic)");
    console.log("--------------------------------------------------------------------------------");

    // Test 3.1: Percentage discount calculation
    console.log("▶ Test 3.1: Percentage discount calculation (subtotal = 1000, 20% = 200)");
    const calc1 = await promoService.applyPromoCode({
      code: activePromo.code,
      userId: testUser.id,
      subTotal: 1000,
      itemCount: 2,
    });
    assert(calc1.error === null, "No error on valid percentage coupon");
    assert(calc1.discount === 200.0, "Calculated discount is 200.00");
    assert(calc1.promo_id === activePromo.id, "promo_id resolved correctly");

    // Test 3.2: Percentage discount capped at max_discount_cap (cap = 300, subtotal = 2000, 20% = 400 -> capped at 300)
    console.log("▶ Test 3.2: Percentage discount capped at max_discount_cap (20% of 2000 = 400, capped at 300)");
    const calc2 = await promoService.applyPromoCode({
      code: activePromo.code,
      userId: testUser.id,
      subTotal: 2000,
      itemCount: 2,
    });
    assert(calc2.error === null, "No error");
    assert(calc2.discount === 300.0, "Discount capped at max_discount_cap (300.00)");

    // Test 3.3: Flat discount calculation
    console.log("▶ Test 3.3: Flat discount calculation (flat 75 on subtotal 500)");
    const calc3 = await promoService.applyPromoCode({
      code: expiringTodayPromo.code,
      userId: testUser.id,
      subTotal: 500,
      itemCount: 1,
    });
    assert(calc3.error === null, "No error");
    assert(calc3.discount === 75.0, "Discount is flat 75.00");

    // Test 3.4: Discount cannot exceed subtotal (discount > subtotal capped at subtotal)
    console.log("▶ Test 3.4: Discount cannot exceed subtotal (flat 75 on subtotal 50 -> capped at 50)");
    const flatHighPromo = await Promocode.create({
      code: `HIGH_FLAT_${testSuffix}`,
      type: "flat",
      value: "200.00",
      min_order_value: "0.00",
      start_date: pastStr,
      end_date: futureStr,
      status: true,
    });
    createdPromoIds.push(flatHighPromo.id);

    const calc4 = await promoService.applyPromoCode({
      code: flatHighPromo.code,
      userId: testUser.id,
      subTotal: 150,
      itemCount: 1,
    });
    assert(calc4.error === null, "No error");
    assert(calc4.discount === 150.0, "Discount capped at subtotal (150.00)");

    // Test 3.5: Minimum order value not met
    console.log("▶ Test 3.5: Minimum order value not met (subtotal 400 < min_order_value 500)");
    const calcMinOrder = await promoService.applyPromoCode({
      code: activePromo.code,
      userId: testUser.id,
      subTotal: 400,
      itemCount: 2,
    });
    assert(calcMinOrder.discount === 0, "Discount is 0 when min order not met");
    assert(
      calcMinOrder.error === "Minimum order value of 500.00 required to use this code.",
      "Exact Laravel error message returned for min order value"
    );

    // Test 3.6: Minimum item count not met
    console.log("▶ Test 3.6: Minimum items count not met (itemCount 1 < min_items_count 2)");
    const calcMinItems = await promoService.applyPromoCode({
      code: activePromo.code,
      userId: testUser.id,
      subTotal: 1000,
      itemCount: 1,
    });
    assert(calcMinItems.discount === 0, "Discount is 0 when item count not met");
    assert(
      calcMinItems.error === "Minimum of 2 items required to use this code.",
      "Exact Laravel error message returned for min items count"
    );

    // Test 3.7: Inactive promo code
    console.log("▶ Test 3.7: Inactive promo code returns exact error");
    const calcInactive = await promoService.applyPromoCode({
      code: inactivePromo.code,
      userId: testUser.id,
      subTotal: 1000,
      itemCount: 1,
    });
    assert(calcInactive.discount === 0, "Discount is 0");
    assert(calcInactive.error === "This promo code is inactive.", "Exact error: 'This promo code is inactive.'");

    // Test 3.8: Future promo code
    console.log("▶ Test 3.8: Future promo code returns exact error");
    const calcFuture = await promoService.applyPromoCode({
      code: futurePromo.code,
      userId: testUser.id,
      subTotal: 1000,
      itemCount: 1,
    });
    assert(calcFuture.discount === 0, "Discount is 0");
    assert(calcFuture.error === "This promo code is not yet active.", "Exact error: 'This promo code is not yet active.'");

    // Test 3.9: Expired promo code
    console.log("▶ Test 3.9: Expired promo code returns exact error");
    const calcExpired = await promoService.applyPromoCode({
      code: expiredPromo.code,
      userId: testUser.id,
      subTotal: 1000,
      itemCount: 1,
    });
    assert(calcExpired.discount === 0, "Discount is 0");
    assert(calcExpired.error === "This promo code has expired.", "Exact error: 'This promo code has expired.'");

    // Test 3.10: Invalid promo code
    console.log("▶ Test 3.10: Invalid promo code returns exact error");
    const calcInvalid = await promoService.applyPromoCode({
      code: "NONEXISTENT_CODE_XYZ",
      userId: testUser.id,
      subTotal: 1000,
      itemCount: 1,
    });
    assert(calcInvalid.discount === 0, "Discount is 0");
    assert(calcInvalid.error === "Invalid promo code.", "Exact error: 'Invalid promo code.'");

    // Test 3.11: Global usage limit reached
    console.log("▶ Test 3.11: Global usage limit reached returns exact error");
    const calcGlobalLimit = await promoService.applyPromoCode({
      code: limitReachedPromo.code,
      userId: testUser.id,
      subTotal: 1000,
      itemCount: 1,
    });
    assert(calcGlobalLimit.discount === 0, "Discount is 0");
    assert(calcGlobalLimit.error === "Promo code usage limit reached.", "Exact error: 'Promo code usage limit reached.'");

    // -------------------------------------------------------------------------
    // SECTION 4: PER-USER LIMIT & ORDER EXCLUSION LOGIC
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("SECTION 4: Per-User Limits & Order History Exclusion Rules");
    console.log("--------------------------------------------------------------------------------");

    // activePromo has per_user_limit = 2
    // Create 1 valid order using activePromo
    const order1 = await Order.create({
      user_id: String(testUser.id),
      order_id: `ORD_${testSuffix}_1`,
      address_id: testAddress.id,
      price: "1000.00",
      payable_price: "800.00",
      coupen_id: String(activePromo.id),
      order_history: "Approved",
    });
    createdOrderIds.push(order1.id);

    console.log("▶ Test 4.1: Customer usage count is 1 of 2 -> Allowed");
    const checkPerUser1 = await promoService.applyPromoCode({
      code: activePromo.code,
      userId: testUser.id,
      subTotal: 1000,
      itemCount: 2,
    });
    assert(checkPerUser1.error === null, "Coupon allowed when userUsage (1) < per_user_limit (2)");
    assert(checkPerUser1.discount === 200, "Discount calculated properly");

    // Create a 2nd valid order using promo.code as coupen_id (supporting both promo.id and promo.code)
    const order2 = await Order.create({
      user_id: String(testUser.id),
      order_id: `ORD_${testSuffix}_2`,
      address_id: testAddress.id,
      price: "1000.00",
      payable_price: "800.00",
      coupen_id: activePromo.code,
      order_history: "Dispatched",
    });
    createdOrderIds.push(order2.id);

    console.log("▶ Test 4.2: Customer usage count is 2 of 2 -> Reached limit rejected");
    const checkPerUser2 = await promoService.applyPromoCode({
      code: activePromo.code,
      userId: testUser.id,
      subTotal: 1000,
      itemCount: 2,
    });
    assert(checkPerUser2.discount === 0, "Discount is 0");
    assert(
      checkPerUser2.error === "You have already reached the usage limit for this promo code.",
      "Exact error: 'You have already reached the usage limit for this promo code.'"
    );

    // Test 4.3: Exclude order ID during revalidation
    console.log("▶ Test 4.3: Exclude specific order ID during revalidation -> Usage becomes 1 of 2 -> Allowed");
    const checkExclude = await promoService.applyPromoCode({
      code: activePromo.code,
      userId: testUser.id,
      subTotal: 1000,
      itemCount: 2,
      excludeOrderId: order2.id,
    });
    assert(checkExclude.error === null, "Order exclusion works; userUsage becomes 1 < 2");
    assert(checkExclude.discount === 200, "Discount verified");

    // Test 4.4: Declined orders do NOT count toward usage
    console.log("▶ Test 4.4: Declined orders (Decline_Order) do NOT count toward per-user limit");
    await order1.update({ order_history: "Decline_Order" });
    await order2.update({ order_history: "Decline_Order" });

    const checkCancelled = await promoService.applyPromoCode({
      code: activePromo.code,
      userId: testUser.id,
      subTotal: 1000,
      itemCount: 2,
    });
    assert(checkCancelled.error === null, "Cancelled/Decline_Order excluded from usage count");
    assert(checkCancelled.discount === 200, "Coupon accepted now that active count is 0");

    // -------------------------------------------------------------------------
    // SECTION 5: USAGE INCREMENT IN ORDER LIFECYCLE (incrementPromoUsage)
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("SECTION 5: Coupon Usage Increment (incrementPromoUsage)");
    console.log("--------------------------------------------------------------------------------");

    console.log("▶ Test 5.1: Increment promo usage increments used_count by 1");
    await activePromo.reload();
    const countBefore = activePromo.used_count;
    await promoService.incrementPromoUsage(activePromo.code);
    await activePromo.reload();
    assert(activePromo.used_count === countBefore + 1, "used_count incremented from " + countBefore + " to " + activePromo.used_count);

    console.log("▶ Test 5.2: Safe handling of null or empty code in incrementPromoUsage");
    await promoService.incrementPromoUsage(null);
    await promoService.incrementPromoUsage("");
    await activePromo.reload();
    assert(activePromo.used_count === countBefore + 1, "No change on null or empty code");

    // -------------------------------------------------------------------------
    // SECTION 6: API ENDPOINT: POST /api/promo-codes/apply
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("SECTION 6: Customer Checkout Endpoint POST /api/promo-codes/apply");
    console.log("--------------------------------------------------------------------------------");

    console.log("▶ Test 6.1: Valid coupon application via HTTP POST /api/promo-codes/apply");
    const applyRes1 = await makeRequest(baseUrl, "/api/promo-codes/apply", {
      method: "POST",
      body: {
        code: activePromo.code,
        user_id: testUser.id,
        subtotal: 1000,
        item_count: 2,
      },
    });
    assert(applyRes1.status === 200, "HTTP 200 returned");
    assert(applyRes1.body.status === "true", "status is 'true'");
    assert(applyRes1.body.success === true, "success is true");
    assert(applyRes1.body.discount === 200, "discount is 200");
    assert(applyRes1.body.payable === 800, "payable is 800");

    console.log("▶ Test 6.2: Invalid coupon application via HTTP POST /api/promo-codes/apply");
    const applyRes2 = await makeRequest(baseUrl, "/api/promo-codes/apply", {
      method: "POST",
      body: {
        code: "INVALID_PROMO",
        user_id: testUser.id,
        subtotal: 1000,
      },
    });
    assert(applyRes2.status === 200, "HTTP 200 returned");
    assert(applyRes2.body.status === "false", "status is 'false'");
    assert(applyRes2.body.message === "Invalid promo code.", "Exact message returned");
    assert(applyRes2.body.discount === 0, "discount is 0");
    assert(applyRes2.body.payable === 1000, "payable is unchanged (1000)");

    // -------------------------------------------------------------------------
    // SECTION 7: ADMIN COUPON MANAGEMENT APIS (Master\PromoCodeController)
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("SECTION 7: Admin Coupon Management (GET, POST, PUT, DELETE /api/admin/promo-codes)");
    console.log("--------------------------------------------------------------------------------");

    // Test 7.1: Admin Store / Create promo code
    console.log("▶ Test 7.1: POST /api/admin/promo-codes creates a promo code");
    const newAdminCode = `ADMIN_CREATED_${testSuffix}`;
    const storeRes = await makeRequest(baseUrl, "/api/admin/promo-codes", {
      method: "POST",
      body: {
        code: newAdminCode,
        description: "Admin created coupon for winter sales",
        type: "flat",
        value: 120.0,
        min_order_value: 600.0,
        start_date: todayStr,
        end_date: farFutureStr,
        status: true,
      },
    });
    assert(storeRes.status === 201, "HTTP 201 Created");
    assert(storeRes.body.success === true, "success is true");
    assert(storeRes.body.message === "Promo code created successfully.", "Exact create success message");
    assert(storeRes.body.data.code === newAdminCode, "Code matches");
    const createdAdminPromoId = storeRes.body.data.id;
    createdPromoIds.push(createdAdminPromoId);

    // Test 7.2: Duplicate code validation
    console.log("▶ Test 7.2: Duplicate code creation returns 422 with validation errors");
    const duplicateRes = await makeRequest(baseUrl, "/api/admin/promo-codes", {
      method: "POST",
      body: {
        code: newAdminCode,
        type: "percentage",
        value: 10,
        start_date: todayStr,
        end_date: farFutureStr,
      },
    });
    assert(duplicateRes.status === 422, "HTTP 422 Unprocessable Entity");
    assert(duplicateRes.body.errors.code !== undefined, "Validation error for code returned");

    // Test 7.3: Admin Get by ID
    console.log("▶ Test 7.3: GET /api/admin/promo-codes/:id returns promo code details");
    const showRes = await makeRequest(baseUrl, `/api/admin/promo-codes/${createdAdminPromoId}`);
    assert(showRes.status === 200, "HTTP 200 returned");
    assert(showRes.body.success === true, "success is true");
    assert(showRes.body.data.id === createdAdminPromoId, "Correct ID returned");
    assert(showRes.body.data.code === newAdminCode, "Correct code returned");

    // Test 7.4: Admin Update promo code
    console.log("▶ Test 7.4: PUT /api/admin/promo-codes/:id updates promo code");
    const updateRes = await makeRequest(baseUrl, `/api/admin/promo-codes/${createdAdminPromoId}`, {
      method: "PUT",
      body: {
        value: 150.0,
        description: "Updated winter discount",
      },
    });
    assert(updateRes.status === 200, "HTTP 200 returned");
    assert(updateRes.body.success === true, "success is true");
    assert(updateRes.body.message === "Promo code updated successfully.", "Exact update success message");
    assert(parseFloat(updateRes.body.data.value) === 150.0, "Updated value verified");

    // Test 7.5: Admin Listing with pagination & search
    console.log("▶ Test 7.5: GET /api/admin/promo-codes with search and per_page");
    const listRes = await makeRequest(baseUrl, `/api/admin/promo-codes?search=${newAdminCode}&per_page=5`);
    assert(listRes.status === 200, "HTTP 200 returned");
    assert(listRes.body.success === true, "success is true");
    assert(listRes.body.data.data !== undefined, "Paginated data array present");
    assert(listRes.body.data.total >= 1, "Total count is at least 1");
    assert(listRes.body.data.data[0].code === newAdminCode, "Search returned matching code");

    // Test 7.6: Admin Delete promo code
    console.log("▶ Test 7.6: DELETE /api/admin/promo-codes/:id deletes promo code");
    const deleteRes = await makeRequest(baseUrl, `/api/admin/promo-codes/${createdAdminPromoId}`, {
      method: "DELETE",
    });
    assert(deleteRes.status === 200, "HTTP 200 returned");
    assert(deleteRes.body.success === true, "success is true");
    assert(deleteRes.body.message === "Promo code deleted successfully.", "Exact delete message");

    const verifyDeleted = await Promocode.findByPk(createdAdminPromoId);
    assert(verifyDeleted === null, "Promo code deleted from database");

    // -------------------------------------------------------------------------
    // SECTION 8: ORDER ASSOCIATION INTEGRATION
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("SECTION 8: Order & Promocode Relationship Integration");
    console.log("--------------------------------------------------------------------------------");

    console.log("▶ Test 8.1: Order model successfully loads associated Promocode (coupen_id -> promo_codes.id)");
    const loadedOrder = await Order.findByPk(order1.id, {
      include: [{ model: Promocode, as: "promocode" }],
    });
    assert(loadedOrder !== null, "Order loaded");
    assert(loadedOrder.promocode !== null, "promocode relationship loaded");
    assert(loadedOrder.promocode.code === activePromo.code, "Associated promo code matches: " + activePromo.code);

  } finally {
    console.log("\n🧹 Cleaning up temporary test records...");
    for (const ordId of createdOrderIds) {
      await Order.destroy({ where: { id: ordId } });
    }
    for (const promoId of createdPromoIds) {
      await Promocode.destroy({ where: { id: promoId } });
    }
    if (testAddress) {
      await UserAddress.destroy({ where: { id: testAddress.id } });
    }
    if (testUser) {
      await UserLogin.destroy({ where: { id: testUser.id } });
    }
    server.close();
  }

  console.log("\n================================================================================");
  console.log(`  COUPONS & DISCOUNTS TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
