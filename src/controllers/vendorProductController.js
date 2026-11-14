import * as vendorProductService from "../services/vendorProductService.js";
import { VendorLogin } from "../../models/setupAssociations.js";
import jwt from "jsonwebtoken";

/**
 * Resolves Vendor ID from cookie, Authorization bearer token, header or body.
 */
async function resolveVendorId(req) {
  let vendorId = null;

  // 1. Direct cookie
  if (req.cookies?.vendor_id && req.cookies.vendor_id !== "null" && req.cookies.vendor_id !== "undefined") {
    vendorId = parseInt(req.cookies.vendor_id, 10);
  }

  // 2. JWT token in cookie or authorization header
  if (!vendorId) {
    const token = req.cookies?.access_token || (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, "") : null);
    if (token && token !== "null" && token !== "undefined") {
      try {
        const decoded = jwt.decode(token);
        if (decoded) {
          const vid = decoded.vendor_id ?? decoded.user_id ?? decoded.id ?? decoded.sub;
          if (vid && !isNaN(Number(vid))) vendorId = parseInt(vid, 10);
        }
      } catch (e) {
        // Ignore token decode error
      }
    }
  }

  // 3. Request inputs / headers
  if (!vendorId) {
    const rawVid =
      req.body?.auth_vendor_id ||
      req.body?.vendor_id ||
      req.headers?.["vendor-id"] ||
      req.headers?.["vendor_id"] ||
      req.query?.vendor_id;

    if (rawVid && rawVid !== "null" && rawVid !== "undefined") {
      if (typeof rawVid === "string" && rawVid.startsWith("{")) {
        try {
          const parsed = JSON.parse(rawVid);
          vendorId = parsed.id || parsed.vendor_id || null;
        } catch (e) {
          vendorId = parseInt(rawVid, 10);
        }
      } else {
        vendorId = parseInt(rawVid, 10);
      }
    }
  }

  // 4. Default fallback: First active vendor if dev environment
  if (!vendorId) {
    const defaultVendor = await VendorLogin.findOne({ order: [["id", "ASC"]] });
    if (defaultVendor) vendorId = defaultVendor.id;
  }

  return vendorId;
}

/**
 * POST /api/vendor/add/product/web
 * POST /api/add/product/web
 * POST /add/product/web
 */
export async function addProductWeb(req, res) {
  try {
    const vendorId = await resolveVendorId(req);
    if (!vendorId) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized. Vendor ID could not be identified.",
      });
    }

    const result = await vendorProductService.vendorAddProductWeb(req, vendorId);
    return res.status(result.statusCode || (result.status ? 201 : 400)).json(result);
  } catch (err) {
    console.error("Error in addProductWeb controller:", err);
    return res.status(500).json({
      status: false,
      message: err.message || "Internal server error",
    });
  }
}

/**
 * POST /api/vendor/update/product/web
 * POST /api/update/product/web
 * POST /update/product/web
 */
export async function updateProductWeb(req, res) {
  try {
    const vendorId = await resolveVendorId(req);
    if (!vendorId) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized. Vendor ID could not be identified.",
      });
    }

    const result = await vendorProductService.vendorUpdateProductWeb(req, vendorId);
    return res.status(result.statusCode || (result.status ? 200 : 400)).json(result);
  } catch (err) {
    console.error("Error in updateProductWeb controller:", err);
    return res.status(500).json({
      status: false,
      message: err.message || "Internal server error",
    });
  }
}

/**
 * GET /api/vendor/product/edit/:id
 * GET /product/edit/:id
 */
export async function getProductEditDetails(req, res) {
  try {
    const productId = req.params.id || req.params.product_id || req.query.id || req.query.product_id;
    const result = await vendorProductService.getVendorProductEditDetails(productId);
    return res.status(result.statusCode || 200).json(result);
  } catch (err) {
    console.error("Error in getProductEditDetails controller:", err);
    return res.status(500).json({
      status: false,
      message: err.message || "Internal server error",
    });
  }
}
