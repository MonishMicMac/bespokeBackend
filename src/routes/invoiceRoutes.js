import express from "express";
import InvoiceController from "../controllers/invoiceController.js";

const router = express.Router();

// ==========================================
// CUSTOMER INVOICE ENDPOINTS
// ==========================================
// List authenticated customer's invoices (history)
router.get("/customer/invoices", InvoiceController.getCustomerInvoices);

// Download customer invoice PDF by query parameter (e.g. /api/customer/invoices/download?sale_order=1068)
router.get("/customer/invoices/download", InvoiceController.downloadCustomerInvoiceByQuery);
router.get("/invoices/download", InvoiceController.downloadCustomerInvoiceByQuery);

// Fetch order / sale-order invoice directly without path parameter (e.g. /api/customer/orders/invoice?sale_order_id=1068)
router.get("/customer/orders/invoice", InvoiceController.getOrderInvoice);
router.get("/customer/orders/invoices", InvoiceController.getOrderInvoice);
router.get("/customer/orders/invoice/download", InvoiceController.downloadCustomerInvoiceByQuery);
router.get("/customer/sale-orders/invoice", InvoiceController.getOrderInvoice);
router.get("/customer/sale-orders/invoice/download", InvoiceController.downloadCustomerInvoiceByQuery);

// Retrieve invoice details by invoice ID
router.get("/customer/invoices/:invoiceId", InvoiceController.getInvoiceDetails);

// Download invoice PDF by invoice ID
router.get("/customer/invoices/:invoiceId/download", InvoiceController.downloadInvoicePdf);

// Retrieve invoice(s) for a specific order
router.get("/customer/orders/:orderId/invoice", InvoiceController.getOrderInvoice);
router.get("/customer/orders/:orderId/invoices", InvoiceController.getOrderInvoice);

// Retrieve invoice(s) for a specific sale order
router.get("/customer/sale-orders/:saleOrderId/invoice", InvoiceController.getOrderInvoice);
router.get("/customer/sale-orders/:saleOrderId/invoices", InvoiceController.getOrderInvoice);

// Download invoice PDF for a specific order or sale order
router.get("/customer/orders/:orderId/invoice/download", InvoiceController.downloadOrderInvoicePdf);
router.get("/customer/sale-orders/:saleOrderId/invoice/download", InvoiceController.downloadOrderInvoicePdf);

// Explicit generate invoice for an order
router.post("/customer/orders/:orderId/invoice/generate", InvoiceController.getOrderInvoice);

// ==========================================
// ADMIN INVOICE ENDPOINTS
// ==========================================
router.get("/admin/invoices", InvoiceController.getAdminInvoices);
router.get("/admin/invoices/:invoiceId", InvoiceController.getInvoiceDetails);
router.get("/admin/invoices/:invoiceId/download", InvoiceController.downloadInvoicePdf);

// ==========================================
// VENDOR INVOICE ENDPOINTS
// ==========================================
router.get("/vendor/invoices", InvoiceController.getVendorInvoices);
router.get("/vendor/invoices/:invoiceId", InvoiceController.getInvoiceDetails);
router.get("/vendor/invoices/:invoiceId/download", InvoiceController.downloadInvoicePdf);

// ==========================================
// GENERAL / CONVENIENCE ENDPOINTS
// ==========================================
router.get("/invoices/:invoiceId", InvoiceController.getInvoiceDetails);
router.get("/invoices/:invoiceId/download", InvoiceController.downloadInvoicePdf);
router.get("/orders/invoice", InvoiceController.getOrderInvoice);
router.get("/orders/invoice/download", InvoiceController.downloadCustomerInvoiceByQuery);
router.get("/orders/:orderId/invoice", InvoiceController.getOrderInvoice);
router.get("/orders/:orderId/invoice/download", InvoiceController.downloadOrderInvoicePdf);
router.get("/sale-orders/invoice", InvoiceController.getOrderInvoice);
router.get("/sale-orders/invoice/download", InvoiceController.downloadCustomerInvoiceByQuery);
router.get("/sale-orders/:saleOrderId/invoice", InvoiceController.getOrderInvoice);
router.get("/sale-orders/:saleOrderId/invoice/download", InvoiceController.downloadOrderInvoicePdf);

export default router;

