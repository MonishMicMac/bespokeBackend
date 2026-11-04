import express from "express";
import * as productCatalogController from "../controllers/productCatalogController.js";
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

// Legacy routes preserved
router.get("/products", getProducts);
router.get("/products/:id", getProductById);
router.get("/product/:id", getProductById);
router.get("/categories", getCategoriesHandler);
router.get("/subcategories", getSubcategoriesHandler);
router.get("/app-banners", getBanners);

export default router;
