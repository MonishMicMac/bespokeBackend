import {
  CustomerReview,
  ReviewImage,
  Product,
  UserLogin,
} from "../../models/setupAssociations.js";
import sequelize from "../../config/db.js";
import ReviewImageService from "./reviewImageService.js";

class CustomerReviewService {
  /**
   * Store a general customer product review (System B: POST /api/store_review).
   * Reproduces ReviewContoller::storeReview().
   *
   * @param {Object} params
   * @param {number|string} params.product_id
   * @param {number|string} params.user_id
   * @param {number|string} params.rating
   * @param {string|null} [params.comments]
   * @param {Array<string>|string|null} [params.images]
   * @param {number|string|null} [params.authenticatedUserId]
   * @returns {Promise<Object>}
   */
  static async storeReview({
    product_id,
    user_id,
    rating,
    comments = null,
    images = null,
    authenticatedUserId = null,
  }) {
    const errors = {};

    if (!product_id) {
      errors.product_id = ["The product id field is required."];
    }
    if (!user_id) {
      errors.user_id = ["The user id field is required."];
    }
    if (rating === undefined || rating === null || rating === "") {
      errors.rating = ["The rating field is required."];
    } else {
      const numRating = parseFloat(rating);
      if (isNaN(numRating) || numRating < 1 || numRating > 5) {
        errors.rating = ["The rating must be between 1 and 5."];
      }
    }

    if (Object.keys(errors).length > 0) {
      return {
        statusCode: 422,
        body: {
          status: "false",
          message: "Validation failed",
          errors,
        },
      };
    }

    const numProductId = parseInt(product_id, 10);
    const numUserId = parseInt(user_id, 10);
    const numRating = parseInt(rating, 10);

    // 1. Verify user exists
    const user = await UserLogin.findByPk(numUserId);
    if (!user) {
      return {
        statusCode: 422,
        body: {
          status: "false",
          message: "Validation failed",
          errors: { user_id: ["The selected user id is invalid."] },
        },
      };
    }

    // 2. Authentication check: if token present, verify user identity
    if (authenticatedUserId && String(authenticatedUserId) !== String(numUserId)) {
      return {
        statusCode: 403,
        body: {
          status: "false",
          message: "Unauthorized: You cannot submit a review for another customer.",
        },
      };
    }

    // 3. Verify product exists
    const product = await Product.findByPk(numProductId);
    if (!product) {
      return {
        statusCode: 404,
        body: {
          status: "false",
          message: "Invalid product ID",
        },
      };
    }

    // 4. Pre-validate and process all images BEFORE database transaction
    // This avoids the legacy PHP bug where an invalid image left an orphaned review in DB!
    const rawImages = images
      ? Array.isArray(images)
        ? images
        : [images]
      : [];

    const uploadedS3Keys = [];

    if (rawImages.length > 0) {
      for (const base64Image of rawImages) {
        if (!base64Image || typeof base64Image !== "string") {
          return {
            statusCode: 422,
            body: {
              status: "false",
              message: "Invalid image data",
              errors: { image: ["Image data must be a valid string."] },
            },
          };
        }

        // Validate format using regex or parsing
        const isDataUrl = /^data:image\/(\w+);base64,/i.test(base64Image.trim());
        if (!isDataUrl && !/^[A-Za-z0-9+/=]+$/.test(base64Image.trim().replace(/\s/g, ""))) {
          return {
            statusCode: 422,
            body: {
              status: "false",
              message: "Invalid image data",
              errors: {
                image: [
                  "The image format is invalid. Must match data:image/{type};base64,...",
                ],
              },
            },
          };
        }

        try {
          const key = await ReviewImageService.processAndUploadBase64(base64Image);
          if (key) {
            uploadedS3Keys.push(key);
          }
        } catch (imgErr) {
          // Clean up previously uploaded images
          await ReviewImageService.deleteS3Keys(uploadedS3Keys);
          return {
            statusCode: 422,
            body: {
              status: "false",
              message: "Invalid image data",
              errors: { image: [imgErr.message] },
            },
          };
        }
      }
    }

    // 5. Database transaction: upsert CustomerReview and store ReviewImage
    const t = await sequelize.transaction();
    try {
      let review = await CustomerReview.findOne({
        where: {
          user_id: numUserId,
          product_id: numProductId,
        },
        transaction: t,
      });

      if (review) {
        review.rating = numRating;
        review.comments = comments || null;
        review.review_date = new Date();
        await review.save({ transaction: t });
      } else {
        review = await CustomerReview.create(
          {
            user_id: numUserId,
            product_id: numProductId,
            rating: numRating,
            comments: comments || null,
            review_date: new Date(),
          },
          { transaction: t }
        );
      }

      for (const key of uploadedS3Keys) {
        await ReviewImage.create(
          {
            customer_review_id: review.id,
            image_path: key,
          },
          { transaction: t }
        );
      }

      await t.commit();
    } catch (dbErr) {
      await t.rollback();
      await ReviewImageService.deleteS3Keys(uploadedS3Keys);
      return {
        statusCode: 500,
        body: {
          status: "false",
          message: `Failed to store review: ${dbErr.message}`,
        },
      };
    }

    return {
      statusCode: 200,
      body: {
        status: "true",
        message: "Review stored successfully",
      },
    };
  }
}

export default CustomerReviewService;
export { CustomerReviewService };

