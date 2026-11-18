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

    // Fallback: Check if orderIdentifier is a sale_order_id (e.g. 1065 or 'SID1065')
    if (!order) {
      const rawStr = String(orderIdentifier).trim();
      const rawClean = rawStr.replace(/^SID/i, "");
      const isSidNum = /^\d+$/.test(rawClean);
      try {
        const so = await SaleOrder.findOne({
          where: {
            [Op.or]: [
              { id: isNumeric ? parseInt(orderIdentifier, 10) : -1 },
              { id: isSidNum ? parseInt(rawClean, 10) : -1 },
              { sale_id: rawStr },
              { sale_id: `SID${rawStr}` },
              { sale_id: `SID${rawClean}` },
            ],
          },
          include: [
            {
              association: "order",
              include: [
                { association: "user" },
                { association: "address" },
                { association: "promocode" },
              ],
            },
          ],
        });
        if (so && so.order) {
          order = so.order;
        }
      } catch (soErr) {
        // continue
      }
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

      if (existingInvoices && existingInvoices.length > 0) {
        const orderPayable = parseFloat(order.payable_price || 0);
        const hasMismatchWithOrder =
          orderPayable > 0 &&
          existingInvoices.some((inv) => Math.abs(parseFloat(inv.grand_total) - orderPayable) > 0.5);

        if (!force && !hasMismatchWithOrder) {
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
            invoices: existingInvoices.map((inv) => formatInvoiceWithClientBreakdown(inv)),
          };
        } else {
          // Force regeneration: remove prior records to avoid unique constraint violations
          for (const oldInv of existingInvoices) {
            await InvoiceItem.destroy({ where: { invoice_id: oldInv.id } });
            await InvoiceAdjustment.destroy({ where: { invoice_id: oldInv.id } });
            await oldInv.destroy();
          }
        }
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
          let groupBasicPrice = 0;
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

            // Look up product_prices for actual MRP / Basic Price and GST
            let basicUnitPrice = unitPrice;
            let gstRate = unitPrice <= 1000 ? 5.0 : 12.0;

            if (so.price_id) {
              try {
                const [priceGstRows] = await sequelize.query(
                  `SELECT pp.actual_price, pp.discount_price,
                          COALESCE(pp.gst_id, pm.gst_id, p.gst_id) AS resolved_gst_id,
                          gm.gst_name, gm.rate AS gst_rate, gm.gst_percentage
                   FROM product_prices pp
                   LEFT JOIN products p ON pp.product_id = p.id
                   LEFT JOIN product_materials pm ON pp.material_id = pm.id
                   LEFT JOIN gst_masters gm ON COALESCE(pp.gst_id, pm.gst_id, p.gst_id) = gm.id AND (gm.action IS NULL OR gm.action != '1')
                   WHERE pp.id = ? LIMIT 1`,
                  { replacements: [so.price_id], transaction }
                );
                if (priceGstRows && priceGstRows.length > 0) {
                  const pRow = priceGstRows[0];
                  if (pRow.actual_price && parseFloat(pRow.actual_price) > 0) {
                    basicUnitPrice = parseFloat(pRow.actual_price);
                  }
                  if (pRow.gst_percentage != null) {
                    const parsedPct = parseFloat(pRow.gst_percentage);
                    if (!isNaN(parsedPct) && parsedPct > 0) {
                      gstRate = parsedPct;
                    }
                  }
                }
              } catch (e) {
                // fallback to default
              }
            }

            if (basicUnitPrice < unitPrice) {
              basicUnitPrice = unitPrice;
            }

            // Basic Price (MRP)
            const lineBasicTotal = Number((basicUnitPrice * qty).toFixed(2));

            // Check whether order was charged with GST added on top of netLineTotal or inclusive
            const orderProductPrice = parseFloat(order.price || 0);
            const orderPayablePrice = parseFloat(order.payable_price || 0);
            const orderDelivery = parseFloat(order.delivery_amount || 0);
            const couponDisc = parseFloat(order.discount_amt || 0);

            const expectedGstOnTop = Number(((netLineTotal * gstRate) / 100).toFixed(2));
            const isGstAddedOnTop =
              (orderProductPrice > 0 && Math.abs(orderProductPrice - (netLineTotal + expectedGstOnTop)) < 1.0) ||
              (orderPayablePrice > 0 && Math.abs(orderPayablePrice - (netLineTotal + expectedGstOnTop + orderDelivery - couponDisc)) < 1.0);

            let lineTaxable = 0;
            let lineTotalTax = 0;
            let lineTotalAmount = 0;

            if (isGstAddedOnTop) {
              lineTaxable = Number(netLineTotal.toFixed(2));
              lineTotalTax = expectedGstOnTop;
              lineTotalAmount = Number((lineTaxable + lineTotalTax).toFixed(2));
            } else {
              // Backward-compatible for legacy orders where netLineTotal was inclusive
              lineTaxable = Number((netLineTotal / (1 + gstRate / 100)).toFixed(2));
              lineTotalTax = Number((netLineTotal - lineTaxable).toFixed(2));
              lineTotalAmount = Number(netLineTotal.toFixed(2));
            }

            const lineDiscount = Math.max(0, Number((lineBasicTotal - lineTaxable).toFixed(2)));

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
              unit_price: Number(basicUnitPrice.toFixed(2)),
              discount_amount: lineDiscount,
              taxable_amount: lineTaxable,
              gst_rate: gstRate,
              cgst_amount: lineCgst,
              sgst_amount: lineSgst,
              igst_amount: lineIgst,
              total_amount: Number(lineTotalAmount.toFixed(2)),
            });

            groupBasicPrice += lineBasicTotal;
            groupDiscount += lineDiscount;
            groupTaxable += lineTaxable;
            groupCgst += lineCgst;
            groupSgst += lineSgst;
            groupIgst += lineIgst;
          }

          // Coupon proportion
          const totalOrderPrice = parseFloat(order.price || 1);
          const sellerRatio = Math.min(1, Math.max(0, (groupBasicPrice || 1) / (totalOrderPrice || 1)));
          const totalCouponDiscount = parseFloat(order.discount_amt || 0);
          const couponDiscountShare = Number((totalCouponDiscount * sellerRatio).toFixed(2));

          // Packing & Delivery charges with 18% GST standard (e.g. Total 100 -> Base 85, GST 15)
          const totalDelivery = parseFloat(order.delivery_amount || 0);
          const deliveryShare = Number((totalDelivery * sellerRatio).toFixed(2));
          const pndGstRate = 18.0;
          let baseShipping = 0;
          let shippingTax = 0;

          if (deliveryShare > 0) {
            baseShipping = Number((deliveryShare / (1 + pndGstRate / 100)).toFixed(2));
            shippingTax = Number((deliveryShare - baseShipping).toFixed(2));
          }

          let calculatedGrandTotal = Number(
            (groupTaxable + groupCgst + groupSgst + groupIgst + baseShipping + shippingTax - couponDiscountShare).toFixed(2)
          );
          const orderPayablePrice = parseFloat(order.payable_price || 0);
          if (orderPayablePrice > 0 && Math.abs(calculatedGrandTotal - orderPayablePrice) < 1.0) {
            calculatedGrandTotal = orderPayablePrice;
          }

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

              subtotal: Number(groupBasicPrice.toFixed(2)),
              discount_amount: Number(groupDiscount.toFixed(2)),
              coupon_discount: couponDiscountShare,
              taxable_amount: Number(groupTaxable.toFixed(2)),
              cgst_amount: Number(groupCgst.toFixed(2)),
              sgst_amount: Number(groupSgst.toFixed(2)),
              igst_amount: Number(groupIgst.toFixed(2)),
              shipping_amount: baseShipping,
              shipping_tax_amount: shippingTax,
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
        invoices: createdInvoices.map((inv) => formatInvoiceWithClientBreakdown(inv)),
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
  static async getInvoiceById(invoiceId, { userId = null, vendorId = null, saleOrderId = null, isAdmin = false } = {}) {
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
      const cleanUid = userId && String(userId) !== "[object Object]" ? String(userId) : null;
      if (saleOrderId) {
        const cleanSid = String(saleOrderId).replace(/^SID/i, "");
        const matchesSaleOrder =
          String(invoice.sale_order_id) === String(cleanSid) ||
          (invoice.items && invoice.items.some((i) => String(i.sale_order_id) === String(cleanSid)));
        if (!matchesSaleOrder && cleanUid && String(invoice.order?.user_id) !== cleanUid) {
          throw new Error("Unauthorized access: you do not have permission to view this invoice.");
        }
      } else if (cleanUid && String(invoice.order?.user_id) !== cleanUid) {
        throw new Error("Unauthorized access: you do not have permission to view this invoice.");
      }
      if (vendorId && String(invoice.seller_id) !== String(vendorId)) {
        throw new Error("Unauthorized access: this invoice does not belong to your vendor boutique.");
      }
    }

    // Check if invoice grand_total mismatches order payable_price
    if (invoice.order?.payable_price) {
      const orderPayable = parseFloat(invoice.order.payable_price);
      if (orderPayable > 0 && Math.abs(parseFloat(invoice.grand_total) - orderPayable) > 0.5) {
        try {
          const refreshed = await this.getOrCreateInvoicesForOrder(invoice.order_id, { force: true });
          if (refreshed?.invoices?.length > 0) {
            const matched = refreshed.invoices.find((i) => i.id === cleanId) || refreshed.invoices[0];
            return matched;
          }
        } catch (syncErr) {
          console.warn("Notice syncing invoice to order payable:", syncErr.message);
        }
      }
    }

    return formatInvoiceWithClientBreakdown(invoice);
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
      invoices: rows.map((inv) => formatInvoiceWithClientBreakdown(inv)),
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

/**
 * Attaches the exact client invoice calculation breakdown:
 * - Basic Price (MRP)
 * - Discount (-XX%)
 * - GST (XX%)
 * - Total (Product Total)
 * - Packing and Delivery charges
 * - GST on P&D 18%
 * - Final payable
 */
export function formatInvoiceWithClientBreakdown(invoice) {
  if (!invoice) return null;
  const inv = typeof invoice.toJSON === "function" ? invoice.toJSON() : { ...invoice };

  let basicPrice = Number(inv.subtotal || 0);
  let discountAmount = Number(inv.discount_amount || 0);
  let couponDiscount = Number(inv.coupon_discount || 0);
  let totalDiscount = Number((discountAmount + couponDiscount).toFixed(2));
  let taxableAmount = Number(inv.taxable_amount || 0);
  let cgst = Number(inv.cgst_amount || 0);
  let sgst = Number(inv.sgst_amount || 0);
  let igst = Number(inv.igst_amount || 0);
  let productGst = Number((cgst + sgst + igst).toFixed(2));
  let shippingAmount = Number(inv.shipping_amount || 0);
  let shippingTax = Number(inv.shipping_tax_amount || 0);
  let grandTotal = Number(inv.grand_total || 0);

  // Synchronize grandTotal with order payable_price if available
  if (inv.order?.payable_price) {
    const orderPayable = Number(inv.order.payable_price);
    if (orderPayable > 0 && Math.abs(grandTotal - orderPayable) > 0.5) {
      grandTotal = orderPayable;
    }
  }

  // Fallback for older invoice records where shipping_tax_amount was 0
  if (shippingTax === 0 && shippingAmount > 0) {
    const pndBase = Number((shippingAmount / 1.18).toFixed(2));
    const pndTax = Number((shippingAmount - pndBase).toFixed(2));
    shippingAmount = pndBase;
    shippingTax = pndTax;
  }

  if (basicPrice === 0 || basicPrice < taxableAmount) {
    basicPrice = Number((taxableAmount + totalDiscount).toFixed(2));
  }

  const productTotal = Number((taxableAmount + productGst).toFixed(2));
  const finalPayable = grandTotal > 0 ? grandTotal : Number((productTotal + shippingAmount + shippingTax).toFixed(2));

  const discountPct = basicPrice > 0
    ? Math.round(((basicPrice - taxableAmount) / basicPrice) * 100)
    : 0;

  const productGstRate = taxableAmount > 0
    ? Math.round((productGst / taxableAmount) * 100)
    : (inv.items && inv.items[0]?.gst_rate ? Number(inv.items[0].gst_rate) : 18);

  const pndGstRate = shippingAmount > 0
    ? Math.round((shippingTax / shippingAmount) * 100)
    : 18;

  inv.client_breakdown = {
    basic_price: basicPrice,
    discount_amount: totalDiscount,
    discount_percentage: discountPct,
    taxable_amount: taxableAmount,
    product_gst: productGst,
    product_gst_rate: productGstRate,
    product_total: productTotal,
    packing_delivery_charges: shippingAmount,
    gst_on_pnd: shippingTax,
    pnd_gst_rate: pndGstRate,
    final_payable: finalPayable,
  };

  return inv;
}

export default InvoiceService;

