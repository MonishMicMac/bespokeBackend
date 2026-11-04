import { Op } from "sequelize";
import sequelize from "../../config/db.js";
import {
  UserFavourites,
  ProductPrice,
  Product,
  ProductMaterial,
  ProductMaterialImage,
  ProductImage,
  UserLogin,
  VendorLogin,
  Category,
  Subcategory,
  UserCartItem,
} from "../../models/setupAssociations.js";
import { buildFileUrl } from "../utils/fileUrl.js";

/**
 * Service to manage customer favorites and wishlist entries
 * Faithful port of Laravel UserProductController::getUserFavorites & FavouritesController
 */

/**
 * API 1: Retrieve customer active wishlist products
 * Method: UserProductController::getUserFavorites
 * GET /api/user-favorites/:user_id
 */
export async function getUserFavorites(userId) {
  if (!userId) {
    return {
      statusCode: 200,
      body: {
        status: "false",
        message: "No favorite products found",
      },
    };
  }

  // Fetch user favorites with price_id and eager load relationships
  const userFavorites = await UserFavourites.findAll({
    where: {
      user_id: userId,
      action: "0",
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
    ],
  });

  if (!userFavorites || userFavorites.length === 0) {
    return {
      statusCode: 200,
      body: {
        status: "false",
        message: "No favorite products found",
      },
    };
  }

  // Format product data matching Laravel UserProductController::getUserFavorites
  const formattedProducts = await Promise.all(
    userFavorites.map(async (favRecord) => {
      const fav = favRecord.toJSON ? favRecord.toJSON() : favRecord;
      const priceRecord = fav.priceRelation;
      if (!priceRecord) return null;

      const product = priceRecord.product;
      if (!product) return null;

      const material = priceRecord.material;
      const vendor = product.vendor;

      const actualPrice = priceRecord.actual_price;
      const discountPrice = priceRecord.discount_price;

      // Resolve Image URL with exact priority:
      // 1. product.main_image
      // 2. material.images[0].img_path
      // 3. productMaterials[0].images[0].img_path
      let imageUrl = null;
      if (product.main_image) {
        imageUrl = buildFileUrl(product.main_image);
      } else if (material && material.images && material.images.length > 0) {
        imageUrl = buildFileUrl(material.images[0].img_path);
      } else if (product.productMaterials && product.productMaterials.length > 0) {
        const firstMaterial = product.productMaterials[0];
        if (firstMaterial && firstMaterial.images && firstMaterial.images.length > 0) {
          imageUrl = buildFileUrl(firstMaterial.images[0].img_path);
        }
      }

      // Check whether user has any cart item whose price relation belongs to the same product
      const isInCart = await UserCartItem.findOne({
        where: {
          user_id: userId,
          action: { [Op.ne]: "1" }, // Bug fix: ignore soft-deleted cart items
        },
        include: [
          {
            model: ProductPrice,
            as: "priceRelation",
            where: { product_id: product.id },
            required: true,
          },
        ],
      });

      // Category and subcategory fallbacks
      let categoryName = product.categoryRel?.name || null;
      if (!categoryName && product.category) {
        const cat = await Category.findByPk(product.category);
        categoryName = cat?.name || null;
      }

      let subcategoryName = product.subcategoryRel?.name || null;
      if (!subcategoryName && product.subcategory) {
        const sub = await Subcategory.findByPk(product.subcategory);
        subcategoryName = sub?.name || null;
      }

      return {
        wishlist_id: fav.id,
        product_id: product.id,
        price_id: priceRecord.id,
        image: imageUrl,
        product_name: product.product_name,
        price: actualPrice,
        offer_price: discountPrice,
        category_name: categoryName,
        sub_category_name: subcategoryName,
        vendor_name: vendor?.shop_name || vendor?.username || null,
        vendor_type: vendor?.vendor_type || null,
        iscarted: !!isInCart,
      };
    })
  );

  const cleanData = formattedProducts.filter((p) => p !== null);

  if (cleanData.length === 0) {
    return {
      statusCode: 200,
      body: {
        status: "false",
        message: "No favorite products found",
      },
    };
  }

  return {
    statusCode: 200,
    body: {
      status: "true",
      message: "Favorite products found",
      data: cleanData,
    },
  };
}

/**
 * API 2: Add a product variant to the user's wishlist
 * Method: FavouritesController::addfavorite
 * POST /api/add/favorite
 */
export async function addFavorite({ userId, priceId, productId = null }) {
  // 1. Validation
  if (!userId) {
    return {
      statusCode: 422,
      body: { status: "false", message: "The user id field is required." },
    };
  }
  if (!priceId) {
    return {
      statusCode: 422,
      body: { status: "false", message: "The price id field is required." },
    };
  }

  // 2. Validate Price Variant
  const productPrice = await ProductPrice.findByPk(priceId, {
    include: [{ model: Product, as: "product" }],
  });

  if (!productPrice) {
    return {
      statusCode: 404,
      body: { status: "false", message: "Invalid product price variant." },
    };
  }

  // 3. Confirm user exists and is active (action = '0')
  const user = await UserLogin.findOne({
    where: {
      id: userId,
      action: "0",
    },
  });

  if (!user) {
    return {
      statusCode: 200,
      body: { status: "false", message: "User is invalid or not active." },
    };
  }

  // 4. Confirm product exists and is active (action = '0')
  const product = productPrice.product;
  if (!product || String(product.action) !== "0") {
    return {
      statusCode: 200,
      body: { status: "false", message: "Product is invalid or not active." },
    };
  }

  // 5. If client provided product_id, verify it matches the variant's product
  if (productId !== null && productId !== undefined && String(productId).trim() !== "") {
    if (Number(productId) !== Number(product.id)) {
      return {
        statusCode: 400,
        body: {
          status: "false",
          message: "The supplied product_id does not match the variant price_id.",
        },
      };
    }
  }

  // 6. Concurrency-safe check if favorite already exists with action = '0'
  const existing = await UserFavourites.findOne({
    where: {
      user_id: userId,
      price_id: priceId,
      action: "0",
    },
  });

  if (existing) {
    return {
      statusCode: 200,
      body: {
        status: "true",
        message: "Favorite already exists.",
        data: existing,
      },
    };
  }

  // 7. Insert new favorite record
  const favorite = await UserFavourites.create({
    user_id: userId,
    price_id: priceId,
    product_id: product.id,
    action: "0",
    c_date: new Date(),
  });

  return {
    statusCode: 200,
    body: {
      status: "true",
      message: "Favorite added successfully.",
      data: favorite,
    },
  };
}

/**
 * API 3: Remove a wishlist entry
 * Method: FavouritesController::removeFavorite
 * POST /api/remove/favorite
 */
export async function removeFavorite({ wishlistId, userId = null, productId = null, authenticatedUserId = null }) {
  if (!wishlistId) {
    return {
      statusCode: 422,
      body: { status: "false", message: "The wishlist id field is required." },
    };
  }

  // Find the favorite record
  const favorite = await UserFavourites.findByPk(wishlistId, {
    include: [{ model: ProductPrice, as: "priceRelation" }],
  });

  if (!favorite) {
    return {
      statusCode: 200,
      body: {
        status: "false",
        message: "Favorite not found or already removed.",
      },
    };
  }

  // Security & Ownership Verification:
  // If authenticated user is passed, must match.
  // If user_id is passed in request, must match.
  if (authenticatedUserId !== null && authenticatedUserId !== undefined) {
    if (String(favorite.user_id) !== String(authenticatedUserId)) {
      return {
        statusCode: 403,
        body: {
          status: "false",
          message: "Unauthorized. You cannot remove another user's favorite.",
        },
      };
    }
  }

  if (userId !== null && userId !== undefined) {
    if (String(favorite.user_id) !== String(userId)) {
      return {
        statusCode: 403,
        body: {
          status: "false",
          message: "Unauthorized. You cannot remove another user's favorite.",
        },
      };
    }
  }

  // If product_id is supplied, verify it matches the entry's resolved product
  if (productId !== null && productId !== undefined && String(productId).trim() !== "") {
    const resolvedProductId = favorite.priceRelation ? favorite.priceRelation.product_id : favorite.product_id;
    if (resolvedProductId && Number(productId) !== Number(resolvedProductId)) {
      return {
        statusCode: 400,
        body: {
          status: "false",
          message: "The supplied product_id does not match the wishlist entry.",
        },
      };
    }
  }

  // Physical deletion matching Laravel ($favorite->delete())
  await favorite.destroy();

  return {
    statusCode: 200,
    body: {
      status: "true",
      message: "Favorite removed successfully.",
    },
  };
}

export default {
  getUserFavorites,
  addFavorite,
  removeFavorite,
};

