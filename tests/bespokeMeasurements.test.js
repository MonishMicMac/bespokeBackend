import http from "http";
import express from "express";
import sequelize from "../config/db.js";
import {
  Measurement,
  CustomerMeasurement,
  CustomerMeasurementName,
  UserLogin,
  Product,
  ProductPrice,
  ProductMeasurement,
} from "../models/setupAssociations.js";
import measurementRoutes from "../src/routes/measurementRoutes.js";
import MeasurementService from "../src/services/measurementService.js";

// Helper for making HTTP requests in tests
function makeRequest(serverUrl, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const reqOptions = {
      method: options.method || "GET",
      headers: options.headers || {},
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
      const data = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
      req.write(data);
    }
    req.end();
  });
}

// Test Runner
async function runTests() {
  console.log("================================================================================");
  console.log("  BESPOKE MEASUREMENT ENGINE - COMPREHENSIVE AUTOMATED TEST SUITE               ");
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

  // Setup Test Express App
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use("/api", measurementRoutes);
  app.use("/", measurementRoutes);

  const server = app.listen(0);
  const serverPort = server.address().port;
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  console.log(`📡 In-process test server listening on ${serverUrl}\n`);

  let testUser1 = null;
  let testUser2 = null;
  let testMasterMeas1 = null;
  let testMasterMeas2 = null;
  let testMasterMeasInactive = null;
  let testCustomProduct = null;
  let testCustomPrice = null;
  let testReadyProduct = null;
  let testReadyPrice = null;
  let createdProfile1 = null;
  let createdProfile2 = null;

  try {
    // 0. Setup test users and master measurements
    testUser1 = await UserLogin.create({
      username: "meas_test_user1",
      email: `meas_test1_${Date.now()}@example.com`,
      mobile: `${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      gender: "female",
      action: "0",
    });

    testUser2 = await UserLogin.create({
      username: "meas_test_user2",
      email: `meas_test2_${Date.now()}@example.com`,
      mobile: `${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      gender: "male",
      action: "0",
    });

    testMasterMeas1 = await Measurement.create({
      name: `Test Bust ${Date.now()}`,
      type: 2, // Women
      img_path: "measurements/bust_test.webp",
      size_details: { M: 36, L: 38, XL: 40 },
      action: 0,
    });

    testMasterMeas2 = await Measurement.create({
      name: `Test Chest ${Date.now()}`,
      type: 1, // Men
      img_path: "measurements/chest_test.webp",
      size_details: { "38": 38, "40": 40, "42": 42 },
      action: 0,
    });

    testMasterMeasInactive = await Measurement.create({
      name: `Test Inactive ${Date.now()}`,
      type: 2,
      action: 1, // Inactive
    });

    // Create products for price ID testing
    testCustomProduct = await Product.create({
      room_id: "ROOM_TEST",
      product_name: `Bespoke Custom Gown ${Date.now()}`,
      product_type: "0", // Customizable
      category: "Women",
      subcategory: "10",
      action: "0",
    });

    testCustomPrice = await ProductPrice.create({
      product_id: testCustomProduct.id,
      product_type: 0, // Customizable
      price: 4999.0,
      actual_price: 4999.0,
      qty: 10,
      size: "Custom",
      action: "0",
    });

    await ProductMeasurement.create({
      product_id: testCustomProduct.id,
      measurement_id: testMasterMeas1.id,
      action: 0,
    });

    testReadyProduct = await Product.create({
      room_id: "ROOM_TEST",
      product_name: `Ready Made Kurti ${Date.now()}`,
      product_type: "1", // Ready-made
      category: "Women",
      subcategory: "10", // Subcategory 10 has mappings in mapping_subcategory
      action: "0",
    });

    testReadyPrice = await ProductPrice.create({
      product_id: testReadyProduct.id,
      product_type: 1, // Ready-made
      price: 1999.0,
      actual_price: 1999.0,
      qty: 10,
      size: "M",
      action: "0",
    });

    console.log("--------------------------------------------------------------------------------");
    console.log("API 1: Measurement Schema List (GET /api/customer-measurement/list)");
    console.log("--------------------------------------------------------------------------------");

    // Test 1.1: List with no filter returns active master measurements
    console.log("▶ Test 1.1: List with no filter returns active master measurements");
    const resListAll = await makeRequest(serverUrl, "/api/customer-measurement/list");
    assert(
      resListAll.status === 200 &&
      resListAll.body.status === true &&
      Array.isArray(resListAll.body.data) &&
      resListAll.body.data.some((m) => m.id === testMasterMeas1.id),
      `Master measurement list fetched (${resListAll.body.data.length} items)`
    );

    // Test 1.2: Inactive master measurement is excluded
    console.log("▶ Test 1.2: Inactive master measurements (action = 1) are excluded");
    const inactiveFound = resListAll.body.data.some((m) => m.id === testMasterMeasInactive.id);
    assert(!inactiveFound, "Inactive measurement correctly excluded from schema list");

    // Test 1.3: Filter by gender=Women maps to type 2
    console.log("▶ Test 1.3: Filter by gender=Women maps to type 2");
    const resWomen = await makeRequest(serverUrl, "/api/customer-measurement/list?gender=Women");
    assert(
      resWomen.status === 200 &&
      resWomen.body.data.some((m) => m.id === testMasterMeas1.id) &&
      !resWomen.body.data.some((m) => m.id === testMasterMeas2.id),
      "Women filter returned type 2 and excluded type 1"
    );

    // Test 1.4: Filter by gender=Men maps to type 1
    console.log("▶ Test 1.4: Filter by gender=Men maps to type 1");
    const resMen = await makeRequest(serverUrl, "/api/customer-measurement/list?gender=Men");
    assert(
      resMen.status === 200 &&
      resMen.body.data.some((m) => m.id === testMasterMeas2.id) &&
      !resMen.body.data.some((m) => m.id === testMasterMeas1.id),
      "Men filter returned type 1 and excluded type 2"
    );

    // Test 1.5: Numeric unisex type 4
    console.log("▶ Test 1.5: Numeric unisex filter (type=4)");
    const resUnisex = await makeRequest(serverUrl, "/api/customer-measurement/list?type=4");
    assert(resUnisex.status === 200 && Array.isArray(resUnisex.body.data), "Numeric unisex type 4 processed");

    // Test 1.6: Derive gender from customer's account (user_login.gender = 'female')
    console.log("▶ Test 1.6: Derive gender from customer's account (user_login.gender)");
    const resUserGender = await makeRequest(serverUrl, `/api/customer-measurement/list?cust_id=${testUser1.id}`);
    assert(
      resUserGender.status === 200 && Array.isArray(resUserGender.body.data),
      "Derived customer gender correctly without error"
    );

    console.log("--------------------------------------------------------------------------------");
    console.log("API 3: Create Customer Measurement Profile (POST /api/customer-measurement/create)");
    console.log("--------------------------------------------------------------------------------");

    // Test 3.1: Create a new profile with multiple measurements using profile_name alias
    console.log("▶ Test 3.1: Create a new profile with profile_name alias and user_id");
    const createPayload1 = {
      user_id: testUser1.id,
      profile_name: "Bridal Wear Profile",
      gender: "Women",
      measurements: [
        { measurement_id: testMasterMeas1.id, value: 36 },
      ],
    };
    const resCreate1 = await makeRequest(serverUrl, "/api/customer-measurement/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: createPayload1,
    });
    assert(
      resCreate1.status === 201 &&
      resCreate1.body.status === true &&
      resCreate1.body.data.name === "Bridal Wear Profile" &&
      resCreate1.body.data.measurements.length === 1 &&
      resCreate1.body.data.measurements[0].value === 36,
      `Profile created successfully: id #${resCreate1.body.data.customer_measurement_name_id}`
    );
    createdProfile1 = resCreate1.body.data;

    // Test 3.2: Create profile using legacy 'name' and 'cust_id' with 'measurement' (singular)
    console.log("▶ Test 3.2: Create profile using legacy 'name' and 'cust_id' with singular 'measurement'");
    const createPayload2 = {
      cust_id: testUser1.id,
      name: "Party Wear Profile",
      gender: "Women",
      measurement: [
        { measurement_id: testMasterMeas1.id, value: 38 },
      ],
    };
    const resCreate2 = await makeRequest(serverUrl, "/api/customer-measurement/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: createPayload2,
    });
    assert(
      resCreate2.status === 201 &&
      resCreate2.body.status === true &&
      resCreate2.body.data.name === "Party Wear Profile" &&
      resCreate2.body.data.customer_measurement_name_id !== createdProfile1.customer_measurement_name_id,
      `Second distinct profile created: id #${resCreate2.body.data.customer_measurement_name_id}`
    );
    createdProfile2 = resCreate2.body.data;

    // Test 3.3: Create profile without name defaults to 'Default Measurement'
    console.log("▶ Test 3.3: Create profile without name defaults to 'Default Measurement'");
    const createPayload3 = {
      user_id: testUser2.id,
      gender: "Men",
      measurements: [
        { measurement_id: testMasterMeas2.id, value: 40 },
      ],
    };
    const resCreate3 = await makeRequest(serverUrl, "/api/customer-measurement/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: createPayload3,
    });
    assert(
      resCreate3.status === 201 &&
      resCreate3.body.data.name === "Default Measurement",
      "Unnamed profile defaulted to 'Default Measurement'"
    );

    // Test 3.4: Validation - Missing user_id / cust_id rejected with HTTP 422
    console.log("▶ Test 3.4: Validation - Missing user_id / cust_id rejected with HTTP 422");
    const badPayload1 = {
      measurements: [{ measurement_id: testMasterMeas1.id, value: 36 }],
    };
    const resBad1 = await makeRequest(serverUrl, "/api/customer-measurement/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: badPayload1,
    });
    assert(
      resBad1.status === 422 &&
      resBad1.body.status === false &&
      resBad1.body.errors?.resolved_user_id,
      `Missing user_id rejected with 422: ${JSON.stringify(resBad1.body.errors?.resolved_user_id)}`
    );

    // Test 3.5: Validation - Invalid measurement ID rejected with HTTP 422
    console.log("▶ Test 3.5: Validation - Invalid measurement ID rejected with HTTP 422");
    const badPayload2 = {
      user_id: testUser1.id,
      name: "Invalid ID Profile",
      measurements: [{ measurement_id: 999999999, value: 36 }],
    };
    const resBad2 = await makeRequest(serverUrl, "/api/customer-measurement/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: badPayload2,
    });
    assert(
      resBad2.status === 422 && resBad2.body.status === false,
      "Invalid measurement ID rejected with HTTP 422"
    );

    // Test 3.6: Validation - Missing measurement value rejected with HTTP 422
    console.log("▶ Test 3.6: Validation - Missing measurement value rejected with HTTP 422");
    const badPayload3 = {
      user_id: testUser1.id,
      measurements: [{ measurement_id: testMasterMeas1.id, value: "" }],
    };
    const resBad3 = await makeRequest(serverUrl, "/api/customer-measurement/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: badPayload3,
    });
    assert(
      resBad3.status === 422 && resBad3.body.status === false,
      "Missing measurement value rejected with HTTP 422"
    );

    // Test 1.7: Scoped list by user_id returns only measurements saved for that customer
    console.log("▶ Test 1.7: Scoped list by user_id returns saved measurements and values");
    const resScopedList = await makeRequest(serverUrl, `/api/customer-measurement/list?user_id=${testUser1.id}`);
    assert(
      resScopedList.status === 200 &&
      resScopedList.body.data.some((m) => m.id === testMasterMeas1.id && m.value > 0),
      "Scoped list returned customer's saved measurement value"
    );

    console.log("--------------------------------------------------------------------------------");
    console.log("API 2: View Customer Measurement Profiles (GET /api/customer-measurement/view/:user_id)");
    console.log("--------------------------------------------------------------------------------");

    // Test 2.1: Non-existent customer / no measurements returns HTTP 404
    console.log("▶ Test 2.1: Non-existent customer returns HTTP 404 with exact message");
    const resView404 = await makeRequest(serverUrl, "/api/customer-measurement/view/999999999");
    assert(
      resView404.status === 404 &&
      resView404.body.status === false &&
      resView404.body.message === "No measurements found for this customer.",
      `Exact Laravel 404 message verified: "${resView404.body.message}"`
    );

    // Test 2.2: Customer with multiple profiles returns profiles with nested measurements
    console.log("▶ Test 2.2: Customer with multiple profiles returns nested measurements");
    const resViewProfiles = await makeRequest(serverUrl, `/api/customer-measurement/view/${testUser1.id}`);
    assert(
      resViewProfiles.status === 200 &&
      resViewProfiles.body.status === true &&
      resViewProfiles.body.data.profiles.length >= 2 &&
      Array.isArray(resViewProfiles.body.data.profiles[0].measurements),
      `Customer has ${resViewProfiles.body.data.profiles.length} profiles with nested measurements array`
    );

    // Test 2.3: Profile-specific filtering by customer_measurement_name_id
    console.log("▶ Test 2.3: Profile-specific filtering (?customer_measurement_name_id=)");
    const resFilterProfile = await makeRequest(
      serverUrl,
      `/api/customer-measurement/view/${testUser1.id}?customer_measurement_name_id=${createdProfile1.customer_measurement_name_id}`
    );
    assert(
      resFilterProfile.status === 200 &&
      resFilterProfile.body.data.profiles.length === 1 &&
      resFilterProfile.body.data.profiles[0].id === createdProfile1.customer_measurement_name_id,
      "Profile filter returned exactly 1 matching profile"
    );

    console.log("--------------------------------------------------------------------------------");
    console.log("API 4: Update Customer Measurement Profile (POST /api/customer-measurement/update)");
    console.log("--------------------------------------------------------------------------------");

    // Test 4.1: Bulk update profile name and measurement values
    console.log("▶ Test 4.1: Bulk update profile name, gender, and measurement values");
    const savedMeasId = createdProfile1.measurements[0].cust_measurement_id;
    const bulkUpdatePayload = {
      user_id: testUser1.id,
      customer_measurement_name_id: createdProfile1.customer_measurement_name_id,
      profile_name: "Updated Bridal Wear Profile",
      gender: "Women",
      measurements: [
        {
          cust_measurement_id: savedMeasId,
          value: 39,
        },
      ],
    };
    const resBulkUpdate = await makeRequest(serverUrl, "/api/customer-measurement/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bulkUpdatePayload,
    });
    assert(
      resBulkUpdate.status === 200 &&
      resBulkUpdate.body.status === true &&
      resBulkUpdate.body.data.name === "Updated Bridal Wear Profile" &&
      resBulkUpdate.body.data.measurements[0].value === 39,
      "Bulk update updated profile name and measurement value to 39"
    );

    // Test 4.2: Single measurement update via route param /update/:cust_measurement_id
    console.log("▶ Test 4.2: Single measurement update via route parameter");
    const singleUpdatePayload = {
      value: 41,
    };
    const resSingleUpdate = await makeRequest(
      serverUrl,
      `/api/customer-measurement/update/${savedMeasId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: singleUpdatePayload,
      }
    );
    assert(
      resSingleUpdate.status === 200 &&
      resSingleUpdate.body.status === true &&
      resSingleUpdate.body.data.value === 41,
      "Single measurement updated to 41"
    );

    // Test 4.3: Update non-existent measurement ID returns HTTP 404
    console.log("▶ Test 4.3: Update non-existent measurement ID returns HTTP 404");
    const resBadUpdate = await makeRequest(
      serverUrl,
      "/api/customer-measurement/update/999999999",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { value: 36 },
      }
    );
    assert(
      resBadUpdate.status === 404 &&
      resBadUpdate.body.message === "Customer measurement not found.",
      `Non-existent measurement update returned 404: "${resBadUpdate.body.message}"`
    );

    // Test 4.4: Security - Customer 2 cannot update Customer 1's measurement row
    console.log("▶ Test 4.4: Security - Customer 2 cannot update Customer 1's measurement row");
    const crossUpdatePayload = {
      user_id: testUser2.id, // User 2 trying to hijack User 1's measurement
      cust_measurement_id: savedMeasId,
      value: 99,
    };
    const resCrossUpdate = await makeRequest(
      serverUrl,
      `/api/customer-measurement/update/${savedMeasId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: crossUpdatePayload,
      }
    );
    assert(
      resCrossUpdate.status === 403 &&
      resCrossUpdate.body.message.includes("Unauthorized"),
      `Cross-customer update blocked with 403: "${resCrossUpdate.body.message}"`
    );

    console.log("--------------------------------------------------------------------------------");
    console.log("API 5: Product Measurement Schema by Price ID (GET /api/measurements/by-price)");
    console.log("--------------------------------------------------------------------------------");

    // Test 5.1: Missing price_id rejected with HTTP 422
    console.log("▶ Test 5.1: Missing price_id rejected with HTTP 422");
    const resMissingPrice = await makeRequest(serverUrl, "/api/measurements/by-price");
    assert(
      resMissingPrice.status === 422 &&
      resMissingPrice.body.status === false,
      `Missing price_id rejected: ${resMissingPrice.body.message}`
    );

    // Test 5.2: Invalid / non-existent price_id rejected
    console.log("▶ Test 5.2: Non-existent price_id rejected");
    const resInvalidPrice = await makeRequest(serverUrl, "/api/measurements/by-price?price_id=999999999");
    assert(
      resInvalidPrice.status === 422 || resInvalidPrice.status === 404,
      `Non-existent price ID rejected with status ${resInvalidPrice.status}`
    );

    // Test 5.3: Customizable product variant returns mapped measurements with legacy spelling
    console.log("▶ Test 5.3: Customizable product (product_type = 0) returns mapped measurements");
    const resCustomPrice = await makeRequest(
      serverUrl,
      `/api/measurements/by-price?price_id=${testCustomPrice.id}`
    );
    assert(
      resCustomPrice.status === 200 &&
      resCustomPrice.body.status === true &&
      Array.isArray(resCustomPrice.body.data) &&
      resCustomPrice.body.data.length > 0 &&
      resCustomPrice.body.data[0].measurment_name !== undefined,
      `Customizable measurements retrieved! Preserved legacy field 'measurment_name': "${resCustomPrice.body.data[0]?.measurment_name}"`
    );

    // Test 5.4: Ready-made product variant resolves subcategory mappings
    console.log("▶ Test 5.4: Ready-made product (product_type = 1) resolves subcategory mappings");
    const resReadyPrice = await makeRequest(
      serverUrl,
      `/api/measurements/by-price?price_id=${testReadyPrice.id}`
    );
    assert(
      resReadyPrice.status === 200 &&
      resReadyPrice.body.status === true &&
      Array.isArray(resReadyPrice.body.data),
      `Ready-made measurements retrieved (${resReadyPrice.body.data.length} items)`
    );

    console.log("--------------------------------------------------------------------------------");
    console.log("MEASUREMENT SERVICE DOWNSTREAM INTEGRATIONS");
    console.log("--------------------------------------------------------------------------------");

    // Test 6.1: MeasurementService.resolve() for customizable product completes validation
    console.log("▶ Test 6.1: MeasurementService.resolve() for customizable product");
    const resolvedCustom = await MeasurementService.resolve(
      testCustomProduct.id,
      {
        price_id: testCustomPrice.id,
        measurements: [{ measurement_id: testMasterMeas1.id, value: 36 }],
      },
      "Custom"
    );
    assert(
      resolvedCustom && resolvedCustom[String(testMasterMeas1.id)]?.value === "36",
      "MeasurementService.resolve() verified for customizable product"
    );

    // Test 6.2: Completeness check rejects customizable product missing mapped measurements
    console.log("▶ Test 6.2: Customizable product completeness validation rejects missing measurements");
    let caughtMissing = false;
    try {
      await MeasurementService.resolve(
        testCustomProduct.id,
        { price_id: testCustomPrice.id, measurements: [] },
        "Custom"
      );
    } catch (e) {
      caughtMissing = true;
    }
    assert(caughtMissing, "Missing measurement correctly rejected by resolveCustomizable()");
  } finally {
    console.log("\n🧹 Cleaning up temporary test records...");
    if (testMasterMeas1) await Measurement.destroy({ where: { id: testMasterMeas1.id } });
    if (testMasterMeas2) await Measurement.destroy({ where: { id: testMasterMeas2.id } });
    if (testMasterMeasInactive) await Measurement.destroy({ where: { id: testMasterMeasInactive.id } });
    if (testCustomProduct) {
      await ProductMeasurement.destroy({ where: { product_id: testCustomProduct.id } });
      await ProductPrice.destroy({ where: { product_id: testCustomProduct.id } });
      await Product.destroy({ where: { id: testCustomProduct.id } });
    }
    if (testReadyProduct) {
      await ProductPrice.destroy({ where: { product_id: testReadyProduct.id } });
      await Product.destroy({ where: { id: testReadyProduct.id } });
    }
    if (testUser1) {
      await CustomerMeasurement.destroy({ where: { cust_id: testUser1.id } });
      await CustomerMeasurementName.destroy({ where: { user_id: testUser1.id } });
      await UserLogin.destroy({ where: { id: testUser1.id } });
    }
    if (testUser2) {
      await CustomerMeasurement.destroy({ where: { cust_id: testUser2.id } });
      await CustomerMeasurementName.destroy({ where: { user_id: testUser2.id } });
      await UserLogin.destroy({ where: { id: testUser2.id } });
    }
    server.close();
  }

  console.log("\n================================================================================");
  console.log(`  BESPOKE MEASUREMENT TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
