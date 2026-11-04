import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import sequelize from "../config/db.js";
import UserLogin from "../models/UserLogin.js";
import CustomerMeasurement from "../models/CustomerMeasurement.js";
import userRoutes from "../src/routes/userRoutes.js";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup ephemeral Express app for testing
const app = express();
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use("/api", userRoutes);

let server;
let baseUrl = "";

async function makeRequest(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, options);
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    // Non-json response
  }
  return { status: res.status, headers: res.headers, body: json };
}

// 1x1 transparent PNG as base64 data URI
const VALID_BASE64_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function runTests() {
  console.log("================================================================================");
  console.log("  CUSTOMER AUTHENTICATION & PROFILE APIS - AUTOMATED COMPREHENSIVE TEST SUITE  ");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;
  const testUsersToCleanup = [];

  try {
    await sequelize.authenticate();
    console.log("✅ Database Connected Successfully for Testing\n");

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
    const testEmail1 = `test_mig_${timestamp}_1@example.com`;
    const testMobile1 = `999${String(timestamp).slice(-7)}`;
    const testEmail2 = `test_mig_${timestamp}_2@example.com`;
    const testMobile2 = `988${String(timestamp).slice(-7)}`;

    // -------------------------------------------------------------------------
    // TEST 1: Successful customer signup
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 1] Successful customer signup (POST /api/user/signup)");
      const res = await makeRequest("/api/user/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Test Migration User",
          mobile: testMobile1,
          email: testEmail1,
        }),
      });

      if (
        res.status === 200 &&
        res.body?.status === "true" &&
        res.body?.message === "User created successfully" &&
        res.body?.data?.email === testEmail1 &&
        res.body?.data?.id
      ) {
        testUsersToCleanup.push(res.body.data.id);
        const dbRecord = await UserLogin.findByPk(res.body.data.id);
        if (dbRecord && dbRecord.email === testEmail1 && dbRecord.password === null) {
          console.log(`   ✅ PASS: Created user ID #${res.body.data.id} in DB with password null\n`);
          passed++;
        } else {
          throw new Error("DB verification failed: record not found or invalid");
        }
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 1]:`, e.message, "\n");
      failed++;
    }

    // Prepare test user 1 with password for login and duplicate tests
    const createdUserId = testUsersToCleanup[0];
    const initialPlainPassword = "Password@123";
    await UserLogin.update(
      { password: initialPlainPassword },
      { where: { id: createdUserId } }
    );

    // -------------------------------------------------------------------------
    // TEST 2: Duplicate email
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 2] Duplicate email signup (POST /api/user/signup)");
      const res = await makeRequest("/api/user/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Another Name",
          mobile: `977${String(Date.now()).slice(-7)}`,
          email: testEmail1, // existing email with password
        }),
      });

      if (res.body?.status === "false" && res.body?.message?.includes("already exists")) {
        console.log(`   ✅ PASS: Rejected duplicate email: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Expected rejection for duplicate email, got: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 2]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 3: Duplicate mobile
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 3] Duplicate mobile signup (POST /api/user/signup)");
      const res = await makeRequest("/api/user/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Another Name",
          mobile: testMobile1, // existing mobile with password
          email: `unique_${Date.now()}@example.com`,
        }),
      });

      if (
        res.body?.status === "false" &&
        res.body?.message === "Account already exists with a password."
      ) {
        console.log(`   ✅ PASS: Rejected duplicate mobile: "${res.body.message}"\n`);
        passed++;
      } else {
        throw new Error(`Expected rejection for duplicate mobile, got: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 3]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 4: Existing pending account (password IS NULL)
    // -------------------------------------------------------------------------
    let pendingUserId;
    try {
      console.log("▶ [Test 4] Existing pending account update (POST /api/user/signup)");
      // Create pending user directly in DB
      const pendingUser = await UserLogin.create({
        username: "Pending Guy",
        email: testEmail2,
        mobile: testMobile2,
        password: null,
      });
      pendingUserId = pendingUser.id;
      testUsersToCleanup.push(pendingUserId);

      const newMobileForPending = `966${String(Date.now()).slice(-7)}`;
      const res = await makeRequest("/api/user/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Updated Pending Guy",
          mobile: newMobileForPending,
          email: testEmail2,
        }),
      });

      if (
        res.body?.status === "true" &&
        res.body?.message === "Mobile number updated and OTP sent to your email." &&
        res.body?.data?.mobile === newMobileForPending
      ) {
        const updatedDb = await UserLogin.findByPk(pendingUserId);
        if (updatedDb.mobile === newMobileForPending && updatedDb.username === "Updated Pending Guy") {
          console.log(`   ✅ PASS: Pending account updated properly with new mobile and OTP\n`);
          passed++;
        } else {
          throw new Error("DB verification failed for pending account update");
        }
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 4]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 5: Successful login
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 5] Successful customer login (GET /api/user/login)");
      const res = await makeRequest(
        `/api/user/login?email=${encodeURIComponent(testEmail1)}&password=${encodeURIComponent(initialPlainPassword)}`
      );

      if (
        res.status === 200 &&
        res.body?.status === "true" &&
        res.body?.message === "User Login successfully" &&
        res.body?.data?.id === createdUserId &&
        res.body?.data?.password === undefined && // Password hash MUST NOT be exposed
        res.body?.otp !== undefined &&
        res.body?.has_measurement !== undefined
      ) {
        // Also verify transitional rehash occurred in DB!
        const recheckDb = await UserLogin.findByPk(createdUserId);
        const isNowBcrypt = /^\$2[ayb]\$/.test(recheckDb.password);
        if (isNowBcrypt) {
          console.log(`   ✅ PASS: Logged in successfully & transitional bcrypt rehash verified in DB!\n`);
          passed++;
        } else {
          throw new Error("Transitional bcrypt rehash did not occur");
        }
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 5]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 6: Invalid password
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 6] Invalid password login (GET /api/user/login)");
      const res = await makeRequest(
        `/api/user/login?email=${encodeURIComponent(testEmail1)}&password=CompletelyWrongPassword123`
      );

      if (res.body?.status === "false" && res.body?.message === "User Login Invalid") {
        console.log(`   ✅ PASS: Returned 'User Login Invalid' for incorrect password\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 6]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 7: Login by email
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 7] Login specifically using email query param");
      const res = await makeRequest(
        `/api/user/login?email=${encodeURIComponent(testEmail1)}&password=${encodeURIComponent(initialPlainPassword)}`
      );

      if (res.body?.status === "true" && res.body?.data?.email === testEmail1) {
        console.log(`   ✅ PASS: Login by email succeeded\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 7]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 8: Login by mobile
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 8] Login specifically using mobile query param");
      const res = await makeRequest(
        `/api/user/login?mobile=${encodeURIComponent(testMobile1)}&password=${encodeURIComponent(initialPlainPassword)}`
      );

      if (res.body?.status === "true" && res.body?.data?.mobile === testMobile1) {
        console.log(`   ✅ PASS: Login by mobile succeeded\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 8]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 9: Banned customer handling
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 9] Banned customer login prevention");
      await UserLogin.update(
        { is_banned: "1", banned_remarks: "Fraudulent test activity" },
        { where: { id: createdUserId } }
      );

      const res = await makeRequest(
        `/api/user/login?email=${encodeURIComponent(testEmail1)}&password=${encodeURIComponent(initialPlainPassword)}`
      );

      if (
        res.status === 403 &&
        res.body?.status === "false" &&
        res.body?.is_banned === 1 &&
        res.body?.banned_remarks === "Fraudulent test activity"
      ) {
        console.log(`   ✅ PASS: Banned user blocked with HTTP 403 & remarks included\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }

      // Unban for subsequent tests
      await UserLogin.update({ is_banned: "0", banned_remarks: null }, { where: { id: createdUserId } });
    } catch (e) {
      console.error(`   ❌ FAIL [Test 9]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 10: OTP generation via POST (Forgot password OTP)
    // -------------------------------------------------------------------------
    let generatedOtp;
    try {
      console.log("▶ [Test 10] Forgot password OTP generation (POST /api/user/forgot/password/otp)");
      const res = await makeRequest("/api/user/forgot/password/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail1 }),
      });

      if (
        res.body?.status === "true" &&
        (res.body?.message === "OTP sent to email successfully" || res.body?.message === "OTP sent successfully") &&
        res.body?.otp
      ) {
        generatedOtp = res.body.otp;
        const dbRecord = await UserLogin.findByPk(createdUserId);
        if (dbRecord.otp === generatedOtp && dbRecord.otp_expires_at) {
          console.log(`   ✅ PASS: OTP "${generatedOtp}" stored with expiry in DB\n`);
          passed++;
        } else {
          throw new Error("DB verification failed: OTP or expiry not stored");
        }
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 10]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 10b: OTP generation via GET (Both HTTP methods supported)
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 10b] Forgot password OTP generation via GET (GET /api/user/forgot/password/otp)");
      const res = await makeRequest(`/api/user/forgot/password/otp?email=${encodeURIComponent(testEmail1)}`);

      if (res.body?.status === "true" && res.body?.otp) {
        generatedOtp = res.body.otp;
        console.log(`   ✅ PASS: GET method for forgot password OTP works as expected\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 10b]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 11: OTP expiration
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 11] OTP expiration validation (POST /api/user/forgot/password/set)");
      // Set OTP expiry to 1 hour ago
      await UserLogin.update(
        { otp_expires_at: new Date(Date.now() - 3600000).toISOString() },
        { where: { id: createdUserId } }
      );

      const res = await makeRequest("/api/user/forgot/password/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail1,
          otp: generatedOtp,
          new_password: "NewPassword@123",
        }),
      });

      if (res.body?.status === "false" && res.body?.message === "OTP has expired. Please request a new one.") {
        console.log(`   ✅ PASS: Expired OTP rejected correctly\n`);
        passed++;
      } else {
        throw new Error(`Expected expiry error, got: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 11]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 12: Invalid OTP verification
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 12] Invalid OTP verification (POST /api/user/forgot/password/set)");
      // Refresh OTP with valid expiry
      await UserLogin.update(
        { otp: "777888", otp_expires_at: new Date(Date.now() + 600000).toISOString() },
        { where: { id: createdUserId } }
      );

      const res = await makeRequest("/api/user/forgot/password/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail1,
          otp: "000000", // Wrong OTP
          new_password: "NewPassword@123",
        }),
      });

      if (res.body?.status === "false" && res.body?.message === "Invalid OTP") {
        console.log(`   ✅ PASS: Invalid OTP rejected correctly\n`);
        passed++;
      } else {
        throw new Error(`Expected 'Invalid OTP', got: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 12]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 13: Valid OTP verification & Password reset (via POST)
    // -------------------------------------------------------------------------
    const resetNewPassword = "BrandNewPassword@2026";
    try {
      console.log("▶ [Test 13] Valid OTP verification & reset (POST /api/user/forgot/password/set)");
      const res = await makeRequest("/api/user/forgot/password/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail1,
          otp: "777888",
          new_password: resetNewPassword,
        }),
      });

      if (
        res.body?.status === "true" &&
        (res.body?.message === "Password reset successfully" || res.body?.message === "Password Changed Successfully")
      ) {
        const dbRecord = await UserLogin.findByPk(createdUserId);
        const matchesNew = await bcrypt.compare(resetNewPassword, dbRecord.password);
        if (matchesNew && dbRecord.otp === null) {
          console.log(`   ✅ PASS: Password reset and hashed; OTP cleared in DB\n`);
          passed++;
        } else {
          throw new Error("DB verification failed: password hash mismatch or OTP not cleared");
        }
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 13]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 14: Login with newly reset password
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 14] Customer login using new reset password (GET /api/user/login)");
      const res = await makeRequest(
        `/api/user/login?email=${encodeURIComponent(testEmail1)}&password=${encodeURIComponent(resetNewPassword)}`
      );

      if (res.body?.status === "true" && res.body?.data?.id === createdUserId) {
        console.log(`   ✅ PASS: Login with new password succeeded\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 14]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 14b: Forgot password reset via GET (Both HTTP methods supported)
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 14b] Forgot password reset via GET method (GET /api/user/forgot/password/set)");
      await UserLogin.update(
        { otp: "112233", otp_expires_at: new Date(Date.now() + 600000).toISOString() },
        { where: { id: createdUserId } }
      );
      const getResetPassword = "GetMethodPassword@2026";
      const res = await makeRequest(
        `/api/user/forgot/password/set?email=${encodeURIComponent(testEmail1)}&otp=112233&new_password=${encodeURIComponent(getResetPassword)}`
      );

      if (
        res.body?.status === "true" &&
        (res.body?.message === "Password reset successfully" || res.body?.message === "Password Changed Successfully")
      ) {
        console.log(`   ✅ PASS: GET method for password reset works\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 14b]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 15: Existing customer profile view
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 15] Customer profile view (GET /api/user/view/:id)");
      const res = await makeRequest(`/api/user/view/${createdUserId}`);

      if (
        res.status === 200 &&
        res.body?.status === "true" &&
        Array.isArray(res.body?.data) &&
        res.body.data[0]?.id === createdUserId &&
        res.body.data[0]?.email === testEmail1
      ) {
        console.log(`   ✅ PASS: Profile view matches Laravel contract with data array\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 15]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 16: Nonexistent customer profile view
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 16] Nonexistent customer profile view (GET /api/user/view/999999999)");
      const res = await makeRequest(`/api/user/view/999999999`);

      if (res.status === 404 && res.body?.status === "false" && res.body?.message === "User not found") {
        console.log(`   ✅ PASS: Nonexistent user returns 404 with 'User not found'\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 16]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 17: Customer profile update
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 17] Customer profile update (POST /api/user/edit/:id)");
      const updatePayload = {
        username: "Updated Profile Name",
        address: "42 Bespoke Boulevard, Suite 100",
        pincode: "600001",
        dob: "1995-05-15",
        gender: "Female",
        prefered_language: "English",
      };

      const res = await makeRequest(`/api/user/edit/${createdUserId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });

      if (
        res.body?.status === "true" &&
        res.body?.message === "User updated successfully" &&
        Array.isArray(res.body?.data) &&
        res.body.data[0]?.username === "Updated Profile Name" &&
        res.body.data[0]?.prefered_language === "English"
      ) {
        const dbRecord = await UserLogin.findByPk(createdUserId);
        if (
          dbRecord.username === "Updated Profile Name" &&
          dbRecord.pincode === "600001" &&
          dbRecord.gender === "Female" &&
          dbRecord.prefered_language === "English"
        ) {
          console.log(`   ✅ PASS: Profile updated and verified in DB\n`);
          passed++;
        } else {
          throw new Error("DB verification failed for profile update");
        }
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 17]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 18: Duplicate email during update
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 18] Duplicate email during update (POST /api/user/edit/:id)");
      const res = await makeRequest(`/api/user/edit/${createdUserId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail2 }), // belongs to pending user
      });

      if (res.body?.status === "false" && res.body?.message === "The email has already been taken.") {
        console.log(`   ✅ PASS: Rejected duplicate email during update\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 18]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 19: Duplicate mobile during update
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 19] Duplicate mobile during update (POST /api/user/edit/:id)");
      // Find mobile of pending user
      const pendingDb = await UserLogin.findByPk(pendingUserId);
      const res = await makeRequest(`/api/user/edit/${createdUserId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: pendingDb.mobile }),
      });

      if (res.body?.status === "false" && res.body?.message === "The mobile has already been taken.") {
        console.log(`   ✅ PASS: Rejected duplicate mobile during update\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 19]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 20: Invalid date of birth
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 20] Invalid date of birth format validation");
      const res = await makeRequest(`/api/user/edit/${createdUserId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dob: "not-a-valid-date" }),
      });

      if (res.body?.status === "false" && res.body?.message === "The dob is not a valid date.") {
        console.log(`   ✅ PASS: Rejected invalid date of birth\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 20]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 21: Invalid gender validation
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 21] Invalid gender validation");
      const res = await makeRequest(`/api/user/edit/${createdUserId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gender: "Alien" }),
      });

      if (res.body?.status === "false" && res.body?.message === "The selected gender is invalid.") {
        console.log(`   ✅ PASS: Rejected invalid gender\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 21]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 22: Base64 image upload
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 22] Base64 image upload handling (POST /api/user/edit/:id)");
      const res = await makeRequest(`/api/user/edit/${createdUserId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: VALID_BASE64_PNG }),
      });

      if (
        res.body?.status === "true" &&
        res.body?.data[0]?.img_path &&
        res.body.data[0].img_path.includes("/uploads/users/user_")
      ) {
        const savedUrl = res.body.data[0].img_path;
        const filename = savedUrl.split("/").pop();
        const diskPath = path.resolve(__dirname, "../uploads/users", filename);
        if (fs.existsSync(diskPath)) {
          console.log(`   ✅ PASS: Base64 image decoded and persisted to disk (${diskPath})\n`);
          // Clean up image file
          try {
            fs.unlinkSync(diskPath);
          } catch (e) {}
          passed++;
        } else {
          throw new Error(`File was not found on disk at ${diskPath}`);
        }
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 22]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // TEST 23: Invalid image upload
    // -------------------------------------------------------------------------
    try {
      console.log("▶ [Test 23] Invalid image upload format validation");
      const res = await makeRequest(`/api/user/edit/${createdUserId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: "data:application/pdf;base64,JVBERi0xLjQK..." }),
      });

      if (res.status === 400 && res.body?.status === "false" && res.body?.message === "Invalid image format") {
        console.log(`   ✅ PASS: Rejected non-image MIME format with HTTP 400\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 23]:`, e.message, "\n");
      failed++;
    }
  } catch (outerErr) {
    console.error("Critical test runner error:", outerErr);
  } finally {
    // Cleanup test records
    console.log("🧹 Cleaning up test database records...");
    for (const uid of testUsersToCleanup) {
      try {
        await UserLogin.destroy({ where: { id: uid } });
        console.log(`   - Removed test user #${uid}`);
      } catch (err) {
        console.warn(`   - Warning: Could not remove test user #${uid}:`, err.message);
      }
    }

    if (server) {
      server.close();
    }
    await sequelize.close();

    console.log("\n================================================================================");
    console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
    console.log("================================================================================\n");

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runTests();
