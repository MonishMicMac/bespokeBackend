import express from "express";
import * as productCatalogController from "../controllers/productCatalogController.js";

const router = express.Router();

// 1. Product listing
router.get("/product/list", productCatalogController.getVendorProducts);
router.get("/vendor/product/list", productCatalogController.getVendorProducts);

// 2. Product details
router.get("/show/product", productCatalogController.getProductDetails);

// 3. Product sizewise measurements (GET and POST supported)
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

// Delegate product-size-details to sizewise measurement handler
router.get(
  ["/product-size-details", "/product-size-details/:product_id"],
  productCatalogController.getProductSizeDetails
);

// 4. Meilisearch product search
router.get("/products/search", productCatalogController.searchProducts);

export default router;
