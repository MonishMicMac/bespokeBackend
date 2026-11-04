import { Op } from "sequelize";
import Promocode from "../../models/Promocode.js";
import Order from "../../models/Order.js";

/**
 * Get current date string in Asia/Kolkata timezone (YYYY-MM-DD)
 */
export function getKolkataTodayString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Customer: List active promo codes
 */
export async function getActivePromoCodes() {
  const todayStr = getKolkataTodayString();

  const activePromos = await Promocode.findAll({
    where: {
      status: true,
      [Op.and]: [
        {
          [Op.or]: [
            { start_date: null },
            { start_date: { [Op.lte]: todayStr } },
          ],
        },
        {
          [Op.or]: [
            { end_date: null },
            { end_date: { [Op.gte]: todayStr } },
          ],
        },
        {
          [Op.or]: [
            { usage_limit: null },
            {
              used_count: {
                [Op.lt]: Promocode.sequelize.col("usage_limit"),
              },
            },
          ],
        },
      ],
    },
    order: [["id", "DESC"]],
  });

  return activePromos.map((p) => {
    const rawVal = parseFloat(p.value);
    const minOrder = p.min_order_value !== null ? parseFloat(p.min_order_value) : 0;
    const maxCap = p.max_discount_cap !== null ? parseFloat(p.max_discount_cap) : null;
    const minItems = p.min_items_count !== null ? Number(p.min_items_count) : 0;

    return {
      id: p.id,
      code: p.code,
      description: p.description || null,
      discount: rawVal,
      discount_type: p.type,
      value: rawVal,
      type: p.type,
      min_order_value: minOrder,
      min_items_count: minItems,
      max_discount_cap: maxCap,
      from_date: p.start_date,
      expire_date: p.end_date,
      start_date: p.start_date,
      end_date: p.end_date,
    };
  });
}

/**
 * Validate and calculate discount for a promo code (PromoHelper::applyPromoCode)
 *
 * @param {Object} params
 * @param {string|null} params.code
 * @param {number|string|null} params.userId
 * @param {number} params.subTotal
 * @param {number} params.itemCount
 * @param {number|null} [params.excludeOrderId]
 * @returns {Promise<{ discount: number, error: string|null, promo_id: number|null }>}
 */
export async function applyPromoCode({
  code,
  userId,
  subTotal = 0,
  itemCount = 0,
  excludeOrderId = null,
}) {
  if (!code || typeof code !== "string" || code.trim() === "") {
    return { discount: 0, error: null, promo_id: null };
  }

  const cleanCode = code.trim();
  const promo = await Promocode.findOne({ where: { code: cleanCode } });

  if (!promo) {
    return { discount: 0, error: "Invalid promo code.", promo_id: null };
  }

  if (!promo.status) {
    return {
      discount: 0,
      error: "This promo code is inactive.",
      promo_id: promo.id,
    };
  }

  const todayStr = getKolkataTodayString();

  if (promo.start_date && todayStr < promo.start_date) {
    return {
      discount: 0,
      error: "This promo code is not yet active.",
      promo_id: promo.id,
    };
  }

  if (promo.end_date && todayStr > promo.end_date) {
    return {
      discount: 0,
      error: "This promo code has expired.",
      promo_id: promo.id,
    };
  }

  if (
    promo.usage_limit !== null &&
    promo.usage_limit !== undefined &&
    Number(promo.used_count) >= Number(promo.usage_limit)
  ) {
    return {
      discount: 0,
      error: "Promo code usage limit reached.",
      promo_id: promo.id,
    };
  }

  // Check per-user limit
  if (promo.per_user_limit && userId) {
    const userUsageWhere = {
      user_id: String(userId),
      [Op.or]: [
        { coupen_id: String(promo.id) },
        { coupen_id: String(promo.code) },
      ],
      [Op.and]: [
        {
          [Op.or]: [
            { order_history: null },
            { order_history: { [Op.notIn]: ["Decline_Order", "Cancelled"] } },
          ],
        },
      ],
    };

    if (excludeOrderId) {
      userUsageWhere.id = { [Op.ne]: excludeOrderId };
    }

    const userUsage = await Order.count({ where: userUsageWhere });

    if (userUsage >= Number(promo.per_user_limit)) {
      return {
        discount: 0,
        error: "You have already reached the usage limit for this promo code.",
        promo_id: promo.id,
      };
    }
  }

  const minOrder = promo.min_order_value !== null ? parseFloat(promo.min_order_value) : 0;
  if (minOrder > 0 && Number(subTotal) < minOrder) {
    return {
      discount: 0,
      error: `Minimum order value of ${promo.min_order_value} required to use this code.`,
      promo_id: promo.id,
    };
  }

  const minItems = promo.min_items_count !== null ? Number(promo.min_items_count) : 0;
  if (minItems > 0 && Number(itemCount) < minItems) {
    return {
      discount: 0,
      error: `Minimum of ${promo.min_items_count} items required to use this code.`,
      promo_id: promo.id,
    };
  }

  // Calculate discount
  let discount = 0;
  const numSubTotal = Number(subTotal) || 0;
  const promoVal = parseFloat(promo.value) || 0;

  if (promo.type === "percentage") {
    discount = (numSubTotal * promoVal) / 100;
    if (promo.max_discount_cap !== null && promo.max_discount_cap !== undefined) {
      const maxCap = parseFloat(promo.max_discount_cap);
      if (discount > maxCap) {
        discount = maxCap;
      }
    }
  } else {
    // Flat discount
    discount = promoVal;
  }

  // Ensure discount doesn't exceed subtotal
  discount = Math.min(discount, numSubTotal);
  discount = parseFloat(Math.max(0, discount).toFixed(2));

  return {
    discount,
    error: null,
    promo_id: promo.id,
  };
}

/**
 * Calculate order-wide discount (PriceService::calculateDiscount)
 */
export async function calculateDiscount(subTotal, couponCode, userId, itemCount) {
  const promoData = await applyPromoCode({
    code: couponCode,
    userId,
    subTotal,
    itemCount,
  });

  const discount = promoData.discount;
  const payable = parseFloat(Math.max(0, subTotal - discount).toFixed(2));

  return {
    discount,
    payable,
    error: promoData.error,
    promo_id: promoData.promo_id,
  };
}

/**
 * Increment usage count for a promo code (PromoHelper::incrementUsage)
 */
export async function incrementPromoUsage(code, transaction = null) {
  if (!code || typeof code !== "string" || code.trim() === "") {
    return;
  }

  const cleanCode = code.trim();
  await Promocode.increment("used_count", {
    by: 1,
    where: { code: cleanCode },
    transaction,
  });
}

/**
 * Admin: List promo codes with optional pagination and search (PromoCodeController::index)
 */
export async function getAdminPromoCodes({ page = 1, perPage, search }) {
  const whereClause = {};

  if (search && String(search).trim() !== "") {
    const term = `%${String(search).trim()}%`;
    whereClause[Op.or] = [
      { code: { [Op.like]: term } },
      { description: { [Op.like]: term } },
      { type: { [Op.like]: term } },
      { value: { [Op.like]: term } },
    ];
  }

  if (perPage) {
    const limit = parseInt(perPage, 10) || 10;
    const offset = ((parseInt(page, 10) || 1) - 1) * limit;

    const { count, rows } = await Promocode.findAndCountAll({
      where: whereClause,
      order: [["id", "DESC"]],
      limit,
      offset,
    });

    const currentPage = parseInt(page, 10) || 1;
    const lastPage = Math.ceil(count / limit) || 1;

    return {
      current_page: currentPage,
      data: rows,
      total: count,
      per_page: limit,
      last_page: lastPage,
    };
  }

  return await Promocode.findAll({
    where: whereClause,
    order: [["id", "DESC"]],
  });
}

/**
 * Admin: Create a promo code (PromoCodeController::store)
 */
export async function createAdminPromoCode(data) {
  const errors = {};

  if (!data.code || String(data.code).trim() === "") {
    errors.code = ["The code field is required."];
  } else {
    const existing = await Promocode.findOne({
      where: { code: String(data.code).trim() },
    });
    if (existing) {
      errors.code = ["The code has already been taken."];
    }
  }

  if (!data.type || !["percentage", "flat"].includes(data.type)) {
    errors.type = ["The type field must be either percentage or flat."];
  }

  if (data.value === undefined || data.value === null || isNaN(Number(data.value)) || Number(data.value) < 0) {
    errors.value = ["The value field is required and must be at least 0."];
  }

  if (!data.start_date) {
    errors.start_date = ["The start date field is required."];
  }

  if (!data.end_date) {
    errors.end_date = ["The end date field is required."];
  } else if (data.start_date && data.end_date < data.start_date) {
    errors.end_date = ["The end date must be a date after or equal to start date."];
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors, statusCode: 422 };
  }

  const promoCode = await Promocode.create({
    code: String(data.code).trim(),
    description: data.description || null,
    type: data.type,
    value: data.value,
    max_discount_cap: data.max_discount_cap !== undefined ? data.max_discount_cap : null,
    min_order_value: data.min_order_value !== undefined ? data.min_order_value : 0.0,
    min_items_count: data.min_items_count !== undefined ? data.min_items_count : 0,
    per_user_limit: data.per_user_limit !== undefined ? data.per_user_limit : 1,
    usage_limit: data.usage_limit !== undefined ? data.usage_limit : null,
    start_date: data.start_date,
    end_date: data.end_date,
    status: data.status !== undefined ? Boolean(data.status) : true,
  });

  return {
    success: true,
    message: "Promo code created successfully.",
    data: promoCode,
    statusCode: 201,
  };
}

/**
 * Admin: Get single promo code (PromoCodeController::show)
 */
export async function getAdminPromoCodeById(id) {
  return await Promocode.findByPk(id);
}

/**
 * Admin: Update a promo code (PromoCodeController::update)
 */
export async function updateAdminPromoCode(id, data) {
  const promo = await Promocode.findByPk(id);
  if (!promo) {
    return { success: false, message: "Promo code not found.", statusCode: 404 };
  }

  const errors = {};

  if (data.code !== undefined) {
    const cleanCode = String(data.code).trim();
    if (cleanCode === "") {
      errors.code = ["The code field cannot be empty."];
    } else {
      const existing = await Promocode.findOne({
        where: { code: cleanCode, id: { [Op.ne]: id } },
      });
      if (existing) {
        errors.code = ["The code has already been taken."];
      }
    }
  }

  if (data.type !== undefined && !["percentage", "flat"].includes(data.type)) {
    errors.type = ["The type field must be either percentage or flat."];
  }

  if (data.value !== undefined && (isNaN(Number(data.value)) || Number(data.value) < 0)) {
    errors.value = ["The value must be at least 0."];
  }

  const startDate = data.start_date !== undefined ? data.start_date : promo.start_date;
  const endDate = data.end_date !== undefined ? data.end_date : promo.end_date;

  if (startDate && endDate && endDate < startDate) {
    errors.end_date = ["The end date must be a date after or equal to start date."];
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors, statusCode: 422 };
  }

  await promo.update(data);

  return {
    success: true,
    message: "Promo code updated successfully.",
    data: promo,
    statusCode: 200,
  };
}

/**
 * Admin: Delete a promo code (PromoCodeController::destroy)
 */
export async function deleteAdminPromoCode(id) {
  const promo = await Promocode.findByPk(id);
  if (!promo) {
    return { success: false, message: "Promo code not found.", statusCode: 404 };
  }

  await promo.destroy();

  return {
    success: true,
    message: "Promo code deleted successfully.",
    statusCode: 200,
  };
}

