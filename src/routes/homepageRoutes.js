import express from "express";
import {
  getHomepageView,
  getCategories,
  getCategoryView,
  getSubcategoriesList,
  getSubcategories,
  getSubcategoriesByCat,
  getSpotlight,
  getDesigners,
  getCurrentDeals,
  getSuperSaveDeals,
  getWomenWear,
} from "../controllers/homepageController.js";

const router = express.Router();

// 1. Homepage Banners
router.get(["/homepage/view", "/app-banners", "/banners"], getHomepageView);

// 2. Categories (RESTful /api/categories vs Legacy /api/category/view)
router.get(["/categories"], getCategories);
router.get(["/category/view", "/vendor/category/view"], getCategoryView);

// 3. Subcategories (RESTful /api/subcategories vs Public /api/view/subcategory)
router.get(["/subcategories"], getSubcategoriesList);
router.get(["/view/subcategory"], getSubcategories);

// 4. Subcategories by Category (Vendor specific route)
router.get("/vendor/subcategories/by-category/:category_id", getSubcategoriesByCat);

// 5. Spotlight
router.get(["/spotlight/view", "/spotlights"], getSpotlight);

// 6. Designers
router.get(["/designer/view", "/designers"], getDesigners);

// 7. Current Deals
router.get(["/currentdeals/view", "/current-deals", "/currentdeals"], getCurrentDeals);

// 8. Super Saver Deals
router.get(
  ["/supersavedeals/view", "/supersaver-deals", "/supersavedeals", "/supersaver-deals/view"],
  getSuperSaveDeals
);

// 9. Womenwear / Top Sellers
router.get(["/womenwear/view", "/womenwear"], getWomenWear);

export default router;

