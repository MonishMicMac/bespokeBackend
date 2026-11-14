import {
  Invoice,
  InvoiceItem,
  InvoiceAdjustment,
  Order,
  SaleOrder,
  UserLogin,
  UserAddress,
  VendorLogin,
  Product,
  Promocode,
  Refund,
} from "../../models/setupAssociations.js";
import sequelize from "../../config/db.js";
import { generateInvoicePdf } from "./invoicePdfService.js";
import path from "path";
import fs from "fs";
import { Op } from "sequelize";

// Indian GST State Codes (2-digit standard)
export const GST_STATE_CODES = {
  "JAMMU AND KASHMIR": "01",
  "HIMACHAL PRADESH": "02",
  "PUNJAB": "03",
  "CHANDIGARH": "04",
  "UTTARAKHAND": "05",
  "HARYANA": "06",
  "DELHI": "07",
  "RAJASTHAN": "08",
  "UTTAR PRADESH": "09",
  "BIHAR": "10",
  "SIKKIM": "11",
  "ARUNACHAL PRADESH": "12",
  "NAGALAND": "13",
  "MANIPUR": "14",
  "MIZORAM": "15",
  "TRIPURA": "16",
  "MEGHALAYA": "17",
  "ASSAM": "18",
  "WEST BENGAL": "19",
  "JHARKHAND": "20",
  "ODISHA": "21",
  "CHHATTISGARH": "22",
  "MADHYA PRADESH": "23",
  "GUJARAT": "24",
  "DAMAN AND DIU": "25",
  "DADRA AND NAGAR HAVELI": "26",
  "MAHARASHTRA": "27",
  "ANDHRA PRADESH": "28",
  "KARNATAKA": "29",
  "GOA": "30",
  "LAKSHADWEEP": "31",
  "KERALA": "32",
  "TAMIL NADU": "33",
  "PUDUCHERRY": "34",
  "ANDAMAN AND NICOBAR ISLANDS": "35",
  "TELANGANA": "36",
  "LADAKH": "37",
};

/**
 * Extracts or resolves 2-digit GST state code
 */
export function resolveStateCode(stateName, gstin = null) {
  if (gstin && typeof gstin === "string" && gstin.trim().length >= 2) {
    const code = gstin.trim().substring(0, 2);
    if (/^\d{2}$/.test(code)) return code;
  }
  if (!stateName || typeof stateName !== "string") return "33";
  const clean = stateName.trim().toUpperCase();
  return GST_STATE_CODES[clean] || "33";
}

/**
 * Computes Indian financial year (e.g. '2026-27')
 */
export function getFinancialYear(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12
  if (month >= 4) {
    const nextYear = String(year + 1).slice(-2);
    return `${year}-${nextYear}`;
  } else {
    const prevYear = year - 1;
    const curYear = String(year).slice(-2);
    return `${prevYear}-${curYear}`;
  }
}

// In-flight generation mutex to prevent simultaneous double-generation
const inFlightInvoicePromises = new Map();

export class InvoiceService {
  /**
   * Generates a unique, sequential invoice number
   */
  static async generateInvoiceNumber(financialYear) {
    const prefix = `BESPOKE/${financialYear}/INV-`;
    const [rows] = await sequelize.query(
      `SELECT invoice_number FROM invoices WHERE financial_year = :fy ORDER BY id DESC LIMIT 1`,
      { replacements: { fy: financialYear } }
    );

    let nextSeq = 1;
    if (rows && rows.length > 0) {
      const lastNum = rows[0].invoice_number;
      const parts = lastNum.split("INV-");
      if (parts.length === 2) {
        const parsed = parseInt(parts[1], 10);
        if (!isNaN(parsed)) nextSeq = parsed + 1;
      }
    }
    return `${prefix}${String(nextSeq).padStart(4, "0")}`;
  }

  /**
   * Generates a unique credit note number
   */
  static async generateCreditNoteNumber(financialYear) {
    const prefix = `BESPOKE/${financialYear}/CN-`;
    const [rows] = await sequelize.query(
      `SELECT credit_note_number FROM invoice_adjustments ORDER BY id DESC LIMIT 1`
    );

    let nextSeq = 1;
    if (rows && rows.length > 0) {
      const lastNum = rows[0].credit_note_number;
      const parts = lastNum.split("CN-");
      if (parts.length === 2) {
        const parsed = parseInt(parts[1], 10);
        if (!isNaN(parsed)) nextSeq = parsed + 1;
      }
    }
    return `${prefix}${String(nextSeq).padStart(4, "0")}`;
  }

  /**
   * Checks if an order is legally eligible for invoice issuance
   */
  static isOrderEligibleForInvoice(order) {
    if (!order) return false;
    const rStatus = String(order.razorpay_status || "").toLowerCase().trim();
    const oHistory = String(order.order_history || "").toLowerCase().trim();
    const txnId = String(order.transaction_id || "").toLowerCase().trim();
    const paymentId = String(order.payment_id || "").trim();

    // 1. Paid online order
    if (rStatus === "paid" || paymentId.length > 0) return true;

    // 2. COD confirmed order
    if (txnId.includes("cod") && rStatus !== "failed") return true;

    // 3. Advanced stages (confirmed, processing, dispatched, delivered)
    const validStages = ["placed", "confirm", "process", "ship", "deliver", "complet", "return"];
    if (validStages.some((st) => oHistory.includes(st))) return true;

    return false;
  }

  /**
   * Core generator: Retrieves or creates all seller invoices for a given order
   */
  static async getOrCreateInvoicesForOrder(orderIdentifier, { force = false } = {}) {
    if (!orderIdentifier) {
      throw new Error("Invalid order identifier provided for invoice generation");
    }

    // 1. Fetch Order by primary key or order_id code ('ORD1117' / '1088')
    let order = null;
    const isNumeric = /^\d+$/.test(String(orderIdentifier).trim());

    if (isNumeric) {
      order = await Order.findByPk(parseInt(orderIdentifier, 10), {
        include: [
          { association: "user" },
          { association: "address" },
          { association: "promocode" },
        ],
      });
    }

    if (!order) {
      const rawStr = String(orderIdentifier).trim();
      order = await Order.findOne({
        where: {
          [Op.or]: [
            { order_id: rawStr },
            { order_id: `ORD${rawStr}` },
            { order_id: rawStr.replace(/^ORD/i, "") },
          ],
        },
        include: [
          { association: "user" },
          { association: "address" },
          { association: "promocode" },
        ],
      });
    }

    if (!order) {
      throw new Error(`Order #${orderIdentifier} not found.`);
    }

    const cleanOrderId = order.id;

    const mutexKey = `order_inv_${cleanOrderId}`;
    if (inFlightInvoicePromises.has(mutexKey)) {
      return await inFlightInvoicePromises.get(mutexKey);
    }

    const task = (async () => {

      // 2. Check invoice issuance eligibility
      if (!this.isOrderEligibleForInvoice(order)) {
        return {
          eligible: false,
          status: "INVOICE_UNAVAILABLE",
          message: "Invoice is not available yet. Invoices are generated once payment is confirmed or order is placed.",
          invoices: [],
        };
      }

      // 3. Check for existing invoices in database
      const existingInvoices = await Invoice.findAll({
        where: { order_id: cleanOrderId },
        include: [
          { association: "items" },
          { association: "adjustments" },
          { association: "order" },
        ],
        order: [["id", "ASC"]],
      });

      if (existingInvoices && existingInvoices.length > 0 && !force) {
        // Verify PDFs exist on disk for each invoice
        for (const inv of existingInvoices) {
          if (!inv.pdf_path || !fs.existsSync(inv.pdf_path)) {
            try {
              const sanitizedNum = inv.invoice_number.replace(/[^a-zA-Z0-9_-]/g, "_");
              const storageDir = path.resolve("./storage/invoices");
              if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
              const pdfTarget = path.join(storageDir, `BESPOKE_INV_${sanitizedNum}.pdf`);
              await generateInvoicePdf(inv, pdfTarget);
              await inv.update({ pdf_path: pdfTarget });
            } catch (pdfErr) {
              console.warn("Notice ensuring cached invoice PDF:", pdfErr.message);
            }
          }
        }

        return {
          eligible: true,
          status: "ISSUED",
          orderId: cleanOrderId,
          invoices: existingInvoices,
        };
      }

      // 4. Fetch all sale_orders (garments) for this checkout order
      const saleOrders = await SaleOrder.findAll({
        where: { order_id: cleanOrderId },
        include: [
          { association: "product" },
          { association: "vendor" },
          { association: "priceRelation" },
          { association: "material" },
        ],
      });

      if (!saleOrders || saleOrders.length === 0) {
        throw new Error(`No product items found for order #${cleanOrderId}.`);
      }

      // 5. Group products by Legal Seller (multi-vendor handling)
      const sellerGroups = new Map();

      for (const so of saleOrders) {
        const rawVendorId = so.vendor_id || (so.vendor ? so.vendor.id : null);
        const sellerKey = rawVendorId ? `vendor_${rawVendorId}` : "platform";

        if (!sellerGroups.has(sellerKey)) {
          sellerGroups.set(sellerKey, {
            sellerKey,
            sellerId: rawVendorId ? parseInt(rawVendorId, 10) : null,
            sellerType: rawVendorId ? "vendor" : "platform",
            vendor: so.vendor || null,
            items: [],
          });
        }
        sellerGroups.get(sellerKey).items.push(so);
      }

      // 6. Build Snapshot Information
      const customer = order.user || {};
      const delAddress = order.address || {};
      const custName = delAddress.name || customer.name || "Valued Customer";
      const custPhone = delAddress.phone || customer.mobile || "N/A";
      const custState = delAddress.state || "Tamil Nadu";
      const custStateCode = resolveStateCode(custState);

      const deliveredToSnapshot = {
        name: custName,
        phone: custPhone,
        house_building_name: delAddress.house_building_name || "",
        area_colony: delAddress.area_colony || "",
        landmark_nearby: delAddress.landmark_nearby || "",
        city: delAddress.city || "Chennai",
        state: custState,
        state_code: custStateCode,
        pincode: delAddress.pincode || "600001",
      };

      const billingAddressSnapshot = {
        name: custName,
        phone: custPhone,
        address: [
          delAddress.house_building_name,
          delAddress.area_colony,
          delAddress.city,
          delAddress.state,
          delAddress.pincode,
        ]
          .filter(Boolean)
          .join(", ") || "Delivery Address",
        state: custState,
        state_code: custStateCode,
      };

      const financialYear = getFinancialYear(order.created_at || new Date());
      const orderDate = order.created_at || new Date();

      const createdInvoices = [];

      // 7. Generate separate invoice for each distinct seller
      for (const [sellerKey, group] of sellerGroups.entries()) {
        const transaction = await sequelize.transaction();

        try {
          // Double-check if invoice was created in parallel
          const existingForSeller = await Invoice.findOne({
            where: {
              order_id: cleanOrderId,
              seller_id: group.sellerId,
              seller_type: group.sellerType,
            },
            transaction,
          });

          if (existingForSeller && !force) {
            await transaction.commit();
            createdInvoices.push(existingForSeller);
            continue;
          }

          // Resolve Seller Details
          let sellerName = "Bespoke Atelier Private Limited";
          let sellerShop = "Bespoke Concierge & Luxury Atelier";
          let sellerGst = "33AAACB1234F1Z9";
          let sellerPan = "AAACB1234F";
          let sellerEmail = "billing@bespokeatelier.com";
          let sellerPhone = "+91 98400 12345";
          let sellerState = "Tamil Nadu";
          let sellerStateCode = "33";
          let shipFromAddress = {
            name: "Bespoke Atelier Central Hub",
            street: "No. 42, Khader Nawaz Khan Road, Nungambakkam",
            city: "Chennai",
            state: "Tamil Nadu",
            state_code: "33",
            pincode: "600006",
            country: "India",
            phone: "+91 98400 12345",
            gstin: "33AAACB1234F1Z9",
          };

          if (group.sellerType === "vendor" && group.sellerId) {
            let vendorRec = group.vendor;
            if (!vendorRec) {
              vendorRec = await VendorLogin.findByPk(group.sellerId, { transaction });
            }

            if (vendorRec) {
              sellerName =
                vendorRec.brand_business_name ||
                vendorRec.seller_name ||
                vendorRec.shop_name ||
                "Bespoke Artisan Seller";
              sellerShop = vendorRec.shop_name || vendorRec.seller_name || "";
              sellerGst = vendorRec.gst_no || null;
              sellerPan = vendorRec.pan_no || null;
              sellerEmail = vendorRec.email || "";
              sellerPhone = vendorRec.mobile || "";
              sellerState = vendorRec.state || "Tamil Nadu";
              sellerStateCode = resolveStateCode(sellerState, sellerGst);

              shipFromAddress = {
                business_name: sellerName,
                shop_name: sellerShop,
                street:
                  vendorRec.business_address ||
                  vendorRec.address ||
                  "Artisan Atelier Workshop",
                city: "Chennai",
                state: sellerState,
                state_code: sellerStateCode,
                pincode: vendorRec.pincode || "600001",
                country: "India",
                phone: sellerPhone,
                gstin: sellerGst,
              };
            }
          }

          // Document Title: TAX INVOICE if GSTIN present, else BILL OF SUPPLY
          const isTaxInvoice = Boolean(sellerGst && sellerGst.trim().length >= 10);
          const documentTitle = isTaxInvoice ? "TAX INVOICE" : "BILL OF SUPPLY";
          const invoiceType = isTaxInvoice ? "TAX_INVOICE" : "BILL_OF_SUPPLY";

          // Inter-state (IGST) vs Intra-state (CGST + SGST)
          const isIntraState = sellerStateCode === custStateCode;

          // Unique Invoice Number
          const invoiceNumber = await this.generateInvoiceNumber(financialYear);

          // Calculate Item totals
          let groupSubtotal = 0;
          let groupDiscount = 0;
          let groupTaxable = 0;
          let groupCgst = 0;
          let groupSgst = 0;
          let groupIgst = 0;

          const itemSnapshots = [];

          for (const so of group.items) {
            const prod = so.product || {};
            const prodName = prod.product_name || "Custom Bespoke Garment";
            const hsnCode = prod.hsn_code || "6204";
            const qty = Math.max(1, parseInt(so.quantity, 10) || 1);

            // Unit Price & Line Amount
            const rawLineTotal = parseFloat(so.total_amount || so.amount || 0);
            const unitPrice = parseFloat(so.single_product_price || (rawLineTotal / qty) || 0);
            const itemDisc = parseFloat(so.discount_amount || 0);

            const netLineTotal = Math.max(0, rawLineTotal - itemDisc);

            // GST Rate for apparel: 12% standard, or 5% if <= 1000 per piece
            let gstRate = 12.0;
            if (unitPrice <= 1000) {
              gstRate = 5.0;
            }

            // Taxable Value calculation from tax-inclusive price:
            // Taxable = NetLineTotal / (1 + (gstRate / 100))
            const lineTaxable = Number((netLineTotal / (1 + gstRate / 100)).toFixed(2));
            const lineTotalTax = Number((netLineTotal - lineTaxable).toFixed(2));

            let lineCgst = 0;
            let lineSgst = 0;
            let lineIgst = 0;

            if (isIntraState) {
              lineCgst = Number((lineTotalTax / 2).toFixed(2));
              lineSgst = Number((lineTotalTax - lineCgst).toFixed(2));
              lineIgst = 0;
            } else {
              lineCgst = 0;
              lineSgst = 0;
              lineIgst = lineTotalTax;
            }

            // Specs
            const variantParts = [
              so.size ? `Size: ${so.size}` : null,
              so.material?.material_name ? `Fabric: ${so.material.material_name}` : null,
              so.is_customisable === "1" ? "Custom Tailored" : null,
            ].filter(Boolean);

            itemSnapshots.push({
              sale_order_id: so.id,
              product_id: so.product_id,
              product_name_snapshot: prodName,
              hsn_code: hsnCode,
              variant_snapshot: variantParts.join(" | ") || "Bespoke Size",
              customization_details: so.measurment_details || null,
              quantity: qty,
              unit_price: Number(unitPrice.toFixed(2)),
              discount_amount: Number(itemDisc.toFixed(2)),
              taxable_amount: lineTaxable,
              gst_rate: gstRate,
              cgst_amount: lineCgst,
              sgst_amount: lineSgst,
              igst_amount: lineIgst,
              total_amount: Number(netLineTotal.toFixed(2)),
            });

            groupSubtotal += rawLineTotal;
            groupDiscount += itemDisc;
            groupTaxable += lineTaxable;
            groupCgst += lineCgst;
            groupSgst += lineSgst;
            groupIgst += lineIgst;
          }

          // Coupon proportion
          const totalOrderPrice = parseFloat(order.price || 1);
          const sellerRatio = Math.min(1, Math.max(0, groupSubtotal / (totalOrderPrice || 1)));
          const totalCouponDiscount = parseFloat(order.discount_amt || 0);
          const couponDiscountShare = Number((totalCouponDiscount * sellerRatio).toFixed(2));

          // Delivery charges
          const totalDelivery = parseFloat(order.delivery_amount || 0);
          const deliveryShare = Number((totalDelivery * sellerRatio).toFixed(2));

          const calculatedGrandTotal = Number(
            (groupSubtotal - groupDiscount - couponDiscountShare + deliveryShare).toFixed(2)
          );

          // Payment details
          const payMethod = order.transaction_id === "COD" ? "Cash on Delivery" : "Razorpay Online";
          const payStatus = order.razorpay_status === "paid" ? "PAID" : order.transaction_id === "COD" ? "COD" : "PAID";

          // Create Invoices table record
          const invoiceRecord = await Invoice.create(
            {
              invoice_number: invoiceNumber,
              order_id: cleanOrderId,
              sale_order_id: group.items.length === 1 ? group.items[0].id : null,
              seller_id: group.sellerId,
              seller_type: group.sellerType,
              invoice_type: invoiceType,
              document_title: documentTitle,
              invoice_date: orderDate,
              financial_year: financialYear,
              place_of_supply: custState,
              reverse_charge: false,

              seller_name_snapshot: sellerName,
              seller_shop_name_snapshot: sellerShop,
              seller_gstin_snapshot: sellerGst,
              seller_pan_snapshot: sellerPan,
              seller_email_snapshot: sellerEmail,
              seller_phone_snapshot: sellerPhone,
              seller_state_snapshot: sellerState,
              seller_state_code_snapshot: sellerStateCode,
              shipping_from_snapshot: shipFromAddress,

              customer_name_snapshot: custName,
              delivered_to_snapshot: deliveredToSnapshot,
              billing_address_snapshot: billingAddressSnapshot,

              payment_method: payMethod,
              payment_transaction_id: order.transaction_id,
              payment_id: order.payment_id,
              payment_status: payStatus,
              payment_date: order.payment_time || orderDate,

              subtotal: Number(groupSubtotal.toFixed(2)),
              discount_amount: Number(groupDiscount.toFixed(2)),
              coupon_discount: couponDiscountShare,
              taxable_amount: Number(groupTaxable.toFixed(2)),
              cgst_amount: Number(groupCgst.toFixed(2)),
              sgst_amount: Number(groupSgst.toFixed(2)),
              igst_amount: Number(groupIgst.toFixed(2)),
              shipping_amount: deliveryShare,
              shipping_tax_amount: 0.0,
              rounding_amount: 0.0,
              grand_total: calculatedGrandTotal,
              refund_amount: 0.0,
              status: "ISSUED",
            },
            { transaction }
          );

          // Create Invoice Items
          for (const itemData of itemSnapshots) {
            await InvoiceItem.create(
              {
                ...itemData,
                invoice_id: invoiceRecord.id,
              },
              { transaction }
            );
          }

          await transaction.commit();

          // Generate PDF on disk
          const sanitizedNum = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
          const storageDir = path.resolve("./storage/invoices");
          if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
          const pdfTarget = path.join(storageDir, `BESPOKE_INV_${sanitizedNum}.pdf`);

          // Fetch full invoice record with items for PDF generator
          const fullInv = await Invoice.findByPk(invoiceRecord.id, {
            include: [
              { association: "items" },
              { association: "adjustments" },
              { association: "order" },
            ],
          });

          await generateInvoicePdf(fullInv, pdfTarget);
          await invoiceRecord.update({ pdf_path: pdfTarget });

          fullInv.pdf_path = pdfTarget;
          createdInvoices.push(fullInv);
        } catch (sellerErr) {
          await transaction.rollback();
          console.error(`Error generating invoice for seller ${sellerKey}:`, sellerErr);
          throw sellerErr;
        }
      }

      return {
        eligible: true,
        status: "ISSUED",
        orderId: cleanOrderId,
        invoices: createdInvoices,
      };
    })();

    inFlightInvoicePromises.set(mutexKey, task);
    try {
      return await task;
    } finally {
      inFlightInvoicePromises.delete(mutexKey);
    }
  }

  /**
   * Retrieves single invoice by ID with strict ownership validation
   */
  static async getInvoiceById(invoiceId, { userId = null, vendorId = null, isAdmin = false } = {}) {
    const cleanId = parseInt(invoiceId, 10);
    if (!cleanId || isNaN(cleanId)) {
      throw new Error("Invalid invoice ID.");
    }

    const invoice = await Invoice.findByPk(cleanId, {
      include: [
        { association: "items" },
        { association: "adjustments" },
        { association: "order", include: [{ association: "user" }] },
      ],
    });

    if (!invoice) {
      throw new Error(`Invoice #${cleanId} not found.`);
    }

    // Authorization checks
    if (!isAdmin) {
      if (userId && String(invoice.order?.user_id) !== String(userId)) {
        throw new Error("Unauthorized access: you do not have permission to view this invoice.");
      }
      if (vendorId && String(invoice.seller_id) !== String(vendorId)) {
        throw new Error("Unauthorized access: this invoice does not belong to your vendor boutique.");
      }
    }

    return invoice;
  }

  /**
   * Returns paginated invoice list for customer account
   */
  static async getCustomerInvoices(userId, { page = 1, limit = 20, search = "", fromDate = null, toDate = null } = {}) {
    const cleanUid = parseInt(userId, 10);
    if (!cleanUid || isNaN(cleanUid)) {
      throw new Error("User ID is required to fetch customer invoices.");
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const offset = (p - 1) * lim;

    // Subquery condition matching orders owned by this user
    const whereConditions = {};
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      whereConditions[Op.or] = [
        { invoice_number: { [Op.like]: q } },
        { seller_name_snapshot: { [Op.like]: q } },
      ];
    }

    if (fromDate) {
      whereConditions.invoice_date = whereConditions.invoice_date || {};
      whereConditions.invoice_date[Op.gte] = new Date(fromDate);
    }
    if (toDate) {
      whereConditions.invoice_date = whereConditions.invoice_date || {};
      whereConditions.invoice_date[Op.lte] = new Date(toDate);
    }

    const { count, rows } = await Invoice.findAndCountAll({
      where: whereConditions,
      include: [
        {
          association: "order",
          where: { user_id: cleanUid },
          attributes: ["id", "order_id", "user_id", "payable_price", "razorpay_status"],
        },
        { association: "items" },
      ],
      order: [["id", "DESC"]],
      limit: lim,
      offset,
    });

    return {
      total: count,
      page: p,
      limit: lim,
      totalPages: Math.ceil(count / lim),
      invoices: rows,
    };
  }

  /**
   * Creates a credit note (refund adjustment document) linked to an existing invoice
   */
  static async createCreditNoteForRefund({ saleOrderId, refundId, reason, amount }) {
    if (!saleOrderId) throw new Error("Sale Order ID is required for credit note creation.");

    const saleOrder = await SaleOrder.findByPk(saleOrderId);
    if (!saleOrder || !saleOrder.order_id) {
      throw new Error("Sale Order not found.");
    }

    // Find the corresponding seller invoice
    const invoice = await Invoice.findOne({
      where: {
        order_id: saleOrder.order_id,
        seller_id: saleOrder.vendor_id ? parseInt(saleOrder.vendor_id, 10) : null,
      },
    });

    if (!invoice) {
      console.warn("Notice: Original invoice not found for credit note creation.");
      return null;
    }

    const financialYear = invoice.financial_year || getFinancialYear(new Date());
    const creditNoteNumber = await this.generateCreditNoteNumber(financialYear);
    const refundVal = parseFloat(amount || saleOrder.total_amount || 0);

    // Calculate tax adjustments
    const isIntraState = invoice.seller_state_code_snapshot === invoice.delivered_to_snapshot?.state_code;
    const gstRate = 12.0;
    const taxableAdj = Number((refundVal / (1 + gstRate / 100)).toFixed(2));
    const taxAdj = Number((refundVal - taxableAdj).toFixed(2));

    const creditNote = await InvoiceAdjustment.create({
      credit_note_number: creditNoteNumber,
      invoice_id: invoice.id,
      sale_order_id: saleOrderId,
      refund_id: refundId || null,
      adjustment_type: "REFUND",
      adjustment_date: new Date(),
      reason: reason || "Customer order return & refund",
      taxable_adjustment: taxableAdj,
      cgst_adjustment: isIntraState ? Number((taxAdj / 2).toFixed(2)) : 0.0,
      sgst_adjustment: isIntraState ? Number((taxAdj / 2).toFixed(2)) : 0.0,
      igst_adjustment: isIntraState ? 0.0 : taxAdj,
      total_refund_amount: Number(refundVal.toFixed(2)),
    });

    // Update invoice status & refund amount
    const updatedRefund = Number((parseFloat(invoice.refund_amount || 0) + refundVal).toFixed(2));
    await invoice.update({
      refund_amount: updatedRefund,
      status: updatedRefund >= parseFloat(invoice.grand_total) ? "CANCELLED" : "ADJUSTED",
    });

    return creditNote;
  }
}

export default InvoiceService;

