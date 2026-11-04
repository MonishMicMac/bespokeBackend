import express from "express";
import {
  index,
  store,
  update,
  destroy,
} from "../controllers/userAddressController.js";

const router = express.Router();

// API 1: Retrieve saved delivery addresses
router.get("/view/address", index);

// API 2: Add a new delivery address
router.post("/add/address", store);

// API 3: Update an existing delivery address
router.post("/edit/address", update);

// API 4: Soft-delete a delivery address (POST primary, GET fallback)
router.post("/delete/address", destroy);
router.get("/delete/address", destroy);

export default router;

