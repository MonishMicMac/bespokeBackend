import express from "express";
import {
  getMeasurementList,
  show,
  store,
  update,
  getMeasurementNames,
} from "../controllers/customerMeasurementController.js";
import { getMeasurementsByPriceId } from "../controllers/measurementApiController.js";

const router = express.Router();

// 1. Measurement schema list
router.get("/customer-measurement/list", getMeasurementList);

// 2. View customer measurement profile
router.get("/customer-measurement/view/:user_id", show);

// 3. Create customer measurement profile & bulk measurements
router.post("/customer-measurement/create", store);

// 4. Update customer measurement profile / measurements (bulk or single)
router.post("/customer-measurement/update", update);
router.post("/customer-measurement/update/:cust_measurement_id", update);

// Helper: Customer measurement profile names
router.get("/customer-measurement/names", getMeasurementNames);
router.get("/customer-measurement/names/:user_id", getMeasurementNames);

// 5. Product measurement schema by price ID
router.get("/measurements/by-price", getMeasurementsByPriceId);

export default router;
