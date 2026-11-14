import { Op } from "sequelize";
import sequelize from "../../config/db.js";
import {
  Product,
  ProductPrice,
  ProductMeasurement,
  Measurement,
  ProductSize,
  Subcategory,
  SaleOrder,
} from "../../models/setupAssociations.js";
import { buildFileUrl } from "../utils/fileUrl.js";

/**
 * Service to resolve, validate, and format product measurements
 * Ported faithfully from Laravel: App\Services\MeasurementService
 */
export class MeasurementService {
  /**
   * Resolve measurement data for a product (customizable or ready-made)
   *
   * @param {number} productId
   * @param {object} itemInput
   * @param {string} requestedSize
   * @returns {Promise<object>}
   */
  static async resolve(productId, itemInput = {}, requestedSize = "") {
    const validProduct = await Product.findByPk(productId);
    if (!validProduct) {
      throw new Error("Invalid product for measurement resolution.");
    }

    // Check product_type on the specific price variant first, fallback to parent product
    const priceId = itemInput.price_id ?? itemInput.price ?? null;
    let priceRow = null;
    if (priceId) {
      priceRow = await ProductPrice.findByPk(priceId);
    }

    let productType = 0;
    if (priceRow && priceRow.product_type !== null && priceRow.product_type !== undefined) {
      productType = parseInt(priceRow.product_type, 10);
    } else if (validProduct.product_type !== null && validProduct.product_type !== undefined) {
      productType = parseInt(validProduct.product_type, 10);
    }

    if (productType === 0) {
      return await this.resolveCustomizable(validProduct, itemInput);
    } else {
      return await this.resolveReadyMade(validProduct, itemInput, requestedSize);
    }
  }

  /**
   * Logic for Customizable Products (product_type = 0)
   *
   * @param {Product} product
   * @param {object} itemInput
   * @returns {Promise<object>}
   */
  static async resolveCustomizable(product, itemInput = {}) {
    const rawMeasurements = itemInput.measurements ?? itemInput.measurment_details ?? [];
    if (!rawMeasurements || (Array.isArray(rawMeasurements) && rawMeasurements.length === 0) || (typeof rawMeasurements === "object" && Object.keys(rawMeasurements).length === 0)) {
      throw new Error(`Measurement details are required for customizable product: ${product.product_name}`);
    }

    const orderMeasurementData = {};
    const processedMasterIds = [];

    // 1. Fetch valid mapping IDs for this product
    const productMappings = await ProductMeasurement.findAll({
      where: { product_id: product.id },
      include: [{ model: Measurement, as: "measurement" }],
    });

    const validMappingIds = productMappings.map((pm) => Number(pm.measurement_id));
    const validPmsById = new Map();
    productMappings.forEach((pm) => {
      validPmsById.set(Number(pm.id), pm);
    });

    // Normalize rawMeasurements if JSON string
    let parsedMeasurements = rawMeasurements;
    if (typeof rawMeasurements === "string") {
      try {
        parsedMeasurements = JSON.parse(rawMeasurements);
      } catch (e) {
        throw new Error("Measurements must be provided as an array of ID-value pairs for customizable products.");
      }
    }

    if (!parsedMeasurements || typeof parsedMeasurements !== "object") {
      throw new Error("Measurements must be provided as an array of ID-value pairs for customizable products.");
    }

    // Iterate through measurements
    const entries = Array.isArray(parsedMeasurements)
      ? parsedMeasurements.map((val, idx) => [idx, val])
      : Object.entries(parsedMeasurements);

    for (const [key, val] of entries) {
      let mName = null;
      let mValue = null;
      let resolvedMasterId = null;

      if (val !== null && typeof val === "object" && !Array.isArray(val) && (val.measurement_id !== undefined || val.id !== undefined)) {
        // Format: Array of objects [{"measurement_id": 9, "value": 12}]
        mValue = val.value !== undefined ? val.value : val.inch;
        if (val.id !== undefined) {
          // Using mapping table primary key
          const pmsId = Number(val.id);
          const pms = validPmsById.get(pmsId) || (await ProductMeasurement.findByPk(pmsId, { include: [{ model: Measurement, as: "measurement" }] }));
          if (!pms || Number(pms.product_id) !== Number(product.id)) {
            const nameMsg = pms && pms.measurement ? pms.measurement.name : `ID ${val.id}`;
            throw new Error(`Measurement mapping '${nameMsg}' does not belong to product ${product.product_name}`);
          }
          mName = pms.measurement?.name ?? null;
          resolvedMasterId = Number(pms.measurement_id);
        } else {
          // Using master measurement ID
          const mId = Number(val.measurement_id);
          if (!validMappingIds.includes(mId)) {
            const masterRec = await Measurement.findByPk(mId);
            const invalidName = masterRec?.name ?? `ID: ${mId}`;
            throw new Error(`Measurement '${invalidName}' is not correctly mapped in product_measurements for ${product.product_name}`);
          }
          const masterRec = await Measurement.findByPk(mId);
          mName = masterRec?.name ?? null;
          resolvedMasterId = mId;
        }
      } else if (!isNaN(key) && key.toString().trim() !== "") {
        // Format: Keyed object {"9": 12} where keys are IDs
        const mId = Number(key);
        mValue = typeof val === "object" && val !== null ? (val.value ?? val.inch) : val;

        if (validMappingIds.includes(mId)) {
          const masterRec = await Measurement.findByPk(mId);
          mName = masterRec?.name ?? null;
          resolvedMasterId = mId;
        } else {
          // Check if key is the mapping primary key
          const pms = validPmsById.get(mId) || (await ProductMeasurement.findByPk(mId, { include: [{ model: Measurement, as: "measurement" }] }));
          if (pms && Number(pms.product_id) === Number(product.id)) {
            mName = pms.measurement?.name ?? null;
            resolvedMasterId = Number(pms.measurement_id);
          } else {
            throw new Error(`Measurement ID '${mId}' is not correctly mapped for ${product.product_name}`);
          }
        }
      } else {
        // Reject named keys/strings
        throw new Error(`Measurements must use numeric IDs. Named keys (like '${key}') are not allowed for customizable products.`);
      }

      // Validate numeric value
      if (mValue === null || mValue === undefined || mValue === "" || isNaN(mValue)) {
        const errorLabel = mName ?? `Measurement ID: ${key}`;
        throw new Error(`A valid numeric value is required for ${errorLabel}.`);
      }

      if (mName) {
        orderMeasurementData[String(resolvedMasterId)] = {
          name: mName,
          value: String(mValue),
        };
        processedMasterIds.push(Number(resolvedMasterId));
      }
    }

    // 2. Completeness Check
    const missingIds = validMappingIds.filter((id) => !processedMasterIds.includes(id));
    if (missingIds.length > 0) {
      const missingRecords = await Measurement.findAll({
        where: { id: missingIds },
        attributes: ["name"],
      });
      const missingNames = missingRecords.map((m) => m.name);
      throw new Error(`The following measurement details are required for ${product.product_name}: ${missingNames.join(", ")}`);
    }

    return orderMeasurementData;
  }

  /**
   * Logic for Ready-made Products (product_type = 1)
   *
   * @param {Product} product
   * @param {object} itemInput
   * @param {string} requestedSize
   * @returns {Promise<object>}
   */
  static async resolveReadyMade(product, itemInput = {}, requestedSize = "") {
    // If the client already sends the measurements dictionary, trust it
    if (itemInput.measurements && Object.keys(itemInput.measurements).length > 0) {
      return itemInput.measurements;
    }

    const orderMeasurementData = {};
    const subId = product.subcategory;

    // Fetch measurement IDs from mapping tables
    const [mappingRows] = await sequelize.query(
      `SELECT mm.measurement_id
       FROM mapping_measurement mm
       JOIN mapping_subcategory ms ON mm.mapping_id = ms.mapping_id
       JOIN measurement_mappings mmap ON mm.mapping_id = mmap.id
       WHERE ms.subcategory_id = ? AND mmap.action = '0'`,
      { replacements: [subId] }
    );

    const measurementIds = mappingRows.map((r) => r.measurement_id);

    if (measurementIds.length > 0) {
      const masterMeasurements = await Measurement.findAll({
        where: {
          id: measurementIds,
          action: 0,
        },
      });

      for (const m of masterMeasurements) {
        let sizeChart = {};
        if (typeof m.size_details === "string") {
          try {
            sizeChart = JSON.parse(m.size_details);
          } catch (e) {
            sizeChart = {};
          }
        } else if (m.size_details && typeof m.size_details === "object") {
          sizeChart = m.size_details;
        }

        const standardValue = sizeChart[requestedSize] ?? 0;
        orderMeasurementData[String(m.id)] = {
          name: m.name,
          value: String(standardValue),
        };
      }
    }

    return orderMeasurementData;
  }

  /**
   * Get measurement details of a product by price_id
   * Faithful reproduction and enrichment of Laravel MeasurementService::getMeasurementsByPriceId
   *
   * @param {number} priceId
   * @returns {Promise<Array>}
   */
  static async getMeasurementsByPriceId(priceId) {
    const priceRow = await ProductPrice.findByPk(priceId);
    if (!priceRow) {
      const err = new Error("Invalid price ID.");
      err.statusCode = 422;
      throw err;
    }

    const product = await Product.findByPk(priceRow.product_id);
    if (!product) {
      const err = new Error("Product not found for the given price ID.");
      err.statusCode = 404;
      throw err;
    }

    // 0 = Customizable, 1 = Ready-made
    const productType =
      priceRow.product_type !== null && priceRow.product_type !== undefined
        ? parseInt(priceRow.product_type, 10)
        : parseInt(product.product_type ?? 0, 10);

    const isCustomizable = productType === 0;

    // Gather available sizes from all active product_prices for this product
    const allPrices = await ProductPrice.findAll({
      where: { product_id: product.id },
      attributes: ["id", "size", "product_type", "is_out_stock"],
    });
    const availableSizes = [...new Set(allPrices.map((p) => p.size).filter(Boolean))];
    const currentSize = priceRow.size || availableSizes[0] || "Standard";

    // Helper to find size value from JSON or string
    const extractSizeValue = (valSource, targetSize) => {
      if (!valSource) return null;
      let parsed = valSource;
      if (typeof valSource === "string") {
        try {
          parsed = JSON.parse(valSource);
        } catch {
          if (!isNaN(valSource)) return parseFloat(valSource);
        }
      }
      if (parsed && typeof parsed === "object") {
        if (parsed.values && typeof parsed.values === "object") {
          parsed = parsed.values;
        }
        for (const [k, v] of Object.entries(parsed)) {
          if (String(k).trim().toLowerCase() === String(targetSize).trim().toLowerCase()) {
            return parseFloat(v);
          }
        }
      }
      return null;
    };

    const orderMeasurementData = [];

    if (isCustomizable) {
      // 1. Fetch ProductSize details for this product & size if available
      const pSizes = await ProductSize.findAll({
        where: { product_id: product.id },
        include: [{ model: Measurement, as: "measurement" }],
      });

      // 2. Fetch ProductMeasurement definitions
      const mappings = await ProductMeasurement.findAll({
        where: { product_id: product.id },
        include: [{ model: Measurement, as: "measurement" }],
      });

      for (const mapping of mappings) {
        const m = mapping.measurement;
        if (m) {
          // Standard reference value lookup
          let standardValue = null;
          const matchedSizeRow = pSizes.find(
            (ps) =>
              Number(ps.measurement_id) === Number(m.id) &&
              String(ps.size).trim().toLowerCase() === String(currentSize).trim().toLowerCase()
          );
          if (matchedSizeRow && matchedSizeRow.details_value) {
            standardValue = parseFloat(matchedSizeRow.details_value);
          }

          if (standardValue === null || isNaN(standardValue)) {
            standardValue = extractSizeValue(mapping.value, currentSize);
          }

          if (standardValue === null || isNaN(standardValue)) {
            standardValue = extractSizeValue(m.size_details, currentSize);
          }

          const numStd = standardValue !== null && !isNaN(standardValue) ? standardValue : 36;
          const minValue = Math.max(1, Math.round(numStd - 6));
          const maxValue = Math.round(numStd + 8);

          orderMeasurementData.push({
            measurement_id: m.id,
            measurment_name: m.name, // Preserving legacy spelling
            name: m.name,
            img_path: m.img_path ? buildFileUrl(m.img_path) : null,
            image: m.img_path ? buildFileUrl(m.img_path) : null,
            unit: "inches",
            standard_value: numStd,
            min_value: minValue,
            max_value: maxValue,
            is_customizable: true,
            current_size: currentSize,
            available_sizes: availableSizes,
          });
        }
      }
    } else {
      // Ready-made product measurements based on subcategory mapping
      const subId = product.subcategory;

      const [mappingRows] = await sequelize.query(
        `SELECT mm.measurement_id
         FROM mapping_measurement mm
         JOIN mapping_subcategory ms ON mm.mapping_id = ms.mapping_id
         JOIN measurement_mappings mmap ON mm.mapping_id = mmap.id
         WHERE ms.subcategory_id = ? AND mmap.action = '0'`,
        { replacements: [subId] }
      );

      const measurementIds = mappingRows.map((r) => r.measurement_id);

      if (measurementIds.length > 0) {
        const masterMeasurements = await Measurement.findAll({
          where: {
            id: measurementIds,
            action: 0,
          },
        });

        for (const m of masterMeasurements) {
          const standardValue = extractSizeValue(m.size_details, currentSize) ?? 36;
          orderMeasurementData.push({
            measurement_id: m.id,
            measurment_name: m.name,
            name: m.name,
            img_path: m.img_path ? buildFileUrl(m.img_path) : null,
            image: m.img_path ? buildFileUrl(m.img_path) : null,
            unit: "inches",
            standard_value: standardValue,
            min_value: Math.max(1, Math.round(standardValue - 6)),
            max_value: Math.round(standardValue + 8),
            is_customizable: false,
            current_size: currentSize,
            available_sizes: availableSizes,
          });
        }
      }
    }

    orderMeasurementData.is_customizable = isCustomizable;
    orderMeasurementData.product_id = product.id;
    orderMeasurementData.price_id = priceRow.id;
    orderMeasurementData.current_size = currentSize;
    orderMeasurementData.available_sizes = availableSizes;
    orderMeasurementData.measurements = orderMeasurementData;

    return orderMeasurementData;
  }

  /**
   * Get and enrich measurement details for a specific SaleOrder by its ID
   * Faithful reproduction of Laravel MeasurementService::getMeasurementDetailsBySaleOrderId
   *
   * @param {number|object} saleOrderId
   * @returns {Promise<Array>}
   */
  static async getMeasurementDetailsBySaleOrderId(saleOrderId) {
    let saleOrder = saleOrderId;
    if (typeof saleOrderId !== "object" || saleOrderId === null) {
      saleOrder = await SaleOrder.findByPk(saleOrderId);
    }

    if (!saleOrder) {
      return [];
    }

    let measurements = saleOrder.measurment_details;
    if (typeof measurements === "string") {
      try {
        measurements = JSON.parse(measurements);
      } catch (e) {
        return [];
      }
    }

    if (!measurements || typeof measurements !== "object") {
      return [];
    }

    const mIds = Object.keys(measurements);
    const masterMeasurements = await Measurement.findAll({
      where: { id: mIds },
    });

    const masterMap = new Map();
    masterMeasurements.forEach((m) => masterMap.set(String(m.id), m));

    const result = [];
    for (const [id, item] of Object.entries(measurements)) {
      const master = masterMap.get(String(id));
      const imgUrl = master?.img_path ? buildFileUrl(master.img_path) : null;

      if (item && typeof item === "object") {
        const name = item.name ?? item.measurment_name ?? master?.name ?? null;
        const value = item.value ?? item.inch ?? null;
        const unit = item.unit ?? "inches";
        const existingImage = item.image ?? item.img_path ?? null;

        result.push({
          id: Number(item.id ?? item.measurement_id ?? id),
          name,
          value,
          unit,
          image: existingImage ? buildFileUrl(existingImage) : imgUrl,
        });
      } else {
        result.push({
          id: Number(id),
          name: master?.name ?? `Measurement #${id}`,
          value: item,
          unit: "inches",
          image: imgUrl,
        });
      }
    }

    return result;
  }

  /**
   * Get measurement id, value, and name for a given product_id and size
   * Faithful reproduction of Laravel MeasurementService::getMeasurementsByProductAndSize
   *
   * @param {number} productId
   * @param {string} size
   * @returns {Promise<Array>}
   */
  static async getMeasurementsByProductAndSize(productId, size) {
    const product = await Product.findByPk(productId);
    if (!product) {
      throw new Error("Product not found.");
    }

    const targetSize = String(size).trim();
    const result = [];

    const productType = parseInt(product.product_type ?? 0, 10);
    if (productType === 0) {
      // Customizable
      const mappings = await ProductMeasurement.findAll({
        where: { product_id: product.id },
        include: [{ model: Measurement, as: "measurement" }],
      });

      for (const mapping of mappings) {
        const m = mapping.measurement;
        if (!m) continue;

        let sizeVal = 0;
        let sizeChart = {};
        if (typeof m.size_details === "string") {
          try {
            sizeChart = JSON.parse(m.size_details);
          } catch (e) {
            sizeChart = {};
          }
        } else if (m.size_details && typeof m.size_details === "object") {
          sizeChart = m.size_details;
        }

        if (sizeChart[targetSize] !== undefined) {
          sizeVal = sizeChart[targetSize];
        }

        result.push({
          measurement_id: m.id,
          measurment_name: m.name,
          value: sizeVal,
          img_path: m.img_path ? buildFileUrl(m.img_path) : null,
        });
      }
    } else {
      // Ready-made
      const subId = product.subcategory;
      const [mappingRows] = await sequelize.query(
        `SELECT mm.measurement_id
         FROM mapping_measurement mm
         JOIN mapping_subcategory ms ON mm.mapping_id = ms.mapping_id
         JOIN measurement_mappings mmap ON mm.mapping_id = mmap.id
         WHERE ms.subcategory_id = ? AND mmap.action = '0'`,
        { replacements: [subId] }
      );

      const measurementIds = mappingRows.map((r) => r.measurement_id);
      if (measurementIds.length > 0) {
        const masterMeasurements = await Measurement.findAll({
          where: { id: measurementIds, action: 0 },
        });

        for (const m of masterMeasurements) {
          let sizeChart = {};
          if (typeof m.size_details === "string") {
            try {
              sizeChart = JSON.parse(m.size_details);
            } catch (e) {
              sizeChart = {};
            }
          } else if (m.size_details && typeof m.size_details === "object") {
            sizeChart = m.size_details;
          }

          const standardValue = sizeChart[targetSize] ?? 0;
          result.push({
            measurement_id: m.id,
            measurment_name: m.name,
            value: standardValue,
            img_path: m.img_path ? buildFileUrl(m.img_path) : null,
          });
        }
      }
    }

    return result;
  }
}

export default MeasurementService;

