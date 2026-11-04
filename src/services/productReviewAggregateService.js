import { Op } from "sequelize";
import {
  SaleOrder,
  SaleOrderReview,
  ProductReviewAggregate,
} from "../../models/setupAssociations.js";
import sequelize from "../../config/db.js";

class ProductReviewAggregateService {
  /**
   * Recalculate and update aggregate statistics for a product.
   * Reproduces ProductReviewAggregate::updateProductAggregate($productId).
   *
   * @param {number|string} productId
   * @param {Object} [options]
   * @param {Object} [options.transaction]
   * @returns {Promise<Object|null>}
   */
  static async updateProductAggregate(productId, options = {}) {
    if (!productId) {
      return null;
    }

    const numericProductId = parseInt(productId, 10);
    if (isNaN(numericProductId)) {
      return null;
    }

    // 1. Find all sale orders for this product
    const saleOrders = await SaleOrder.findAll({
      where: { product_id: numericProductId },
      attributes: ["id"],
      raw: true,
      transaction: options.transaction,
    });

    const saleOrderIds = saleOrders.map((so) => so.id);

    // If there are no sale orders, zero out aggregate
    if (saleOrderIds.length === 0) {
      const [agg] = await ProductReviewAggregate.upsert(
        {
          product_id: numericProductId,
          one_star_count: 0,
          two_star_count: 0,
          three_star_count: 0,
          four_star_count: 0,
          five_star_count: 0,
          total_reviews: 0,
          total_average: 0.0,
        },
        { transaction: options.transaction }
      );
      return agg;
    }

    // 2. Retrieve all active (non-soft-deleted) sale order reviews
    const reviews = await SaleOrderReview.findAll({
      where: {
        sale_order_id: { [Op.in]: saleOrderIds },
      },
      attributes: ["id", "ratings"],
      raw: true,
      transaction: options.transaction,
    });

    const totalReviews = reviews.length;
    let oneStar = 0;
    let twoStar = 0;
    let threeStar = 0;
    let fourStar = 0;
    let fiveStar = 0;
    let sumRatings = 0;

    for (const rev of reviews) {
      const rating = parseFloat(rev.ratings) || 0;
      sumRatings += rating;
      const rounded = Math.round(rating);

      if (rounded === 1) oneStar++;
      else if (rounded === 2) twoStar++;
      else if (rounded === 3) threeStar++;
      else if (rounded === 4) fourStar++;
      else if (rounded === 5) fiveStar++;
    }

    const totalAverage =
      totalReviews > 0 ? parseFloat((sumRatings / totalReviews).toFixed(2)) : 0.0;

    // 3. Upsert into product_review_aggregates table
    let aggregateRecord = await ProductReviewAggregate.findOne({
      where: { product_id: numericProductId },
      transaction: options.transaction,
    });

    if (aggregateRecord) {
      await aggregateRecord.update(
        {
          one_star_count: oneStar,
          two_star_count: twoStar,
          three_star_count: threeStar,
          four_star_count: fourStar,
          five_star_count: fiveStar,
          total_reviews: totalReviews,
          total_average: totalAverage,
        },
        { transaction: options.transaction }
      );
    } else {
      aggregateRecord = await ProductReviewAggregate.create(
        {
          product_id: numericProductId,
          one_star_count: oneStar,
          two_star_count: twoStar,
          three_star_count: threeStar,
          four_star_count: fourStar,
          five_star_count: fiveStar,
          total_reviews: totalReviews,
          total_average: totalAverage,
        },
        { transaction: options.transaction }
      );
    }

    return aggregateRecord;
  }

  /**
   * Get current aggregate for a product or return zeroed fallback.
   *
   * @param {number|string} productId
   * @returns {Promise<Object>}
   */
  static async getProductAggregate(productId) {
    const numericProductId = parseInt(productId, 10);
    const agg = await ProductReviewAggregate.findOne({
      where: { product_id: numericProductId },
      raw: true,
    });

    if (agg) {
      return {
        product_id: agg.product_id,
        one_star_count: parseInt(agg.one_star_count, 10) || 0,
        two_star_count: parseInt(agg.two_star_count, 10) || 0,
        three_star_count: parseInt(agg.three_star_count, 10) || 0,
        four_star_count: parseInt(agg.four_star_count, 10) || 0,
        five_star_count: parseInt(agg.five_star_count, 10) || 0,
        total_reviews: parseInt(agg.total_reviews, 10) || 0,
        total_average: parseFloat(agg.total_average) || 0.0,
      };
    }

    return {
      product_id: numericProductId,
      one_star_count: 0,
      two_star_count: 0,
      three_star_count: 0,
      four_star_count: 0,
      five_star_count: 0,
      total_reviews: 0,
      total_average: 0.0,
    };
  }
}

export default ProductReviewAggregateService;
export { ProductReviewAggregateService };

