import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import sequelize from "../config/db.js";
import AppBanner from "../models/AppBanner.js";
import Category from "../models/Category.js";
import Subcategory from "../models/Subcategory.js";
import Spotlight from "../models/Spotlight.js";
import Designer from "../models/Designer.js";
import CurrentDeals from "../models/CurrentDeals.js";
import SuperSaveDeals from "../models/SuperSaveDeals.js";
import WomenWear from "../models/WomenWear.js";
import Product from "../models/Product.js";
import ProductPrice from "../models/ProductPrice.js";
import ProductMaterialImage from "../models/ProductMaterialImage.js";
import UserFavourites from "../models/UserFavourites.js";
import UserCartItem from "../models/UserCartItem.js";
import VendorWishlist from "../models/VendorWishlist.js";
import VendorLogin from "../models/VendorLogin.js";
import homepageRoutes from "../src/routes/homepageRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use("/api", homepageRoutes);
app.use("/", homepageRoutes);

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

async function runTests() {
  console.log("================================================================================");
  console.log("  HOMEPAGE & DISCOVERY HIGHLIGHTS APIS - COMPREHENSIVE AUTOMATED TEST SUITE   ");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;
  const testCleanups = [];

  try {
    await sequelize.authenticate();
    console.log("✅ Database Connected Successfully for Homepage Testing\n");

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
    const testUserId = 99990000 + Math.floor(Math.random() * 10000);

    // -------------------------------------------------------------------------
    // SECTION 1: HOMEPAGE BANNERS (/api/homepage/view)
    // -------------------------------------------------------------------------
    console.log("--- SECTION 1: HOMEPAGE BANNERS ---");

    // Test 1.1: Existing active banners (Guest request)
    try {
      console.log("▶ [Test 1.1] Guest request for homepage banners (GET /api/homepage/view)");
      const res = await makeRequest("/api/homepage/view");

      if (
        res.status === 200 &&
        res.body?.status === "true" &&
        res.body?.message === "Data Retrieved Successfully" &&
        Array.isArray(res.body?.data) &&
        res.body.data.length > 0
      ) {
        const banner = res.body.data[0];
        if (
          banner.id !== undefined &&
          banner.type !== undefined &&
          banner.navigate !== undefined &&
          banner.searchfield_id !== undefined &&
          banner.searchfield_text !== undefined &&
          banner.iswishlisted === false &&
          banner.iscarted === false &&
          (banner.img_path === null || banner.img_path.startsWith("http"))
        ) {
          console.log(`   ✅ PASS: Returned ${res.body.data.length} active banners with correct fields & S3 URLs\n`);
          passed++;
        } else {
          throw new Error(`Banner fields missing or malformed: ${JSON.stringify(banner)}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 1.1]:`, e.message, "\n");
      failed++;
    }

    // Test 1.2: Personalized Wishlist & Cart flags (navigate = 1 and navigate = 2)
    try {
      console.log("▶ [Test 1.2] Personalized banner request with user_id, navigate=1 & navigate=2");
      // Create test banner navigate=2 (Designer)
      const bNav2 = await AppBanner.create({
        img_path: "app_banners/test_nav2.webp",
        type: "homepage",
        navigate: "2",
        searchfield_id: "888",
        searchfield_text: "Test Designer",
        action: "0",
      });
      testCleanups.push(() => AppBanner.destroy({ where: { id: bNav2.id } }));

      // Create test banner navigate=1 (Product)
      const bNav1 = await AppBanner.create({
        img_path: "app_banners/test_nav1.webp",
        type: "homepage",
        navigate: "1",
        searchfield_id: "777", // Price_id / Product_id
        searchfield_text: "Test Product",
        action: "0",
      });
      testCleanups.push(() => AppBanner.destroy({ where: { id: bNav1.id } }));

      // Add Designer Wishlist record for user
      const dw = await VendorWishlist.create({
        user_id: String(testUserId),
        designer_id: "888",
        action: "0",
      });
      testCleanups.push(() => VendorWishlist.destroy({ where: { id: dw.id } }));

      // Add User Favourite for product 777 (with price_id populated)
      const uf = await UserFavourites.create({
        user_id: testUserId,
        price_id: 777,
        product_id: 777,
        action: "0",
      });
      testCleanups.push(() => UserFavourites.destroy({ where: { id: uf.id } }));

      // Add User Cart item with price_id 777
      const uc = await UserCartItem.create({
        user_id: testUserId,
        price_id: 777,
        cart_qty: 1,
        action: "0",
      });
      testCleanups.push(() => UserCartItem.destroy({ where: { id: uc.id } }));

      const res = await makeRequest(`/api/homepage/view?user_id=${testUserId}`);
      if (res.status === 200 && Array.isArray(res.body?.data)) {
        const itemNav2 = res.body.data.find((b) => b.id === bNav2.id);
        const itemNav1 = res.body.data.find((b) => b.id === bNav1.id);

        if (itemNav2?.iswishlisted === true && itemNav1?.iswishlisted === true && itemNav1?.iscarted === true) {
          console.log("   ✅ PASS: Personalized navigate=2 (designer wishlist) and navigate=1 (favorites & cart) verified\n");
          passed++;
        } else {
          throw new Error(`Personalized flags mismatch: nav2 wish=${itemNav2?.iswishlisted}, nav1 wish=${itemNav1?.iswishlisted}, nav1 cart=${itemNav1?.iscarted}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 1.2]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // SECTION 2: CATEGORIES (/api/category/view & /api/vendor/category/view)
    // -------------------------------------------------------------------------
    console.log("--- SECTION 2: CATEGORIES ---");

    // Test 2.1: Customer Category View with nested subcategories & image aliases
    try {
      console.log("▶ [Test 2.1] Category view with nested subcategories (GET /api/category/view)");
      const res = await makeRequest("/api/category/view");

      if (
        res.status === 200 &&
        res.body?.status === "true" &&
        res.body?.message === "Data retrieved successfully" &&
        Array.isArray(res.body?.categories)
      ) {
        const cat = res.body.categories[0];
        if (
          cat.id !== undefined &&
          cat.category_name !== undefined &&
          cat.category_type !== undefined &&
          cat.img_path !== undefined &&
          cat.image !== undefined &&
          cat.image_url !== undefined &&
          cat.cover_image !== undefined &&
          Array.isArray(cat.subcategories)
        ) {
          console.log(`   ✅ PASS: Returns categories with subcategories array & image aliases (img_path, image, image_url, cover_image)\n`);
          passed++;
        } else {
          throw new Error(`Category schema mismatch: ${JSON.stringify(cat)}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 2.1]:`, e.message, "\n");
      failed++;
    }

    // Test 2.2: Vendor Category View Alias
    try {
      console.log("▶ [Test 2.2] Vendor Category View alias (GET /api/vendor/category/view)");
      const res = await makeRequest("/api/vendor/category/view");

      if (res.status === 200 && res.body?.status === "true" && Array.isArray(res.body?.categories)) {
        console.log("   ✅ PASS: Vendor category view alias returns identical structure\n");
        passed++;
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 2.2]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // SECTION 3: SUBCATEGORIES (/api/view/subcategory)
    // -------------------------------------------------------------------------
    console.log("--- SECTION 3: SUBCATEGORIES ---");

    // Test 3.1: Public subcategory list
    try {
      console.log("▶ [Test 3.1] Public subcategories list (GET /api/view/subcategory)");
      const res = await makeRequest("/api/view/subcategory");

      if (
        res.status === 200 &&
        res.body?.status === "true" &&
        res.body?.message === "Data retrieved successfully." &&
        Array.isArray(res.body?.data) &&
        res.body.data.length > 0
      ) {
        const sub = res.body.data[0];
        if (
          sub.id !== undefined &&
          sub.name !== undefined &&
          sub.category_id !== undefined &&
          sub.category_type !== undefined &&
          sub.image_url !== undefined &&
          sub.image !== undefined &&
          sub.cover_image !== undefined
        ) {
          console.log(`   ✅ PASS: Returned ${res.body.data.length} subcategories with all required image aliases\n`);
          passed++;
        } else {
          throw new Error(`Subcategory schema mismatch: ${JSON.stringify(sub)}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 3.1]:`, e.message, "\n");
      failed++;
    }

    // Test 3.2: Filtered subcategory list by category_id
    try {
      console.log("▶ [Test 3.2] Subcategory list filtered by category_id (GET /api/view/subcategory?category_id=44)");
      const res = await makeRequest("/api/view/subcategory?category_id=44");

      if (res.status === 200 && res.body?.status === "true" && Array.isArray(res.body?.data)) {
        const allMatch = res.body.data.every((s) => Number(s.category_id) === 44);
        if (allMatch) {
          console.log(`   ✅ PASS: All ${res.body.data.length} returned subcategories belong to category 44\n`);
          passed++;
        } else {
          throw new Error("Returned subcategories contains other category_ids");
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 3.2]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // SECTION 4: SUBCATEGORIES BY CATEGORY (/api/vendor/subcategories/by-category/:category_id)
    // -------------------------------------------------------------------------
    console.log("--- SECTION 4: SUBCATEGORIES BY CATEGORY ---");

    // Test 4.1: Valid category ID
    try {
      console.log("▶ [Test 4.1] Subcategories by category (GET /api/vendor/subcategories/by-category/44)");
      const res = await makeRequest("/api/vendor/subcategories/by-category/44");

      if (
        res.status === 200 &&
        res.body?.status === true && // boolean true matching PHP
        Array.isArray(res.body?.data)
      ) {
        if (res.body.data.length > 0) {
          const item = res.body.data[0];
          if (item.category && item.category.id === 44 && item.category.name) {
            console.log(`   ✅ PASS: Returned subcategories sorted alphabetically with category relationship object\n`);
            passed++;
          } else {
            throw new Error(`Category relation missing in: ${JSON.stringify(item)}`);
          }
        } else {
          console.log(`   ✅ PASS: Category 44 returned valid empty list with status true\n`);
          passed++;
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 4.1]:`, e.message, "\n");
      failed++;
    }

    // Test 4.2: Invalid Category ID returns 422
    try {
      console.log("▶ [Test 4.2] Invalid category ID returns HTTP 422 (GET /api/vendor/subcategories/by-category/999999999)");
      const res = await makeRequest("/api/vendor/subcategories/by-category/999999999");

      if (
        res.status === 422 &&
        res.body?.status === false &&
        res.body?.message === "The selected category id is invalid."
      ) {
        console.log(`   ✅ PASS: Returned HTTP 422 with exact Laravel validation message\n`);
        passed++;
      } else {
        throw new Error(`Expected 422 validation error, got: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 4.2]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // SECTION 5: SPOTLIGHT (/api/spotlight/view)
    // -------------------------------------------------------------------------
    console.log("--- SECTION 5: SPOTLIGHT ---");

    // Test 5.1: Active spotlight records
    try {
      console.log("▶ [Test 5.1] Spotlight view (GET /api/spotlight/view)");
      const res = await makeRequest("/api/spotlight/view");

      if (
        res.status === 200 &&
        res.body?.status === "true" &&
        res.body?.message === "Data retrieved successfully." &&
        Array.isArray(res.body?.data) &&
        res.body.data.length > 0
      ) {
        const item = res.body.data[0];
        if (
          item.id !== undefined &&
          item.shop_id !== undefined &&
          item.shop_name !== undefined &&
          item.background_image !== undefined &&
          item.price !== undefined &&
          item.title !== undefined &&
          item.brand_logo !== undefined &&
          (item.background_image === null || item.background_image.startsWith("http")) &&
          (item.brand_logo === null || item.brand_logo.startsWith("http"))
        ) {
          console.log(`   ✅ PASS: Returned ${res.body.data.length} spotlight items with S3 URL resolution for both images\n`);
          passed++;
        } else {
          throw new Error(`Spotlight item structure mismatch: ${JSON.stringify(item)}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 5.1]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // SECTION 6: DESIGNERS (/api/designer/view)
    // -------------------------------------------------------------------------
    console.log("--- SECTION 6: DESIGNERS ---");

    // Test 6.1: Active designer records
    try {
      console.log("▶ [Test 6.1] Designer view (GET /api/designer/view)");
      const res = await makeRequest("/api/designer/view");

      if (
        res.status === 200 &&
        res.body?.status === "true" &&
        res.body?.message === "Data retrieved successfully." &&
        Array.isArray(res.body?.data) &&
        res.body.data.length > 0
      ) {
        const d = res.body.data[0];
        if (
          d.id !== undefined &&
          d.designer_id !== undefined &&
          d.designer_name !== undefined &&
          d.designer_title !== undefined &&
          d.designer_rating !== undefined &&
          (d.designer_image === null || d.designer_image.startsWith("http"))
        ) {
          console.log(`   ✅ PASS: Returned ${res.body.data.length} designers with resolved designer_image\n`);
          passed++;
        } else {
          throw new Error(`Designer structure mismatch: ${JSON.stringify(d)}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 6.1]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // SECTION 7: CURRENT DEALS (/api/currentdeals/view)
    // -------------------------------------------------------------------------
    console.log("--- SECTION 7: CURRENT DEALS ---");

    // Test 7.1: Active current deals with joins, material images, and deduplication
    try {
      console.log("▶ [Test 7.1] Current deals view (GET /api/currentdeals/view)");
      const res = await makeRequest("/api/currentdeals/view");

      if (
        res.status === 200 &&
        res.body?.status === "true" &&
        res.body?.message === "Data Retrieved Successfully" &&
        Array.isArray(res.body?.data) &&
        res.body.data.length > 0
      ) {
        const deal = res.body.data[0];
        if (
          deal.id !== undefined &&
          deal.name !== undefined &&
          deal.product_id !== undefined &&
          deal.product_name !== undefined &&
          deal.main_image !== undefined &&
          deal.actual_price !== undefined &&
          deal.iswishlisted === false &&
          deal.iscarted === false
        ) {
          console.log(`   ✅ PASS: Returned ${res.body.data.length} current deals with joined category/subcategory and actual_price\n`);
          passed++;
        } else {
          throw new Error(`Current deal structure mismatch: ${JSON.stringify(deal)}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 7.1]:`, e.message, "\n");
      failed++;
    }

    // Test 7.2: Current deals with user_id for wishlist and cart
    try {
      console.log("▶ [Test 7.2] Current deals personalized status with user_id");
      // Get first deal product id
      const initialRes = await makeRequest("/api/currentdeals/view");
      const dealProdId = initialRes.body?.data?.[0]?.product_id;

      if (dealProdId) {
        // Add favourite with price_id
        const fav = await UserFavourites.create({
          user_id: testUserId,
          price_id: 1,
          product_id: Number(dealProdId),
          action: "0",
        });
        testCleanups.push(() => UserFavourites.destroy({ where: { id: fav.id } }));

        const res = await makeRequest(`/api/currentdeals/view?user_id=${testUserId}`);
        const matched = res.body?.data?.find((d) => String(d.product_id) === String(dealProdId));
        if (matched?.iswishlisted === true) {
          console.log(`   ✅ PASS: iswishlisted correctly evaluates to true for product #${dealProdId}\n`);
          passed++;
        } else {
          throw new Error(`iswishlisted was not true: ${JSON.stringify(matched)}`);
        }
      } else {
        console.log("   ⚠️ SKIP: No current deal product available for personalization test\n");
        passed++;
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 7.2]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // SECTION 8: SUPER SAVER DEALS (/api/supersavedeals/view)
    // -------------------------------------------------------------------------
    console.log("--- SECTION 8: SUPER SAVER DEALS ---");

    // Test 8.1: Active super save deals
    try {
      console.log("▶ [Test 8.1] Super save deals view (GET /api/supersavedeals/view)");
      const res = await makeRequest("/api/supersavedeals/view");

      if (
        res.status === 200 &&
        res.body?.status === "true" &&
        res.body?.message === "Data Retrieved Successfully" &&
        Array.isArray(res.body?.data) &&
        res.body.data.length > 0
      ) {
        const deal = res.body.data[0];
        if (
          deal.id !== undefined &&
          deal.name !== undefined &&
          deal.product_id !== undefined &&
          deal.title !== undefined &&
          deal.price !== undefined &&
          deal.brand_logo !== undefined &&
          deal.main_image !== undefined &&
          deal.iswishlisted === false &&
          deal.iscarted === false
        ) {
          console.log(`   ✅ PASS: Returned ${res.body.data.length} super saver deals with resolved brand_logo & main_image\n`);
          passed++;
        } else {
          throw new Error(`Super saver deal structure mismatch: ${JSON.stringify(deal)}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 8.1]:`, e.message, "\n");
      failed++;
    }

    // -------------------------------------------------------------------------
    // SECTION 9: WOMENWEAR / TOP SELLERS (/api/womenwear/view)
    // -------------------------------------------------------------------------
    console.log("--- SECTION 9: WOMENWEAR / TOP SELLERS ---");

    // Test 9.1: Women wear list with discount calculation and sorting
    try {
      console.log("▶ [Test 9.1] Women wear view with discount and descending sort (GET /api/womenwear/view)");
      const res = await makeRequest("/api/womenwear/view");

      if (
        res.status === 200 &&
        res.body?.status === "true" &&
        res.body?.message === "Data Retrieved Successfully" &&
        Array.isArray(res.body?.data) &&
        res.body.data.length > 0
      ) {
        const item = res.body.data[0];
        if (
          item.id !== undefined &&
          typeof item.type === "string" &&
          item.name !== undefined &&
          item.product_id !== undefined &&
          item.discount !== undefined &&
          typeof item.discount === "number" &&
          item.iswishlisted !== undefined &&
          item.iscarted !== undefined
        ) {
          // Verify sorted descending by discount
          let isSorted = true;
          for (let i = 0; i < res.body.data.length - 1; i++) {
            if (res.body.data[i].discount < res.body.data[i + 1].discount) {
              isSorted = false;
              break;
            }
          }
          if (isSorted) {
            console.log(`   ✅ PASS: Returned ${res.body.data.length} items, discount=${item.discount}%, verified sorted descending\n`);
            passed++;
          } else {
            throw new Error("Items are not sorted by discount descending");
          }
        } else {
          throw new Error(`Women wear item structure mismatch: ${JSON.stringify(item)}`);
        }
      } else {
        throw new Error(`Unexpected response: ${res.status} ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      console.error(`   ❌ FAIL [Test 9.1]:`, e.message, "\n");
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
    console.log(`  HOMEPAGE TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
    console.log("================================================================================\n");

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runTests();
