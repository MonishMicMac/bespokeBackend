import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import sequelize from "../config/db.js";
import {
  Product,
  ProductFabric,
  ProductMaterial,
  ProductMaterialImage,
  ProductPrice,
  VendorLogin,
} from "../models/setupAssociations.js";
import * as vendorProductService from "../src/services/vendorProductService.js";
import * as productCatalogService from "../src/services/productCatalogService.js";

describe("Vendor Multi-Fabric and Multi-Colour Product Module", () => {
  let testVendorId = null;
  let createdProductId = null;

  before(async () => {
    // Find or create test vendor
    let vendor = await VendorLogin.findOne();
    if (!vendor) {
      vendor = await VendorLogin.create({
        username: "Fabric Vendor Test",
        email: `vendor_fabric_${Date.now()}@test.com`,
        phone_number: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        shop_name: "Test Fabric Boutique",
        address: "123 Atelier Street",
        city: "Chennai",
        state: "Tamil Nadu",
        pincode: "600001",
        is_active: "1",
      });
    }
    testVendorId = vendor.id;
  });

  after(async () => {
    if (createdProductId) {
      await ProductPrice.destroy({ where: { product_id: createdProductId } });
      await ProductMaterialImage.destroy({ where: { product_id: createdProductId } });
      await ProductMaterial.destroy({ where: { product_id: createdProductId } });
      await ProductFabric.destroy({ where: { product_id: createdProductId } });
      await Product.destroy({ where: { id: createdProductId } });
    }
  });

  it("1. Validation: Rejects product creation when no fabrics are provided", async () => {
    const req = {
      body: {
        name: "Invalid Fabric Product",
        category_id: 1,
        fabrics_json: JSON.stringify([]),
      },
      files: [],
    };

    const res = await vendorProductService.vendorAddProductWeb(req, testVendorId);
    assert.strictEqual(res.status, false);
    assert.match(res.message, /at least one fabric/i);
  });

  it("2. Validation: Rejects fabric when it has zero colours configured", async () => {
    const req = {
      body: {
        name: "Empty Colours Product",
        category_id: 1,
        fabrics_json: JSON.stringify([
          {
            fabric_name: "Pure Silk",
            colours: [],
          },
        ]),
      },
      files: [],
    };

    const res = await vendorProductService.vendorAddProductWeb(req, testVendorId);
    assert.strictEqual(res.status, false);
    assert.match(res.message, /at least one colour/i);
  });

  it("3. Validation: Rejects colour when colour name is missing", async () => {
    const req = {
      body: {
        name: "Missing Colour Name Product",
        category_id: 1,
        fabrics_json: JSON.stringify([
          {
            fabric_name: "Pure Silk",
            colours: [
              {
                colour_name: "",
                color_code: "#FF0000",
              },
            ],
          },
        ]),
      },
      files: [],
    };

    const res = await vendorProductService.vendorAddProductWeb(req, testVendorId);
    assert.strictEqual(res.status, false);
    assert.match(res.message, /must have a name/i);
  });

  it("4. Creation: Successfully creates product with 3 fabrics and independent colours", async () => {
    const nestedFabrics = [
      {
        id: "temp_fab_1",
        fabric_name: "Cotton",
        composition: "100% Cotton",
        description: "Soft breathable everyday cotton",
        colours: [
          {
            id: "temp_col_c1",
            identity: "Cream",
            colour_name: "Cream",
            color_code: "#FAF5EE",
            availability: { ready: true, custom: false },
          },
          {
            id: "temp_col_c2",
            identity: "Navy Blue",
            colour_name: "Navy Blue",
            color_code: "#0F172A",
            availability: { ready: true, custom: false },
          },
        ],
      },
      {
        id: "temp_fab_2",
        fabric_name: "Silk",
        composition: "100% Pure Mulberry Silk",
        description: "Lustrous festive silk drape",
        colours: [
          {
            id: "temp_col_s1",
            identity: "Red",
            colour_name: "Red",
            color_code: "#DC2626",
            availability: { ready: true, custom: true },
          },
          {
            id: "temp_col_s2",
            identity: "Maroon",
            colour_name: "Maroon",
            color_code: "#881337",
            availability: { ready: true, custom: true },
          },
        ],
      },
      {
        id: "temp_fab_3",
        fabric_name: "Linen",
        composition: "80% Linen 20% Cotton",
        description: "Crisp natural textured linen",
        colours: [
          {
            id: "temp_col_l1",
            identity: "White",
            colour_name: "White",
            color_code: "#FFFFFF",
            availability: { ready: true, custom: false },
          },
          {
            id: "temp_col_l2",
            identity: "Beige",
            colour_name: "Beige",
            color_code: "#E8D8C3",
            availability: { ready: true, custom: false },
          },
        ],
      },
    ];

    const pricingItems = [
      { material_id: "temp_col_c1", size: "M", price: 1500, discount_price: 1200, stock: 10, type: "ready" },
      { material_id: "temp_col_c2", size: "L", price: 1500, discount_price: 1200, stock: 8, type: "ready" },
      { material_id: "temp_col_s1", size: "M", price: 3500, discount_price: 2900, stock: 5, type: "ready" },
      { material_id: "temp_col_s2", size: "L", price: 3800, discount_price: 3200, stock: 4, type: "ready" },
      { material_id: "temp_col_l1", size: "M", price: 2200, discount_price: 1800, stock: 12, type: "ready" },
      { material_id: "temp_col_l2", size: "L", price: 2200, discount_price: 1800, stock: 15, type: "ready" },
    ];

    const req = {
      body: {
        name: "Bespoke Multi-Fabric Artisan Kurta",
        category_id: 1,
        sub_category_id: 1,
        description: "Exquisite hand-tailored kurta available in multiple fine fabrics and hues",
        product_type: "readymade",
        fabrics_json: JSON.stringify(nestedFabrics),
        prices_json: JSON.stringify(pricingItems),
      },
      files: [],
    };

    const res = await vendorProductService.vendorAddProductWeb(req, testVendorId);
    assert.strictEqual(res.status, true, `Expected success but got: ${res.message}`);
    assert.ok(res.product_id);
    createdProductId = res.product_id;

    // Verify product_fabrics in DB
    const fabricsInDb = await ProductFabric.findAll({
      where: { product_id: createdProductId },
      order: [["id", "ASC"]],
    });
    assert.strictEqual(fabricsInDb.length, 3, "Should have created exactly 3 fabrics in product_fabrics");
    const fabricNames = fabricsInDb.map((f) => f.fabric_name);
    assert.deepStrictEqual(fabricNames, ["Cotton", "Silk", "Linen"]);

    // Verify product_materials in DB (Colours linked via product_fabric_id)
    const materialsInDb = await ProductMaterial.findAll({
      where: { product_id: createdProductId },
      order: [["id", "ASC"]],
    });
    assert.strictEqual(materialsInDb.length, 6, "Should have created exactly 6 colour materials in product_materials");

    // Check Cotton colours
    const cottonDb = fabricsInDb.find((f) => f.fabric_name === "Cotton");
    const cottonColours = materialsInDb.filter((m) => Number(m.product_fabric_id) === Number(cottonDb.id));
    assert.strictEqual(cottonColours.length, 2);
    assert.deepStrictEqual(cottonColours.map((c) => c.material_name), ["Cream", "Navy Blue"]);
    assert.strictEqual(cottonColours[0].color_code, "#FAF5EE");
    assert.strictEqual(cottonColours[1].color_code, "#0F172A");

    // Check Silk colours
    const silkDb = fabricsInDb.find((f) => f.fabric_name === "Silk");
    const silkColours = materialsInDb.filter((m) => Number(m.product_fabric_id) === Number(silkDb.id));
    assert.strictEqual(silkColours.length, 2);
    assert.deepStrictEqual(silkColours.map((c) => c.material_name), ["Red", "Maroon"]);
    assert.strictEqual(silkColours[0].color_code, "#DC2626");

    // Check product_prices mapping
    const pricesInDb = await ProductPrice.findAll({
      where: { product_id: createdProductId },
    });
    assert.strictEqual(pricesInDb.length, 6, "Should have created exactly 6 price rows");
    for (const p of pricesInDb) {
      assert.ok(p.material_id, "Every price row must have a valid material_id linked to a colour");
      const matchedMaterial = materialsInDb.find((m) => Number(m.id) === Number(p.material_id));
      assert.ok(matchedMaterial, `Price row material_id ${p.material_id} must exist in product_materials`);
    }
  });

  it("5. Inspection & Retrieval: getVendorProductEditDetails returns complete nested fabrics & colours", async () => {
    assert.ok(createdProductId);
    const details = await vendorProductService.getVendorProductEditDetails(createdProductId);

    assert.strictEqual(details.status, true);
    assert.ok(details.product);
    assert.strictEqual(details.product.fabrics.length, 3, "Product should have 3 fabrics");
    assert.strictEqual(details.product.fabrics[0].fabric_name, "Cotton");
    assert.strictEqual(details.product.fabrics[0].colours.length, 2, "Cotton should have 2 colours");
    assert.strictEqual(details.product.fabrics[0].colours[0].colour_name, "Cream");
    assert.strictEqual(details.product.fabrics[0].colours[0].color_code, "#FAF5EE");

    assert.strictEqual(details.product.fabrics[1].fabric_name, "Silk");
    assert.strictEqual(details.product.fabrics[1].colours.length, 2, "Silk should have 2 colours");

    assert.strictEqual(details.product.fabrics[2].fabric_name, "Linen");
    assert.strictEqual(details.product.fabrics[2].colours.length, 2, "Linen should have 2 colours");
  });

  it("6. Customer Catalog: getProductDetails returns both nested fabrics and backwards-compatible materials", async () => {
    assert.ok(createdProductId);
    const catalogDetails = await productCatalogService.getProductDetails(createdProductId);

    assert.strictEqual(catalogDetails.success, true);
    assert.ok(catalogDetails.data.fabrics, "Should return fabrics array");
    assert.strictEqual(catalogDetails.data.fabrics.length, 3);
    assert.ok(catalogDetails.data.product_materials, "Should maintain backwards-compatible product_materials");
    assert.strictEqual(catalogDetails.data.product_materials.length, 6);
  });

  it("7. Edit & Update: Add a colour to Silk and remove a colour from Cotton without affecting Linen", async () => {
    assert.ok(createdProductId);
    const existing = await vendorProductService.getVendorProductEditDetails(createdProductId);
    const currentFabrics = existing.product.fabrics;

    const cottonFab = currentFabrics.find((f) => f.fabric_name === "Cotton");
    const silkFab = currentFabrics.find((f) => f.fabric_name === "Silk");
    const linenFab = currentFabrics.find((f) => f.fabric_name === "Linen");

    // Remove Navy Blue from Cotton
    const navyColour = cottonFab.colours.find((c) => c.colour_name === "Navy Blue");
    const updatedCottonColours = cottonFab.colours.filter((c) => c.colour_name !== "Navy Blue");

    // Add Emerald Green to Silk
    const updatedSilkColours = [
      ...silkFab.colours,
      {
        id: "temp_new_emerald",
        colour_name: "Emerald Green",
        color_code: "#059669",
        availability: { ready: true, custom: true },
      },
    ];

    const updatedFabricsPayload = [
      {
        id: cottonFab.id,
        fabric_name: "Cotton",
        composition: cottonFab.composition,
        description: cottonFab.description,
        colours: updatedCottonColours,
      },
      {
        id: silkFab.id,
        fabric_name: "Silk",
        composition: silkFab.composition,
        description: silkFab.description,
        colours: updatedSilkColours,
      },
      {
        id: linenFab.id,
        fabric_name: "Linen",
        composition: linenFab.composition,
        description: linenFab.description,
        colours: linenFab.colours,
      },
    ];

    const updateReq = {
      body: {
        id: createdProductId,
        name: "Bespoke Multi-Fabric Artisan Kurta - Updated",
        category_id: 1,
        fabrics_json: JSON.stringify(updatedFabricsPayload),
        remove_material_ids: JSON.stringify([navyColour.id]),
        prices_json: JSON.stringify([
          { material_id: "temp_new_emerald", size: "M", price: 3600, discount_price: 3100, stock: 7, type: "ready" },
        ]),
      },
      files: [],
    };

    const updateRes = await vendorProductService.vendorUpdateProductWeb(updateReq, testVendorId);
    assert.strictEqual(updateRes.status, true, `Update failed: ${updateRes.message}`);

    // Verify after update
    const afterUpdate = await vendorProductService.getVendorProductEditDetails(createdProductId);
    const afterCotton = afterUpdate.product.fabrics.find((f) => f.fabric_name === "Cotton");
    const afterSilk = afterUpdate.product.fabrics.find((f) => f.fabric_name === "Silk");
    const afterLinen = afterUpdate.product.fabrics.find((f) => f.fabric_name === "Linen");

    // Cotton now only has 1 active colour (Cream)
    assert.strictEqual(afterCotton.colours.length, 1);
    assert.strictEqual(afterCotton.colours[0].colour_name, "Cream");

    // Silk now has 3 colours (Red, Maroon, Emerald Green)
    assert.strictEqual(afterSilk.colours.length, 3);
    const silkColourNames = afterSilk.colours.map((c) => c.colour_name);
    assert.ok(silkColourNames.includes("Emerald Green"));
    assert.ok(silkColourNames.includes("Red"));
    assert.ok(silkColourNames.includes("Maroon"));

    // Linen remains completely untouched with 2 colours (White, Beige)
    assert.strictEqual(afterLinen.colours.length, 2);
    assert.deepStrictEqual(afterLinen.colours.map((c) => c.colour_name), ["White", "Beige"]);
  });

  it("8. Backwards Compatibility: Legacy flat material creation still works", async () => {
    const legacyMaterials = [
      {
        id: "mat_1",
        identity: "Velvet Crimson",
        material_type: "Velvet",
        description: "Royal winter velvet",
        color_code: "#990000",
        availability: { ready: true, custom: false },
      },
    ];

    const req = {
      body: {
        name: "Legacy Velvet Shawl",
        category_id: 1,
        materials_json: JSON.stringify(legacyMaterials),
        prices_json: JSON.stringify([
          { material_id: "mat_1", size: "Free Size", price: 4000, discount_price: 3500, stock: 10, type: "ready" },
        ]),
      },
      files: [],
    };

    const legacyRes = await vendorProductService.vendorAddProductWeb(req, testVendorId);
    assert.strictEqual(legacyRes.status, true);
    assert.ok(legacyRes.product_id);

    // Clean up legacy test product
    await ProductPrice.destroy({ where: { product_id: legacyRes.product_id } });
    await ProductMaterial.destroy({ where: { product_id: legacyRes.product_id } });
    await ProductFabric.destroy({ where: { product_id: legacyRes.product_id } });
    await Product.destroy({ where: { id: legacyRes.product_id } });
  });
});

