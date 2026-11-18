import InvoiceService from "../services/invoiceService.js";
import { generateInvoicePdf } from "../services/invoicePdfService.js";
import { SaleOrder, Order, Invoice } from "../../models/setupAssociations.js";
import { Op } from "sequelize";
import fs from "fs";
import path from "path";

/**
 * Resolves SaleOrder from numeric id or sale_id code (e.g. 1065 or 'SID1065')
 */
async function resolveSaleOrder(rawSaleOrderId) {
  if (!rawSaleOrderId) return null;
  const str = String(rawSaleOrderId).trim();
  const isNum = /^\d+$/.test(str);
  const cleanId = isNum ? parseInt(str, 10) : -1;
  const rawClean = str.replace(/^SID/i, "");
  const numClean = /^\d+$/.test(rawClean) ? parseInt(rawClean, 10) : -1;

  try {
    return await SaleOrder.findOne({
      where: {
        [Op.or]: [
          { id: cleanId > 0 ? cleanId : -1 },
          { id: numClean > 0 ? numClean : -1 },
          { sale_id: str },
          { sale_id: `SID${str}` },
          { sale_id: `SID${rawClean}` },
        ],
      },
      include: [{ association: "order" }],
    });
  } catch (err) {
    console.warn("Could not resolve sale_order:", err.message);
    return null;
  }
}

/**
 * Resolves current user ID from headers, auth token or query/body
 */
function resolveUserId(req) {
  const raw = (
    req.user?.id ||
    req.user?.user_id ||
    req.headers["x-user-id"] ||
    req.query.user_id ||
    req.body?.user_id ||
    null
  );
  if (!raw || typeof raw === "object" || raw === "[object Object]" || raw === "undefined" || raw === "null") {
    return null;
  }
  return raw;
}

/**
 * Resolves current vendor ID from headers or auth
 */
function resolveVendorId(req) {
  return (
    req.vendor?.id ||
    req.headers["x-vendor-id"] ||
    req.query.vendor_id ||
    req.body?.vendor_id ||
    null
  );
}

/**
 * Checks if request is from an administrator
 */
function checkIsAdmin(req) {
  const role = req.user?.role || req.headers["x-user-role"];
  const adminKey = req.headers["x-admin-key"] || req.headers["admin-token"];
  return role === "admin" || Boolean(adminKey) || req.query.admin === "true";
}

export class InvoiceController {
  /**
   * 1. GET /api/customer/invoices
   * List customer's invoices with pagination & search
   */
  static async getCustomerInvoices(req, res) {
    try {
      const rawSaleOrder =
        req.query.sale_order ||
        req.query.sale_order_id ||
        req.query.sale_id ||
        req.query.saleOrderId ||
        req.query.saleOrder ||
        req.query.sid ||
        null;

      const rawOrderId =
        req.query.order_id ||
        req.query.order ||
        req.query.orderId ||
        null;

      // If queried with specific sale order or order, directly retrieve the invoice
      if (rawSaleOrder || rawOrderId) {
        return InvoiceController.getOrderInvoice(req, res);
      }

      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(401).json({
          status: false,
          message: "Authentication required to access invoice history.",
        });
      }

      const { page = 1, limit = 20, search = "", fromDate, toDate } = req.query;
      const data = await InvoiceService.getCustomerInvoices(userId, {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        search,
        fromDate,
        toDate,
      });

      return res.status(200).json({
        status: true,
        data,
      });
    } catch (err) {
      console.error("Error in getCustomerInvoices:", err);
      return res.status(500).json({
        status: false,
        message: err.message || "Failed to retrieve invoice history.",
      });
    }
  }

  /**
   * 2. GET /api/customer/invoices/:invoiceId
   * Retrieve single invoice details
   */
  static async getInvoiceDetails(req, res) {
    try {
      const { invoiceId } = req.params;
      const userId = resolveUserId(req);
      const vendorId = resolveVendorId(req);
      const isAdmin = checkIsAdmin(req);
      const saleOrderId =
        req.query.sale_order_id ||
        req.query.sale_id ||
        req.query.saleOrderId ||
        null;

      const invoice = await InvoiceService.getInvoiceById(invoiceId, {
        userId,
        vendorId,
        saleOrderId,
        isAdmin,
      });

      return res.status(200).json({
        status: true,
        data: invoice,
      });
    } catch (err) {
      console.error(`Error in getInvoiceDetails (${req.params?.invoiceId}):`, err);
      const statusCode = err.message.includes("Unauthorized") ? 403 : 404;
      return res.status(statusCode).json({
        status: false,
        message: err.message || "Unable to fetch invoice details.",
      });
    }
  }

  /**
   * GET /api/customer/invoices/download?sale_order=1068
   * Download customer invoice PDF by sale_order query parameter (or order_id / invoice_id)
   * Dynamically resolves the invoice matching the provided sale order ID
   */
  static async downloadCustomerInvoiceByQuery(req, res) {
    try {
      const rawSaleOrder =
        req.query.sale_order ||
        req.query.sale_order_id ||
        req.query.sale_id ||
        req.query.saleOrderId ||
        req.query.saleOrder ||
        req.query.sid ||
        null;

      const rawOrderId =
        req.query.order_id ||
        req.query.order ||
        req.query.orderId ||
        null;

      const rawInvoiceId =
        req.query.invoice_id ||
        req.query.invoice ||
        req.query.invoiceId ||
        req.query.id ||
        null;

      const userId = resolveUserId(req);
      const isAdmin = checkIsAdmin(req);

      let targetInvoice = null;

      // 1. If sale_order is provided (e.g. ?sale_order=1068 or ?sale_order=SID1068)
      if (rawSaleOrder) {
        const saleOrder = await resolveSaleOrder(rawSaleOrder);
        if (!saleOrder) {
          return res.status(404).json({
            status: false,
            message: `Sale order #${rawSaleOrder} not found.`,
          });
        }

        // Verify customer authorization if userId is supplied
        if (!isAdmin && userId && saleOrder.order?.user_id && String(saleOrder.order.user_id) !== String(userId)) {
          return res.status(403).json({
            status: false,
            message: "Unauthorized access: you do not have permission to download this invoice.",
          });
        }

        const result = await InvoiceService.getOrCreateInvoicesForOrder(saleOrder.order_id || saleOrder.order?.id);
        if (!result.invoices || result.invoices.length === 0) {
          return res.status(404).json({
            status: false,
            message: `Invoice is not available yet for sale order #${rawSaleOrder}.`,
          });
        }

        const cleanSid = String(saleOrder.id);
        targetInvoice = result.invoices.find((inv) => {
          if (inv.sale_order_id && String(inv.sale_order_id) === cleanSid) return true;
          if (inv.items && inv.items.some((item) => String(item.sale_order_id) === cleanSid)) return true;
          return false;
        });

        if (!targetInvoice) {
          targetInvoice = result.invoices[0];
        }
      }
      // 2. If order is provided (e.g. ?order=1220 or ?order=ORD...)
      else if (rawOrderId) {
        const result = await InvoiceService.getOrCreateInvoicesForOrder(rawOrderId);
        if (!result.invoices || result.invoices.length === 0) {
          return res.status(404).json({
            status: false,
            message: `Invoice is not available yet for order #${rawOrderId}.`,
          });
        }

        if (!isAdmin && userId && result.invoices[0].order?.user_id && String(result.invoices[0].order.user_id) !== String(userId)) {
          return res.status(403).json({
            status: false,
            message: "Unauthorized access: you do not have permission to download this invoice.",
          });
        }

        targetInvoice = result.invoices[0];
      }
      // 3. If invoice ID is provided (e.g. ?invoice_id=36)
      else if (rawInvoiceId) {
        targetInvoice = await InvoiceService.getInvoiceById(rawInvoiceId, { userId, isAdmin });
      }
      // 4. Missing required query parameter
      else {
        return res.status(400).json({
          status: false,
          message: "Please provide a sale_order parameter (e.g. /api/customer/invoices/download?sale_order=1068).",
        });
      }

      if (!targetInvoice) {
        return res.status(404).json({
          status: false,
          message: "Invoice not found.",
        });
      }

      const sanitizedNum = (targetInvoice.invoice_number || `INV_${targetInvoice.id}`).replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `BESPOKE_INV_${sanitizedNum}.pdf`;
      const disposition = req.query.inline === "true" || req.query.view === "true" ? "inline" : "attachment";
      const forceRegenerate = req.query.regenerate === "true" || req.query.fresh === "true";

      // Check if file is cached on disk and is a valid single-page document
      if (!forceRegenerate && targetInvoice.pdf_path && fs.existsSync(targetInvoice.pdf_path)) {
        try {
          const cachedBuffer = fs.readFileSync(targetInvoice.pdf_path, "latin1");
          const pageMatches = cachedBuffer.match(/\/Type\s*\/Page[^s]/g);
          // Only serve cached file if it is a single-page document (no stale multi-page cache)
          if (!pageMatches || pageMatches.length <= 1) {
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            const fileStream = fs.createReadStream(targetInvoice.pdf_path);
            return fileStream.pipe(res);
          }
        } catch (readCacheErr) {
          // ignore error and re-generate
        }
      }

      // Generate dynamically and save
      const storageDir = path.resolve("./storage/invoices");
      if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
      const targetPath = path.join(storageDir, filename);

      const buffer = await generateInvoicePdf(targetInvoice, targetPath);
      try {
        await Invoice.update({ pdf_path: targetPath }, { where: { id: targetInvoice.id } });
      } catch (saveErr) {
        // ignore notice
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.send(buffer);
    } catch (err) {
      console.error("Error in downloadCustomerInvoiceByQuery:", err);
      const statusCode = err.message.includes("Unauthorized") ? 403 : 500;
      return res.status(statusCode).json({
        status: false,
        message: err.message || "Unable to download invoice PDF.",
      });
    }
  }

  /**
   * 3. GET /api/customer/invoices/:invoiceId/download
   * Download Invoice PDF
   */
  static async downloadInvoicePdf(req, res) {
    try {
      const { invoiceId } = req.params;
      if (invoiceId === "download" || !invoiceId || isNaN(parseInt(invoiceId, 10))) {
        return InvoiceController.downloadCustomerInvoiceByQuery(req, res);
      }

      const userId = resolveUserId(req);
      const vendorId = resolveVendorId(req);
      const isAdmin = checkIsAdmin(req);
      const saleOrderId =
        req.query.sale_order_id ||
        req.query.sale_order ||
        req.query.sale_id ||
        req.query.saleOrderId ||
        null;

      const invoice = await InvoiceService.getInvoiceById(invoiceId, {
        userId,
        vendorId,
        saleOrderId,
        isAdmin,
      });

      const sanitizedNum = invoice.invoice_number.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `BESPOKE_INV_${sanitizedNum}.pdf`;

      // Check if file is cached on disk
      if (invoice.pdf_path && fs.existsSync(invoice.pdf_path)) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        const fileStream = fs.createReadStream(invoice.pdf_path);
        return fileStream.pipe(res);
      }

      // Generate dynamically and save
      const storageDir = path.resolve("./storage/invoices");
      if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
      const targetPath = path.join(storageDir, filename);

      const buffer = await generateInvoicePdf(invoice, targetPath);
      await invoice.update({ pdf_path: targetPath });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(buffer);
    } catch (err) {
      console.error("Error downloading invoice PDF:", err);
      const statusCode = err.message.includes("Unauthorized") ? 403 : 500;
      return res.status(statusCode).json({
        status: false,
        message: err.message || "Unable to generate invoice. Please try again.",
      });
    }
  }

  /**
   * 4. GET /api/customer/orders/:orderId/invoice
   * Retrieve or create invoices for a specific order or sale order
   */
  static async getOrderInvoice(req, res) {
    try {
      let orderId = req.params.orderId || req.params.saleOrderId;
      if (orderId === "invoice" || orderId === "invoices") {
        orderId = null;
      }

      const rawSaleOrderId =
        req.query.sale_order ||
        req.query.sale_order_id ||
        req.query.sale_id ||
        req.query.saleOrderId ||
        req.query.saleOrder ||
        req.query.sid ||
        req.params.saleOrderId ||
        req.body?.sale_order_id ||
        null;

      const rawOrderId =
        req.query.order_id ||
        req.query.order ||
        req.query.orderId ||
        orderId ||
        null;

      const userId = resolveUserId(req);

      let saleOrder = null;
      if (rawSaleOrderId) {
        saleOrder = await resolveSaleOrder(rawSaleOrderId);
      }

      if (saleOrder && saleOrder.order) {
        orderId = saleOrder.order.order_id || saleOrder.order.id;
      } else if (rawOrderId && String(rawOrderId).toUpperCase().startsWith("SID") && !saleOrder) {
        saleOrder = await resolveSaleOrder(rawOrderId);
        if (saleOrder && saleOrder.order) {
          orderId = saleOrder.order.order_id || saleOrder.order.id;
        }
      } else if (rawOrderId) {
        orderId = rawOrderId;
      }

      const result = await InvoiceService.getOrCreateInvoicesForOrder(orderId || saleOrder?.order_id);

      // Verify customer authorization if userId provided
      if (userId && result.invoices && result.invoices.length > 0) {
        const orderUid = result.invoices[0].order?.user_id;
        if (orderUid && String(orderUid) !== String(userId)) {
          return res.status(403).json({
            status: false,
            message: "Unauthorized access: you do not have permission to view invoices for this order.",
          });
        }
      }

      // If a specific sale order was requested, find the matching invoice
      let matchingInvoice = null;
      if (saleOrder && result.invoices && result.invoices.length > 0) {
        matchingInvoice = result.invoices.find((inv) => {
          if (inv.sale_order_id && String(inv.sale_order_id) === String(saleOrder.id)) return true;
          if (inv.items && inv.items.some((item) => String(item.sale_order_id) === String(saleOrder.id))) return true;
          return false;
        });
      }

      if (!matchingInvoice && result.invoices && result.invoices.length > 0) {
        matchingInvoice = result.invoices[0];
      }

      return res.status(200).json({
        status: true,
        ...result,
        sale_order_id: saleOrder ? saleOrder.id : (matchingInvoice?.sale_order_id || null),
        sale_id: saleOrder?.sale_id || (saleOrder?.id ? `SID${saleOrder.id}` : null),
        invoice: matchingInvoice || null,
        invoices: matchingInvoice ? [matchingInvoice] : result.invoices,
      });
    } catch (err) {
      console.error(`Error in getOrderInvoice (${req.params?.orderId || req.query?.sale_order_id}):`, err);
      return res.status(500).json({
        status: false,
        message: err.message || "Unable to retrieve invoice for order.",
      });
    }
  }

  /**
   * 5. GET /api/customer/orders/:orderId/invoice/download
   * Download primary or first invoice PDF for order / sale order
   */
  static async downloadOrderInvoicePdf(req, res) {
    try {
      let orderId = req.params.orderId || req.params.saleOrderId;
      const sellerId = req.query.seller_id || req.query.vendor_id || null;
      const rawSaleOrderId =
        req.query.sale_order_id ||
        req.query.sale_id ||
        req.query.saleOrderId ||
        req.params.saleOrderId ||
        req.body?.sale_order_id ||
        null;
      const userId = resolveUserId(req);

      let saleOrder = null;
      if (rawSaleOrderId) {
        saleOrder = await resolveSaleOrder(rawSaleOrderId);
      }
      if (saleOrder && saleOrder.order) {
        orderId = saleOrder.order.order_id || saleOrder.order.id;
      } else if (orderId && String(orderId).toUpperCase().startsWith("SID") && !saleOrder) {
        saleOrder = await resolveSaleOrder(orderId);
        if (saleOrder && saleOrder.order) {
          orderId = saleOrder.order.order_id || saleOrder.order.id;
        }
      }

      const result = await InvoiceService.getOrCreateInvoicesForOrder(orderId || saleOrder?.order_id);

      if (!result.invoices || result.invoices.length === 0) {
        return res.status(404).json({
          status: false,
          message: "Invoice is not available yet.",
        });
      }

      // Verify customer authorization
      const orderUid = result.invoices[0].order?.user_id;
      if (userId && orderUid && String(orderUid) !== String(userId)) {
        return res.status(403).json({
          status: false,
          message: "Unauthorized access.",
        });
      }

      let selectedInvoice = result.invoices[0];

      if (saleOrder) {
        const bySaleOrder = result.invoices.find((inv) => {
          if (inv.sale_order_id && String(inv.sale_order_id) === String(saleOrder.id)) return true;
          if (inv.items && inv.items.some((item) => String(item.sale_order_id) === String(saleOrder.id))) return true;
          return false;
        });
        if (bySaleOrder) selectedInvoice = bySaleOrder;
      } else if (sellerId) {
        const match = result.invoices.find((inv) => String(inv.seller_id) === String(sellerId));
        if (match) selectedInvoice = match;
      }

      const sanitizedNum = selectedInvoice.invoice_number.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `BESPOKE_INV_${sanitizedNum}.pdf`;

      if (selectedInvoice.pdf_path && fs.existsSync(selectedInvoice.pdf_path)) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        const stream = fs.createReadStream(selectedInvoice.pdf_path);
        return stream.pipe(res);
      }

      const storageDir = path.resolve("./storage/invoices");
      if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
      const targetPath = path.join(storageDir, filename);

      const buffer = await generateInvoicePdf(selectedInvoice, targetPath);
      await selectedInvoice.update({ pdf_path: targetPath });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(buffer);
    } catch (err) {
      console.error("Error in downloadOrderInvoicePdf:", err);
      return res.status(500).json({
        status: false,
        message: err.message || "Unable to download invoice PDF.",
      });
    }
  }

  /**
   * 6. GET /api/admin/invoices
   * Administrator invoice search and listing
   */
  static async getAdminInvoices(req, res) {
    try {
      const { page = 1, limit = 50, search = "", status } = req.query;
      const p = Math.max(1, parseInt(page, 10) || 1);
      const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
      const offset = (p - 1) * lim;

      const whereClause = {};
      if (search && search.trim()) {
        const q = `%${search.trim()}%`;
        whereClause[Op.or] = [
          { invoice_number: { [Op.like]: q } },
          { seller_name_snapshot: { [Op.like]: q } },
          { customer_name_snapshot: { [Op.like]: q } },
        ];
      }
      if (status) {
        whereClause.status = status;
      }

      const { count, rows } = await Invoice.findAndCountAll({
        where: whereClause,
        include: [{ association: "items" }, { association: "adjustments" }],
        order: [["id", "DESC"]],
        limit: lim,
        offset,
      });

      return res.status(200).json({
        status: true,
        data: {
          total: count,
          page: p,
          limit: lim,
          totalPages: Math.ceil(count / lim),
          invoices: rows,
        },
      });
    } catch (err) {
      console.error("Error in getAdminInvoices:", err);
      return res.status(500).json({
        status: false,
        message: err.message || "Failed to fetch admin invoices.",
      });
    }
  }

  /**
   * 7. GET /api/vendor/invoices
   * Vendor invoice listing for their own boutique
   */
  static async getVendorInvoices(req, res) {
    try {
      const vendorId = resolveVendorId(req);
      if (!vendorId) {
        return res.status(401).json({
          status: false,
          message: "Vendor authentication required.",
        });
      }

      const { page = 1, limit = 50, search = "" } = req.query;
      const p = Math.max(1, parseInt(page, 10) || 1);
      const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
      const offset = (p - 1) * lim;

      const whereClause = {
        seller_id: parseInt(vendorId, 10),
        seller_type: "vendor",
      };

      if (search && search.trim()) {
        const q = `%${search.trim()}%`;
        whereClause[Op.or] = [
          { invoice_number: { [Op.like]: q } },
          { customer_name_snapshot: { [Op.like]: q } },
        ];
      }

      const { count, rows } = await Invoice.findAndCountAll({
        where: whereClause,
        include: [{ association: "items" }, { association: "adjustments" }],
        order: [["id", "DESC"]],
        limit: lim,
        offset,
      });

      return res.status(200).json({
        status: true,
        data: {
          total: count,
          page: p,
          limit: lim,
          totalPages: Math.ceil(count / lim),
          invoices: rows,
        },
      });
    } catch (err) {
      console.error("Error in getVendorInvoices:", err);
      return res.status(500).json({
        status: false,
        message: err.message || "Failed to fetch vendor invoices.",
      });
    }
  }
}

export default InvoiceController;

