import express from "express";
import upload from "../middleware/upload.js";
import * as productCatalogController from "../controllers/productCatalogController.js";
import * as vendorProductController from "../controllers/vendorProductController.js";
import { getProductRecommendations } from "../controllers/recommendationController.js";
import {
  getProducts,
  getProductById,
  getBanners,
} from "../controllers/productController.js";
import {
  getCategories as getCategoriesHandler,
  getSubcategoriesList as getSubcategoriesHandler,
} from "../controllers/homepageController.js";

const router = express.Router();

// Products & Catalog endpoints (Laravel equivalent)
router.post(
  ["/add/product/web", "/product/add/web"],
  upload.any(),
  vendorProductController.addProductWeb
);
router.post(
  ["/update/product/web", "/product/update/web"],
  upload.any(),
  vendorProductController.updateProductWeb
);

router.get(
  ["/product/edit/:id", "/product/edit", "/vendor/product/edit/:id"],
  vendorProductController.getProductEditDetails
);

router.get("/show/product", productCatalogController.getProductDetails);
router.get("/product/list", productCatalogController.getVendorProducts);
router.get("/vendor/product/list", productCatalogController.getVendorProducts);

const sizewisePaths = [
  "/product-measurements/sizewise",
  "/product-measurements/sizewise/:product_id",
  "/product/measurement/sizewise",
  "/product/measurement/sizewise/:product_id",
  "/product/size-wise-measurements",
  "/product/size-wise-measurements/:product_id",
];

sizewisePaths.forEach((path) => {
  router.get(path, productCatalogController.getProductMeasurementSizeWise);
  router.post(path, productCatalogController.getProductMeasurementSizeWise);
});

router.get(
  ["/product-size-details", "/product-size-details/:product_id"],
  productCatalogController.getProductSizeDetails
);

router.get("/products/search", productCatalogController.searchProducts);

// Intelligent Product Recommendations (Relevance-based scoring)
router.get("/products/:productId/recommendations", getProductRecommendations);
router.get("/product/:productId/recommendations", getProductRecommendations);
router.get("/show/product/recommendations", getProductRecommendations);

// Legacy routes preserved
router.get("/products", getProducts);
router.get("/products/:id", getProductById);
router.get("/product/:id", getProductById);
router.get("/categories", getCategoriesHandler);
router.get("/subcategories", getSubcategoriesHandler);
router.get("/app-banners", getBanners);

export default router;
