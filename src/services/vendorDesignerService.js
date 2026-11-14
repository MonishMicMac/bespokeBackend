import { Op } from "sequelize";
import sequelize from "../../config/db.js";
import {
  VendorLogin,
  UserLogin,
  Product,
  ProductPrice,
  ProductMaterial,
  ProductMaterialImage,
  Category,
  Subcategory,
  SaleOrder,
  CustomerReview,
  UserFavourites,
  UserCartItem,
  VendorPortfolioImage,
  DesignerPortfolio,
  DesignerSpecialities,
  ShopWishlist,
  Designer,
  DesignerWishlist,
} from "../../models/setupAssociations.js";
import { buildFileUrl } from "../utils/fileUrl.js";

/**
 * API 1: Boutique Listing
 * Laravel Method: VendorController::shoplistview
 * GET /api/shoplist/view
 */
export async function getShopListView(userId = null) {
  // Check if user_id is provided and valid
  if (userId) {
    const user = await UserLogin.findOne({
      where: {
        id: userId,
        action: "0",
      },
    });

    if (!user) {
      return {
        status: "false",
        message: "No User found.",
        data: [],
      };
    }
  }

  // Fetch vendors where action = 0
  // Note: Laravel PHP does NOT filter vendor_type or approval_status in this endpoint
  const shoplist = await VendorLogin.findAll({
    where: { action: "0" },
    attributes: ["id", "shop_name", "img_path", "is_customization", "title", "rating"],
  });

  if (!shoplist || shoplist.length === 0) {
    return {
      status: "false",
      message: "No Shop List found.",
      data: [],
    };
  }

  // Transform each vendor
  const transformedShops = await Promise.all(
    shoplist.map(async (shopRecord) => {
      const shop = shopRecord.toJSON();

      // Auto-heal missing or broken placeholder image
      if (
        !shop.img_path ||
        shop.img_path.includes("vendor.jpg") ||
        shop.img_path.includes("6799fdefb9f03")
      ) {
        const portfolio = await VendorPortfolioImage.findOne({
          where: {
            vendor_id: shop.id,
            image: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] },
          },
          order: [["id", "ASC"]],
        });

        if (portfolio) {
          shop.img_path = portfolio.image;
          await VendorLogin.update({ img_path: portfolio.image }, { where: { id: shop.id } });
        } else {
          const designerRec = await Designer.findOne({
            where: {
              designer_id: String(shop.id),
              designer_image: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] },
            },
          });
          if (designerRec) {
            shop.img_path = designerRec.designer_image;
            await VendorLogin.update({ img_path: designerRec.designer_image }, { where: { id: shop.id } });
          }
        }
      }

      // Resolve S3 image path
      shop.img_path = buildFileUrl(shop.img_path);

      // Check if the shop is in the user's wishlist
      if (userId) {
        const isWishlisted = await DesignerWishlist.findOne({
          where: {
            user_id: String(userId),
            designer_id: String(shop.id),
            action: "0",
          },
        });
        shop.wishlist = !!isWishlisted;
      } else {
        shop.wishlist = false;
      }

      // Ensure rating is returned as string with fallback calculation
      if (shop.rating !== null && shop.rating !== "" && shop.rating !== undefined) {
        shop.rating = String(shop.rating);
      } else {
        // Fallback to customer_reviews or Designer model if not set in vendor_login
        const vendorProducts = await Product.findAll({
          where: { vendor_id: String(shop.id) },
          attributes: ["id"],
        });
        const vendorProductIds = vendorProducts.map((p) => p.id);

        let avgRating = null;
        if (vendorProductIds.length > 0) {
          const avgRes = await CustomerReview.findOne({
            where: { product_id: { [Op.in]: vendorProductIds } },
            attributes: [[sequelize.fn("AVG", sequelize.col("rating")), "avg_rating"]],
            raw: true,
          });
          if (avgRes && avgRes.avg_rating) {
            avgRating = parseFloat(avgRes.avg_rating);
          }
        }

        if (avgRating === null) {
          const designerRec = await Designer.findOne({
            where: { designer_id: String(shop.id) },
          });
          if (designerRec && designerRec.designer_rating) {
            avgRating = parseFloat(designerRec.designer_rating);
          }
        }

        if (avgRating === null) {
          const overallAvg = await CustomerReview.findOne({
            attributes: [[sequelize.fn("AVG", sequelize.col("rating")), "avg_rating"]],
            raw: true,
          });
          if (overallAvg && overallAvg.avg_rating) {
            avgRating = parseFloat(overallAvg.avg_rating);
          }
        }

        shop.rating = avgRating !== null ? String(Math.round(avgRating * 10) / 10) : "0";
      }

      return shop;
    })
  );

  return {
    status: "true",
    message: "Data retrieved successfully.",
    data: transformedShops,
  };
}

/**
 * API 2: Boutique Product Listing
 * Laravel Method: VendorController::shopProductList
 * GET /api/shoplist/product
 */
export async function getShopProductList(params) {
  const shopId = params.shop_id;
  const userId = params.user_id ?? null;

  if (!shopId) {
    return {
      statusCode: 400,
      body: {
        status: "false",
        message: "Shop ID is required.",
        data: [],
      },
    };
  }

  // Fetch shop details where action = 0, vendor_type = 1, approval_status = 1
  const shopRecord = await VendorLogin.findOne({
    where: {
      id: shopId,
      action: "0",
      vendor_type: "1",
      approval_status: "1",
    },
    attributes: ["id", "shop_name", "img_path", "is_customization", "title", "rating"],
  });

  if (!shopRecord) {
    return {
      statusCode: 404,
      body: {
        status: "false",
        message: "No Shop found.",
        data: [],
      },
    };
  }

  const shop = shopRecord.toJSON();
  shop.img_path = buildFileUrl(shop.img_path);

  // User Context (Wishlist & Cart)
  let favoriteProductIds = [];
  let cartProductIds = [];

  if (userId) {
    const favorites = await UserFavourites.findAll({
      where: {
        user_id: userId,
        action: "0",
      },
      attributes: ["product_id"],
    });
    favoriteProductIds = favorites.map((f) => Number(f.product_id));

    const cartItems = await UserCartItem.findAll({
      where: {
        user_id: userId,
        action: "0",
      },
      include: [
        {
          model: ProductPrice,
          as: "priceRelation",
          attributes: ["product_id"],
        },
      ],
    });
    cartProductIds = cartItems
      .map((c) => (c.priceRelation ? Number(c.priceRelation.product_id) : null))
      .filter((id) => id !== null);
  }

  // Pagination parameters
  const perPage = Math.max(1, Math.min(100, parseInt(params.per_page, 10) || 10));
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const offset = (page - 1) * perPage;

  // Products query
  const whereProduct = {
    vendor_id: String(shopId),
    action: "0",
    is_active: "1",
  };

  const total = await Product.count({
    where: whereProduct,
    include: [
      {
        model: ProductMaterial,
        as: "productMaterials",
        where: { action: "0", is_active: "1" },
        required: true,
      },
    ],
  });
  const lastPage = Math.max(1, Math.ceil(total / perPage));

  const products = await Product.findAll({
    where: whereProduct,
    include: [
      { model: Category, as: "categoryRel", attributes: ["name"] },
      { model: Subcategory, as: "subcategoryRel", attributes: ["name"] },
      {
        model: ProductPrice,
        as: "prices",
        attributes: ["id", "product_id", "actual_price", "discount_price"],
        required: false,
      },
      {
        model: ProductMaterial,
        as: "productMaterials",
        where: { action: "0", is_active: "1" },
        required: true,
        include: [
          {
            model: ProductMaterialImage,
            as: "images",
            where: { action: false },
            required: false,
          },
        ],
      },
    ],
    order: [["id", "DESC"]],
    limit: perPage,
    offset: offset,
  });

  // Transform and flatten product data
  const transformedProducts = await Promise.all(
    products.map(async (prodRecord) => {
      const prod = prodRecord.toJSON();

      // Bestseller check using sale_order
      const isBestseller = await SaleOrder.findOne({
        where: {
          product_id: prod.id,
          action: "0",
        },
        attributes: ["id"],
      });

      // Image resolution
      let imageUrl = null;
      if (prod.main_image) {
        imageUrl = buildFileUrl(prod.main_image);
      } else if (prod.productMaterials && prod.productMaterials.length > 0) {
        const firstMat = prod.productMaterials[0];
        if (firstMat.images && firstMat.images.length > 0) {
          imageUrl = buildFileUrl(firstMat.images[0].img_path);
        }
      }

      // Price flattening
      const priceData = prod.prices && prod.prices.length > 0 ? prod.prices[0] : null;
      const actual = priceData ? parseFloat(priceData.actual_price || 0) : 0;
      const discountPrice = priceData ? parseFloat(priceData.discount_price || 0) : 0;

      let discountPercentage = 0;
      if (actual > 0 && discountPrice > 0 && discountPrice < actual) {
        discountPercentage = Math.round(((actual - discountPrice) / actual) * 100);
      }

      const item = {
        id: prod.id,
        product_name: prod.product_name,
        main_image: imageUrl,
        category_name: prod.categoryRel?.name || null,
        subcategory_name: prod.subcategoryRel?.name || null,
        rating: String(prod.rating ?? "0"),
        bestseller: !!isBestseller,
        actual_price: actual.toFixed(2),
        discount_price: discountPrice.toFixed(2),
        discount_percentage: discountPercentage,
        wishlist: favoriteProductIds.includes(Number(prod.id)),
        iscarted: cartProductIds.includes(Number(prod.id)),
      };

      return item;
    })
  );

  const pagination = {
    current_page: page,
    per_page: perPage,
    total: total,
    last_page: lastPage,
  };

  shop.rating = String(shop.rating ?? "0");
  shop.products = transformedProducts;
  shop.pagination = pagination;

  return {
    statusCode: 200,
    body: {
      status: "true",
      message: "Data retrieved successfully.",
      shop: shop,
      pagination: pagination,
    },
  };
}

/**
 * API 3: Designer Listing
 * Laravel Method: DesignerController::designerlistview
 * GET /api/designerlist/view/{user_id?}
 */
export async function getDesignerListView(userId = null) {
  // Check if user_id is provided and valid
  if (userId) {
    const user = await UserLogin.findOne({
      where: {
        id: userId,
        action: "0",
      },
    });

    if (!user) {
      return {
        status: "false",
        message: "No User found.",
        data: [],
      };
    }
  }

  // Fetch designers from vendor_login where action = 0, vendor_type = 2, approval_status = 1
  const shoplist = await VendorLogin.findAll({
    where: {
      action: "0",
      vendor_type: "2",
      approval_status: "1",
    },
    attributes: ["id", "shop_name", "img_path", "is_customization", "title", "rating", "description"],
  });

  if (!shoplist || shoplist.length === 0) {
    return {
      status: "false",
      message: "No Shop List found.",
      data: [],
    };
  }

  const transformedDesigners = await Promise.all(
    shoplist.map(async (designerRecord) => {
      const shop = designerRecord.toJSON();

      // Auto-heal missing or broken placeholder image
      if (
        !shop.img_path ||
        shop.img_path.includes("vendor.jpg") ||
        shop.img_path.includes("6799fdefb9f03")
      ) {
        const portfolio = await VendorPortfolioImage.findOne({
          where: {
            vendor_id: shop.id,
            image: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] },
          },
          order: [["id", "ASC"]],
        });

        if (portfolio) {
          shop.img_path = portfolio.image;
          await VendorLogin.update({ img_path: portfolio.image }, { where: { id: shop.id } });
        } else {
          const designerRec = await Designer.findOne({
            where: {
              designer_id: String(shop.id),
              designer_image: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] },
            },
          });
          if (designerRec) {
            shop.img_path = designerRec.designer_image;
            await VendorLogin.update({ img_path: designerRec.designer_image }, { where: { id: shop.id } });
          }
        }
      }

      // Resolve S3 URL
      shop.img_path = buildFileUrl(shop.img_path);

      // Check Wishlist Status
      if (userId) {
        const isWishlisted = await DesignerWishlist.findOne({
          where: {
            user_id: String(userId),
            designer_id: String(shop.id),
            action: "0",
          },
        });
        shop.wishlist = !!isWishlisted;
      } else {
        shop.wishlist = false;
      }

      // Get Specialities
      const specialities = await DesignerSpecialities.findAll({
        where: {
          vendor_id: shop.id,
          action: "0",
        },
        attributes: ["speciality_name"],
      });
      shop.specialities = specialities.map((s) => s.speciality_name);

      return shop;
    })
  );

  return {
    status: "true",
    message: "Data retrieved successfully.",
    data: transformedDesigners,
  };
}

/**
 * API 4: Designer Products
 * Laravel Method: DesignerController::designerProductList
 * GET /api/designer/product
 */
export async function getDesignerProductList(params) {
  const designerId = params.designer_id;
  const userId = params.user_id ?? null;

  if (!designerId) {
    return {
      statusCode: 200,
      body: {
        status: "false",
        message: "Designer ID is required.",
      },
    };
  }

  // In Laravel PHP: Designer lookup does not filter vendor_type = 2 or approval_status = 1
  let shopRecord = await VendorLogin.findOne({
    where: {
      id: designerId,
      action: "0",
    },
    attributes: ["id", "shop_name", "img_path", "is_customization", "title", "rating", "description"],
  });

  let resolvedDesignerRec = null;
  if (!shopRecord) {
    resolvedDesignerRec = await Designer.findOne({
      where: {
        [Op.or]: [{ id: designerId }, { designer_id: String(designerId) }],
      },
    });

    if (resolvedDesignerRec) {
      if (resolvedDesignerRec.designer_id) {
        shopRecord = await VendorLogin.findOne({
          where: {
            id: resolvedDesignerRec.designer_id,
            action: "0",
          },
          attributes: ["id", "shop_name", "img_path", "is_customization", "title", "rating", "description"],
        });
      }
      if (!shopRecord) {
        shopRecord = {
          id: Number(resolvedDesignerRec.designer_id || resolvedDesignerRec.id),
          shop_name: resolvedDesignerRec.designer_name,
          img_path: resolvedDesignerRec.designer_image,
          is_customization: "0",
          title: resolvedDesignerRec.designer_title,
          rating: parseFloat(resolvedDesignerRec.designer_rating || 5),
          description: `Bespoke Designer Atelier - ${resolvedDesignerRec.designer_title || "Haute Couture"}`,
          toJSON: function () {
            return { ...this };
          },
        };
      }
    }
  }

  if (!shopRecord) {
    return {
      statusCode: 200,
      body: {
        status: "false",
        message: "No Shop found.",
      },
    };
  }

  const shop = shopRecord.toJSON();

  // Auto-heal missing or broken placeholder image
  if (!shop.img_path || shop.img_path.includes("vendor.jpg")) {
    const portfolio = await VendorPortfolioImage.findOne({
      where: {
        vendor_id: shop.id,
        image: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] },
      },
      order: [["id", "ASC"]],
    });

    if (portfolio) {
      shop.img_path = portfolio.image;
      await VendorLogin.update({ img_path: portfolio.image }, { where: { id: shop.id } });
    }
  }

  // Resolve Shop S3 Image safely
  shop.img_path = buildFileUrl(shop.img_path);

  // Pagination parameters
  const perPage = Math.max(1, Math.min(100, parseInt(params.per_page, 10) || 10));
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const offset = (page - 1) * perPage;

  // Products query
  const resolvedVendorId = String(shopRecord.id || designerId);
  const whereProduct = {
    vendor_id: resolvedVendorId,
    action: "0",
    is_active: "1",
  };

  let total = await Product.count({
    where: whereProduct,
    include: [
      {
        model: ProductMaterial,
        as: "productMaterials",
        where: { action: "0", is_active: "1" },
        required: true,
      },
    ],
  });
  let products = await Product.findAll({
    where: whereProduct,
    include: [
      { model: Category, as: "categoryRel", attributes: ["name"] },
      { model: Subcategory, as: "subcategoryRel", attributes: ["name"] },
      {
        model: ProductPrice,
        as: "prices",
        required: false,
      },
      {
        model: ProductMaterial,
        as: "productMaterials",
        where: { action: "0", is_active: "1" },
        required: true,
        include: [
          {
            model: ProductMaterialImage,
            as: "images",
            where: { action: false },
            required: false,
          },
        ],
      },
    ],
    order: [["id", "DESC"]],
    limit: perPage,
    offset: offset,
  });

  const lastPage = Math.max(1, Math.ceil(total / perPage));

  const productIds = products.map((p) => p.id);

  // Fetch product ratings from customer_reviews
  const productRatingsMap = {};
  if (productIds.length > 0) {
    const reviewAvgs = await CustomerReview.findAll({
      where: { product_id: { [Op.in]: productIds } },
      attributes: [
        "product_id",
        [sequelize.fn("AVG", sequelize.col("rating")), "avg_rating"],
      ],
      group: ["product_id"],
      raw: true,
    });
    for (const r of reviewAvgs) {
      productRatingsMap[r.product_id] = parseFloat(r.avg_rating);
    }
  }

  // Transform products
  const transformedProducts = await Promise.all(
    products.map(async (prodRecord) => {
      const prod = prodRecord.toJSON();

      let imageUrl = null;
      if (prod.main_image) {
        imageUrl = buildFileUrl(prod.main_image);
      } else if (prod.productMaterials && prod.productMaterials.length > 0) {
        const firstMat = prod.productMaterials[0];
        if (firstMat.images && firstMat.images.length > 0) {
          imageUrl = buildFileUrl(firstMat.images[0].img_path);
        }
      }
      prod.main_image = imageUrl;
      delete prod.productMaterials;

      if (prod.prices && prod.prices.length > 0) {
        const p0 = prod.prices[0];
        const actual = parseFloat(p0.actual_price) || 0;
        const disc = parseFloat(p0.discount_price) || actual;
        prod.price = disc || actual || 499;
        prod.actual_price = actual || prod.price;
        prod.discount_price = disc || prod.price;
        prod.discount_percentage = actual > disc && actual > 0
          ? Math.round(((actual - disc) / actual) * 100)
          : 0;
        prod.price_id = p0.id;
      } else {
        prod.price = 499;
        prod.actual_price = 499;
        prod.discount_price = 499;
        prod.discount_percentage = 0;
      }
      delete prod.prices;

      // Bestseller check
      const isBestseller = await SaleOrder.findOne({
        where: { product_id: prod.id, action: "0" },
        attributes: ["id"],
      });
      prod.bestseller = !!isBestseller;

      // Wishlist & Cart
      if (userId) {
        const isFav = await UserFavourites.findOne({
          where: { user_id: userId, product_id: prod.id, action: "0" },
          attributes: ["id"],
        });
        prod.wishlist = !!isFav;

        // In PHP DesignerController line 281: compares Price_id against product.id
        const isCarted = await UserCartItem.findOne({
          where: { user_id: userId, price_id: prod.id, action: "0" },
          attributes: ["id"],
        });
        prod.iscarted = !!isCarted;
      } else {
        prod.wishlist = false;
        prod.iscarted = false;
      }

      prod.rating = productRatingsMap[prod.id] !== undefined
        ? Math.round(productRatingsMap[prod.id] * 10) / 10
        : prod.rating ? parseFloat(prod.rating) : 0.0;

      return prod;
    })
  );

  // Portfolio images with 3-tier fallback
  let portfolioList = [];
  const vendorPortfolio = await VendorPortfolioImage.findAll({
    where: {
      vendor_id: designerId,
      image: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] },
    },
    order: [["id", "ASC"]],
  });

  if (vendorPortfolio.length > 0) {
    portfolioList = vendorPortfolio.map((item) => ({
      id: item.id,
      vendor_id: item.vendor_id,
      image: buildFileUrl(item.image),
      description: item.description ?? shop.description ?? null,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));
  } else {
    const designerPort = await DesignerPortfolio.findAll({
      where: {
        designer_id: String(designerId),
        action: "0",
      },
    });

    if (designerPort.length > 0) {
      portfolioList = designerPort.map((item) => ({
        id: item.id,
        designer_id: item.designer_id,
        image: buildFileUrl(item.img_path),
        title: item.title,
        description: item.description ?? shop.description ?? null,
        created_at: item.created_at,
        updated_at: item.updated_at,
      }));
    }
  }

  // Link Designer Model for Rating & Title
  const designerRec =
    (await Designer.findOne({ where: { designer_id: String(designerId) } })) ||
    (await Designer.findOne({ where: { id: designerId } }));

  // Resolve Designer Rating from customer_reviews (with fallback to Designer model & overall reviews)
  const allVendorProducts = await Product.findAll({
    where: { vendor_id: String(designerId) },
    attributes: ["id"],
  });
  const allVendorProductIds = allVendorProducts.map((p) => p.id);
  let customerReviewAvg = null;

  if (allVendorProductIds.length > 0) {
    const revAvg = await CustomerReview.findOne({
      where: { product_id: { [Op.in]: allVendorProductIds } },
      attributes: [[sequelize.fn("AVG", sequelize.col("rating")), "avg_rating"]],
      raw: true,
    });
    if (revAvg && revAvg.avg_rating) {
      customerReviewAvg = parseFloat(revAvg.avg_rating);
    }
  }

  if (customerReviewAvg === null && designerRec && designerRec.designer_rating) {
    customerReviewAvg = parseFloat(designerRec.designer_rating);
  }

  if (customerReviewAvg === null && shop.rating) {
    customerReviewAvg = parseFloat(shop.rating);
  }

  if (customerReviewAvg === null) {
    const overallAvg = await CustomerReview.findOne({
      attributes: [[sequelize.fn("AVG", sequelize.col("rating")), "avg_rating"]],
      raw: true,
    });
    if (overallAvg && overallAvg.avg_rating) {
      customerReviewAvg = parseFloat(overallAvg.avg_rating);
    }
  }

  shop.rating = customerReviewAvg !== null ? Math.round(customerReviewAvg * 10) / 10 : null;

  // Auto-heal title from Designer model if shop title is empty
  if (!shop.title && designerRec && designerRec.designer_title) {
    shop.title = designerRec.designer_title;
  }

  // Update vendor_login table so rating persists
  if (shop.rating !== null) {
    await VendorLogin.update({ rating: shop.rating }, { where: { id: shop.id } });
  }

  // Fallback for portfolio from Designer model if both previous tables are empty
  if (portfolioList.length === 0 && designerRec && designerRec.designer_image) {
    portfolioList = [
      {
        id: designerRec.id,
        designer_id: designerRec.designer_id,
        image: buildFileUrl(designerRec.designer_image),
        description: shop.description ?? null,
        created_at: designerRec.created_at,
        updated_at: designerRec.updated_at,
      },
    ];
  }

  // Specialities
  const specialities = await DesignerSpecialities.findAll({
    where: { vendor_id: designerId, action: "0" },
    attributes: ["speciality_name"],
  });
  shop.specialities = specialities.map((s) => s.speciality_name);

  // Designer Wishlist Status
  if (userId) {
    const isWishlisted = await DesignerWishlist.findOne({
      where: {
        user_id: String(userId),
        designer_id: String(shop.id),
        action: "0",
      },
    });
    shop.wishlist = !!isWishlisted;
  } else {
    shop.wishlist = false;
  }

  const pagination = {
    current_page: page,
    per_page: perPage,
    total: total,
    last_page: lastPage,
  };

  shop.products = transformedProducts;
  shop.portfolio = portfolioList;
  shop.pagination = pagination;

  return {
    statusCode: 200,
    body: {
      status: "true",
      message: "Data retrieved successfully.",
      designer: shop,
      pagination: pagination,
    },
  };
}

/**
 * API 5: Vendor Portfolio
 * Laravel Method: VendorController::getVendorPortfolio
 * GET /api/vendor/portfolio/:vendor_id
 */
export async function getVendorPortfolio(vendorId) {
  const vendor = await VendorLogin.findByPk(vendorId);
  if (!vendor) {
    return {
      statusCode: 404,
      body: {
        status: false,
        message: "Vendor not found",
      },
    };
  }

  const portfolioRecords = await VendorPortfolioImage.findAll({
    where: { vendor_id: vendor.id },
  });

  const portfolioImages = portfolioRecords.map((item) => ({
    id: item.id,
    vendor_id: item.vendor_id,
    image: item.image,
    image_url: buildFileUrl(item.image),
    created_at: item.created_at,
  }));

  return {
    statusCode: 200,
    body: {
      status: true,
      message: "Vendor portfolio fetched successfully",
      data: {
        vendor_id: vendor.id,
        description: vendor.description,
        portfolio_images: portfolioImages,
      },
    },
  };
}

/**
 * API 6: Add Vendor to Favorites
 * Laravel Method: DesignerWishlistController::addToWishlist
 * POST /api/favorite/vendor
 */
export async function addVendorToFavorites(userId, vendorId) {
  if (!userId || !vendorId) {
    return {
      statusCode: 200,
      body: {
        status: "false",
        message: "user_id and vendor_id are required",
      },
    };
  }

  // Check if already in the wishlist
  const existingWishlistItem = await DesignerWishlist.findOne({
    where: {
      user_id: String(userId),
      designer_id: String(vendorId),
    },
  });

  if (existingWishlistItem) {
    return {
      statusCode: 200,
      body: {
        status: "true",
        message: "This added successfully",
      },
    };
  }

  // Add the designer to the wishlist
  await DesignerWishlist.create({
    user_id: String(userId),
    designer_id: String(vendorId),
    action: "0",
  });

  return {
    statusCode: 200,
    body: {
      status: "true",
      message: "This added successfully",
    },
  };
}

/**
 * API 7: Remove Vendor from Favorites
 * Laravel Method: DesignerWishlistController::removeFromWishlist
 * POST /api/remove/favorite/vendor
 */
export async function removeVendorFromFavorites(userId, vendorId) {
  if (!userId || !vendorId) {
    return {
      statusCode: 200,
      body: {
        status: "false",
        message: "user_id and vendor_id are required",
      },
    };
  }

  const wishlistItem = await DesignerWishlist.findOne({
    where: {
      user_id: String(userId),
      designer_id: String(vendorId),
    },
  });

  if (!wishlistItem) {
    return {
      statusCode: 200,
      body: {
        status: "false",
        message: "This designer is not in the wishlist",
      },
    };
  }

  // Physical row deletion matching Laravel $wishlistItem->delete()
  await wishlistItem.destroy();

  return {
    statusCode: 200,
    body: {
      status: "true",
      message: "This designer removed successfully from the wishlist",
    },
  };
}

/**
 * API 8: Add Boutique to Shop Wishlist
 * Laravel Method: ShopWishlistController::addToShopWishlist
 * POST /api/addtoshopwishlist
 */
export async function addShopToWishlist(userId, shopId) {
  if (!userId || !shopId) {
    return {
      statusCode: 200,
      body: {
        status: "false",
        message: "user_id and shop_id are required",
      },
    };
  }

  // Check if the shop exists and if it's actually a shop (vendor_type != '2')
  const checkingShop = await VendorLogin.findByPk(shopId);

  if (!checkingShop || String(checkingShop.vendor_type) === "2") {
    return {
      statusCode: 200,
      body: {
        status: "false",
        message: "This is not a shop",
      },
    };
  }

  // Check if the shop is active
  if (String(checkingShop.action) === "1") {
    return {
      statusCode: 200,
      body: {
        status: "false",
        message: "This shop is not active",
      },
    };
  }

  // Check if the shop is approved
  if (String(checkingShop.approval_status) === "0") {
    return {
      statusCode: 200,
      body: {
        status: "false",
        message: "This shop is not approved",
      },
    };
  }

  // Check if already in the shop wishlist
  const existingWishlistItem = await ShopWishlist.findOne({
    where: {
      user_id: String(userId),
      shop_id: String(shopId),
    },
  });

  if (existingWishlistItem) {
    return {
      statusCode: 200,
      body: {
        status: "false",
        message: "This shop is already in your wishlist.",
      },
    };
  }

  // Add the shop to the wishlist
  await ShopWishlist.create({
    user_id: String(userId),
    shop_id: String(shopId),
    action: "0",
  });

  return {
    statusCode: 200,
    body: {
      status: "true",
      message: "Shop added to your wishlist successfully.",
    },
  };
}

export default {
  getShopListView,
  getShopProductList,
  getDesignerListView,
  getDesignerProductList,
  getVendorPortfolio,
  addVendorToFavorites,
  removeVendorFromFavorites,
  addShopToWishlist,
};
