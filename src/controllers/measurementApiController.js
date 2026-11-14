import MeasurementService from "../services/measurementService.js";

/**
 * API 5: Get measurement details of a product by price_id
 * Method: MeasurementApiController::getMeasurementsByPriceId()
 * GET /api/measurements/by-price?price_id={price_id}
 */
export const getMeasurementsByPriceId = async (req, res) => {
  const priceId = req.query.price_id || req.body?.price_id;

  if (!priceId || isNaN(priceId)) {
    return res.status(422).json({
      status: false,
      message: "The price id field is required and must be an integer.",
    });
  }

  try {
    const data = await MeasurementService.getMeasurementsByPriceId(parseInt(priceId, 10));
    return res.status(200).json({
      status: true,
      message: "Measurement details retrieved successfully",
      is_customizable: data.is_customizable,
      product_id: data.product_id,
      price_id: data.price_id,
      current_size: data.current_size,
      available_sizes: data.available_sizes,
      data,
    });
  } catch (e) {
    const statusCode = e.statusCode || 500;
    return res.status(statusCode).json({
      status: false,
      message: e.message,
    });
  }
};
