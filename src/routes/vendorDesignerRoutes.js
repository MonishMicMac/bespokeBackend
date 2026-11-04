import { Router } from "express";
import {
  getShopListView,
  getShopProductList,
  getDesignerListView,
  getDesignerProductList,
  getVendorPortfolio,
  addVendorToFavorites,
  removeVendorFromFavorites,
  addShopToWishlist,
} from "../controllers/vendorDesignerController.js";

const router = Router();

// API 1: Boutique Listing
router.get("/shoplist/view", getShopListView);
router.post("/shoplist/view", getShopListView);

// API 2: Boutique Product Listing
router.get("/shoplist/product", getShopProductList);
router.post("/shoplist/product", getShopProductList);

// API 3: Designer Listing (supports both /designerlist/view and /designerlist/view/:user_id)
router.get("/designerlist/view", getDesignerListView);
router.get("/designerlist/view/:user_id", getDesignerListView);
router.post("/designerlist/view", getDesignerListView);
router.post("/designerlist/view/:user_id", getDesignerListView);

// API 4: Designer Product Listing
router.get(
  [
    "/designer/product",
    "/designer/product/:designer_id",
    "/designer/:designer_id/products",
    "/designer/:designer_id",
  ],
  getDesignerProductList
);
router.post(
  ["/designer/product", "/designer/product/:designer_id"],
  getDesignerProductList
);

// API 5: Vendor Portfolio
router.get("/vendor/portfolio/:vendor_id", getVendorPortfolio);

// API 6: Add Vendor to Favorites
router.post("/favorite/vendor", addVendorToFavorites);

// API 7: Remove Vendor from Favorites
router.post("/remove/favorite/vendor", removeVendorFromFavorites);

// API 8: Add Boutique to Shop Wishlist
router.post("/addtoshopwishlist", addShopToWishlist);

export default router;
