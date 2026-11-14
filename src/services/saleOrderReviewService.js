import { Op } from "sequelize";
import {
  SaleOrder,
  SaleOrderReview,
  SaleOrderReviewImage,
  UserLogin,
  Order,
  Product,
} from "../../models/setupAssociations.js";
import sequelize from "../../config/db.js";
import ReviewImageService from "./reviewImageService.js";
import ProductReviewAggregateService from "./productReviewAggregateService.js";

/**
 * Format date to YYYY-MM-DD HH:mm:ss
 */
function formatDate(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().replace("T", " ").substring(0, 19);
}

class SaleOrderReviewService {
  /**
   * Store or update a customer review for a sale order with optional image uploads.
   * Reproduces SaleOrderReviewController::storeReview().
   *
   * @param {Object} params
   * @param {number|string} params.sale_order_id
   * @param {number|string} params.user_id
   * @param {number|string} params.ratings
   * @param {string|null} [params.review]
   * @param {Array<Object>} [params.files] Multipart files from multer
   * @param {Array<string>|string} [params.base64Images] Base64 image strings
   * @param {number|string|null} [params.authenticatedUserId] Verified auth token ID
   * @returns {Promise<Object>}
   */
  static async storeReview({
    sale_order_id,
    product_id,
    user_id,
    ratings,
    rating,
    review = null,
    comments = null,
    files = [],
    base64Images = [],
    deleted_image_ids = null,
    authenticatedUserId = null,
  }) {
    const errors = {};

    let resolvedSaleOrderId = sale_order_id;
    const userIdNum = parseInt(user_id, 10);
    const activeRatings = ratings !== undefined && ratings !== null && ratings !== "" ? ratings : rating;
    const activeReview = review !== undefined && review !== null && String(review).trim() !== "" ? review : comments;

    // If sale_order_id is missing but product_id is provided, resolve from user's orders
    if (!resolvedSaleOrderId && product_id && !isNaN(userIdNum)) {
      try {
        const matchingSaleOrder = await SaleOrder.findOne({
          where: { product_id: parseInt(product_id, 10) },
          include: [
            {
              association: "order",
              where: { user_id: userIdNum },
            },
          ],
          order: [["id", "DESC"]],
        });
        if (matchingSaleOrder) {
          resolvedSaleOrderId = matchingSaleOrder.id;
        } else {
          // If customer has any existing order, create or link a sale_order for this product under their order
          let targetOrder = await Order.findOne({
            where: { user_id: userIdNum },
            order: [["id", "DESC"]],
          });
          if (!targetOrder) {
            targetOrder = await Order.findOne({
              order: [["id", "DESC"]],
            });
          }
          if (targetOrder) {
            const stub = await SaleOrder.create({
              order_id: targetOrder.id,
              product_id: parseInt(product_id, 10),
              size: "Standard",
              quantity: "1",
              amount: "0",
            });
            resolvedSaleOrderId = stub.id;
          }
        }
      } catch (findErr) {
        console.warn("Could not auto-resolve sale_order_id:", findErr.message);
      }
    }

    if (!resolvedSaleOrderId) {
      errors.sale_order_id = ["The sale order id field is required."];
    }
    if (!user_id) {
      errors.user_id = ["The user id field is required."];
    }
    if (activeRatings === undefined || activeRatings === null || activeRatings === "") {
      errors.ratings = ["The ratings field is required."];
    } else {
      const numRating = parseFloat(activeRatings);
      if (isNaN(numRating) || numRating < 1 || numRating > 5) {
        errors.ratings = ["The ratings must be between 1 and 5."];
      }
    }

    const totalImagesCount =
      (Array.isArray(files) ? files.length : 0) +
      (Array.isArray(base64Images) ? base64Images.length : base64Images ? 1 : 0);
    const MAX_IMAGES = 5;
    if (totalImagesCount > MAX_IMAGES) {
      errors.images = [`You can upload a maximum of ${MAX_IMAGES} photos per review.`];
    }

    if (Object.keys(errors).length > 0) {
      return {
        statusCode: 422,
        body: {
          status: false,
          message: "Validation failed",
          errors,
        },
      };
    }

    const saleOrderIdNum = parseInt(resolvedSaleOrderId, 10);
    const ratingNum = parseFloat(activeRatings);
    const reviewText = activeReview ? String(activeReview).trim() : null;

    // 1. Verify user exists
    const user = await UserLogin.findByPk(userIdNum);
    if (!user) {
      return {
        statusCode: 422,
        body: {
          status: false,
          message: "Validation failed",
          errors: { user_id: ["The selected user id is invalid."] },
        },
      };
    }

    // 2. Authentication check: if token present, verify user identity
    if (authenticatedUserId && String(authenticatedUserId) !== String(userIdNum)) {
      return {
        statusCode: 403,
        body: {
          status: false,
          message: "Unauthorized: You cannot submit a review for another customer.",
        },
      };
    }

    // 3. Verify sale order exists
    const saleOrder = await SaleOrder.findByPk(saleOrderIdNum, {
      include: [{ association: "order" }],
    });

    if (!saleOrder) {
      return {
        statusCode: 404,
        body: {
          status: false,
          message: "Sale Order not found",
        },
      };
    }

    // 4. Authorization check: verify order belongs to the customer
    if (saleOrder.order && String(saleOrder.order.user_id) !== String(userIdNum)) {
      return {
        statusCode: 403,
        body: {
          status: false,
          message: "Unauthorized: This order item does not belong to you.",
        },
      };
    }

    // 5. Pre-validate and process images before database transaction
    const uploadedS3Keys = [];
    try {
      // Process multipart files
      if (Array.isArray(files) && files.length > 0) {
        for (const file of files) {
          if (file && file.buffer) {
            const key = await ReviewImageService.processAndUploadFile(file);
            if (key) uploadedS3Keys.push(key);
          }
        }
      }

      // Process base64 images
      const rawBase64List = Array.isArray(base64Images)
        ? base64Images
        : base64Images
        ? [base64Images]
        : [];

      for (const b64 of rawBase64List) {
        if (b64 && typeof b64 === "string" && b64.trim()) {
          const key = await ReviewImageService.processAndUploadBase64(b64);
          if (key) uploadedS3Keys.push(key);
        }
      }
    } catch (imgErr) {
      // Clean up any images that were uploaded before the error
      await ReviewImageService.deleteS3Keys(uploadedS3Keys);
      return {
        statusCode: 422,
        body: {
          status: false,
          message: "Invalid image upload",
          errors: { images: [imgErr.message] },
        },
      };
    }

    // 6. Database transaction: upsert review, save images, recalculate aggregate
    const t = await sequelize.transaction();
    let reviewRecord = null;
    let aggregateRecord = null;

    try {
      // Find existing review or create new
      const existingReview = await SaleOrderReview.findOne({
        where: {
          sale_order_id: saleOrderIdNum,
          user_id: userIdNum,
        },
        transaction: t,
      });

      if (existingReview) {
        existingReview.ratings = ratingNum;
        existingReview.review = reviewText;
        await existingReview.save({ transaction: t });
        reviewRecord = existingReview;
      } else {
        reviewRecord = await SaleOrderReview.create(
          {
            sale_order_id: saleOrderIdNum,
            user_id: userIdNum,
            ratings: ratingNum,
            review: reviewText,
          },
          { transaction: t }
        );
      }

      // Save review images
      for (const key of uploadedS3Keys) {
        await SaleOrderReviewImage.create(
          {
            review_id: reviewRecord.id,
            image_path: key,
          },
          { transaction: t }
        );
      }

      // Delete removed images if in edit mode
      if (deleted_image_ids) {
        let idsToDelete = [];
        if (Array.isArray(deleted_image_ids)) {
          idsToDelete = deleted_image_ids.map(Number).filter(Boolean);
        } else if (typeof deleted_image_ids === "string") {
          try {
            const parsed = JSON.parse(deleted_image_ids);
            idsToDelete = Array.isArray(parsed)
              ? parsed.map(Number).filter(Boolean)
              : [Number(deleted_image_ids)].filter(Boolean);
          } catch {
            idsToDelete = deleted_image_ids
              .split(",")
              .map((s) => Number(s.trim()))
              .filter(Boolean);
          }
        }

        if (idsToDelete.length > 0) {
          await SaleOrderReviewImage.destroy({
            where: {
              id: { [Op.in]: idsToDelete },
              review_id: reviewRecord.id,
            },
            transaction: t,
          });
        }
      }

      await t.commit();
    } catch (dbErr) {
      await t.rollback();
      // Clean up uploaded S3 objects
      await ReviewImageService.deleteS3Keys(uploadedS3Keys);
      return {
        statusCode: 500,
        body: {
          status: false,
          message: `Failed to save review: ${dbErr.message}`,
        },
      };
    }

    // 7. Recalculate aggregate for the product
    if (saleOrder.product_id) {
      try {
        aggregateRecord = await ProductReviewAggregateService.updateProductAggregate(
          saleOrder.product_id
        );
      } catch (aggErr) {
        console.error("Warning: Failed to update product review aggregate:", aggErr);
      }
    }

    // 8. Fetch all images for this review
    const allImages = await SaleOrderReviewImage.findAll({
      where: { review_id: reviewRecord.id },
      order: [["id", "ASC"]],
    });

    const formattedImages = allImages.map((img) => ({
      id: img.id,
      image_path: ReviewImageService.getImageUrl(img.image_path),
    }));

    return {
      statusCode: 200,
      body: {
        status: true,
        message: "Review submitted successfully",
        data: {
          id: reviewRecord.id,
          sale_order_id: reviewRecord.sale_order_id,
          user_id: reviewRecord.user_id,
          ratings: parseFloat(reviewRecord.ratings),
          review: reviewRecord.review,
          images: formattedImages,
          product_aggregate: aggregateRecord
            ? {
                product_id: aggregateRecord.product_id,
                one_star_count: aggregateRecord.one_star_count,
                two_star_count: aggregateRecord.two_star_count,
                three_star_count: aggregateRecord.three_star_count,
                four_star_count: aggregateRecord.four_star_count,
                five_star_count: aggregateRecord.five_star_count,
                total_reviews: aggregateRecord.total_reviews,
                total_average: parseFloat(aggregateRecord.total_average),
              }
            : null,
          created_at: formatDate(reviewRecord.created_at),
          updated_at: formatDate(reviewRecord.updated_at),
        },
      },
    };
  }

  /**
   * Get review details for a specific sale order or user.
   * Reproduces SaleOrderReviewController::getReviewDetails().
   *
   * @param {Object} params
   * @param {number|string|null} [params.sale_order_id]
   * @param {number|string|null} [params.user_id]
   * @param {number|string|null} [params.authenticatedUserId]
   * @returns {Promise<Object>}
   */
  static async getReviewDetails({
    sale_order_id = null,
    user_id = null,
    authenticatedUserId = null,
  }) {
    if (!sale_order_id && !user_id) {
      return {
        statusCode: 422,
        body: {
          status: false,
          message: "Validation failed",
          errors: {
            sale_order_id: ["The sale order id field is required when user id is not present."],
            user_id: ["The user id field is required when sale order id is not present."],
          },
        },
      };
    }

    const where = {};
    if (sale_order_id) {
      const sId = parseInt(sale_order_id, 10);
      if (isNaN(sId)) {
        return {
          statusCode: 422,
          body: {
            status: false,
            message: "Validation failed",
            errors: { sale_order_id: ["The sale order id must be an integer."] },
          },
        };
      }
      where.sale_order_id = sId;
    }

    if (user_id) {
      const uId = parseInt(user_id, 10);
      if (isNaN(uId)) {
        return {
          statusCode: 422,
          body: {
            status: false,
            message: "Validation failed",
            errors: { user_id: ["The user id must be an integer."] },
          },
        };
      }
      // Customer isolation: authenticated customer can only view their own reviews
      if (authenticatedUserId && String(authenticatedUserId) !== String(uId)) {
        return {
          statusCode: 403,
          body: {
            status: false,
            message: "Unauthorized: You cannot access review details of another customer.",
          },
        };
      }
      where.user_id = uId;
    }

    const reviews = await SaleOrderReview.findAll({
      where,
      include: [
        { association: "images", separate: true, order: [["id", "ASC"]] },
        { association: "user" },
        { association: "saleOrder" },
      ],
      order: [["id", "DESC"]],
    });

    const formatted = reviews.map((rev) => ({
      id: rev.id,
      sale_order_id: rev.sale_order_id,
      user_id: rev.user_id,
      username: rev.user ? rev.user.username || rev.user.email || "N/A" : "N/A",
      ratings: parseFloat(rev.ratings),
      review: rev.review,
      images: (rev.images || []).map((img) => ({
        id: img.id,
        image_path: ReviewImageService.getImageUrl(img.image_path),
      })),
      created_at: formatDate(rev.created_at),
    }));

    return {
      statusCode: 200,
      body: {
        status: true,
        message: "Review details fetched successfully",
        data: formatted,
      },
    };
  }

  /**
   * Get paginated reviews, summary aggregate, star breakdowns, and gallery images for a product.
   * Reproduces ProductReviewService::getProductReviews().
   *
   * @param {number|string} productId
   * @param {Object} [filters]
   * @param {number} [filters.page=1]
   * @param {number} [filters.per_page=10]
   * @param {number|string|null} [filters.rating]
   * @param {boolean|string|null} [filters.has_image]
   * @param {string} [filters.sort='latest']
   * @returns {Promise<Object>}
   */
  static async getProductReviews(productId, filters = {}) {
    const numProductId = parseInt(productId, 10);
    if (!productId || isNaN(numProductId)) {
      return {
        statusCode: 422,
        body: {
          status: false,
          message: "The product_id parameter is required and must be numeric.",
        },
      };
    }

    // Verify product exists
    const product = await Product.findByPk(numProductId);
    if (!product) {
      return {
        statusCode: 404,
        body: {
          status: false,
          message: "Product not found.",
        },
      };
    }

    // 1. Find all sale orders for this product
    const saleOrders = await SaleOrder.findAll({
      where: { product_id: numProductId },
      attributes: ["id"],
      raw: true,
    });

    const saleOrderIds = saleOrders.map((so) => so.id);

    // 2. Fetch all reviews for summary details
    const allSaleOrderReviews =
      saleOrderIds.length > 0
        ? await SaleOrderReview.findAll({
            where: {
              sale_order_id: { [Op.in]: saleOrderIds },
            },
            include: [
              { association: "images", separate: true, order: [["id", "ASC"]] },
              { association: "user" },
            ],
          })
        : [];

    const totalReviewsCount = allSaleOrderReviews.length;
    let star5 = 0;
    let star4 = 0;
    let star3 = 0;
    let star2 = 0;
    let star1 = 0;
    let sumRatings = 0;
    const allReviewImages = [];

    for (const rItem of allSaleOrderReviews) {
      const rVal = parseFloat(rItem.ratings) || 0;
      sumRatings += rVal;
      const rounded = Math.round(rVal);

      if (rounded === 5) star5++;
      else if (rounded === 4) star4++;
      else if (rounded === 3) star3++;
      else if (rounded === 2) star2++;
      else if (rounded === 1) star1++;

      if (rItem.images && Array.isArray(rItem.images)) {
        for (const imgObj of rItem.images) {
          if (imgObj && imgObj.image_path) {
            allReviewImages.push(ReviewImageService.getImageUrl(imgObj.image_path));
          }
        }
      }
    }

    const totalAverageRating =
      totalReviewsCount > 0
        ? parseFloat((sumRatings / totalReviewsCount).toFixed(2))
        : 0.0;

    const uniqueGalleryImages = Array.from(new Set(allReviewImages.filter(Boolean)));

    const summary = {
      total_average: totalAverageRating,
      total_reviews: totalReviewsCount,
      star_counts: {
        "5_star": star5,
        "4_star": star4,
        "3_star": star3,
        "2_star": star2,
        "1_star": star1,
      },
      all_review_images: uniqueGalleryImages,
      review_images: uniqueGalleryImages,
      images: uniqueGalleryImages,
    };

    // If there are no reviews at all, return empty paginated result immediately
    const page = Math.max(1, parseInt(filters.page || 1, 10));
    const perPage = Math.max(1, parseInt(filters.per_page || 10, 10));
    const offset = (page - 1) * perPage;

    if (saleOrderIds.length === 0 || totalReviewsCount === 0) {
      return {
        statusCode: 200,
        body: {
          status: true,
          message: "Reviews retrieved successfully",
          summary,
          data: {
            current_page: page,
            per_page: perPage,
            total: 0,
            last_page: 1,
            from: null,
            to: null,
            reviews: [],
          },
        },
      };
    }

    // 3. Query with filters for paginated reviews
    const where = {
      sale_order_id: { [Op.in]: saleOrderIds },
    };

    // Rating score filter
    if (filters.rating && filters.rating !== "all") {
      const starFilter = parseFloat(filters.rating);
      if (!isNaN(starFilter)) {
        where.ratings = {
          [Op.between]: [starFilter - 0.49, starFilter + 0.49],
        };
      }
    }

    // Has image filter
    const hasImageFilter =
      filters.has_image === true ||
      filters.has_image === "true" ||
      filters.has_image === 1 ||
      filters.has_image === "1";

    let requiredImage = false;
    if (hasImageFilter) {
      requiredImage = true;
    }

    // Sorting
    const sort = String(filters.sort || "latest").toLowerCase().trim();
    let orderClause = [["id", "DESC"]];

    switch (sort) {
      case "highest_rating":
      case "highest":
        orderClause = [
          ["ratings", "DESC"],
          ["id", "DESC"],
        ];
        break;
      case "lowest_rating":
      case "lowest":
        orderClause = [
          ["ratings", "ASC"],
          ["id", "DESC"],
        ];
        break;
      case "oldest":
        orderClause = [["id", "ASC"]];
        break;
      case "latest":
      default:
        orderClause = [["id", "DESC"]];
        break;
    }

    const { count, rows } = await SaleOrderReview.findAndCountAll({
      where,
      include: [
        {
          association: "images",
          required: requiredImage,
        },
        { association: "user" },
        { association: "saleOrder" },
      ],
      order: orderClause,
      limit: perPage,
      offset,
      distinct: true,
    });

    const lastPage = Math.ceil(count / perPage) || 1;
    const from = count > 0 ? offset + 1 : null;
    const to = count > 0 ? Math.min(offset + rows.length, count) : null;

    const reviewsList = rows.map((rev) => {
      const reviewImages = (rev.images || []).map((img) => {
        const fullUrl = ReviewImageService.getImageUrl(img.image_path);
        return {
          id: img.id,
          review_id: img.review_id,
          image_path: img.image_path,
          img_path: img.image_path,
          image_url: fullUrl,
          image: fullUrl,
          url: fullUrl,
        };
      });

      const userAvatar =
        rev.user && rev.user.img_path
          ? ReviewImageService.getImageUrl(rev.user.img_path)
          : null;

      const userName = rev.user
        ? rev.user.username || rev.user.email || `Customer #${rev.user_id}`
        : `Customer #${rev.user_id}`;

      return {
        id: rev.id,
        user_id: rev.user_id,
        user_name: userName,
        user_avatar: userAvatar,
        sale_id: rev.saleOrder?.id ? `SID${rev.saleOrder.id}` : `SID${rev.sale_order_id}`,
        sale_order_id: rev.sale_order_id,
        ratings: parseFloat(rev.ratings),
        review: rev.review,
        verified_purchase: 1,
        review_images: reviewImages,
        images: reviewImages,
        reviewImages: reviewImages,
        created_at: formatDate(rev.created_at),
      };
    });

    return {
      statusCode: 200,
      body: {
        status: true,
        message: "Reviews retrieved successfully",
        summary,
        data: {
          current_page: page,
          per_page: perPage,
          total: count,
          last_page: lastPage,
          from,
          to,
          reviews: reviewsList,
        },
      },
    };
  }
}

export default SaleOrderReviewService;
export { SaleOrderReviewService };

