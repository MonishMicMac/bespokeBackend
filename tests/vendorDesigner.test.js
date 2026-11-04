import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import sequelize from "../config/db.js";
import {
  VendorLogin,
  UserLogin,
  Product,
  ProductPrice,
  ProductMaterial,
  ProductMaterialImage,
  Category,
  Subcategory,
  UserFavourites,
  UserCartItem,
  VendorPortfolioImage,
  DesignerPortfolio,
  DesignerSpecialities,
  ShopWishlist,
  Designer,
  DesignerWishlist,
} from "../models/setupAssociations.js";
import vendorDesignerRoutes from "../src/routes/vendorDesignerRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use("/api", vendorDesignerRoutes);
app.use("/", vendorDesignerRoutes);

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
  console.log("  BOUTIQUE & DESIGNER APIS - COMPREHENSIVE AUTOMATED TEST SUITE                 ");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;
  const testCleanups = [];

  try {
    await sequelize.authenticate();
    console.log("✅ Database Connected Successfully for Boutique & Designer Testing\n");

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
    const testShopId = 77770000 + Math.floor(Math.random() * 10000);
    const testDesignerId = 66660000 + Math.floor(Math.random() * 10000);

    // Setup Test User
    const testUser = await UserLogin.create({
      id: testUserId,
      username: `testuser_${timestamp}`,
      mobile: `99${timestamp.toString().slice(-8)}`,
      email: `testuser_${timestamp}@example.com`,
      action: "0",
    });
    testCleanups.push(async () => {
      await UserLogin.destroy({ where: { id: testUserId } });
    });

    // Setup Test Boutique (vendor_type = 1, approval_status = 1, action = 0)
    const testBoutique = await VendorLogin.create({
      id: testShopId,
      shop_name: `Boutique_${timestamp}`,
      username: `boutique_${timestamp}`,
      email: `boutique_${timestamp}@example.com`,
      mobile: `88${timestamp.toString().slice(-8)}`,
      password: "testpassword",
      vendor_type: "1",
      approval_status: "1",
      action: "0",
      img_path: "placeholder_vendor.jpg",
      is_customization: "1",
      title: "Haute Couture",
      rating: "4.5",
      description: "Elite boutique for custom designer clothing",
    });
    testCleanups.push(async () => {
      await VendorLogin.destroy({ where: { id: testShopId } });
    });

    // Setup Test Designer (vendor_type = 2, approval_status = 1, action = 0)
    const testDesigner = await VendorLogin.create({
      id: testDesignerId,
      shop_name: `Designer_${timestamp}`,
      username: `designer_${timestamp}`,
      email: `designer_${timestamp}@example.com`,
      mobile: `77${timestamp.toString().slice(-8)}`,
      password: "testpassword",
      vendor_type: "2",
      approval_status: "1",
      action: "0",
      img_path: "designer_img.jpg",
      is_customization: "1",
      title: "Master Couturier",
      rating: "4.8",
      description: "Award-winning bespoke master fashion designer",
    });
    testCleanups.push(async () => {
      await VendorLogin.destroy({ where: { id: testDesignerId } });
    });

    // Portfolio Image for test Boutique
    const testBoutiquePortfolio = await VendorPortfolioImage.create({
      vendor_id: testShopId,
      image: "portfolio_boutique_1.jpg",
    });
    testCleanups.push(async () => {
      await VendorPortfolioImage.destroy({ where: { vendor_id: testShopId } });
    });

    // Specialities for test Designer
    const testSpeciality = await DesignerSpecialities.create({
      vendor_id: testDesignerId,
      speciality_name: "Bridal Couture",
      action: "0",
    });
    testCleanups.push(async () => {
      await DesignerSpecialities.destroy({ where: { vendor_id: testDesignerId } });
    });

    // Setup Test Products for Boutique & Designer
    const boutiqueProduct = await Product.create({
      room_id: "1",
      product_id: `PROD_B_${timestamp}`,
      vendor_id: String(testShopId),
      product_name: `Boutique Gown ${timestamp}`,
      category: "Ethnic Wear",
      action: "0",
      is_active: "1",
      description: "Exquisite handmade evening gown",
    });
    testCleanups.push(async () => {
      await Product.destroy({ where: { vendor_id: String(testShopId) } });
    });

    const boutiquePrice = await ProductPrice.create({
      product_id: boutiqueProduct.id,
      size: "M",
      actual_price: 10000,
      mrp: 10000,
      selling_price: 8500,
      qty: 10,
      action: "0",
    });
    testCleanups.push(async () => {
      await ProductPrice.destroy({ where: { product_id: boutiqueProduct.id } });
    });

    const designerProduct = await Product.create({
      room_id: "1",
      product_id: `PROD_D_${timestamp}`,
      vendor_id: String(testDesignerId),
      product_name: `Designer Sherwani ${timestamp}`,
      category: "Occasion Wear",
      action: "0",
      is_active: "1",
      description: "Royal bespoke silk sherwani",
    });
    testCleanups.push(async () => {
      await Product.destroy({ where: { vendor_id: String(testDesignerId) } });
    });

    const designerPrice = await ProductPrice.create({
      product_id: designerProduct.id,
      size: "L",
      actual_price: 25000,
      mrp: 25000,
      selling_price: 20000,
      qty: 5,
      action: "0",
    });
    testCleanups.push(async () => {
      await ProductPrice.destroy({ where: { product_id: designerProduct.id } });
    });

    // Cleanups for wishlists
    testCleanups.push(async () => {
      await DesignerWishlist.destroy({ where: { user_id: String(testUserId) } });
      await ShopWishlist.destroy({ where: { user_id: String(testUserId) } });
    });

    // =========================================================================
    // API 1: Boutique Listing (GET /api/shoplist/view)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("API 1: Boutique Listing (GET /api/shoplist/view)");
    console.log("--------------------------------------------------------------------------------");

    // Test 1.1: Listing without user_id
    try {
      console.log("▶ Test 1.1: Fetch boutique listing without user_id");
      const res = await makeRequest("/api/shoplist/view");
      if (res.status === 200 && res.body?.status === "true" && Array.isArray(res.body.data)) {
        const found = res.body.data.find((s) => s.id === testShopId);
        if (found) {
          console.log(`   ✅ PASS: Found created boutique ID ${found.id}, name: ${found.shop_name}, wishlist: ${found.wishlist}\n`);
          passed++;
        } else {
          throw new Error("Created boutique not found in listing");
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.1]:", e.message, "\n");
      failed++;
    }

    // Test 1.2: Listing with valid user_id
    try {
      console.log("▶ Test 1.2: Fetch boutique listing with valid user_id");
      // Add shop to designer wishlist first
      await DesignerWishlist.create({
        user_id: String(testUserId),
        designer_id: String(testShopId),
        action: "0",
      });

      const res = await makeRequest(`/api/shoplist/view?user_id=${testUserId}`);
      if (res.status === 200 && res.body?.status === "true") {
        const found = res.body.data.find((s) => s.id === testShopId);
        if (found && found.wishlist === true) {
          console.log(`   ✅ PASS: Boutique marked wishlist=true for authenticated user\n`);
          passed++;
        } else {
          throw new Error(`Boutique wishlist status mismatch: ${found?.wishlist}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.2]:", e.message, "\n");
      failed++;
    }

    // Test 1.3: Listing with invalid user_id -> returns { status: "false", message: "No User found.", data: [] }
    try {
      console.log("▶ Test 1.3: Fetch boutique listing with invalid user_id");
      const res = await makeRequest("/api/shoplist/view?user_id=999999999");
      if (res.status === 200 && res.body?.status === "false" && res.body.message === "No User found." && Array.isArray(res.body.data) && res.body.data.length === 0) {
        console.log(`   ✅ PASS: Returns status="false", message="No User found.", data=[]\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 1.3]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // API 2: Boutique Product Listing (GET /api/shoplist/product)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("API 2: Boutique Product Listing (GET /api/shoplist/product)");
    console.log("--------------------------------------------------------------------------------");

    // Test 2.1: Missing shop_id returns 400
    try {
      console.log("▶ Test 2.1: Missing shop_id returns HTTP 400");
      const res = await makeRequest("/api/shoplist/product");
      if (res.status === 400 && res.body?.status === "false" && res.body.message === "Shop ID is required.") {
        console.log(`   ✅ PASS: HTTP 400 with status="false", message="Shop ID is required."\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.1]:", e.message, "\n");
      failed++;
    }

    // Test 2.2: Non-existent shop returns 404
    try {
      console.log("▶ Test 2.2: Non-existent shop returns HTTP 404");
      const res = await makeRequest("/api/shoplist/product?shop_id=999999999");
      if (res.status === 404 && res.body?.status === "false" && res.body.message === "No Shop found.") {
        console.log(`   ✅ PASS: HTTP 404 with status="false", message="No Shop found."\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.2]:", e.message, "\n");
      failed++;
    }

    // Test 2.3: Valid boutique with products
    try {
      console.log("▶ Test 2.3: Valid boutique returns products and shop details");
      const res = await makeRequest(`/api/shoplist/product?shop_id=${testShopId}&user_id=${testUserId}`);
      if (
        res.status === 200 &&
        res.body?.status === "true" &&
        res.body?.shop?.id === testShopId &&
        Array.isArray(res.body.shop.products)
      ) {
        const prod = res.body.shop.products.find((p) => p.id === boutiqueProduct.id);
        if (prod && res.body.shop.pagination) {
          console.log(`   ✅ PASS: Returned shop details, product ID ${prod.id}, price=${prod.selling_price}, pagination intact\n`);
          passed++;
        } else {
          throw new Error(`Product not found in shop response: ${JSON.stringify(res.body.shop)}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 2.3]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // API 3: Designer Listing (GET /api/designerlist/view/:user_id?)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("API 3: Designer Listing (GET /api/designerlist/view/:user_id?)");
    console.log("--------------------------------------------------------------------------------");

    // Test 3.1: Listing without user_id
    try {
      console.log("▶ Test 3.1: Designer listing without user_id");
      const res = await makeRequest("/api/designerlist/view");
      if (res.status === 200 && res.body?.status === "true" && Array.isArray(res.body.data)) {
        const found = res.body.data.find((d) => d.id === testDesignerId);
        if (found && Array.isArray(found.specialities) && found.specialities.includes("Bridal Couture")) {
          console.log(`   ✅ PASS: Found designer ID ${found.id}, specialities: ${JSON.stringify(found.specialities)}\n`);
          passed++;
        } else {
          throw new Error("Created designer or speciality not found in listing");
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.1]:", e.message, "\n");
      failed++;
    }

    // Test 3.2: Listing with route param user_id
    try {
      console.log("▶ Test 3.2: Designer listing with route param user_id");
      const res = await makeRequest(`/api/designerlist/view/${testUserId}`);
      if (res.status === 200 && res.body?.status === "true") {
        const found = res.body.data.find((d) => d.id === testDesignerId);
        if (found && typeof found.wishlist === "boolean") {
          console.log(`   ✅ PASS: Route param user_id handled, wishlist=${found.wishlist}\n`);
          passed++;
        } else {
          throw new Error("Designer listing route param failed");
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.2]:", e.message, "\n");
      failed++;
    }

    // Test 3.3: Invalid user_id
    try {
      console.log("▶ Test 3.3: Designer listing with invalid user_id");
      const res = await makeRequest("/api/designerlist/view/999999999");
      if (res.status === 200 && res.body?.status === "false" && res.body.message === "No User found." && res.body.data?.length === 0) {
        console.log(`   ✅ PASS: Returns status="false", message="No User found.", data=[]\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 3.3]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // API 4: Designer Product Listing (GET /api/designer/product)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("API 4: Designer Product Listing (GET /api/designer/product)");
    console.log("--------------------------------------------------------------------------------");

    // Test 4.1: Missing designer_id returns 200 with status "false" (Laravel contract)
    try {
      console.log("▶ Test 4.1: Missing designer_id returns HTTP 200 with status='false'");
      const res = await makeRequest("/api/designer/product");
      if (res.status === 200 && res.body?.status === "false" && res.body.message === "Designer ID is required.") {
        console.log(`   ✅ PASS: Laravel contract preserved: HTTP 200 status="false", "Designer ID is required."\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 4.1]:", e.message, "\n");
      failed++;
    }

    // Test 4.2: Non-existent designer returns HTTP 200 with status "false"
    try {
      console.log("▶ Test 4.2: Non-existent designer returns HTTP 200 with status='false'");
      const res = await makeRequest("/api/designer/product?designer_id=999999999");
      if (res.status === 200 && res.body?.status === "false" && res.body.message === "No Shop found.") {
        console.log(`   ✅ PASS: HTTP 200 with status="false", message="No Shop found."\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 4.2]:", e.message, "\n");
      failed++;
    }

    // Test 4.3: Valid designer product listing
    try {
      console.log("▶ Test 4.3: Valid designer returns designer details, products, portfolio, pagination");
      const res = await makeRequest(`/api/designer/product?designer_id=${testDesignerId}&user_id=${testUserId}`);
      if (
        res.status === 200 &&
        res.body?.status === "true" &&
        res.body?.designer?.id === testDesignerId &&
        Array.isArray(res.body.designer.products) &&
        Array.isArray(res.body.designer.portfolio)
      ) {
        const prod = res.body.designer.products.find((p) => p.id === designerProduct.id);
        if (prod && res.body.pagination) {
          console.log(`   ✅ PASS: Designer product ID ${prod.id}, price=${prod.selling_price}, portfolio and pagination validated\n`);
          passed++;
        } else {
          throw new Error(`Product not found in designer response: ${JSON.stringify(res.body.designer)}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 4.3]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // API 5: Vendor Portfolio (GET /api/vendor/portfolio/:vendor_id)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("API 5: Vendor Portfolio (GET /api/vendor/portfolio/:vendor_id)");
    console.log("--------------------------------------------------------------------------------");

    // Test 5.1: Non-existent vendor returns 404
    try {
      console.log("▶ Test 5.1: Non-existent vendor returns HTTP 404");
      const res = await makeRequest("/api/vendor/portfolio/999999999");
      if (res.status === 404 && res.body?.status === false && res.body.message === "Vendor not found") {
        console.log(`   ✅ PASS: HTTP 404 with status=false, message="Vendor not found"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 5.1]:", e.message, "\n");
      failed++;
    }

    // Test 5.2: Valid vendor with portfolio images
    try {
      console.log("▶ Test 5.2: Valid vendor returns portfolio images with S3 URLs");
      const res = await makeRequest(`/api/vendor/portfolio/${testShopId}`);
      if (
        res.status === 200 &&
        res.body?.status === true &&
        res.body.data?.vendor_id === testShopId &&
        Array.isArray(res.body.data.portfolio_images)
      ) {
        const img = res.body.data.portfolio_images.find((i) => i.id === testBoutiquePortfolio.id);
        if (img && img.image_url) {
          console.log(`   ✅ PASS: Found portfolio image ID ${img.id}, url: ${img.image_url}\n`);
          passed++;
        } else {
          throw new Error(`Portfolio image not found in response: ${JSON.stringify(res.body.data)}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 5.2]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // API 6: Add Vendor to Favorites (POST /api/favorite/vendor)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("API 6: Add Vendor to Favorites (POST /api/favorite/vendor)");
    console.log("--------------------------------------------------------------------------------");

    // Clear any leftover wishlist for testDesignerId
    await DesignerWishlist.destroy({
      where: {
        user_id: String(testUserId),
        designer_id: String(testDesignerId),
      },
    });

    // Test 6.1: Missing fields
    try {
      console.log("▶ Test 6.1: Missing fields returns validation message");
      const res = await makeRequest("/api/favorite/vendor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: testUserId }),
      });
      if (res.status === 200 && res.body?.status === "false" && res.body.message === "user_id and vendor_id are required") {
        console.log(`   ✅ PASS: status="false", message="user_id and vendor_id are required"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 6.1]:", e.message, "\n");
      failed++;
    }

    // Test 6.2: Add vendor to favorites successfully
    try {
      console.log("▶ Test 6.2: Add vendor to favorites successfully");
      const res = await makeRequest("/api/favorite/vendor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: testUserId, vendor_id: testDesignerId }),
      });
      if (res.status === 200 && res.body?.status === "true" && res.body.message === "This added successfully") {
        console.log(`   ✅ PASS: status="true", message="This added successfully"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 6.2]:", e.message, "\n");
      failed++;
    }

    // Test 6.3: Duplicate add to favorites
    try {
      console.log("▶ Test 6.3: Duplicate add to favorites returns 'This added successfully' per Laravel idempotency");
      const res = await makeRequest("/api/favorite/vendor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: testUserId, vendor_id: testDesignerId }),
      });
      if (res.status === 200 && res.body?.status === "true" && res.body.message === "This added successfully") {
        console.log(`   ✅ PASS: status="true", message="This added successfully"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 6.3]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // API 7: Remove Vendor from Favorites (POST /api/remove/favorite/vendor)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("API 7: Remove Vendor from Favorites (POST /api/remove/favorite/vendor)");
    console.log("--------------------------------------------------------------------------------");

    // Test 7.1: Missing fields
    try {
      console.log("▶ Test 7.1: Missing fields returns validation message");
      const res = await makeRequest("/api/remove/favorite/vendor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor_id: testDesignerId }),
      });
      if (res.status === 200 && res.body?.status === "false" && res.body.message === "user_id and vendor_id are required") {
        console.log(`   ✅ PASS: status="false", message="user_id and vendor_id are required"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 7.1]:", e.message, "\n");
      failed++;
    }

    // Test 7.2: Remove successfully
    try {
      console.log("▶ Test 7.2: Remove designer from favorites successfully");
      const res = await makeRequest("/api/remove/favorite/vendor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: testUserId, vendor_id: testDesignerId }),
      });
      if (res.status === 200 && res.body?.status === "true" && res.body.message === "This designer removed successfully from the wishlist") {
        console.log(`   ✅ PASS: status="true", message="This designer removed successfully from the wishlist"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 7.2]:", e.message, "\n");
      failed++;
    }

    // Test 7.3: Remove again (not in wishlist)
    try {
      console.log("▶ Test 7.3: Remove again returns not in wishlist");
      const res = await makeRequest("/api/remove/favorite/vendor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: testUserId, vendor_id: testDesignerId }),
      });
      if (res.status === 200 && res.body?.status === "false" && res.body.message === "This designer is not in the wishlist") {
        console.log(`   ✅ PASS: status="false", message="This designer is not in the wishlist"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 7.3]:", e.message, "\n");
      failed++;
    }

    // =========================================================================
    // API 8: Add Boutique to Shop Wishlist (POST /api/addtoshopwishlist)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("API 8: Add Boutique to Shop Wishlist (POST /api/addtoshopwishlist)");
    console.log("--------------------------------------------------------------------------------");

    // Clean any prior wishlist for testShopId
    await ShopWishlist.destroy({
      where: {
        user_id: String(testUserId),
        shop_id: String(testShopId),
      },
    });

    // Test 8.1: Missing fields
    try {
      console.log("▶ Test 8.1: Missing fields returns validation message");
      const res = await makeRequest("/api/addtoshopwishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: testUserId }),
      });
      if (res.status === 200 && res.body?.status === "false" && res.body.message === "user_id and shop_id are required") {
        console.log(`   ✅ PASS: status="false", message="user_id and shop_id are required"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 8.1]:", e.message, "\n");
      failed++;
    }

    // Test 8.2: Target vendor is designer (vendor_type = 2) -> "This is not a shop"
    try {
      console.log("▶ Test 8.2: Target vendor is designer (vendor_type=2)");
      const res = await makeRequest("/api/addtoshopwishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: testUserId, shop_id: testDesignerId }),
      });
      if (res.status === 200 && res.body?.status === "false" && res.body.message === "This is not a shop") {
        console.log(`   ✅ PASS: Correctly rejected with status="false", message="This is not a shop"\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 8.2]:", e.message, "\n");
      failed++;
    }

    // Test 8.3: Add valid boutique to shop wishlist
    try {
      console.log("▶ Test 8.3: Add active approved boutique to shop wishlist");
      const res = await makeRequest("/api/addtoshopwishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: testUserId, shop_id: testShopId }),
      });
      if (res.status === 200 && res.body?.status === "true" && res.body.message === "Shop added to your wishlist successfully.") {
        console.log(`   ✅ PASS: status="true", message="Shop added to your wishlist successfully."\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 8.3]:", e.message, "\n");
      failed++;
    }

    // Test 8.4: Duplicate addition to shop wishlist
    try {
      console.log("▶ Test 8.4: Duplicate addition to shop wishlist");
      const res = await makeRequest("/api/addtoshopwishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: testUserId, shop_id: testShopId }),
      });
      if (res.status === 200 && res.body?.status === "false" && res.body.message === "This shop is already in your wishlist.") {
        console.log(`   ✅ PASS: status="false", message="This shop is already in your wishlist."\n`);
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error("   ❌ FAIL [Test 8.4]:", e.message, "\n");
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
    console.log(`  BOUTIQUE & DESIGNER TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
    console.log("================================================================================\n");

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runTests();
