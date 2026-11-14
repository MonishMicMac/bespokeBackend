import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import s3 from "../../config/s3.js";
import sequelize from "../../config/db.js";
import {
  Product,
  ProductFabric,
  ProductMaterial,
  ProductMaterialImage,
  ProductPrice,
  ProductMeasurement,
  ProductInfo,
  ProductAddon,
  ProductAddonImage,
  VendorLogin,
  Measurement,
  Size,
} from "../../models/setupAssociations.js";

/**
 * Uploads an uploaded file (memory buffer) to S3 as WebP,
 * with graceful local fallback if S3 is unavailable.
 */
export const uploadProductFile = async (file, folder = "products/materials") => {
  if (!file || !file.buffer) return null;

  try {
    let buffer = file.buffer;
    let contentType = file.mimetype || "application/octet-stream";
    let extension = (file.originalname || "image.jpg").split(".").pop().toLowerCase();

    if (contentType.startsWith("image/")) {
      try {
        buffer = await sharp(file.buffer).webp({ quality: 80 }).toBuffer();
        contentType = "image/webp";
        extension = "webp";
      } catch (sharpErr) {
        console.warn("[uploadProductFile] Sharp conversion warning:", sharpErr.message);
      }
    }

    const randomName = uuidv4().replace(/-/g, "").substring(0, 28);
    const fileName = `${randomName}.${extension}`;
    const cleanFolder = folder.replace(/^\/+|\/+$/g, "");
    const key = `${cleanFolder}/${fileName}`;

    if (process.env.AWS_BUCKET_NAME) {
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
          })
        );
        return key;
      } catch (s3Err) {
        console.error("[uploadProductFile] S3 upload error, falling back to local:", s3Err.message);
      }
    }

    // Local fallback
    const localDir = path.resolve(process.cwd(), "uploads", cleanFolder);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    const localPath = path.join(localDir, fileName);
    fs.writeFileSync(localPath, buffer);
    return key;
  } catch (err) {
    console.error("[uploadProductFile] Failed to process file:", err);
    return null;
  }
};

/**
 * Helper to safely parse JSON or return existing array/object.
 */
function parseJsonSafe(val, fallback = []) {
  if (!val) return fallback;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch (e) {
    return fallback;
  }
}

/**
 * Resolves product types (e.g. ['READY_MADE', 'CUSTOMIZABLE'])
 */
function resolveProductTypes(body, materials, prices) {
  if (body.product_types) {
    const parsed = parseJsonSafe(body.product_types, null);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    if (typeof body.product_types === "string" && body.product_types.trim()) {
      return [body.product_types.trim()];
    }
  }

  let hasCustom = false;
  let hasReady = false;

  if (Array.isArray(materials)) {
    for (const m of materials) {
      const isCustom =
        m?.availability?.custom === true ||
        String(m?.availability?.custom) === "true" ||
        m?.material_type_id === 0 ||
        m?.material_type_id === 2;
      const isReady =
        m?.availability?.ready === true ||
        String(m?.availability?.ready) === "true" ||
        m?.material_type_id === 1 ||
        m?.material_type_id === 2;
      if (isCustom) hasCustom = true;
      if (isReady) hasReady = true;
    }
  }

  if (Array.isArray(prices)) {
    for (const p of prices) {
      if (p.type === "custom" || p.price_type_id === 0) hasCustom = true;
      if (p.type === "ready" || p.price_type_id === 1) hasReady = true;
    }
  }

  const types = [];
  if (hasReady) types.push("READY_MADE");
  if (hasCustom) types.push("CUSTOMIZABLE");
  return types.length > 0 ? types : ["READY_MADE"];
}

/**
 * Create a new Product with Fabrics, Colours (Materials), Images, Pricing & Measurements
 */
export async function vendorAddProductWeb(req, vendorId) {
  const body = req.body || {};
  const files = req.files || [];

  // Validation
  const productName = body.name || body.product_name;
  if (!productName || !String(productName).trim()) {
    return { status: false, message: "Product name is required.", statusCode: 422 };
  }

  const categoryId = body.category_id || body.category;
  if (!categoryId) {
    return { status: false, message: "Category is required.", statusCode: 422 };
  }

  // Parse JSON payloads
  let fabricsInput = parseJsonSafe(body.fabrics_json, []);
  let materialsInput = parseJsonSafe(body.materials_json, []);
  const pricesInput = parseJsonSafe(body.prices_json, []);
  const measurementsInput = parseJsonSafe(body.measurements_json, []);
  const sizeMatrixInput = parseJsonSafe(body.product_size_json, []);
  const detailsInput = parseJsonSafe(body.details_json, []);

  // Normalization: Support nested fabrics structure with colours
  // If fabricsInput is empty but materialsInput exists (legacy), construct fabrics from materials
  if ((!fabricsInput || fabricsInput.length === 0) && materialsInput && materialsInput.length > 0) {
    const fabricMapGroup = {};
    materialsInput.forEach((mat, mIdx) => {
      const fName = mat.fabric_name || mat.material_type || mat.name || "Default Fabric";
      if (!fabricMapGroup[fName]) {
        fabricMapGroup[fName] = {
          id: mat.product_fabric_id || `fab_${mIdx}`,
          fabric_name: fName,
          composition: mat.composition || "",
          description: mat.description || "",
          colours: [],
        };
      }
      fabricMapGroup[fName].colours.push({
        id: mat.id || mat.identity || `col_${mIdx}`,
        identity: mat.identity || mat.material_identity || mat.material_name || `Colour ${mIdx + 1}`,
        colour_name: mat.material_name || mat.material_identity || mat.identity || `Colour ${mIdx + 1}`,
        color_code: mat.color_code || mat.colour_code || "#000000",
        description: mat.description || "",
        availability: mat.availability || { ready: true, custom: false },
        addons: mat.addons || [],
      });
    });
    fabricsInput = Object.values(fabricMapGroup);
  }

  // Validation: At least one fabric
  if (!Array.isArray(fabricsInput) || fabricsInput.length === 0) {
    return { status: false, message: "At least one fabric is required.", statusCode: 422 };
  }

  // Validation: Each fabric must have at least one colour
  for (let fIdx = 0; fIdx < fabricsInput.length; fIdx++) {
    const fab = fabricsInput[fIdx];
    const fName = fab.fabric_name || fab.name;
    if (!fName || !String(fName).trim()) {
      return { status: false, message: `Fabric #${fIdx + 1} must have a name.`, statusCode: 422 };
    }
    const colours = fab.colours || fab.materials || [];
    if (!Array.isArray(colours) || colours.length === 0) {
      return {
        status: false,
        message: `Fabric "${fName}" must have at least one colour configured.`,
        statusCode: 422,
      };
    }
    for (let cIdx = 0; cIdx < colours.length; cIdx++) {
      const col = colours[cIdx];
      const cName = col.colour_name || col.name || col.identity || col.material_name;
      if (!cName || !String(cName).trim()) {
        return {
          status: false,
          message: `Colour #${cIdx + 1} under fabric "${fName}" must have a name.`,
          statusCode: 422,
        };
      }
    }
  }

  const t = await sequelize.transaction();

  try {
    const productTypes = resolveProductTypes(body, materialsInput, pricesInput);
    const isCustomizable =
      body.is_customizable === true ||
      String(body.is_customizable) === "1" ||
      productTypes.includes("CUSTOMIZABLE");
    const isAlter =
      body.is_alter === true || String(body.is_alter) === "1" ? 1 : 0;
    const alterCharge = parseFloat(body.alter_charge) || 0;

    // 1. Create Product
    const product = await Product.create(
      {
        room_id: body.room_id ? String(body.room_id) : "1",
        product_name: productName,
        hsn_code: body.hsn_code || null,
        description: body.description || "",
        category: categoryId,
        subcategory: body.sub_category_id || body.subcategory || null,
        gender: body.gender ? String(body.gender).toLowerCase() : null,
        is_customizable: isCustomizable,
        is_alter: isAlter,
        alter_charge: alterCharge,
        action: "0",
        is_active: body.is_active !== undefined ? String(body.is_active) : "0",
        vendor_id: vendorId,
        wear_type_id: body.wear_type_id ? parseInt(body.wear_type_id, 10) : null,
        product_types: productTypes,
      },
      { transaction: t }
    );

    // 2. Save Fabrics and Colours (ProductMaterial)
    const fabricMap = {}; // Maps input ID & fabric name to ProductFabric DB id
    const materialMap = {}; // Maps colour/material input key, identity & ID to ProductMaterial DB id
    const allColoursFlat = []; // Flat list to match files and pricing

    for (let fIdx = 0; fIdx < fabricsInput.length; fIdx++) {
      const fab = fabricsInput[fIdx];
      const fabName = fab.fabric_name || fab.name;

      const createdFabric = await ProductFabric.create(
        {
          product_id: product.id,
          fabric_name: fabName,
          composition: fab.composition || "",
          description: fab.description || "",
          action: "0",
        },
        { transaction: t }
      );

      fabricMap[fabName] = createdFabric.id;
      if (fab.id) fabricMap[String(fab.id)] = createdFabric.id;
      fabricMap[`fab_${fIdx}`] = createdFabric.id;

      const colours = fab.colours || fab.materials || [];
      for (let cIdx = 0; cIdx < colours.length; cIdx++) {
        const col = colours[cIdx];
        const colourName = col.colour_name || col.name || col.identity || col.material_name || `Colour ${cIdx + 1}`;
        const hexCode = col.color_code || col.colour_code || col.hex || "#000000";

        const isCustom =
          col?.availability?.custom === true ||
          String(col?.availability?.custom) === "true";
        const isReady =
          col?.availability?.ready === true ||
          String(col?.availability?.ready) === "true";
        const derivedType = isCustom && isReady ? 2 : isReady ? 1 : 0;

        const createdMaterial = await ProductMaterial.create(
          {
            product_id: product.id,
            product_fabric_id: createdFabric.id,
            name: fabName, // Fabric Name
            material_name: colourName, // Colour Name
            color_code: hexCode, // Hex Colour Code
            description: col.description || fab.description || "",
            product_type: derivedType,
            action: "0",
            is_active: "1",
          },
          { transaction: t }
        );

        // Populate lookup maps for images, addons, pricing
        const colIdentity = col.identity || col.material_identity || colourName;
        materialMap[colIdentity] = createdMaterial.id;
        materialMap[`${fabName}_${colourName}`] = createdMaterial.id;
        if (col.id) materialMap[String(col.id)] = createdMaterial.id;
        materialMap[`${fIdx}_${cIdx}`] = createdMaterial.id;
        materialMap[`mat_${fIdx}_${cIdx}`] = createdMaterial.id;

        allColoursFlat.push({
          fabricIdx: fIdx,
          colourIdx: cIdx,
          fabricName: fabName,
          colourName: colourName,
          fabricDbId: createdFabric.id,
          materialDbId: createdMaterial.id,
          rawColour: col,
        });
      }
    }

    // 3. Process Uploaded Images for each colour
    let firstUploadedImagePath = null;

    for (const cInfo of allColoursFlat) {
      const { fabricIdx, colourIdx, materialDbId, rawColour } = cInfo;
      const targetColId = rawColour.id ? String(rawColour.id) : null;
      const targetColIdent = rawColour.identity || rawColour.colour_name;

      // Filter files relevant to this colour:
      // Matching patterns:
      // 1. materials[<flatIdx>][...] or materials.<flatIdx>
      // 2. materials[<fIdx>][colours][<cIdx>][...]
      // 3. materials_<fIdx>_<cIdx>
      // 4. colour_<colId> or material_<matDbId>
      const colourFiles = files.filter((f) => {
        const fn = f.fieldname;
        if (!fn) return false;
        if (targetColId && fn.includes(targetColId)) return true;
        if (targetColIdent && fn.includes(targetColIdent)) return true;
        if (fn.includes(`materials[${fabricIdx}][colours][${colourIdx}]`)) return true;
        if (fn.includes(`materials_${fabricIdx}_${colourIdx}`)) return true;
        if (fn.includes(`materials[${cInfo.colourIdx}]`) && fabricIdx === 0) return true;
        if (fn.startsWith(`materials.${cInfo.colourIdx}`) && fabricIdx === 0) return true;
        return false;
      });

      for (const fileItem of colourFiles) {
        if (fileItem.fieldname.includes("addons")) continue; // Handled separately
        const uploadedPath = await uploadProductFile(fileItem, "products/materials");
        if (uploadedPath) {
          if (!firstUploadedImagePath) firstUploadedImagePath = uploadedPath;
          await ProductMaterialImage.create(
            {
              product_id: product.id,
              product_material_id: materialDbId,
              img_path: uploadedPath,
              action: 0,
            },
            { transaction: t }
          );
        }
      }

      // Handle Addons & Addon Images for this colour
      const addons = rawColour.addons || [];
      if (Array.isArray(addons) && addons.length > 0) {
        for (let aIdx = 0; aIdx < addons.length; aIdx++) {
          const addon = addons[aIdx];
          const addonName = addon.name || `Add-on ${aIdx + 1}`;
          const addonAmount = parseFloat(addon.amount || addon.price) || 0;

          const createdAddon = await ProductAddon.create(
            {
              product_id: product.id,
              material_id: materialDbId,
              name: addonName,
              amount: addonAmount,
              action: "0",
            },
            { transaction: t }
          );

          // Check for addon image file
          const addonFile = files.find(
            (f) =>
              f.fieldname.includes(`addons[${aIdx}]`) ||
              f.fieldname.includes(`addon_${aIdx}`) ||
              f.fieldname.includes(`addons.${aIdx}`)
          );
          if (addonFile) {
            const addonPath = await uploadProductFile(addonFile, "products/addons");
            if (addonPath) {
              await ProductAddonImage.create(
                {
                  product_id: product.id,
                  addon_id: createdAddon.id,
                  img_path: addonPath,
                  action: "0",
                },
                { transaction: t }
              );
            }
          }
        }
      }
    }

    // Set product main image if found
    if (firstUploadedImagePath) {
      await product.update({ main_image: firstUploadedImagePath }, { transaction: t });
    }

    // 4. Save Measurements & Size Matrix
    if (Array.isArray(measurementsInput) && measurementsInput.length > 0) {
      for (const mItem of measurementsInput) {
        let measId = null;
        let measName = null;

        if (typeof mItem === "number" || (typeof mItem === "string" && /^\d+$/.test(mItem))) {
          measId = parseInt(mItem, 10);
        } else if (typeof mItem === "object" && mItem !== null) {
          measId = mItem.id || mItem.measurement_id || null;
          measName = mItem.name || mItem.measurement_name || null;
        }

        if (measId) {
          if (!measName) {
            const mRecord = await Measurement.findByPk(measId);
            measName = mRecord ? mRecord.name : `Measurement ${measId}`;
          }

          // Extract size matrix values
          let extractedSizes = {};
          if (sizeMatrixInput && typeof sizeMatrixInput === "object") {
            if (Array.isArray(sizeMatrixInput)) {
              sizeMatrixInput.forEach((group) => {
                if (group && typeof group === "object") {
                  const val =
                    group[`meas_${measId}`] ??
                    group[String(measId)] ??
                    group[measId] ??
                    (measName ? group[measName] : null);
                  if (val !== undefined) extractedSizes[group.size || "Standard"] = String(val);
                }
              });
            } else {
              extractedSizes =
                sizeMatrixInput[measId] ||
                sizeMatrixInput[`meas_${measId}`] ||
                {};
            }
          }

          await ProductMeasurement.create(
            {
              product_id: product.id,
              measurement_id: measId,
              value: {
                id: measId,
                name: measName,
                values: extractedSizes,
              },
              action: 0,
            },
            { transaction: t }
          );
        }
      }
    }

    // 5. Save Pricing & Stock
    if (Array.isArray(pricesInput) && pricesInput.length > 0) {
      for (const priceItem of pricesInput) {
        const rawPrice = priceItem.price ?? priceItem.actual_price;
        const rawDiscount = priceItem.discount_price ?? 0;
        const rawStock = priceItem.stock ?? priceItem.qty ?? 0;

        const actualPrice = parseFloat(rawPrice) || 0;
        const discountPrice = parseFloat(rawDiscount) || 0;
        const stockQty = parseInt(rawStock, 10) || 0;

        let resolvedSize = priceItem.size || priceItem.size_id || "Standard";
        if (typeof resolvedSize === "number" || /^\d+$/.test(String(resolvedSize))) {
          const sRecord = await Size.findByPk(resolvedSize);
          if (sRecord && sRecord.name) resolvedSize = sRecord.name;
        }

        // Resolve material_id to DB product_materials.id
        let targetMatId = null;
        if (priceItem.material_id && materialMap[String(priceItem.material_id)]) {
          targetMatId = materialMap[String(priceItem.material_id)];
        } else if (priceItem.fabric && materialMap[priceItem.fabric]) {
          targetMatId = materialMap[priceItem.fabric];
        } else if (priceItem.colour && materialMap[priceItem.colour]) {
          targetMatId = materialMap[priceItem.colour];
        } else if (priceItem.material_id && typeof priceItem.material_id === "number") {
          targetMatId = priceItem.material_id;
        } else if (allColoursFlat.length > 0) {
          targetMatId = allColoursFlat[0].materialDbId;
        }

        await ProductPrice.create(
          {
            product_id: product.id,
            material_id: targetMatId,
            size: String(resolvedSize),
            actual_price: actualPrice,
            discount_price: discountPrice,
            qty: stockQty,
            is_out_stock: stockQty <= 0 ? "1" : "0",
            product_type: priceItem.type === "ready" || priceItem.price_type_id === 1 ? 1 : 0,
          },
          { transaction: t }
        );
      }
    }

    // 6. Save Product Details / Attributes (ProductInfo)
    if (Array.isArray(detailsInput) && detailsInput.length > 0) {
      for (const info of detailsInput) {
        const dName = info.detail || info.key || info.name || "";
        const dVal = info.value || "";
        if (dName) {
          await ProductInfo.create(
            {
              product_id: product.id,
              details_name: dName,
              details_value: dVal,
              action: "0",
            },
            { transaction: t }
          );
        }
      }
    }

    await t.commit();

    return {
      status: true,
      success: true,
      message: "Product saved successfully!",
      product_id: product.id,
      product: {
        id: product.id,
        product_name: product.product_name,
      },
      statusCode: 201,
    };
  } catch (err) {
    await t.rollback();
    console.error("[vendorAddProductWeb] Transaction failed and rolled back:", err);
    return {
      status: false,
      message: `Failed to save product: ${err.message}`,
      statusCode: 500,
    };
  }
}

/**
 * Update an existing Product with Fabrics, Colours (Materials), Images, Pricing
 */
export async function vendorUpdateProductWeb(req, vendorId) {
  const body = req.body || {};
  const files = req.files || [];

  const productId = body.id || body.product_id;
  if (!productId) {
    return { status: false, message: "Product ID is required for update.", statusCode: 422 };
  }

  const existingProduct = await Product.findByPk(productId);
  if (!existingProduct) {
    return { status: false, message: "Product not found.", statusCode: 404 };
  }

  const t = await sequelize.transaction();

  try {
    const productName = body.name || body.product_name || existingProduct.product_name;
    const categoryId = body.category_id || body.category || existingProduct.category;

    // Parse JSON payloads
    let fabricsInput = parseJsonSafe(body.fabrics_json, []);
    let materialsInput = parseJsonSafe(body.materials_json, []);
    const pricesInput = parseJsonSafe(body.prices_json, []);
    const detailsInput = parseJsonSafe(body.details_json, []);

    // Handle soft deletions if requested
    const removeMaterialIds = parseJsonSafe(body.remove_material_ids, []);
    if (Array.isArray(removeMaterialIds) && removeMaterialIds.length > 0) {
      await ProductMaterial.update(
        { action: "1", is_active: "0" },
        { where: { id: removeMaterialIds, product_id: productId }, transaction: t }
      );
    }

    const removeAddonIds = parseJsonSafe(body.remove_addon_ids, []);
    if (Array.isArray(removeAddonIds) && removeAddonIds.length > 0) {
      await ProductAddon.update(
        { action: "1" },
        { where: { id: removeAddonIds, product_id: productId }, transaction: t }
      );
    }

    const removeImageIds = parseJsonSafe(body.remove_image_ids, []);
    if (Array.isArray(removeImageIds) && removeImageIds.length > 0) {
      await ProductMaterialImage.update(
        { action: 1 },
        { where: { id: removeImageIds, product_id: productId }, transaction: t }
      );
    }

    // Update core product attributes
    const productTypes = resolveProductTypes(body, materialsInput, pricesInput);
    await existingProduct.update(
      {
        product_name: productName,
        hsn_code: body.hsn_code !== undefined ? body.hsn_code : existingProduct.hsn_code,
        description: body.description !== undefined ? body.description : existingProduct.description,
        category: categoryId,
        subcategory: body.sub_category_id !== undefined ? body.sub_category_id : existingProduct.subcategory,
        gender: body.gender ? String(body.gender).toLowerCase() : existingProduct.gender,
        is_customizable: body.is_customizable !== undefined ? (body.is_customizable === true || String(body.is_customizable) === "1") : existingProduct.is_customizable,
        is_alter: body.is_alter !== undefined ? (body.is_alter === true || String(body.is_alter) === "1" ? 1 : 0) : existingProduct.is_alter,
        alter_charge: body.alter_charge !== undefined ? parseFloat(body.alter_charge) || 0 : existingProduct.alter_charge,
        is_active: body.is_active !== undefined ? String(body.is_active) : existingProduct.is_active,
        wear_type_id: body.wear_type_id ? parseInt(body.wear_type_id, 10) : existingProduct.wear_type_id,
        product_types: productTypes,
      },
      { transaction: t }
    );

    // Sync Fabrics and Colours
    const fabricMap = {};
    const materialMap = {};
    const allColoursFlat = [];

    // Fallback if legacy flat materials
    if ((!fabricsInput || fabricsInput.length === 0) && materialsInput && materialsInput.length > 0) {
      const fabricMapGroup = {};
      materialsInput.forEach((mat, mIdx) => {
        const fName = mat.fabric_name || mat.material_type || mat.name || "Default Fabric";
        if (!fabricMapGroup[fName]) {
          fabricMapGroup[fName] = {
            id: mat.product_fabric_id || `fab_${mIdx}`,
            fabric_name: fName,
            composition: mat.composition || "",
            description: mat.description || "",
            colours: [],
          };
        }
        fabricMapGroup[fName].colours.push({
          id: mat.id,
          identity: mat.identity || mat.material_identity || mat.material_name || `Colour ${mIdx + 1}`,
          colour_name: mat.material_name || mat.material_identity || mat.identity || `Colour ${mIdx + 1}`,
          color_code: mat.color_code || mat.colour_code || "#000000",
          description: mat.description || "",
          availability: mat.availability || { ready: true, custom: false },
          addons: mat.addons || [],
          existingImages: mat.existingImages || [],
        });
      });
      fabricsInput = Object.values(fabricMapGroup);
    }

    if (Array.isArray(fabricsInput) && fabricsInput.length > 0) {
      for (let fIdx = 0; fIdx < fabricsInput.length; fIdx++) {
        const fab = fabricsInput[fIdx];
        const fabName = fab.fabric_name || fab.name;
        let fabricRecord = null;

        if (fab.id && typeof fab.id === "number" && fab.id < 1000000000000) {
          fabricRecord = await ProductFabric.findByPk(fab.id, { transaction: t });
          if (fabricRecord) {
            await fabricRecord.update(
              {
                fabric_name: fabName,
                composition: fab.composition || "",
                description: fab.description || "",
              },
              { transaction: t }
            );
          }
        }

        if (!fabricRecord) {
          fabricRecord = await ProductFabric.create(
            {
              product_id: productId,
              fabric_name: fabName,
              composition: fab.composition || "",
              description: fab.description || "",
              action: "0",
            },
            { transaction: t }
          );
        }

        fabricMap[fabName] = fabricRecord.id;
        if (fab.id) fabricMap[String(fab.id)] = fabricRecord.id;

        const colours = fab.colours || fab.materials || [];
        for (let cIdx = 0; cIdx < colours.length; cIdx++) {
          const col = colours[cIdx];
          const colourName = col.colour_name || col.name || col.identity || col.material_name || `Colour ${cIdx + 1}`;
          const hexCode = col.color_code || col.colour_code || col.hex || "#000000";

          const isCustom = col?.availability?.custom === true || String(col?.availability?.custom) === "true";
          const isReady = col?.availability?.ready === true || String(col?.availability?.ready) === "true";
          const derivedType = isCustom && isReady ? 2 : isReady ? 1 : 0;

          let matRecord = null;
          if (col.id && typeof col.id === "number" && col.id < 1000000000000) {
            matRecord = await ProductMaterial.findByPk(col.id, { transaction: t });
            if (matRecord) {
              await matRecord.update(
                {
                  product_fabric_id: fabricRecord.id,
                  name: fabName,
                  material_name: colourName,
                  color_code: hexCode,
                  description: col.description || fab.description || "",
                  product_type: derivedType,
                  is_active: "1",
                },
                { transaction: t }
              );
            }
          }

          if (!matRecord) {
            matRecord = await ProductMaterial.create(
              {
                product_id: productId,
                product_fabric_id: fabricRecord.id,
                name: fabName,
                material_name: colourName,
                color_code: hexCode,
                description: col.description || fab.description || "",
                product_type: derivedType,
                action: "0",
                is_active: "1",
              },
              { transaction: t }
            );
          }

          const colIdentity = col.identity || col.material_identity || colourName;
          materialMap[colIdentity] = matRecord.id;
          materialMap[`${fabName}_${colourName}`] = matRecord.id;
          if (col.id) materialMap[String(col.id)] = matRecord.id;
          materialMap[`${fIdx}_${cIdx}`] = matRecord.id;

          allColoursFlat.push({
            fabricIdx: fIdx,
            colourIdx: cIdx,
            fabricName: fabName,
            colourName: colourName,
            fabricDbId: fabricRecord.id,
            materialDbId: matRecord.id,
            rawColour: col,
          });
        }
      }
    }

    // Process newly uploaded files
    for (const cInfo of allColoursFlat) {
      const { fabricIdx, colourIdx, materialDbId, rawColour } = cInfo;
      const targetColId = rawColour.id ? String(rawColour.id) : null;
      const targetColIdent = rawColour.identity || rawColour.colour_name;

      const colourFiles = files.filter((f) => {
        const fn = f.fieldname;
        if (!fn) return false;
        if (targetColId && fn.includes(targetColId)) return true;
        if (targetColIdent && fn.includes(targetColIdent)) return true;
        if (fn.includes(`materials[${fabricIdx}][colours][${colourIdx}]`)) return true;
        if (fn.includes(`materials_${fabricIdx}_${colourIdx}`)) return true;
        if (fn.includes(`materials[${cInfo.colourIdx}]`) && fabricIdx === 0) return true;
        return false;
      });

      for (const fileItem of colourFiles) {
        if (fileItem.fieldname.includes("addons")) continue;
        const uploadedPath = await uploadProductFile(fileItem, "products/materials");
        if (uploadedPath) {
          await ProductMaterialImage.create(
            {
              product_id: productId,
              product_material_id: materialDbId,
              img_path: uploadedPath,
              action: 0,
            },
            { transaction: t }
          );
        }
      }
    }

    // Sync Pricing & Stock
    if (Array.isArray(pricesInput) && pricesInput.length > 0) {
      for (const priceItem of pricesInput) {
        const rawPrice = priceItem.price ?? priceItem.actual_price;
        const rawDiscount = priceItem.discount_price ?? 0;
        const rawStock = priceItem.stock ?? priceItem.qty ?? 0;

        const actualPrice = parseFloat(rawPrice) || 0;
        const discountPrice = parseFloat(rawDiscount) || 0;
        const stockQty = parseInt(rawStock, 10) || 0;

        let resolvedSize = priceItem.size || priceItem.size_id || "Standard";
        if (typeof resolvedSize === "number" || /^\d+$/.test(String(resolvedSize))) {
          const sRecord = await Size.findByPk(resolvedSize);
          if (sRecord && sRecord.name) resolvedSize = sRecord.name;
        }

        let targetMatId = null;
        if (priceItem.material_id && materialMap[String(priceItem.material_id)]) {
          targetMatId = materialMap[String(priceItem.material_id)];
        } else if (priceItem.fabric && materialMap[priceItem.fabric]) {
          targetMatId = materialMap[priceItem.fabric];
        } else if (priceItem.material_id && typeof priceItem.material_id === "number") {
          targetMatId = priceItem.material_id;
        } else if (allColoursFlat.length > 0) {
          targetMatId = allColoursFlat[0].materialDbId;
        }

        if (priceItem.id && typeof priceItem.id === "number") {
          const existingPrice = await ProductPrice.findByPk(priceItem.id, { transaction: t });
          if (existingPrice) {
            await existingPrice.update(
              {
                material_id: targetMatId || existingPrice.material_id,
                size: String(resolvedSize),
                actual_price: actualPrice,
                discount_price: discountPrice,
                qty: stockQty,
                is_out_stock: stockQty <= 0 ? "1" : "0",
                product_type: priceItem.type === "ready" || priceItem.price_type_id === 1 ? 1 : 0,
              },
              { transaction: t }
            );
            continue;
          }
        }

        // Insert new price row
        await ProductPrice.create(
          {
            product_id: productId,
            material_id: targetMatId,
            size: String(resolvedSize),
            actual_price: actualPrice,
            discount_price: discountPrice,
            qty: stockQty,
            is_out_stock: stockQty <= 0 ? "1" : "0",
            product_type: priceItem.type === "ready" || priceItem.price_type_id === 1 ? 1 : 0,
          },
          { transaction: t }
        );
      }
    }

    await t.commit();

    return {
      status: true,
      success: true,
      message: "Product updated successfully!",
      product_id: productId,
      statusCode: 200,
    };
  } catch (err) {
    await t.rollback();
    console.error("[vendorUpdateProductWeb] Transaction failed and rolled back:", err);
    return {
      status: false,
      message: `Failed to update product: ${err.message}`,
      statusCode: 500,
    };
  }
}

/**
 * Get Product Details for Vendor Edit (/api/vendor/product/edit/:id)
 */
export async function getVendorProductEditDetails(productId) {
  try {
    const product = await Product.findByPk(productId, {
      include: [
        {
          model: ProductFabric,
          as: "fabrics",
          required: false,
        },
        {
          model: ProductMaterial,
          as: "productMaterials",
          required: false,
          include: [
            {
              model: ProductMaterialImage,
              as: "images",
              required: false,
            },
            {
              model: ProductPrice,
              as: "prices",
              required: false,
            },
            {
              model: ProductAddon,
              as: "addons",
              required: false,
              include: [
                {
                  model: ProductAddonImage,
                  as: "addonImages",
                  required: false,
                },
              ],
            },
          ],
        },
        {
          model: ProductMeasurement,
          as: "product_measurements",
          required: false,
          include: [
            {
              model: Measurement,
              as: "measurement",
              required: false,
            },
          ],
        },
        {
          model: ProductInfo,
          as: "productInfo",
          required: false,
        },
        {
          model: ProductPrice,
          as: "prices",
          required: false,
        },
      ],
    });

    if (!product) {
      return { status: false, message: "Product not found", statusCode: 404 };
    }

    const pJson = product.toJSON();

    // Map nested fabrics and colours (filter out soft-deleted action === "1")
    const rawFabrics = (pJson.fabrics || []).filter((fab) => String(fab.action ?? "0") === "0");
    const mats = (pJson.productMaterials || []).filter((m) => String(m.action ?? "0") === "0");

    let formattedFabrics = [];
    if (rawFabrics.length > 0) {
      formattedFabrics = rawFabrics.map((fab) => {
        const coloursForFab = mats.filter((m) => {
          if (m.product_fabric_id && Number(m.product_fabric_id) === Number(fab.id)) return true;
          if (m.name && fab.fabric_name && m.name.trim().toLowerCase() === fab.fabric_name.trim().toLowerCase()) return true;
          return false;
        });
        return {
          id: fab.id,
          fabric_name: fab.fabric_name,
          name: fab.fabric_name,
          composition: fab.composition || "",
          description: fab.description || "",
          colours: coloursForFab.map((c) => ({
            id: c.id,
            colour_name: c.material_name || c.name,
            name: c.material_name || c.name,
            identity: c.material_name || c.name,
            material_identity: c.material_name || c.name,
            color_code: c.color_code || "#000000",
            description: c.description || "",
            product_fabric_id: fab.id,
            product_type_id: c.product_type,
            availability: {
              custom: c.product_type === 0 || c.product_type === 2,
              ready: c.product_type === 1 || c.product_type === 2,
            },
            images: (c.images || []).map((img) => ({
              id: img.id,
              img_path: img.img_path,
              url: img.img_path?.startsWith("http") ? img.img_path : `https://bespoke-2026.s3.ap-south-1.amazonaws.com/${img.img_path?.replace(/^\/+/, "")}`,
            })),
            prices: c.prices || [],
            addons: (c.addons || []).map((a) => ({
              id: a.id,
              name: a.name,
              amount: a.amount,
              price: a.amount,
              images: a.addonImages || [],
            })),
          })),
        };
      });
    } else if (mats.length > 0) {
      // Group by material name as fallback
      const groups = {};
      mats.forEach((m) => {
        const fName = m.name || "Default Fabric";
        if (!groups[fName]) {
          groups[fName] = {
            id: m.product_fabric_id || 1,
            fabric_name: fName,
            name: fName,
            composition: "",
            description: m.description || "",
            colours: [],
          };
        }
        groups[fName].colours.push({
          id: m.id,
          colour_name: m.material_name || m.name,
          name: m.material_name || m.name,
          identity: m.material_name || m.name,
          material_identity: m.material_name || m.name,
          color_code: m.color_code || "#000000",
          description: m.description || "",
          product_fabric_id: m.product_fabric_id,
          product_type_id: m.product_type,
          availability: {
            custom: m.product_type === 0 || m.product_type === 2,
            ready: m.product_type === 1 || m.product_type === 2,
          },
          images: (m.images || []).map((img) => ({
            id: img.id,
            img_path: img.img_path,
            url: img.img_path?.startsWith("http") ? img.img_path : `https://bespoke-2026.s3.ap-south-1.amazonaws.com/${img.img_path?.replace(/^\/+/, "")}`,
          })),
          prices: m.prices || [],
          addons: (m.addons || []).map((a) => ({
            id: a.id,
            name: a.name,
            amount: a.amount,
            price: a.amount,
            images: a.addonImages || [],
          })),
        });
      });
      formattedFabrics = Object.values(groups);
    }

    // Format flat materials for legacy UI
    const flatMaterials = mats.map((m) => ({
      id: m.id,
      name: m.name,
      material_name: m.material_name || m.name,
      identity: m.material_name || m.name,
      material_identity: m.material_name || m.name,
      color_code: m.color_code || "#000000",
      description: m.description || "",
      product_fabric_id: m.product_fabric_id,
      product_type_id: m.product_type,
      availability: {
        custom: m.product_type === 0 || m.product_type === 2,
        ready: m.product_type === 1 || m.product_type === 2,
      },
      images: (m.images || []).map((img) => ({
        id: img.id,
        img_path: img.img_path,
        url: img.img_path?.startsWith("http") ? img.img_path : `https://bespoke-2026.s3.ap-south-1.amazonaws.com/${img.img_path?.replace(/^\/+/, "")}`,
      })),
      prices: m.prices || [],
      addons: (m.addons || []).map((a) => ({
        id: a.id,
        name: a.name,
        amount: a.amount,
        price: a.amount,
        images: a.addonImages || [],
      })),
    }));

    return {
      status: true,
      success: true,
      product: {
        ...pJson,
        fabrics: formattedFabrics,
        materials: flatMaterials,
        product_materials: flatMaterials,
      },
      data: {
        ...pJson,
        fabrics: formattedFabrics,
        materials: flatMaterials,
        product_materials: flatMaterials,
      },
      statusCode: 200,
    };
  } catch (err) {
    console.error("[getVendorProductEditDetails] Error:", err);
    return {
      status: false,
      message: err.message,
      statusCode: 500,
    };
  }
}
