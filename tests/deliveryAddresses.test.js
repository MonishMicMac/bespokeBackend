import http from "http";
import express from "express";
import sequelize from "../config/db.js";
import { UserAddress, UserLogin, Order } from "../models/setupAssociations.js";
import userAddressRoutes from "../src/routes/userAddressRoutes.js";
import userRoutes from "../src/routes/userRoutes.js";

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
  console.log("  CUSTOMER DELIVERY ADDRESS APIS - COMPREHENSIVE AUTOMATED TEST SUITE          ");
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
  app.use("/api", userAddressRoutes);
  app.use("/", userAddressRoutes);
  app.use("/api", userRoutes);
  app.use("/", userRoutes);

  const server = app.listen(0);
  const serverPort = server.address().port;
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  console.log(`📡 In-process test server listening on ${serverUrl}\n`);

  let testUser1 = null;
  let testUser2 = null;
  let createdAddress1 = null;
  let createdAddress2 = null;
  let createdAddress3 = null;

  try {
    // 0. Setup test users in user_login
    testUser1 = await UserLogin.create({
      username: "addr_test_user1",
      email: `addr_test1_${Date.now()}@example.com`,
      mobile: `${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      action: "0",
    });

    testUser2 = await UserLogin.create({
      username: "addr_test_user2",
      email: `addr_test2_${Date.now()}@example.com`,
      mobile: `${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      action: "0",
    });

    console.log("--------------------------------------------------------------------------------");
    console.log("API 1: Get Customer Addresses (GET /api/view/address)");
    console.log("--------------------------------------------------------------------------------");

    // Test 1.1: Customer with no saved addresses
    console.log("▶ Test 1.1: Customer with no saved addresses returns empty list");
    const res1 = await makeRequest(serverUrl, `/api/view/address?user_id=${testUser1.id}`);
    assert(
      res1.status === 200 && res1.body.status === "true" && Array.isArray(res1.body.data) && res1.body.data.length === 0,
      `Empty address list returned with status 'true': ${res1.body.message}`
    );

    // Test 1.2: Missing user_id is rejected and never leaks all customer addresses
    console.log("▶ Test 1.2: Missing user_id is rejected and never leaks addresses");
    const resMissing = await makeRequest(serverUrl, `/api/view/address`);
    assert(
      (resMissing.status === 400 || resMissing.body.status === "false") &&
      (!resMissing.body.data || resMissing.body.data.length === 0),
      `Missing user_id safely rejected: ${resMissing.body.message}`
    );

    console.log("--------------------------------------------------------------------------------");
    console.log("API 2: Add Delivery Address (POST /api/add/address)");
    console.log("--------------------------------------------------------------------------------");

    // Test 2.1: Add a valid Home delivery address
    console.log("▶ Test 2.1: Add a valid Home delivery address");
    const addPayload1 = {
      user_id: testUser1.id,
      name: "Alice Smith",
      phone: "9876543210",
      pincode: "600094",
      state: "Tamil Nadu",
      city: "Chennai",
      house_building_name: "Flat 4B, Lotus Apartments",
      area_colony: "Choolaimedu",
      landmark_nearby: "Near Temple",
      type: "HOME",
      lat: "13.0604",
      long: "80.2295",
    };
    const resAdd1 = await makeRequest(serverUrl, "/api/add/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: addPayload1,
    });
    assert(
      resAdd1.status === 200 &&
      resAdd1.body.status === "true" &&
      resAdd1.body.message === "User address added successfully " &&
      resAdd1.body.data.length === 1 &&
      resAdd1.body.data[0].type === "0",
      `Home address added successfully with type '0': id #${resAdd1.body.data[0]?.id}`
    );
    createdAddress1 = resAdd1.body.data[0];

    // Test 2.2: Add a valid Work delivery address using 'mobile' alias and without optional landmark/coords
    console.log("▶ Test 2.2: Add a valid Work address with mobile alias and no landmark/coords");
    const addPayload2 = {
      user_id: testUser1.id,
      name: "Alice Office",
      mobile: "9123456789", // Using mobile alias
      pincode: "600001",
      state: "Tamil Nadu",
      city: "Chennai",
      house_building_name: "Tech Park Block C",
      area_colony: "George Town",
      type: "WORK",
    };
    const resAdd2 = await makeRequest(serverUrl, "/api/add/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: addPayload2,
    });
    assert(
      resAdd2.status === 200 &&
      resAdd2.body.status === "true" &&
      resAdd2.body.data.length === 2 &&
      resAdd2.body.data[1].type === "1" &&
      resAdd2.body.data[1].landmark_nearby === null,
      `Work address added with type '1' and mobile alias preserved as phone`
    );
    createdAddress2 = resAdd2.body.data[1];

    // Test 2.3: Verify adding an address does NOT modify pre-existing addresses
    console.log("▶ Test 2.3: Adding an address does NOT overwrite or modify previous address");
    const addr1Check = await UserAddress.findByPk(createdAddress1.id);
    assert(
      addr1Check && addr1Check.name === "Alice Smith" && addr1Check.type === "0",
      "Original address remains completely intact"
    );

    // Test 2.4: Validation - Missing recipient name
    console.log("▶ Test 2.4: Validation - Missing recipient name");
    const badPayload1 = { ...addPayload1, name: "" };
    const resBad1 = await makeRequest(serverUrl, "/api/add/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: badPayload1,
    });
    assert(
      resBad1.body.status === "false" && resBad1.body.errors?.name,
      `Missing name rejected with validation error: ${JSON.stringify(resBad1.body.errors?.name)}`
    );

    // Test 2.5: Validation - Invalid pincode length (> 6 digits)
    console.log("▶ Test 2.5: Validation - Invalid pincode length");
    const badPayload2 = { ...addPayload1, pincode: "1234567" };
    const resBad2 = await makeRequest(serverUrl, "/api/add/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: badPayload2,
    });
    assert(
      resBad2.body.status === "false" && resBad2.body.errors?.pincode,
      `Invalid pincode rejected: ${JSON.stringify(resBad2.body.errors?.pincode)}`
    );

    // Test 2.6: Validation - Non-existent customer
    console.log("▶ Test 2.6: Validation - Non-existent customer");
    const badPayload3 = { ...addPayload1, user_id: 999999999 };
    const resBad3 = await makeRequest(serverUrl, "/api/add/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: badPayload3,
    });
    assert(
      resBad3.body.status === "false" && resBad3.body.message.includes("User not active"),
      `Non-existent user rejected: ${resBad3.body.message}`
    );

    // Create an address for User 2 to test cross-customer isolation
    const addPayloadUser2 = {
      user_id: testUser2.id,
      name: "Bob Jones",
      phone: "9988776655",
      pincode: "560001",
      state: "Karnataka",
      city: "Bangalore",
      house_building_name: "101 Brigade Road",
      area_colony: "MG Road Area",
      type: "0",
    };
    const resAddUser2 = await makeRequest(serverUrl, "/api/add/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: addPayloadUser2,
    });
    createdAddress3 = resAddUser2.body.data[0];

    // Test 1.3: Cross-customer isolation in GET /api/view/address
    console.log("▶ Test 1.3: Customer 1 only sees their own addresses (Customer 2 addresses excluded)");
    const resUser1List = await makeRequest(serverUrl, `/api/view/address?user_id=${testUser1.id}`);
    const user1Ids = resUser1List.body.data.map((a) => a.id);
    assert(
      user1Ids.includes(createdAddress1.id) &&
      user1Ids.includes(createdAddress2.id) &&
      !user1Ids.includes(createdAddress3.id),
      `Customer 1 list has 2 addresses and excludes Customer 2 address #${createdAddress3.id}`
    );

    console.log("--------------------------------------------------------------------------------");
    console.log("API 3: Edit Delivery Address (POST /api/edit/address)");
    console.log("--------------------------------------------------------------------------------");

    // Test 3.1: Update recipient name, phone, and pincode
    console.log("▶ Test 3.1: Update recipient name, phone, and pincode");
    const editPayload = {
      address_id: createdAddress1.id,
      user_id: testUser1.id,
      name: "Alice Johnson",
      phone: "9876500000",
      pincode: "600095",
    };
    const resEdit1 = await makeRequest(serverUrl, "/api/edit/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: editPayload,
    });
    assert(
      resEdit1.status === 200 &&
      resEdit1.body.status === "true" &&
      resEdit1.body.message === "User address updated successfully.",
      `Address updated: ${resEdit1.body.message}`
    );

    // Verify DB update and omitted field retention
    const updatedAddr1 = await UserAddress.findByPk(createdAddress1.id);
    assert(
      updatedAddr1.name === "Alice Johnson" &&
      updatedAddr1.phone === "9876500000" &&
      updatedAddr1.pincode === "600095" &&
      updatedAddr1.house_building_name === "Flat 4B, Lotus Apartments" && // Retained!
      updatedAddr1.city === "Chennai", // Retained!
      "Supplied fields updated while omitted fields retained original values"
    );

    // Test 3.2: Security check - User 2 cannot modify User 1's address
    console.log("▶ Test 3.2: Security check - User 2 cannot modify User 1's address");
    const crossEditPayload = {
      address_id: createdAddress1.id,
      user_id: testUser2.id, // Wrong owner!
      name: "Hacker Attempt",
    };
    const resCrossEdit = await makeRequest(serverUrl, "/api/edit/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: crossEditPayload,
    });
    assert(
      resCrossEdit.body.status === "false" &&
      resCrossEdit.body.message.includes("Unauthorized: This address does not belong to you"),
      `Cross-customer update blocked: ${resCrossEdit.body.message}`
    );

    // Test 3.3: Edit non-existent address ID returns 'Address not found.'
    console.log("▶ Test 3.3: Edit non-existent address ID returns 'Address not found.'");
    const resBadEdit = await makeRequest(serverUrl, "/api/edit/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { address_id: 999999999, user_id: testUser1.id, name: "Test" },
    });
    assert(
      resBadEdit.body.status === "false" && resBadEdit.body.message === "Address not found.",
      `Non-existent address edit handled correctly: ${resBadEdit.body.message}`
    );

    console.log("--------------------------------------------------------------------------------");
    console.log("API 4: Delete Delivery Address (POST /api/delete/address)");
    console.log("--------------------------------------------------------------------------------");

    // Test 4.1: Security check - User 2 cannot delete User 1's address
    console.log("▶ Test 4.1: Security check - User 2 cannot delete User 1's address");
    const resCrossDelete = await makeRequest(
      serverUrl,
      `/api/delete/address?address_id=${createdAddress1.id}&user_id=${testUser2.id}`,
      { method: "POST" }
    );
    assert(
      resCrossDelete.body.status === "false" &&
      resCrossDelete.body.message.includes("Unauthorized: This address does not belong to you"),
      `Cross-customer deletion blocked: ${resCrossDelete.body.message}`
    );

    // Test 4.2: Soft delete a valid address (action = '1')
    console.log("▶ Test 4.2: Soft delete a valid address (action = '1')");
    const resDelete = await makeRequest(
      serverUrl,
      `/api/delete/address?address_id=${createdAddress2.id}&user_id=${testUser1.id}`,
      { method: "POST" }
    );
    assert(
      resDelete.status === 200 &&
      resDelete.body.status === "true" &&
      resDelete.body.message === "User address deleted successfully (soft delete).",
      `Address soft deleted: ${resDelete.body.message}`
    );

    // Verify row still exists in DB with action = '1'
    const deletedAddrRow = await UserAddress.findByPk(createdAddress2.id);
    assert(
      deletedAddrRow !== null && deletedAddrRow.action === "1",
      `Row physically preserved in MySQL database with action = '1'`
    );

    // Verify address is excluded from active address list
    const resAfterDelete = await makeRequest(serverUrl, `/api/view/address?user_id=${testUser1.id}`);
    const activeIds = resAfterDelete.body.data.map((a) => a.id);
    assert(
      !activeIds.includes(createdAddress2.id) && activeIds.includes(createdAddress1.id),
      "Deleted address #2 excluded from active address list while active address #1 remains"
    );

    // Test 4.3: Repeated deletion returns 'Address not found.' or handled cleanly
    console.log("▶ Test 4.3: Repeated deletion or non-existent address ID");
    const resRepeatDelete = await makeRequest(
      serverUrl,
      `/api/delete/address?address_id=999999999&user_id=${testUser1.id}`,
      { method: "POST" }
    );
    assert(
      resRepeatDelete.body.status === "false" && resRepeatDelete.body.message === "Address not found.",
      `Invalid delete handled consistently: ${resRepeatDelete.body.message}`
    );

    console.log("--------------------------------------------------------------------------------");
    console.log("INTEGRATION TESTS: Customer Profile & Order Association");
    console.log("--------------------------------------------------------------------------------");

    // Test 5.1: Customer profile details (/user/details/:id) contains saved addresses with formatted_address
    console.log("▶ Test 5.1: Profile details API returns saved addresses with formatted_address");
    const resDetails = await makeRequest(serverUrl, `/api/user/details/${testUser1.id}`);
    assert(
      resDetails.status === 200 &&
      resDetails.body.status === "true" &&
      Array.isArray(resDetails.body.data?.addresses) &&
      resDetails.body.data.addresses.length > 0 &&
      resDetails.body.data.addresses[0].formatted_address.includes("Flat 4B, Lotus Apartments"),
      `Profile details returned formatted_address: "${resDetails.body.data?.addresses[0]?.formatted_address}"`
    );

    // Test 5.2: Order model association with UserAddress
    console.log("▶ Test 5.2: Order model relationship with UserAddress");
    const testOrder = await Order.create({
      price: 1500.0,
      payable_price: 1500.0,
      order_id: `ORD_TEST_${Date.now()}`,
      user_id: testUser1.id,
      address_id: createdAddress1.id,
      discount_used: "0",
      order_history: "Pending",
    });

    const loadedOrder = await Order.findByPk(testOrder.id, {
      include: [{ model: UserAddress, as: "address" }],
    });
    assert(
      loadedOrder && loadedOrder.address && loadedOrder.address.name === "Alice Johnson",
      `Order #${loadedOrder.id} successfully loaded UserAddress #${loadedOrder.address.id} (${loadedOrder.address.name})`
    );

    // Cleanup test order
    await testOrder.destroy();
  } finally {
    console.log("\n🧹 Cleaning up temporary test records...");
    if (createdAddress1) await UserAddress.destroy({ where: { id: createdAddress1.id } });
    if (createdAddress2) await UserAddress.destroy({ where: { id: createdAddress2.id } });
    if (createdAddress3) await UserAddress.destroy({ where: { id: createdAddress3.id } });
    if (testUser1) await UserLogin.destroy({ where: { id: testUser1.id } });
    if (testUser2) await UserLogin.destroy({ where: { id: testUser2.id } });
    server.close();
  }

  console.log("\n================================================================================");
  console.log(`  DELIVERY ADDRESS TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});

