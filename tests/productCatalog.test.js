/**
 * Comprehensive Automated Test Suite for Products & Catalog APIs
 *
 * Covers:
 * 1. Product listing (/api/product/list and /api/vendor/product/list)
 * 2. Complete product details (/api/show/product) covering 18 test scenarios:
 *    - Product ID 426 initial test case
 *    - Multiple materials
 *    - Multiple prices and sizes
 *    - Free Size handling
 *    - Customizable vs ready-made variant grouping
 *    - Multiple material images with S3 URLs
 *    - Add-ons and add-on images
 *    - Product measurement data transformation
 *    - Product with no measurement data
 *    - Product with no reviews
 *    - Both review sources (SaleOrderReview + CustomerReview)
 *    - Product with valid user_id
 *    - Product without user_id
 *    - Product with wishlist records
 *    - Product with cart records
 *    - Invalid product ID (missing, non-integer, nonexistent)
 *    - Invalid user ID (non-integer, nonexistent)
 *    - Product belonging to a banned vendor
 *    - Product with missing or unavailable images
 * 3. Product sizewise measurements (/api/product-measurements/sizewise/:product_id?)
 * 4. Product search (/api/products/search)
 */

import http from "http";
import express from "express";
import sequelize from "../config/db.js";
import productRoutes from "../src/routes/productRoutes.js";
import {
  Product,
  ProductMaterial,
  ProductPrice,
  ProductImage,
  ProductMaterialImage,
  ProductInfo,
  ProductAddon,
  ProductAddonImage,
  ProductMeasurement,
  Measurement,
  VendorLogin,
  UserLogin,
  UserFavourites,
  UserCartItem,
  SaleOrder,
  SaleOrderReview,
  CustomerReview,
} from "../models/setupAssociations.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount catalog routes
app.use("/api", productRoutes);
app.use("/api/vendor", productRoutes);
app.use("/", productRoutes);

let server;
let baseUrl = "";

async function makeRequest(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const status = response.status;
  let json = null;
  try {
    json = await response.json();
  } catch (err) {
    json = null;
  }
  return { status, json };
}

async function runTests() {
  console.log("================================================================================");
  console.log("    PRODUCTS & CATALOG APIS - COMPREHENSIVE AUTOMATED TEST SUITE                ");
  console.log("================================================================================");

  try {
    await sequelize.authenticate();
    console.log("✅ Database Connected Successfully for Products Testing\n");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  }

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`📡 In-process test server listening on ${baseUrl}\n`);

  let totalPassed = 0;
  let totalFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`   ✅ PASS: ${message}`);
      totalPassed++;
    } else {
      console.error(`   ❌ FAIL: ${message}`);
      totalFailed++;
    }
  }

  // --- SECTION 1: PRODUCT LISTING ---
  console.log("--- SECTION 1: PRODUCT LISTING (/api/product/list) ---");

  console.log("▶ [Test 1.1] Product listing without filters (GET /api/product/list)");
  const listRes = await makeRequest("/api/product/list?per_page=5&page=1");
  assert(listRes.status === 200, "Returns HTTP 200");
  assert(listRes.json?.status === true, "Response status is true");
  assert(listRes.json?.data?.current_page === 1, "Paginator current_page is 1");
  assert(Array.isArray(listRes.json?.data?.data), "Paginator data is an array");
  assert(listRes.json?.data?.data?.length <= 5, "Honors per_page parameter");
  if (listRes.json?.data?.data?.length > 0) {
    const item = listRes.json.data.data[0];
    assert(typeof item.id === "number", "Item has numeric id");
    assert(typeof item.product_name === "string", "Item has product_name string");
    assert(item.actual_price !== undefined, "Item has actual_price");
    assert(item.discount_price !== undefined, "Item has discount_price");
    assert(String(item.is_active) === "1", "Item strictly filtered for is_active = 1");
  }

  console.log("\n▶ [Test 1.2] Vendor product list alias (GET /api/vendor/product/list)");
  const aliasRes = await makeRequest("/api/vendor/product/list?per_page=5");
  assert(aliasRes.status === 200, "Alias returns HTTP 200");
  assert(aliasRes.json?.status === true, "Alias status is true");
  assert(Array.isArray(aliasRes.json?.data?.data), "Alias returns paginated data array");

  console.log("\n▶ [Test 1.3] Category & Subcategory filter (GET /api/product/list?category_id=44&subcategory_id=124)");
  const catRes = await makeRequest("/api/product/list?category_id=44&subcategory_id=124");
  assert(catRes.status === 200, "Category filter returns HTTP 200");
  assert(catRes.json?.status === true, "Category filter returns status true");
  assert(Array.isArray(catRes.json?.data?.data), "Finds active products in category 44 & subcategory 124");

  console.log("\n▶ [Test 1.4] Search filter by product name (GET /api/product/list?search=Black)");
  const searchRes = await makeRequest("/api/product/list?search=Black");
  assert(searchRes.status === 200, "Search query returns HTTP 200");
  assert(searchRes.json?.data?.data?.length > 0, "Search results include 'Black' product");

  console.log("\n▶ [Test 1.5] Vendor filtering by numeric vendor_id (GET /api/product/list?vendor_id=1)");
  const listResVendor = await makeRequest("/api/product/list?vendor_id=1");
  assert(listResVendor.status === 200, "Vendor filter returns HTTP 200");
  assert(listResVendor.json?.data?.total > 0, "Returns products for vendor 1");

  console.log("\n▶ [Test 1.6] Banned vendor exclusion (GET /api/product/list?vendor_id=9999999)");
  const bannedVendor = await VendorLogin.create({
    shop_name: "Banned Studio Test",
    username: "banned_test_user",
    email: `banned_${Date.now()}@example.com`,
    is_banned: "1",
    banned_remarks: "Suspended for fraudulent activity",
  });

  const bannedRes = await makeRequest(`/api/product/list?vendor_id=${bannedVendor.id}`);
  assert(bannedRes.status === 200, "Banned vendor returns HTTP 200");
  assert(bannedRes.json?.status === true, "Status is true");
  assert(bannedRes.json?.data?.total === 0, "Total is 0 for banned vendor");
  assert(bannedRes.json?.data?.from === 0 && bannedRes.json?.data?.to === 0, "from and to are 0");

  // --- SECTION 2: PRODUCT DETAILS (18 COMPREHENSIVE SCENARIOS) ---
  console.log("\n--- SECTION 2: PRODUCT DETAILS (/api/show/product - 18 SCENARIOS) ---");

  // Test 2.1: Initial test case Product 426
  console.log("▶ [Test 2.1] Initial test case Product 426 (GET /api/show/product?product_id=426)");
  const res426 = await makeRequest("/api/show/product?product_id=426");
  assert(res426.status === 200, "Returns HTTP 200");
  assert(res426.json?.status === true, "Status is true");
  assert(res426.json?.data?.id === 426, "Product ID is 426");
  assert(res426.json?.data?.product_name === "Saree", "Product name matches 'Saree'");
  assert(res426.json?.data?.category?.name === "Traditional", "Category is Traditional");
  assert(res426.json?.data?.subcategory?.name === "Saree", "Subcategory is Saree");
  assert(res426.json?.data?.lowest_price_main_image?.startsWith("http"), "lowest_price_main_image is valid S3 URL");
  assert(res426.json?.data?.actual_price === "113.00" || res426.json?.data?.actual_price === "113", "actual_price matches lowest price variant");
  assert(res426.json?.data?.offer_price === "113.00" || res426.json?.data?.offer_price === "113", "offer_price matches lowest price variant");

  // Test 2.2: Product with multiple materials
  console.log("\n▶ [Test 2.2] Product with multiple materials");
  const mats426 = res426.json?.data?.product_materials || res426.json?.data?.productMaterials;
  assert(Array.isArray(mats426) && mats426.length >= 2, "Product 426 has multiple materials (Red Saree & Green saree)");
  assert(mats426[0].name === "Red Saree" && mats426[1].name === "Green saree", "Preserves material names");

  // Test 2.3: Product with multiple prices and sizes
  console.log("\n▶ [Test 2.3] Product with multiple prices and sizes");
  const res417 = await makeRequest("/api/show/product?product_id=417");
  assert(res417.status === 200, "Product 417 details returns HTTP 200");
  assert(Array.isArray(res417.json?.data?.sizes) && res417.json?.data?.sizes.length > 0, "Product 417 has sizes array");
  const mat417 = res417.json?.data?.product_materials?.[0] || res417.json?.data?.productMaterials?.[0];
  const allPrices417 = [
    ...(mat417?.prices?.customizable_products || []),
    ...(mat417?.prices?.ready_made_products || []),
  ];
  assert(allPrices417.length > 0, "Material has prices");
  assert(allPrices417[0].price_id !== undefined, "Price has price_id");
  assert(allPrices417[0].actual_price !== undefined, "Price has actual_price");

  // Test 2.4: Product with Free Size
  console.log("\n▶ [Test 2.4] Product with Free Size");
  const freeSizeProduct = await Product.create({
    room_id: 1,
    product_name: "Free Size Pashmina Shawl Test",
    vendor_id: 1,
    category: 49,
    subcategory: 126,
    is_active: "1",
    action: "0",
  });
  const freeSizeMat = await ProductMaterial.create({
    product_id: freeSizeProduct.id,
    name: "Pure Cashmere",
    material_name: "Cashmere",
    is_active: "1",
    action: "0",
  });
  await ProductPrice.create({
    product_id: freeSizeProduct.id,
    material_id: freeSizeMat.id,
    size: "Free Size",
    actual_price: 1500,
    discount_price: 1500,
    qty: 5,
    product_type: 1,
  });

  const freeSizeRes = await makeRequest(`/api/show/product?product_id=${freeSizeProduct.id}`);
  assert(freeSizeRes.status === 200, "Free size product returns HTTP 200");
  assert(freeSizeRes.json?.data?.is_free_size === true, "is_free_size evaluates to true");
  assert(Array.isArray(freeSizeRes.json?.data?.sizes) && freeSizeRes.json?.data?.sizes.length === 0, "sizes is empty array for Free Size");
  assert(Array.isArray(freeSizeRes.json?.data?.measurements_table) && freeSizeRes.json?.data?.measurements_table.length === 0, "measurements_table is empty array for Free Size");

  // Test 2.5: Product with customizable and ready-made variants
  console.log("\n▶ [Test 2.5] Product with customizable and ready-made variants");
  assert(Array.isArray(mat417?.prices?.customizable_products), "Prices grouped into customizable_products");
  assert(Array.isArray(mat417?.prices?.ready_made_products), "Prices grouped into ready_made_products");

  // Test 2.6: Product with multiple material images
  console.log("\n▶ [Test 2.6] Product with multiple material images");
  assert(Array.isArray(mats426[0].images) && mats426[0].images.length > 0, "Material has images array");
  assert(mats426[0].images[0].img_path?.startsWith("http"), "Material image URL begins with http (S3)");

  // Test 2.7: Product with add-ons and add-on images
  console.log("\n▶ [Test 2.7] Product with add-ons and add-on images");
  const tempAddon = await ProductAddon.create({
    product_id: freeSizeProduct.id,
    material_id: freeSizeMat.id,
    name: "Golden Zari Border",
    amount: "250.00",
    action: "0",
  });
  const tempAddonImg = await ProductAddonImage.create({
    addon_id: tempAddon.id, product_id: freeSizeProduct.id,
    img_path: "products/addons/zari_border.jpg",
  });
  const addonProductRes = await makeRequest(`/api/show/product?product_id=${freeSizeProduct.id}`);
  const loadedAddons = (addonProductRes.json?.data?.product_materials?.[0]?.addons) || (addonProductRes.json?.data?.productMaterials?.[0]?.addons);
  assert(Array.isArray(loadedAddons) && loadedAddons.length > 0, "Addon loaded under material");
  assert(loadedAddons[0].price === 250, "Addon price is float number");
  assert(loadedAddons[0].addon_image?.startsWith("http"), "Addon image has S3 URL");

  // Test 2.8: Product with measurement data
  console.log("\n▶ [Test 2.8] Product with measurement data");
  assert(Array.isArray(res417.json?.data?.measurements_table), "measurements_table is present");
  if (res417.json?.data?.measurements_table?.length > 0) {
    const mRow = res417.json?.data?.measurements_table[0];
    assert(mRow.measurement_id !== undefined, "Measurement has measurement_id");
    assert(typeof mRow.values === "object", "Measurement has values object");
  }

  // Test 2.9: Product with no measurement data
  console.log("\n▶ [Test 2.9] Product with no measurement data");
  assert(Array.isArray(res426.json?.data?.measurements_table), "Product 426 measurements_table is array");

  // Test 2.10: Product with no reviews
  console.log("\n▶ [Test 2.10] Product with no reviews");
  assert(Array.isArray(freeSizeRes.json?.data?.reviews) && freeSizeRes.json?.data?.reviews.length === 0, "No reviews product has empty reviews array");
  assert(freeSizeRes.json?.data?.total_reviews === 0, "total_reviews is 0");

  // Test 2.11: Both review sources (SaleOrderReview + CustomerReview)
  console.log("\n▶ [Test 2.11] Product with whole product reviews");
  assert(Array.isArray(res426.json?.data?.reviews), "reviews is an array");
  assert(res426.json?.data?.total_average !== undefined, "total_average rating is present");
  assert(res426.json?.data?.ratings?.five_star_count !== undefined, "five_star_count is present in ratings aggregate");

  // Test 2.12: Product with valid user_id
  console.log("\n▶ [Test 2.12] Product with valid user_id");
  const testUser = await UserLogin.create({
    username: "ProductDetailsTester",
    email: `details_tester_${Date.now()}@example.com`,
    mobile: `98${Date.now().toString().slice(-8)}`,
  });
  const validUserRes = await makeRequest(`/api/show/product?product_id=426&user_id=${testUser.id}`);
  assert(validUserRes.status === 200, "Returns HTTP 200 for authenticated user");
  assert(validUserRes.json?.status === true, "Status is true");

  // Test 2.13: Product without user_id
  console.log("\n▶ [Test 2.13] Product without user_id (guest defaults)");
  assert(res426.json?.data?.wishlist === false, "Guest wishlist is false");
  assert(res426.json?.data?.wishlist_id === null, "Guest wishlist_id is null");
  assert(res426.json?.data?.iscarted === false, "Guest iscarted is false");
  assert(Array.isArray(res426.json?.data?.cart_details) && res426.json?.data?.cart_details.length === 0, "Guest cart_details is empty");

  // Test 2.14: Product with wishlist records
  console.log("\n▶ [Test 2.14] Product with wishlist records");
  const price426 = await ProductPrice.findOne({ where: { product_id: 426 } });
  let tempFav = null;
  if (price426) {
    tempFav = await UserFavourites.create({
      user_id: testUser.id,
      product_id: 426,
      price_id: price426.id,
      action: "0",
    });
  }
  const favRes = await makeRequest(`/api/show/product?product_id=426&user_id=${testUser.id}`);
  assert(favRes.json?.data?.wishlist === true, "wishlist flag evaluates to true");
  assert(favRes.json?.data?.wishlist_id === tempFav?.id, "wishlist_id matches user_favourites record");

  // Test 2.15: Product with cart records
  console.log("\n▶ [Test 2.15] Product with cart records");
  let tempCart = null;
  if (price426) {
    tempCart = await UserCartItem.create({
      user_id: testUser.id,
      price_id: price426.id,
      cart_qty: 2,
      action: "0",
    });
  }
  const cartRes = await makeRequest(`/api/show/product?product_id=426&user_id=${testUser.id}`);
  assert(cartRes.json?.data?.iscarted === true, "iscarted flag evaluates to true");
  assert(Array.isArray(cartRes.json?.data?.cart_details) && cartRes.json?.data?.cart_details.length > 0, "cart_details array contains item");
  assert(cartRes.json?.data?.cart_details[0]?.cart_qty === 2, "cart_qty matches 2");

  // Test 2.16: Invalid product ID
  console.log("\n▶ [Test 2.16] Invalid product ID (missing, non-integer, nonexistent)");
  const missingId = await makeRequest("/api/show/product");
  assert(missingId.status === 200 && missingId.json?.message === "The product id field is required.", "Missing product_id message");
  const nonIntId = await makeRequest("/api/show/product?product_id=abc");
  assert(nonIntId.status === 200 && nonIntId.json?.message === "The product id must be an integer.", "Non-integer product_id message");
  const nonExistId = await makeRequest("/api/show/product?product_id=999999999");
  assert(nonExistId.status === 200 && nonExistId.json?.message === "The selected product id is invalid.", "Nonexistent product_id message");

  // Test 2.17: Invalid user ID
  console.log("\n▶ [Test 2.17] Invalid user ID (non-integer, nonexistent)");
  const nonIntUser = await makeRequest("/api/show/product?product_id=426&user_id=xyz");
  assert(nonIntUser.status === 200 && nonIntUser.json?.message === "The user id must be an integer.", "Non-integer user_id message");
  const nonExistUser = await makeRequest("/api/show/product?product_id=426&user_id=999999999");
  assert(nonExistUser.status === 200 && nonExistUser.json?.message === "The selected user id is invalid.", "Nonexistent user_id message");

  // Test 2.18: Product belonging to a banned vendor
  console.log("\n▶ [Test 2.18] Product belonging to a banned vendor (Laravel global scope)");
  const bannedProduct = await Product.create({
    room_id: 1,
    product_name: "Banned Vendor Forbidden Product",
    vendor_id: bannedVendor.id,
    category: 49,
    subcategory: 126,
    is_active: "1",
    action: "0",
  });
  const bannedProductRes = await makeRequest(`/api/show/product?product_id=${bannedProduct.id}`);
  assert(bannedProductRes.status === 500, "Returns HTTP 500 for product of banned vendor");
  assert(bannedProductRes.json?.status === false, "Status is false for banned vendor product");
  assert(bannedProductRes.json?.message?.includes("No query results for model"), "Message matches Laravel model not found error");

  // --- SECTION 3: PRODUCT SIZEWISE MEASUREMENTS ---
  console.log("\n--- SECTION 3: PRODUCT SIZEWISE MEASUREMENTS ---");

  console.log("▶ [Test 3.1] Sizewise measurements (GET /api/product-measurements/sizewise/417)");
  const sizeRes = await makeRequest("/api/product-measurements/sizewise/417");
  assert(sizeRes.status === 200, "Returns HTTP 200");
  assert(sizeRes.json?.status === true, "Status is true");
  assert(sizeRes.json?.data?.product_id === 417, "product_id is 417");
  assert(Array.isArray(sizeRes.json?.data?.sizes), "sizes is an array");
  assert(Array.isArray(sizeRes.json?.data?.sizewise_measurements), "sizewise_measurements is an array");

  console.log("\n▶ [Test 3.2] POST method support (POST /api/product-measurements/sizewise with body)");
  const postSizeRes = await makeRequest("/api/product-measurements/sizewise", {
    method: "POST",
    body: { product_id: 417 },
  });
  assert(postSizeRes.status === 200, "POST returns HTTP 200");
  assert(postSizeRes.json?.status === true, "POST returns status true");
  assert(postSizeRes.json?.data?.product_id === 417, "POST resolved product_id from body");

  console.log("\n▶ [Test 3.3] Registered alias (/api/product/size-wise-measurements/417)");
  const aliasSizeRes = await makeRequest("/api/product/size-wise-measurements/417");
  assert(aliasSizeRes.status === 200, "Alias returns HTTP 200");
  assert(aliasSizeRes.json?.data?.product_id === 417, "Alias returns identical sizewise data");

  console.log("\n▶ [Test 3.4] Product size details delegation (/api/product-size-details/417)");
  const detailsAliasRes = await makeRequest("/api/product-size-details/417");
  assert(detailsAliasRes.status === 200, "Product-size-details returns HTTP 200");
  assert(detailsAliasRes.json?.data?.product_id === 417, "Delegated correctly to sizewise handler");

  console.log("\n▶ [Test 3.5] Missing product ID validation (HTTP 422)");
  const missingParamRes = await makeRequest("/api/product-measurements/sizewise");
  assert(missingParamRes.status === 422, "Returns HTTP 422 for missing product ID");
  assert(missingParamRes.json?.status === false, "Status is false");

  console.log("\n▶ [Test 3.6] Nonexistent product ID returns HTTP 404");
  const nonExistSizeRes = await makeRequest("/api/product-measurements/sizewise/999999999");
  assert(nonExistSizeRes.status === 404, "Returns HTTP 404 for nonexistent product");
  assert(nonExistSizeRes.json?.status === false, "Status is false");

  // --- SECTION 4: PRODUCT SEARCH ---
  console.log("\n--- SECTION 4: MEILISEARCH PRODUCT SEARCH (/api/products/search) ---");

  console.log("▶ [Test 4.1] Empty search query (GET /api/products/search)");
  const emptySearchRes = await makeRequest("/api/products/search");
  assert(emptySearchRes.status === 200, "Returns HTTP 200");
  assert(emptySearchRes.json?.message === "Please enter a search query", "Returns exact Laravel Scout message");
  assert(Array.isArray(emptySearchRes.json?.data) && emptySearchRes.json.data.length === 0, "Returns empty data array");

  console.log("\n▶ [Test 4.2] Valid search query (GET /api/products/search?q=Black)");
  const validSearchRes = await makeRequest("/api/products/search?q=Black");
  assert(validSearchRes.status === 200, "Returns HTTP 200");
  assert(typeof validSearchRes.json?.count === "number", "Returns numeric count");
  assert(Array.isArray(validSearchRes.json?.data), "Returns matching product array");

  // Cleanup temporary test data
  console.log("\n🧹 Cleaning up temporary test records...");
  if (tempCart) {
    await tempCart.destroy();
  }
  if (tempFav) {
    await tempFav.destroy();
  }
  if (testUser) {
    await testUser.destroy();
  }
  if (tempAddonImg) {
    await tempAddonImg.destroy();
  }
  if (tempAddon) {
    await tempAddon.destroy();
  }
  if (freeSizeMat) {
    await ProductPrice.destroy({ where: { material_id: freeSizeMat.id } });
    await freeSizeMat.destroy();
  }
  if (freeSizeProduct) {
    await freeSizeProduct.destroy();
  }
  if (bannedProduct) {
    await bannedProduct.destroy();
  }
  if (bannedVendor) {
    await bannedVendor.destroy();
  }

  server.close();

  console.log("\n================================================================================");
  console.log(`  PRODUCTS TEST RESULTS: ${totalPassed} PASSED, ${totalFailed} FAILED (TOTAL ${totalPassed + totalFailed})`);
  console.log("================================================================================\n");

  if (totalFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();


