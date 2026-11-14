import { strict as assert } from "assert";
import http from "http";
import express from "express";
import {
  Product,
  ProductPrice,
  ProductMeasurement,
  Measurement,
  CustomerMeasurementName,
  CustomerMeasurement,
  UserLogin,
} from "../models/setupAssociations.js";
import measurementRoutes from "../src/routes/measurementRoutes.js";
import { MeasurementService } from "../src/services/measurementService.js";

async function makeRequest(serverUrl, path, options = {}) {
  const url = `${serverUrl}${path}`;
  const response = await fetch(url, options);
  const json = await response.json().catch(() => ({}));
  return { status: response.status, body: json };
}

async function runTests() {
  console.log("================================================================================");
  console.log("  CUSTOM MEASUREMENTS FEATURE SUITE (API 1 - API 5) VERIFICATION");
  console.log("================================================================================");

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use("/api", measurementRoutes);
  app.use("/", measurementRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const serverUrl = `http://127.0.0.1:${port}`;
  console.log(`📡 In-process test server listening on ${serverUrl}`);

  let testUser = null;
  let testMeas1 = null;
  let testMeas2 = null;
  let testCustomProduct = null;
  let testCustomPrice = null;
  let testReadyProduct = null;
  let testReadyPrice = null;
  let createdProfile = null;

  try {
    // Setup test data
    testUser = await UserLogin.create({
      username: `meas_cust_${Date.now()}`,
      email: `meas_cust_${Date.now()}@example.com`,
      mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
      gender: "Female",
    });

    testMeas1 = await Measurement.create({
      name: "Bust",
      type: 2,
      action: 0,
      size_details: { XS: "32", S: "34", M: "36", L: "38", XL: "40" },
    });

    testMeas2 = await Measurement.create({
      name: "Waist",
      type: 2,
      action: 0,
      size_details: { XS: "26", S: "28", M: "30", L: "32", XL: "34" },
    });

    testCustomProduct = await Product.create({
      room_id: "1",
      product_name: "Bespoke Couture Anarkali",
      product_type: "0", // Customizable
      category: "Women",
      subcategory: "120",
      action: "0",
    });

    testCustomPrice = await ProductPrice.create({
      product_id: testCustomProduct.id,
      product_type: 0,
      price: 3999.0,
      actual_price: 3999.0,
      qty: 15,
      size: "M",
      action: "0",
    });

    await ProductMeasurement.create({
      product_id: testCustomProduct.id,
      measurement_id: testMeas1.id,
      value: JSON.stringify({ XS: 32, S: 34, M: 36, L: 38, XL: 40 }),
      action: 0,
    });

    await ProductMeasurement.create({
      product_id: testCustomProduct.id,
      measurement_id: testMeas2.id,
      value: JSON.stringify({ XS: 26, S: 28, M: 30, L: 32, XL: 34 }),
      action: 0,
    });

    testReadyProduct = await Product.create({
      room_id: "1",
      product_name: "Ready-To-Wear Kurti",
      product_type: "1", // Ready-made
      category: "Women",
      subcategory: "10",
      action: "0",
    });

    testReadyPrice = await ProductPrice.create({
      product_id: testReadyProduct.id,
      product_type: 1,
      price: 1999.0,
      actual_price: 1999.0,
      qty: 20,
      size: "L",
      action: "0",
    });

    // -------------------------------------------------------------------------
    // TEST 1: GET /api/measurements/by-price validation
    // -------------------------------------------------------------------------
    console.log("▶ [Test 1] Missing price_id validation (HTTP 422)");
    const missingRes = await makeRequest(serverUrl, "/api/measurements/by-price");
    assert.equal(missingRes.status, 422);
    assert.equal(missingRes.body.status, false);
    console.log("   ✅ PASS: Missing price_id correctly rejected with 422");

    console.log("▶ [Test 2] Non-existent price_id (HTTP 422 or 404)");
    const invalidRes = await makeRequest(serverUrl, "/api/measurements/by-price?price_id=999999999");
    assert.equal(invalidRes.body.status, false);
    console.log("   ✅ PASS: Non-existent price_id correctly rejected");

    console.log("▶ [Test 3] Customizable product variant schema (GET /api/measurements/by-price)");
    const customRes = await makeRequest(serverUrl, `/api/measurements/by-price?price_id=${testCustomPrice.id}`);
    assert.equal(customRes.status, 200);
    assert.equal(customRes.body.status, true);
    assert.equal(customRes.body.is_customizable, true);
    assert.equal(customRes.body.product_id, testCustomProduct.id);
    assert.equal(customRes.body.price_id, testCustomPrice.id);
    assert.equal(customRes.body.current_size, "M");
    assert.ok(Array.isArray(customRes.body.data));
    assert.equal(customRes.body.data.length, 2);

    const bustField = customRes.body.data.find((m) => m.measurement_id === testMeas1.id);
    assert.ok(bustField, "Bust measurement field returned");
    assert.equal(bustField.standard_value, 36);
    assert.equal(bustField.unit, "inches");
    assert.ok(bustField.min_value < bustField.standard_value);
    assert.ok(bustField.max_value > bustField.standard_value);
    console.log(`   ✅ PASS: Customizable schema verified (Bust standard: ${bustField.standard_value}", range: ${bustField.min_value}" - ${bustField.max_value}")`);

    console.log("▶ [Test 4] Ready-made product variant schema (is_customizable: false)");
    const readyRes = await makeRequest(serverUrl, `/api/measurements/by-price?price_id=${testReadyPrice.id}`);
    assert.equal(readyRes.status, 200);
    assert.equal(readyRes.body.status, true);
    assert.equal(readyRes.body.is_customizable, false);
    console.log("   ✅ PASS: Ready-made product returns is_customizable: false");

    // -------------------------------------------------------------------------
    // TEST 5: Saved measurement profiles (APIs 2, 3, 4, 5)
    // -------------------------------------------------------------------------
    console.log("▶ [Test 5] Create customer measurement profile (POST /api/customer-measurement/create)");
    const createRes = await makeRequest(serverUrl, "/api/customer-measurement/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: testUser.id,
        name: "Festive Silhouette",
        gender: "Female",
        measurements: [
          { measurement_id: testMeas1.id, value: 37 },
          { measurement_id: testMeas2.id, value: 29 },
        ],
      }),
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.status, true);
    const createdProfileId = createRes.body.data?.customer_measurement_name_id;
    assert.ok(createdProfileId, "Profile ID generated");
    console.log(`   ✅ PASS: Profile created with ID #${createdProfileId}`);

    console.log("▶ [Test 6] View customer measurements (GET /api/customer-measurement/view/:user_id)");
    const viewRes = await makeRequest(serverUrl, `/api/customer-measurement/view/${testUser.id}`);
    assert.equal(viewRes.status, 200);
    assert.equal(viewRes.body.status, true);
    assert.ok(Array.isArray(viewRes.body.data?.profiles));
    assert.ok(viewRes.body.data.profiles.length >= 1);
    const loadedProfile = viewRes.body.data.profiles.find((p) => p.name === "Festive Silhouette");
    assert.ok(loadedProfile, "Festive Silhouette profile loaded");
    assert.equal(loadedProfile.measurements.length, 2);
    console.log(`   ✅ PASS: Customer measurement profiles fetched successfully (${loadedProfile.measurements.length} measurements)`);

    console.log("▶ [Test 7] Update customer measurement profile (POST /api/customer-measurement/update)");
    const updateRes = await makeRequest(serverUrl, "/api/customer-measurement/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: testUser.id,
        customer_measurement_name_id: createdProfileId,
        name: "Festive Silhouette Revised",
        measurements: [
          { measurement_id: testMeas1.id, value: 38 },
        ],
      }),
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.status, true);
    console.log("   ✅ PASS: Profile updated successfully");

    console.log("▶ [Test 8] Delete customer measurement profile (POST /api/customer-measurement/delete)");
    const deleteRes = await makeRequest(serverUrl, `/api/customer-measurement/delete?profile_id=${createdProfileId}`, {
      method: "POST",
    });
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.status, true);
    console.log("   ✅ PASS: Profile deleted successfully");

    console.log("================================================================================");
    console.log("  ALL 8 TESTS PASSED WITH 0 FAILURES!");
    console.log("================================================================================");
  } finally {
    // Cleanup
    if (testCustomProduct?.id) {
      await ProductMeasurement.destroy({ where: { product_id: testCustomProduct.id } });
      await ProductPrice.destroy({ where: { product_id: testCustomProduct.id } });
      await Product.destroy({ where: { id: testCustomProduct.id } });
    }
    if (testReadyProduct?.id) {
      await ProductPrice.destroy({ where: { product_id: testReadyProduct.id } });
      await Product.destroy({ where: { id: testReadyProduct.id } });
    }
    if (testMeas1?.id) await Measurement.destroy({ where: { id: testMeas1.id } });
    if (testMeas2?.id) await Measurement.destroy({ where: { id: testMeas2.id } });
    if (testUser?.id) {
      await CustomerMeasurement.destroy({ where: { cust_id: testUser.id } });
      await CustomerMeasurementName.destroy({ where: { user_id: testUser.id } });
      await UserLogin.destroy({ where: { id: testUser.id } });
    }

    await new Promise((resolve) => server.close(resolve));
    process.exitCode = 0;
  }
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
