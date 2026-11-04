import { Commission, DeliveryCharge } from "../../models/setupAssociations.js";
import * as promoService from "./promoService.js";

class OrderPricingService {
  /**
   * Calculate line-item total for a SaleOrder.
   * Total = (singlePrice * qty) + addonPrice + alterAmount + materialPrice
   *
   * @param {number} singlePrice
   * @param {number} qty
   * @param {number} addonPrice Total contribution for this item's addons
   * @param {number} materialPrice
   * @param {number} alterAmount
   * @returns {number}
   */
  static calculateItemTotal(singlePrice, qty, addonPrice = 0, materialPrice = 0, alterAmount = 0) {
    const sp = parseFloat(singlePrice) || 0;
    const q = parseInt(qty, 10) || 1;
    const add = parseFloat(addonPrice) || 0;
    const mat = parseFloat(materialPrice) || 0;
    const alt = parseFloat(alterAmount) || 0;

    return Math.round(((sp * q) + add + alt + mat) * 100) / 100;
  }

  /**
   * Calculate Bespoke Commission amount for an item total.
   * Commission = (itemTotal * commissionPercent) / 100
   *
   * @param {number} itemTotal
   * @param {number} [customPercent]
   * @returns {Promise<{commissionAmount: number, commissionPercent: number}>}
   */
  static async calculateCommission(itemTotal, customPercent = null) {
    let commissionPercent = customPercent;

    if (commissionPercent === null || commissionPercent === undefined) {
      try {
        const commRow = await Commission.findOne();
        commissionPercent = commRow && commRow.commission_percentage !== undefined
          ? parseFloat(commRow.commission_percentage)
          : 25;
      } catch (err) {
        commissionPercent = 25;
      }
    }

    const total = parseFloat(itemTotal) || 0;
    const commissionAmount = Math.round(((total * commissionPercent) / 100) * 100) / 100;

    return {
      commissionAmount,
      commissionPercent,
    };
  }

  /**
   * Fetch active delivery charge from DB.
   *
   * @returns {Promise<number>}
   */
  static async getDeliveryCharge() {
    try {
      const chargeRow = await DeliveryCharge.findOne();
      return chargeRow ? parseFloat(chargeRow.delivery_amount) : 0.0;
    } catch (err) {
      return 0.0;
    }
  }

  /**
   * Calculate discount using promoService.
   *
   * @param {number} subTotal
   * @param {string|null} couponCode
   * @param {number} userId
   * @param {number} itemCount
   * @returns {Promise<{discount: number, payable: number, error: string|null, promoId: number|null}>}
   */
  static async calculateDiscount(subTotal, couponCode, userId, itemCount) {
    if (!couponCode) {
      return {
        discount: 0,
        payable: subTotal,
        error: null,
        promoId: null,
      };
    }

    try {
      const promoResult = await promoService.calculateDiscount(subTotal, couponCode, userId, itemCount);
      if (promoResult.error) {
        return {
          discount: 0,
          payable: subTotal,
          error: promoResult.error,
          promoId: promoResult.promo_id || null,
        };
      }

      const discount = parseFloat(promoResult.discount) || 0;
      const payable = Math.max(0, subTotal - discount);

      return {
        discount,
        payable,
        error: null,
        promoId: promoResult.promo_id || null,
      };
    } catch (err) {
      return {
        discount: 0,
        payable: subTotal,
        error: err.message,
        promoId: null,
      };
    }
  }

  /**
   * Prorate promo discount across sale orders.
   * The discount is deducted EXCLUSIVELY from bespoke_commision_amount,
   * leaving seller_amount completely intact!
   *
   * @param {Array<Object>} saleOrders
   * @param {number} subTotal
   * @param {number} totalDiscount
   * @param {Object} [transaction]
   */
  static async prorateDiscountAcrossSaleOrders(saleOrders, subTotal, totalDiscount, transaction = null) {
    if (subTotal <= 0 || totalDiscount <= 0 || !saleOrders.length) {
      return;
    }

    const discountRatio = totalDiscount / subTotal;

    for (const so of saleOrders) {
      const amount = parseFloat(so.amount) || 0;
      const soDiscount = Math.round(amount * discountRatio * 100) / 100;
      const currentBespokeComm = parseFloat(so.bespoke_commision_amount) || 0;
      const currentTotal = parseFloat(so.total_amount) || amount;

      await so.update(
        {
          discount_amount: soDiscount,
          total_amount: Math.round((currentTotal - soDiscount) * 100) / 100,
          bespoke_commision_amount: Math.round((currentBespokeComm - soDiscount) * 100) / 100,
          // seller_amount remains intact
        },
        { transaction }
      );
    }
  }
}

export default OrderPricingService;
