import { Op, QueryTypes } from "sequelize";
import sequelize from "../../config/db.js";
import {
  UserCartItem,
  CartAddon,
  ProductPrice,
  Product,
  ProductMaterial,
  ProductMaterialImage,
  ProductImage,
  ProductAddon,
  UserLogin,
  VendorLogin,
  Category,
  Subcategory,
  UserFavourites,
  Measurement,
} from "../../models/setupAssociations.js";
import { buildFileUrl } from "../utils/fileUrl.js";
import MeasurementService from "./measurementService.js";
import { redisClient } from "../redis/redisClient.js";

/**
 * Format cart measurements to a flat array format of key-value pairs
 * e.g. [{"measurement_id": 9, "value": 34}]
 */
export function formatCartMeasurements(measurmentDetails) {
  if (!measurmentDetails) return [];

  let details = measurmentDetails;
  if (typeof details === "string") {
    try {
      details = JSON.parse(details);
    } catch (e) {
      return [];
    }
  }

  const formatted = [];
  if (Array.isArray(details)) {
    for (const item of details) {
      if (item && typeof item === "object") {
        if (item.measurement_id !== undefined) {
          formatted.push({
            measurement_id: parseInt(item.measurement_id, 10),
            value: item.value ?? 0,
          });
        } else if (item.id !== undefined) {
          formatted.push({
            measurement_id: parseInt(item.id, 10),
            value: item.value ?? 0,
          });
        }
      }
    }
  } else if (typeof details === "object" && details !== null) {
    for (const [key, val] of Object.entries(details)) {
      if (val && typeof val === "object") {
        if (val.measurement_id !== undefined) {
          formatted.push({
            measurement_id: parseInt(val.measurement_id, 10),
            value: val.value ?? 0,
          });
        } else {
          formatted.push({
            measurement_id: parseInt(key, 10),
            value: val.value ?? 0,
          });
        }
      } else {
        formatted.push({
          measurement_id: parseInt(key, 10),
          value: val,
        });
      }
    }
  }

  return formatted;
}

/**
 * Parse and format incoming measurements into:
 * {"21":{"name":"Waist","value":"43"},"22":{"name":"Hip","value":"23"}}
 */
export async function parseAndFormatMeasurements(rawMeasurements) {
  if (!rawMeasurements) return null;

  let parsed = rawMeasurements;
  if (typeof rawMeasurements === "string") {
    try {
      parsed = JSON.parse(rawMeasurements);
    } catch (e) {
      return null;
    }
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  const measurementIdsToFetch = [];
  const entries = Array.isArray(parsed)
    ? parsed.map((v, i) => [i, v])
    : Object.entries(parsed);

  for (const [key, item] of entries) {
    if (item && typeof item === "object") {
      const mId = item.measurement_id ?? item.id ?? (!isNaN(key) ? parseInt(key, 10) : null);
      if (mId && !item.name) {
        measurementIdsToFetch.push(parseInt(mId, 10));
      }
    } else if (!isNaN(key)) {
      measurementIdsToFetch.push(parseInt(key, 10));
    }
  }

  let namesMap = {};
  if (measurementIdsToFetch.length > 0) {
    const measurements = await Measurement.findAll({
      where: { id: { [Op.in]: Array.from(new Set(measurementIdsToFetch)) } },
      attributes: ["id", "name"],
    });
    measurements.forEach((m) => {
      namesMap[m.id] = m.name;
    });
  }

  const formatted = {};
  for (const [key, item] of entries) {
    if (item && typeof item === "object") {
      const mId = item.measurement_id ?? item.id ?? (!isNaN(key) ? String(key) : null);
      const val = item.value ?? item.inch ?? null;
      const name = item.name ?? namesMap[mId] ?? `Measurement ${mId}`;

      if (mId !== null && val !== null) {
        formatted[String(mId)] = {
          name: String(name),
          value: String(val),
        };
      }
    } else if (!isNaN(key)) {
      const mId = String(key);
      const val = item !== null && typeof item !== "object" ? String(item) : null;
      const name = namesMap[mId] ?? `Measurement ${mId}`;

      if (val !== null) {
        formatted[mId] = {
          name: String(name),
          value: String(val),
        };
      }
    }
  }

  return Object.keys(formatted).length > 0 ? formatted : null;
}

/**
 * API 1: Get Customer Cart
 * Method: UserProductController::getUserCart
 * GET /api/user-cart/:user_id
 */
export async function getUserCart(userId) {
  if (!userId) {
    return {
      statusCode: 200,
      body: { status: "false", message: "Cart is empty" },
    };
  }

  // 1. Fetch Cart Items with optimized eager loading
  const cartItems = await UserCartItem.findAll({
    where: {
      user_id: userId,
      action: { [Op.ne]: "1" },
    },
    include: [
      {
        model: ProductPrice,
        as: "priceRelation",
        include: [
          {
            model: Product,
            as: "product",
            include: [
              { model: ProductImage, as: "images" },
              { model: VendorLogin, as: "vendor" },
              { model: Category, as: "categoryRel" },
              { model: Subcategory, as: "subcategoryRel" },
              {
                model: ProductMaterial,
                as: "productMaterials",
                include: [{ model: ProductMaterialImage, as: "images" }],
              },
            ],
          },
          {
            model: ProductMaterial,
            as: "material",
            include: [{ model: ProductMaterialImage, as: "images" }],
          },
        ],
      },
      {
        model: CartAddon,
        as: "cartAddons",
        include: [
          {
            model: ProductAddon,
            as: "productAddon",
            where: { action: "0" },
            required: false,
          },
        ],
      },
    ],
  });

  if (!cartItems || cartItems.length === 0) {
    return {
      statusCode: 200,
      body: { status: "false", message: "Cart is empty" },
    };
  }

  // 2. Format the Data
  const formattedCart = await Promise.all(
    cartItems.map(async (cartRecord) => {
      const cart = cartRecord.toJSON ? cartRecord.toJSON() : cartRecord;
      const priceData = cart.priceRelation;
      if (!priceData) return null;

      const product = priceData.product;
      if (!product) return null;

      const material = priceData.material;
      const vendor = product.vendor;

      // Check Wishlist Status
      const isFavorite = await UserFavourites.findOne({
        where: {
          price_id: cart.price_id,
          user_id: userId,
          action: "0",
        },
      });

      // Resolve Image URL
      let imageUrl = null;
      if (product.main_image) {
        imageUrl = buildFileUrl(product.main_image);
      } else if (material && material.images && material.images.length > 0) {
        imageUrl = buildFileUrl(material.images[0].img_path);
      } else {
        const firstMaterial = product.productMaterials && product.productMaterials.length > 0 ? product.productMaterials[0] : null;
        if (firstMaterial && firstMaterial.images && firstMaterial.images.length > 0) {
          imageUrl = buildFileUrl(firstMaterial.images[0].img_path);
        }
      }

      // Addons
      const addons = (cart.cartAddons || [])
        .map((addon) => {
          const pAddon = addon.productAddon;
          if (!pAddon) return null;
          return {
            addon_id: addon.add_on_id,
            addon_name: pAddon.name,
            addon_amount: pAddon.amount,
          };
        })
        .filter((a) => a !== null);

      let measDetails = cart.measurment_details;
      if (typeof measDetails === "string") {
        try {
          measDetails = JSON.parse(measDetails);
        } catch (e) {
          measDetails = {};
        }
      }

      return {
        cart_id: cart.id,
        price_id: cart.price_id,
        product_id: product.id,
        product_name: product.product_name,
        image: imageUrl,

        vendor_name: vendor?.username || vendor?.shop_name || "N/A",
        vendor_id: String(vendor?.id || ""),
        vendor_image: vendor?.img_path ? buildFileUrl(vendor.img_path) : null,

        all_images: (product.images || []).map((img) => buildFileUrl(img.image_url)),

        cart_qty: parseInt(cart.cart_qty, 10),
        size: priceData.size,

        rating: product.rating ?? 0,
        actual_price: priceData.actual_price,
        offer_price: priceData.discount_price,

        is_out_of_stock: priceData.is_out_stock === "1" || priceData.qty <= 0,
        is_customizable: Boolean(product.is_customizable),

        category: product.categoryRel?.name || null,
        sub_category: product.subcategoryRel?.name || null,
        isWishlisted: !!isFavorite,

        material: {
          material_id: material?.id || null,
          material_name: material?.material_name || null,
          material_price: material?.one_meter_price || null,
          material_image: material?.img_path ? buildFileUrl(material.img_path) : material?.main_img_path ? buildFileUrl(material.main_img_path) : null,
        },

        addons: addons,
        measurment_details: formatCartMeasurements(measDetails),
      };
    })
  );

  const cleanData = formattedCart.filter((item) => item !== null);

  if (cleanData.length === 0) {
    return {
      statusCode: 200,
      body: { status: "false", message: "Cart is empty" },
    };
  }

  return {
    statusCode: 200,
    body: {
      status: "true",
      message: "Cart details retrieved successfully",
      data: cleanData,
    },
  };
}

/**
 * API 2: Add Product to Cart
 * Method: UserProductController::addcart
 * GET & POST /api/add/cart
 */
export async function addToCart(payload) {
  const userId = payload.user_id;
  let priceId = payload.price_id;
  const productId = payload.product_id || payload.id;
  const size = payload.size;
  const qty = parseInt(payload.qty, 10);
  const addonId = payload.addon_id;
  const rawMeasurements = payload.measurements ?? payload.measurment_details ?? payload.measurement_details;

  // Auto-resolve price_id from product_id if not directly passed
  if ((!priceId || priceId === "null" || priceId === "undefined") && productId) {
    if (size) {
      const sizePrice = await ProductPrice.findOne({
        where: { product_id: productId, size },
        order: [["id", "ASC"]],
      });
      if (sizePrice) priceId = sizePrice.id;
    }
    if (!priceId) {
      const defaultPrice = await ProductPrice.findOne({
        where: { product_id: productId },
        order: [["id", "ASC"]],
      });
      if (defaultPrice) priceId = defaultPrice.id;
    }
  }

  // Validation
  if (!userId) {
    return { statusCode: 422, body: { status: "false", message: "The user id field is required." } };
  }
  if (!priceId) {
    return { statusCode: 422, body: { status: "false", message: "The price id field is required." } };
  }
  if (!qty || isNaN(qty) || qty < 1) {
    return { statusCode: 422, body: { status: "false", message: "The qty field must be at least 1." } };
  }

  let userExists = await UserLogin.findByPk(userId);
  if (!userExists) {
    try {
      const [legacyUser] = await sequelize.query(
        "SELECT id, name, email, mobile_number FROM Customer WHERE id = ? LIMIT 1",
        { replacements: [userId], type: QueryTypes.SELECT }
      );
      if (legacyUser) {
        if (legacyUser.email) {
          userExists = await UserLogin.findOne({ where: { email: legacyUser.email } });
        }
        if (!userExists && legacyUser.mobile_number) {
          userExists = await UserLogin.findOne({ where: { mobile: legacyUser.mobile_number } });
        }
        if (!userExists) {
          userExists = await UserLogin.create({
            id: legacyUser.id,
            username: legacyUser.name || "Customer",
            email: legacyUser.email,
            mobile: legacyUser.mobile_number,
            action: "0",
          });
        }
      }
    } catch (e) {
      // Ignore fallback query error
    }
  }

  if (!userExists) {
    return { statusCode: 422, body: { status: "false", message: "The selected user id is invalid." } };
  }

  const priceDetails = await ProductPrice.findByPk(priceId, {
    include: [
      { model: Product, as: "product" },
      {
        model: ProductMaterial,
        as: "material",
        include: [{ model: ProductMaterialImage, as: "images" }],
      },
    ],
  });

  if (!priceDetails || !priceDetails.product) {
    return { statusCode: 404, body: { status: "false", message: "Invalid Product/Price ID" } };
  }

  const product = priceDetails.product;
  const material = priceDetails.material;

  const formattedMeasurements = await parseAndFormatMeasurements(rawMeasurements);

  const t = await sequelize.transaction();
  let cartItem;

  try {
    cartItem = await UserCartItem.findOne({
      where: {
        user_id: userId,
        price_id: priceId,
      },
      transaction: t,
    });

    if (cartItem) {
      // Set cart_qty to incoming qty (REPLACES, does not increment!)
      cartItem.cart_qty = qty;
      cartItem.vendor_id = product.vendor_id;
      cartItem.action = "0";
      cartItem.c_date = new Date();
      if (formattedMeasurements !== null) {
        cartItem.measurment_details = JSON.stringify(formattedMeasurements);
      }
      await cartItem.save({ transaction: t });
    } else {
      cartItem = await UserCartItem.create(
        {
          user_id: userId,
          price_id: priceId,
          vendor_id: product.vendor_id,
          cart_qty: qty,
          action: "0",
          c_date: new Date(),
          measurment_details: formattedMeasurements !== null ? JSON.stringify(formattedMeasurements) : null,
        },
        { transaction: t }
      );
    }

    // 4. Handle Addons
    if (addonId !== undefined && addonId !== null && String(addonId).trim() !== "") {
      await CartAddon.destroy({
        where: { cart_id: cartItem.id },
        transaction: t,
      });

      const addonIds = String(addonId)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const id of addonIds) {
        await CartAddon.create(
          {
            cart_id: cartItem.id,
            add_on_id: parseInt(id, 10),
            action: "0",
          },
          { transaction: t }
        );
      }
    }

    await t.commit();
  } catch (err) {
    await t.rollback();
    console.error("Cart transaction failed:", err);
    return { statusCode: 500, body: { status: "false", error: err.message } };
  }

  // 5. Redis Sync (Full AWS S3 Links)
  let fullImageUrl = null;
  if (material && material.images && material.images.length > 0) {
    fullImageUrl = buildFileUrl(material.images[0].img_path);
  } else if (product.main_image) {
    fullImageUrl = buildFileUrl(product.main_image);
  }

  let parsedMeas = cartItem.measurment_details;
  if (typeof parsedMeas === "string") {
    try {
      parsedMeas = JSON.parse(parsedMeas);
    } catch (e) {
      parsedMeas = {};
    }
  }

  const cacheData = {
    cart_id: cartItem.id,
    product_id: product.id,
    product_name: product.product_name,
    image: fullImageUrl,
    price: priceDetails.discount_price ?? priceDetails.actual_price,
    qty: parseInt(cartItem.cart_qty, 10),
    material_id: material ? material.id : null,
    material_name: material ? (material.material_name || "Standard") : "Standard",
    measurment_details: parsedMeas,
    updated_at: new Date().toISOString(),
  };

  const redisKey = `user:${userId}:cart`;
  const field = `item:${priceId}`;

  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.hSet(redisKey, field, JSON.stringify(cacheData));
      await redisClient.expire(redisKey, 86400); // 24-hour expiration
    }
  } catch (e) {
    console.warn(`Redis Cache sync failed for User ID ${userId}: ${e.message}`);
  }

  return {
    statusCode: 200,
    body: {
      status: "true",
      message: "Cart updated and cached with full image links",
      data: cacheData,
    },
  };
}

/**
 * API 3: Delete Cart Item
 * Method: UserProductController::deleteCart
 * POST /api/delete/cart
 */
export async function deleteCartItem(userId, cartId) {
  if (!userId) {
    return { statusCode: 422, body: { status: "false", message: "The user id field is required." } };
  }
  if (!cartId) {
    return { statusCode: 422, body: { status: "false", message: "The cart id field is required." } };
  }

  const cartItem = await UserCartItem.findOne({
    where: {
      id: cartId,
      user_id: userId,
    },
  });

  if (!cartItem) {
    return {
      statusCode: 404,
      body: {
        status: "false",
        message: "Cart item not found",
      },
    };
  }

  // Soft Delete: set action = '1'
  cartItem.action = "1";
  await cartItem.save();

  // Redis cache consistency (clean up deleted item)
  try {
    if (redisClient && redisClient.isOpen) {
      const redisKey = `user:${userId}:cart`;
      const field = `item:${cartItem.price_id}`;
      await redisClient.hDel(redisKey, field);
    }
  } catch (e) {
    console.warn(`Redis cleanup failed on deleteCart: ${e.message}`);
  }

  return {
    statusCode: 200,
    body: {
      status: "true",
      message: "Cart item removed successfully",
    },
  };
}

/**
 * API 4: Store Bespoke Measurements
 * Method: UserProductController::storeCartMeasurement
 * POST /api/user-cart/store-measurement
 */
export async function storeCartMeasurement(cartId, measurmentDetails, authenticatedUserId = null) {
  if (!cartId) {
    return { statusCode: 422, body: { status: false, message: "The cart id field is required." } };
  }
  if (!measurmentDetails || !Array.isArray(measurmentDetails)) {
    return { statusCode: 422, body: { status: false, message: "The measurment details field must be an array." } };
  }

  const cartItem = await UserCartItem.findByPk(cartId, {
    include: [
      {
        model: ProductPrice,
        as: "priceRelation",
        include: [{ model: Product, as: "product" }],
      },
    ],
  });

  if (!cartItem) {
    return {
      statusCode: 404,
      body: {
        status: false,
        message: "Cart item not found.",
      },
    };
  }

  // Security Correction: Cart ownership validation
  if (authenticatedUserId !== null && authenticatedUserId !== undefined) {
    if (String(cartItem.user_id) !== String(authenticatedUserId)) {
      return {
        statusCode: 403,
        body: {
          status: false,
          message: "Unauthorized cart access. You can only modify your own cart items.",
        },
      };
    }
  }

  const priceRow = cartItem.priceRelation;
  if (!priceRow || !priceRow.product) {
    return {
      statusCode: 400,
      body: {
        status: false,
        message: "Invalid product price variant associated with this cart item.",
      },
    };
  }

  try {
    // Resolve & Validate measurements via MeasurementService
    const resolvedMeasurements = await MeasurementService.resolve(
      parseInt(priceRow.product_id, 10),
      { measurements: measurmentDetails, price_id: priceRow.id },
      String(priceRow.size || "")
    );

    cartItem.measurment_details = JSON.stringify(resolvedMeasurements);
    await cartItem.save();

    // Redis sync if cache field exists
    const userId = cartItem.user_id;
    const redisKey = `user:${userId}:cart`;
    const field = `item:${cartItem.price_id}`;

    try {
      if (redisClient && redisClient.isOpen) {
        const cachedStr = await redisClient.hGet(redisKey, field);
        if (cachedStr) {
          const cachedData = JSON.parse(cachedStr);
          if (cachedData && typeof cachedData === "object") {
            cachedData.measurment_details = resolvedMeasurements;
            await redisClient.hSet(redisKey, field, JSON.stringify(cachedData));
          }
        }
      }
    } catch (e) {
      // Fail-safe check for Redis issues
    }

    return {
      statusCode: 200,
      body: {
        status: true,
        message: "Measurement details validated and stored successfully in cart.",
        data: {
          cart_id: cartItem.id,
          user_id: cartItem.user_id,
          price_id: cartItem.price_id,
          measurment_details: formatCartMeasurements(resolvedMeasurements),
        },
      },
    };
  } catch (e) {
    return {
      statusCode: 400,
      body: {
        status: false,
        message: e.message,
      },
    };
  }
}

/**
 * API 5: Edit Cart
 * Method: UserProductController::editCart
 * GET & POST /api/edit/cart
 */
export async function editCart(payload) {
  const userId = payload.user_id;
  const cartId = payload.cart_id;
  const priceId = payload.price_id;
  const qty = parseInt(payload.qty, 10);
  const addonId = payload.addon_id;
  const rawMeasurements = payload.measurements ?? payload.measurment_details ?? payload.measurement_details;

  if (!userId) {
    return { statusCode: 422, body: { status: "false", message: "The user id field is required." } };
  }
  if (!cartId) {
    return { statusCode: 422, body: { status: "false", message: "The cart id field is required." } };
  }
  if (!priceId) {
    return { statusCode: 422, body: { status: "false", message: "The price id field is required." } };
  }
  if (!qty || isNaN(qty) || qty < 1) {
    return { statusCode: 422, body: { status: "false", message: "The qty field must be at least 1." } };
  }

  const t = await sequelize.transaction();

  try {
    // 2. Find existing cart item
    let cartItem = await UserCartItem.findOne({
      where: {
        id: cartId,
        user_id: userId,
      },
      include: [{ model: ProductPrice, as: "priceRelation" }],
      transaction: t,
    });

    if (!cartItem) {
      await t.rollback();
      return { statusCode: 404, body: { status: "false", message: "Cart item not found" } };
    }

    let isMerged = false;

    // 3. Handle Price ID Change (Merge Check)
    if (Number(cartItem.price_id) !== Number(priceId)) {
      const newPriceVariant = await ProductPrice.findByPk(priceId, {
        include: [{ model: Product, as: "product" }],
        transaction: t,
      });

      if (!newPriceVariant) {
        await t.rollback();
        return { statusCode: 400, body: { status: "false", message: "Invalid Price ID selected" } };
      }

      // Compare Old Product ID vs New Product ID
      if (Number(cartItem.priceRelation?.product_id) !== Number(newPriceVariant.product_id)) {
        await t.rollback();
        return {
          statusCode: 400,
          body: {
            status: "false",
            message: "Invalid selection. You cannot change the product, only the variant (size/material).",
          },
        };
      }

      // Check if the NEW price_id already exists in the cart (excluding current item)
      const existingDuplicate = await UserCartItem.findOne({
        where: {
          user_id: userId,
          price_id: priceId,
          id: { [Op.ne]: cartItem.id },
          action: "0",
        },
        transaction: t,
      });

      if (existingDuplicate) {
        // MERGE: Update duplicate quantity and delete the current row
        existingDuplicate.cart_qty = parseInt(existingDuplicate.cart_qty, 10) + qty;
        await existingDuplicate.save({ transaction: t });

        await cartItem.destroy({ transaction: t });
        cartItem = existingDuplicate;
        isMerged = true;
      } else {
        // NO DUPLICATE: Update price_id
        cartItem.price_id = priceId;
        if (newPriceVariant.product) {
          cartItem.vendor_id = newPriceVariant.product.vendor_id;
        }
      }
    }

    // Handle measurements update if provided
    if (rawMeasurements !== null && rawMeasurements !== undefined) {
      const formattedMeasurements = await parseAndFormatMeasurements(rawMeasurements);
      if (formattedMeasurements !== null) {
        cartItem.measurment_details = JSON.stringify(formattedMeasurements);
      }
    }

    // Update Quantity & Save (if not already merged)
    if (!isMerged) {
      cartItem.cart_qty = qty;
    }
    await cartItem.save({ transaction: t });

    // Handle Addons
    if (payload.addon_id !== undefined) {
      await CartAddon.destroy({
        where: { cart_id: cartItem.id },
        transaction: t,
      });

      if (addonId && String(addonId).trim() !== "") {
        const addonIds = String(addonId)
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const aId of addonIds) {
          await CartAddon.create(
            {
              cart_id: cartItem.id,
              add_on_id: parseInt(aId, 10),
              action: "0",
            },
            { transaction: t }
          );
        }
      }
    }

    await t.commit();
  } catch (err) {
    await t.rollback();
    console.error("Edit cart transaction failed:", err);
    return {
      statusCode: 500,
      body: {
        status: "false",
        message: "Failed to update cart",
        error: err.message,
      },
    };
  }

  // 6. Generate Response (Full Cart List)
  const fullCart = await getUserCart(userId);
  return {
    statusCode: 200,
    body: {
      status: "true",
      message: "Cart updated successfully",
      data: fullCart.body?.data || [],
    },
  };
}

export default {
  getUserCart,
  addToCart,
  deleteCartItem,
  storeCartMeasurement,
  editCart,
  formatCartMeasurements,
  parseAndFormatMeasurements,
};
