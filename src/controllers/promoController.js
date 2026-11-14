import * as promoService from "../services/promoService.js";

/**
 * Customer: List active promo codes
 * Route: GET /api/promo-codes and GET /api/promocode
 */
export async function getActivePromoCodes(req, res) {
  try {
    // If admin query parameters are present, delegate to admin listing
    if (
      req.query.per_page !== undefined ||
      req.query.search !== undefined ||
      req.query.admin === "true" ||
      req.query.all === "true"
    ) {
      return await getAdminPromoCodes(req, res);
    }

    const activePromoCodes = await promoService.getActivePromoCodes();

    if (!activePromoCodes || activePromoCodes.length === 0) {
      return res.status(200).json({
        status: "false",
        message: "No active promo codes found.",
      });
    }

    return res.status(200).json({
      status: "true",
      message: "Active promo codes retrieved successfully.",
      data: activePromoCodes,
    });
  } catch (error) {
    console.error("Error fetching active promo codes:", error);
    return res.status(500).json({
      status: "false",
      message: "Failed to retrieve promo codes.",
    });
  }
}

/**
 * Customer / Checkout: Apply / Validate a Promo Code
 * Route: POST /api/promo-codes/apply or POST /api/promocode/apply
 */
export async function applyPromoCode(req, res) {
  try {
    const code = req.body.code || req.body.coupon_code || req.body.coupen_id;
    const userId = req.body.user_id || req.body.userId;
    const subTotal = parseFloat(req.body.subtotal || req.body.subTotal || req.body.price || 0);
    const itemCount = parseInt(req.body.item_count || req.body.itemCount || req.body.items_count || 1, 10);
    const excludeOrderId = req.body.exclude_order_id || req.body.excludeOrderId || null;

    if (!code) {
      return res.status(400).json({
        status: "false",
        success: false,
        message: "Coupon code is required.",
      });
    }

    const result = await promoService.applyPromoCode({
      code,
      userId,
      subTotal,
      itemCount,
      excludeOrderId,
    });

    if (result.error) {
      return res.status(200).json({
        status: "false",
        success: false,
        message: result.error,
        error: result.error,
        discount: 0,
        payable: subTotal,
        promo_id: result.promo_id,
      });
    }

    const payable = parseFloat(Math.max(0, subTotal - result.discount).toFixed(2));

    return res.status(200).json({
      status: "true",
      success: true,
      message: "Promo code applied successfully.",
      discount: result.discount,
      payable,
      promo_id: result.promo_id,
      promo: {
        id: result.promo_id,
        code: result.promo_code || code,
        discount: result.discount,
        discount_amount: result.discount,
        discount_type: result.promo_type || "flat",
        value: result.promo_value,
      },
    });
  } catch (error) {
    console.error("Error applying promo code:", error);
    return res.status(500).json({
      status: "false",
      success: false,
      message: "Failed to apply promo code.",
    });
  }
}

/**
 * Admin: List promo codes with search and pagination (Master\PromoCodeController::index)
 * Route: GET /api/admin/promo-codes
 */
export async function getAdminPromoCodes(req, res) {
  try {
    const page = req.query.page || 1;
    const perPage = req.query.per_page;
    const search = req.query.search;

    const data = await promoService.getAdminPromoCodes({
      page,
      perPage,
      search,
    });

    return res.status(200).json({
      status: true,
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error retrieving admin promo codes:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve promo codes.",
    });
  }
}

/**
 * Admin: Create a promo code (Master\PromoCodeController::store)
 * Route: POST /api/admin/promo-codes or POST /api/promo-codes
 */
export async function createAdminPromoCode(req, res) {
  try {
    const result = await promoService.createAdminPromoCode(req.body);

    if (!result.success) {
      return res.status(result.statusCode || 422).json({
        success: false,
        errors: result.errors,
      });
    }

    return res.status(result.statusCode || 201).json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error("Error creating promo code:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create promo code.",
    });
  }
}

/**
 * Admin: Get single promo code by ID (Master\PromoCodeController::show)
 * Route: GET /api/admin/promo-codes/:id or GET /api/promo-codes/:id
 */
export async function getAdminPromoCodeById(req, res) {
  try {
    const { id } = req.params;
    const promo = await promoService.getAdminPromoCodeById(id);

    if (!promo) {
      return res.status(404).json({
        success: false,
        message: "Promo code not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: promo,
    });
  } catch (error) {
    console.error("Error fetching promo code by id:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch promo code.",
    });
  }
}

/**
 * Admin: Update promo code (Master\PromoCodeController::update)
 * Route: PUT /api/admin/promo-codes/:id or PUT /api/promo-codes/:id
 */
export async function updateAdminPromoCode(req, res) {
  try {
    const { id } = req.params;
    const result = await promoService.updateAdminPromoCode(id, req.body);

    if (!result.success) {
      return res.status(result.statusCode || 422).json({
        success: false,
        message: result.message,
        errors: result.errors,
      });
    }

    return res.status(result.statusCode || 200).json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error("Error updating promo code:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update promo code.",
    });
  }
}

/**
 * Admin: Delete promo code (Master\PromoCodeController::destroy)
 * Route: DELETE /api/admin/promo-codes/:id or DELETE /api/promo-codes/:id
 */
export async function deleteAdminPromoCode(req, res) {
  try {
    const { id } = req.params;
    const result = await promoService.deleteAdminPromoCode(id);

    if (!result.success) {
      return res.status(result.statusCode || 404).json({
        success: false,
        message: result.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("Error deleting promo code:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete promo code.",
    });
  }
}

