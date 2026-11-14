import InvoiceService from "../services/invoiceService.js";
import { generateInvoicePdf } from "../services/invoicePdfService.js";
import fs from "fs";
import path from "path";

/**
 * Resolves current user ID from headers, auth token or query/body
 */
function resolveUserId(req) {
  return (
    req.user?.id ||
    req.user?.user_id ||
    req.headers["x-user-id"] ||
    req.query.user_id ||
    req.body?.user_id ||
    null
  );
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

      const invoice = await InvoiceService.getInvoiceById(invoiceId, {
        userId,
        vendorId,
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
   * 3. GET /api/customer/invoices/:invoiceId/download
   * Download Invoice PDF
   */
  static async downloadInvoicePdf(req, res) {
    try {
      const { invoiceId } = req.params;
      const userId = resolveUserId(req);
      const vendorId = resolveVendorId(req);
      const isAdmin = checkIsAdmin(req);

      const invoice = await InvoiceService.getInvoiceById(invoiceId, {
        userId,
        vendorId,
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
   * Retrieve or create invoices for a specific order
   */
  static async getOrderInvoice(req, res) {
    try {
      const { orderId } = req.params;
      const userId = resolveUserId(req);

      const result = await InvoiceService.getOrCreateInvoicesForOrder(orderId);

      // Verify customer authorization
      if (userId && result.invoices && result.invoices.length > 0) {
        const orderUid = result.invoices[0].order?.user_id;
        if (orderUid && String(orderUid) !== String(userId)) {
          return res.status(403).json({
            status: false,
            message: "Unauthorized access: you do not have permission to view invoices for this order.",
          });
        }
      }

      return res.status(200).json({
        status: true,
        ...result,
      });
    } catch (err) {
      console.error(`Error in getOrderInvoice (${req.params?.orderId}):`, err);
      return res.status(500).json({
        status: false,
        message: err.message || "Unable to retrieve invoice for order.",
      });
    }
  }

  /**
   * 5. GET /api/customer/orders/:orderId/invoice/download
   * Download primary or first invoice PDF for order
   */
  static async downloadOrderInvoicePdf(req, res) {
    try {
      const { orderId } = req.params;
      const sellerId = req.query.seller_id || req.query.vendor_id || null;
      const userId = resolveUserId(req);

      const result = await InvoiceService.getOrCreateInvoicesForOrder(orderId);

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
      if (sellerId) {
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

