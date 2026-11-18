import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

/**
 * Converts a number to Indian Words (Rupees and Paise)
 */
export function numberToIndianWords(amount) {
  const num = Math.floor(Math.abs(Number(amount) || 0));
  const paise = Math.round((Math.abs(Number(amount) || 0) - num) * 100);

  const units = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  function convertTwoDigits(n) {
    if (n < 20) return units[n];
    return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + units[n % 10] : "");
  }

  function convertThreeDigits(n) {
    let str = "";
    if (Math.floor(n / 100) > 0) {
      str += units[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n > 0) {
      str += convertTwoDigits(n);
    }
    return str.trim();
  }

  if (num === 0 && paise === 0) return "Rupees Zero Only";

  let words = "";
  let n = num;

  const crores = Math.floor(n / 10000000);
  n %= 10000000;
  const lakhs = Math.floor(n / 100000);
  n %= 100000;
  const thousands = Math.floor(n / 1000);
  n %= 1000;
  const hundreds = n;

  if (crores > 0) words += convertTwoDigits(crores) + " Crore ";
  if (lakhs > 0) words += convertTwoDigits(lakhs) + " Lakh ";
  if (thousands > 0) words += convertTwoDigits(thousands) + " Thousand ";
  if (hundreds > 0) words += convertThreeDigits(hundreds) + " ";

  words = words.trim();
  let result = "Rupees " + (words || "Zero");

  if (paise > 0) {
    result += " and " + convertTwoDigits(paise) + " Paise";
  }
  return result + " Only";
}

/**
 * Generates an A4 PDF Invoice using PDFKit
 *
 * @param {Object} invoice - Invoice database record with items
 * @param {string} outputPath - Optional filesystem target path
 * @returns {Promise<Buffer>}
 */
export async function generateInvoicePdf(invoice, outputPath = null) {
  return new Promise((resolve, reject) => {
    try {
      const MARGIN = 30;
      const PAGE_WIDTH = 595.28;
      const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2; // 535.28 pt

      // Create A4 PDF Document with clean single-page margins
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 25, bottom: 25, left: MARGIN, right: MARGIN },
        bufferPages: true,
        autoFirstPage: true,
        info: {
          Title: `${invoice.document_title || "Invoice"} - ${invoice.invoice_number}`,
          Author: "Bespoke Atelier",
          Subject: `Tax Invoice for Order #${invoice.order_id}`,
        },
      });

      const buffers = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(buffers);
        if (outputPath) {
          try {
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(outputPath, pdfBuffer);
          } catch (writeErr) {
            console.warn("Notice saving PDF to path:", writeErr.message);
          }
        }
        resolve(pdfBuffer);
      });
      doc.on("error", (err) => reject(err));

      // Theme Colors
      const COLOR_PRIMARY = "#C00078"; // Bespoke Magenta
      const COLOR_TEXT = "#24212A"; // Dark Text
      const COLOR_MUTED = "#5A5565"; // Subdued Gray
      const COLOR_LIGHT_BG = "#FAF6F9"; // Light Magenta tint
      const COLOR_BORDER = "#E8DFE6"; // Subtle border
      const COLOR_HEADER_FILL = "#F4EBF2";

      // 1. TOP BRAND & DOCUMENT HEADER
      let currentY = 24;

      doc.rect(MARGIN, currentY, CONTENT_WIDTH, 3).fill(COLOR_PRIMARY);
      currentY += 10;

      // Brand Title & Tagline
      doc.font("Helvetica-Bold").fontSize(18).fillColor(COLOR_PRIMARY);
      doc.text("BESPOKE", MARGIN, currentY, { continued: true });
      doc.font("Helvetica").fontSize(10.5).fillColor(COLOR_MUTED);
      doc.text("  |  LUXURY ATELIER & DESIGNER APPAREL");

      // Right: Document Title Badge
      const docTitle = String(
        invoice.document_title || (invoice.seller_gstin_snapshot ? "TAX INVOICE" : "BILL OF SUPPLY")
      ).toUpperCase();
      doc.font("Helvetica-Bold").fontSize(13.5).fillColor(COLOR_PRIMARY);
      doc.text(docTitle, MARGIN, currentY, {
        align: "right",
        width: CONTENT_WIDTH,
      });

      currentY += 24;

      // 2. INVOICE META DETAILS BAR (2-Row Clean Layout to prevent collision)
      const metaBoxHeight = 32;
      doc.rect(MARGIN, currentY, CONTENT_WIDTH, metaBoxHeight).fillAndStroke(COLOR_LIGHT_BG, COLOR_BORDER);

      const invDate = invoice.invoice_date
        ? new Date(invoice.invoice_date).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : new Date().toLocaleDateString("en-IN");

      const placeOfSupply = `${invoice.place_of_supply || "Tamil Nadu"} (${invoice.seller_state_code_snapshot || "33"})`;

      // Meta Row 1: Invoice No (Left) | Place of Supply (Right)
      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_TEXT);
      doc.text("Invoice No: ", MARGIN + 8, currentY + 6, { continued: true });
      doc.font("Helvetica").text(invoice.invoice_number);

      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_TEXT);
      doc.text("Place of Supply: ", MARGIN, currentY + 6, {
        align: "right",
        width: CONTENT_WIDTH - 8,
        continued: true,
      });
      doc.font("Helvetica").text(placeOfSupply);

      // Meta Row 2: Date & FY (Left) | Reverse Charge (Right)
      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_TEXT);
      doc.text("Invoice Date: ", MARGIN + 8, currentY + 18, { continued: true });
      doc.font("Helvetica").text(`${invDate}     `, { continued: true });
      doc.font("Helvetica-Bold").text("Financial Year: ", { continued: true });
      doc.font("Helvetica").text(`${invoice.financial_year || "2026-27"}`);

      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_TEXT);
      doc.text("Reverse Charge: ", MARGIN, currentY + 18, {
        align: "right",
        width: CONTENT_WIDTH - 8,
        continued: true,
      });
      doc.font("Helvetica").text(invoice.reverse_charge ? "Yes" : "No");

      currentY += metaBoxHeight + 8;

      // 3. THREE-SECTION ADDRESSES: SELLER | SHIPPING FROM | DELIVERED TO
      const colWidth = (CONTENT_WIDTH - 16) / 3;
      const boxHeight = 104;

      // Seller Data
      const sellerName = invoice.seller_name_snapshot || "Bespoke Platform Seller";
      const sellerShop = invoice.seller_shop_name_snapshot ? `(${invoice.seller_shop_name_snapshot})` : "";
      const sellerGst = invoice.seller_gstin_snapshot || "Unregistered / None";
      const sellerPan = invoice.seller_pan_snapshot || "N/A";
      const sellerPhone = invoice.seller_phone_snapshot || "";
      const sellerEmail = invoice.seller_email_snapshot || "";

      // Shipping From Data
      const shipFrom =
        typeof invoice.shipping_from_snapshot === "string"
          ? JSON.parse(invoice.shipping_from_snapshot || "{}")
          : invoice.shipping_from_snapshot || {};
      const shipFromAddr = shipFrom.street || shipFrom.address || "Vendor Workshop Dispatch Center";
      const shipFromCity = [shipFrom.city, shipFrom.state, shipFrom.pincode ? `- ${shipFrom.pincode}` : ""]
        .filter(Boolean)
        .join(", ");

      // Delivered To (Customer) Data
      const delTo =
        typeof invoice.delivered_to_snapshot === "string"
          ? JSON.parse(invoice.delivered_to_snapshot || "{}")
          : invoice.delivered_to_snapshot || {};
      const custName = invoice.customer_name_snapshot || delTo.name || "Customer";
      const delAddrLine1 =
        [delTo.house_building_name, delTo.area_colony, delTo.landmark_nearby].filter(Boolean).join(", ") ||
        delTo.street ||
        "Delivery Address on File";
      const delAddrCity = [delTo.city, delTo.state, delTo.pincode ? `- ${delTo.pincode}` : ""]
        .filter(Boolean)
        .join(", ");
      const custPhone = delTo.phone || invoice.customer_phone_snapshot || "On File";

      // Draw Box 1: Seller Details
      const col1X = MARGIN;
      doc.rect(col1X, currentY, colWidth, boxHeight).fillAndStroke("#FFFFFF", COLOR_BORDER);
      doc.rect(col1X, currentY, colWidth, 18).fill(COLOR_HEADER_FILL);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOR_PRIMARY);
      doc.text("SOLD BY / SELLER DETAILS", col1X + 6, currentY + 5);

      let textY = currentY + 23;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_TEXT);
      doc.text(sellerName.substring(0, 30), col1X + 6, textY);
      textY += 10;
      if (sellerShop) {
        doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(COLOR_MUTED);
        doc.text(sellerShop.substring(0, 30), col1X + 6, textY);
        textY += 10;
      }
      doc.font("Helvetica").fontSize(7.5).fillColor(COLOR_MUTED);
      doc.text(`GSTIN: ${sellerGst}`, col1X + 6, textY);
      textY += 10;
      doc.text(`PAN: ${sellerPan}`, col1X + 6, textY);
      textY += 10;
      doc.text(
        `State: ${invoice.seller_state_snapshot || "Tamil Nadu"} (${invoice.seller_state_code_snapshot || "33"})`,
        col1X + 6,
        textY
      );
      textY += 10;
      if (sellerPhone || sellerEmail) {
        doc.text(`${sellerPhone || sellerEmail}`.substring(0, 30), col1X + 6, textY);
      }

      // Draw Box 2: Shipping From (Dispatch Address)
      const col2X = col1X + colWidth + 8;
      doc.rect(col2X, currentY, colWidth, boxHeight).fillAndStroke("#FFFFFF", COLOR_BORDER);
      doc.rect(col2X, currentY, colWidth, 18).fill(COLOR_HEADER_FILL);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOR_PRIMARY);
      doc.text("SHIPPING FROM (DISPATCH)", col2X + 6, currentY + 5);

      textY = currentY + 23;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_TEXT);
      doc.text(shipFrom.business_name || shipFrom.name || sellerName.substring(0, 30), col2X + 6, textY);
      textY += 11;
      doc.font("Helvetica").fontSize(7.5).fillColor(COLOR_MUTED);
      const shipFromText = [shipFromAddr, shipFromCity, shipFrom.phone ? `Contact: ${shipFrom.phone}` : ""]
        .filter(Boolean)
        .join("\n");
      doc.text(shipFromText, col2X + 6, textY, { width: colWidth - 12, lineGap: 2 });

      // Draw Box 3: Delivered To (Shipping Destination)
      const col3X = col2X + colWidth + 8;
      doc.rect(col3X, currentY, colWidth, boxHeight).fillAndStroke("#FFFFFF", COLOR_BORDER);
      doc.rect(col3X, currentY, colWidth, 18).fill(COLOR_HEADER_FILL);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOR_PRIMARY);
      doc.text("DELIVERED TO (SHIPPING ADDRESS)", col3X + 6, currentY + 5);

      textY = currentY + 23;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_TEXT);
      doc.text(custName.substring(0, 30), col3X + 6, textY);
      textY += 11;
      doc.font("Helvetica").fontSize(7.5).fillColor(COLOR_MUTED);
      const delToText = [delAddrLine1, delAddrCity, `Phone: ${custPhone}`].filter(Boolean).join("\n");
      doc.text(delToText, col3X + 6, textY, { width: colWidth - 12, lineGap: 2 });

      currentY += boxHeight + 8;

      // 4. ORDER & PAYMENT SUMMARY BAR
      doc.rect(MARGIN, currentY, CONTENT_WIDTH, 20).fillAndStroke(COLOR_LIGHT_BG, COLOR_BORDER);

      const payMethod = invoice.payment_method || "Online Razorpay / Card";
      const payTxn = invoice.payment_id || invoice.payment_transaction_id || "N/A";
      const payStatus = String(invoice.payment_status || "PAID").toUpperCase();

      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_TEXT);
      doc.text("Order ID: ", MARGIN + 8, currentY + 6, { continued: true });
      doc.font("Helvetica").text(`#${invoice.order_id}   `, { continued: true });
      doc.font("Helvetica-Bold").text("Payment Mode: ", { continued: true });
      doc.font("Helvetica").text(`${payMethod}   `, { continued: true });
      doc.font("Helvetica-Bold").text("Transaction ID: ", { continued: true });
      doc.font("Helvetica").text(`${payTxn.substring(0, 24)}`);

      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(payStatus === "PAID" ? "#0D8A56" : COLOR_PRIMARY);
      doc.text(`Status: ${payStatus}`, MARGIN, currentY + 6, {
        align: "right",
        width: CONTENT_WIDTH - 8,
      });

      currentY += 26;

      // 5. ITEMIZED PRODUCT TABLE
      const cols = [
        { label: "S.No", width: 25, align: "center" },
        { label: "Product & HSN Code", width: 165, align: "left" },
        { label: "Variant / Spec", width: 75, align: "left" },
        { label: "Qty", width: 25, align: "center" },
        { label: "Unit Price", width: 50, align: "right" },
        { label: "Discount", width: 45, align: "right" },
        { label: "Taxable Val", width: 50, align: "right" },
        { label: "GST %", width: 35, align: "center" },
        { label: "Total (Rs.)", width: 65, align: "right" },
      ];

      // Table Header Row
      const tableHeaderHeight = 20;
      doc.rect(MARGIN, currentY, CONTENT_WIDTH, tableHeaderHeight).fill(COLOR_PRIMARY);

      let colX = MARGIN;
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#FFFFFF");
      cols.forEach((col) => {
        doc.text(col.label, colX + 2, currentY + 6, {
          width: col.width - 4,
          align: col.align,
        });
        colX += col.width;
      });

      currentY += tableHeaderHeight;

      // Table Rows
      const items = invoice.items || [];
      items.forEach((item, index) => {
        const rowHeight = 32;

        if (index % 2 === 1) {
          doc.rect(MARGIN, currentY, CONTENT_WIDTH, rowHeight).fill("#FDFBFD");
        }
        doc.rect(MARGIN, currentY, CONTENT_WIDTH, rowHeight).stroke(COLOR_BORDER);

        let cX = MARGIN;

        // 1. S.No
        doc.font("Helvetica").fontSize(7.5).fillColor(COLOR_TEXT);
        doc.text(String(index + 1), cX, currentY + 8, {
          width: cols[0].width,
          align: cols[0].align,
        });
        cX += cols[0].width;

        // 2. Product Name & HSN Code
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOR_TEXT);
        doc.text(item.product_name_snapshot || "Garment Piece", cX + 4, currentY + 5, {
          width: cols[1].width - 8,
          height: 12,
        });
        doc.font("Helvetica").fontSize(6.8).fillColor(COLOR_MUTED);
        doc.text(`HSN: ${item.hsn_code || "5208"}`, cX + 4, currentY + 17, {
          width: cols[1].width - 8,
        });
        cX += cols[1].width;

        // 3. Variant / Spec
        let specStr = item.variant_snapshot || "";
        if (item.customization_details) {
          try {
            const cust =
              typeof item.customization_details === "string"
                ? JSON.parse(item.customization_details)
                : item.customization_details;
            if (cust.is_custom) specStr = specStr ? `${specStr} (Custom Fit)` : "Custom Fit";
          } catch (e) {
            // ignore
          }
        }
        doc.font("Helvetica").fontSize(7).fillColor(COLOR_MUTED);
        doc.text(specStr || "Standard", cX + 2, currentY + 8, {
          width: cols[2].width - 4,
          align: cols[2].align,
        });
        cX += cols[2].width;

        // 4. Quantity
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOR_TEXT);
        doc.text(String(item.quantity || 1), cX, currentY + 8, {
          width: cols[3].width,
          align: cols[3].align,
        });
        cX += cols[3].width;

        // 5. Unit Price
        doc.font("Helvetica").fontSize(7.5).fillColor(COLOR_TEXT);
        doc.text(Number(item.unit_price || 0).toFixed(2), cX, currentY + 8, {
          width: cols[4].width - 4,
          align: cols[4].align,
        });
        cX += cols[4].width;

        // 6. Discount
        const discVal = Number(item.discount_amount || 0);
        doc.font("Helvetica").fontSize(7.5).fillColor(discVal > 0 ? "#0D8A56" : COLOR_MUTED);
        doc.text(discVal > 0 ? `-${discVal.toFixed(2)}` : "0.00", cX, currentY + 8, {
          width: cols[5].width - 4,
          align: cols[5].align,
        });
        cX += cols[5].width;

        // 7. Taxable Value
        doc.font("Helvetica").fontSize(7.5).fillColor(COLOR_TEXT);
        doc.text(Number(item.taxable_amount || 0).toFixed(2), cX, currentY + 8, {
          width: cols[6].width - 4,
          align: cols[6].align,
        });
        cX += cols[6].width;

        // 8. GST %
        const gstRate = Number(item.gst_rate || 0);
        doc.font("Helvetica").fontSize(7.5).fillColor(COLOR_TEXT);
        doc.text(`${gstRate.toFixed(1)}%`, cX, currentY + 8, {
          width: cols[7].width,
          align: cols[7].align,
        });
        cX += cols[7].width;

        // 9. Total Line Amount
        doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_PRIMARY);
        doc.text(Number(item.total_amount || 0).toFixed(2), cX, currentY + 8, {
          width: cols[8].width - 4,
          align: cols[8].align,
        });

        currentY += rowHeight;
      });

      currentY += 8;

      // 6. BOTTOM SUMMARY: AMOUNT IN WORDS (LEFT) | PRICE & TAX BREAKDOWN (RIGHT)
      const leftBoxWidth = 270;
      const rightBoxWidth = CONTENT_WIDTH - leftBoxWidth - 10;
      const rightBoxX = MARGIN + leftBoxWidth + 10;
      const summaryBoxHeight = 122;

      // Left Box: Amount in words + Guarantee/Policies
      doc.rect(MARGIN, currentY, leftBoxWidth, summaryBoxHeight).fillAndStroke("#FFFFFF", COLOR_BORDER);
      doc.rect(MARGIN, currentY, leftBoxWidth, 18).fill(COLOR_HEADER_FILL);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOR_PRIMARY);
      doc.text("INVOICE TOTAL IN WORDS", MARGIN + 8, currentY + 5);

      const words = numberToIndianWords(invoice.grand_total);
      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_TEXT);
      doc.text(words, MARGIN + 8, currentY + 24, { width: leftBoxWidth - 16, height: 26 });

      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOR_PRIMARY);
      doc.text("ATELIER RETURN & CANCELLATION TERMS:", MARGIN + 8, currentY + 54);
      doc.font("Helvetica").fontSize(6.8).fillColor(COLOR_MUTED);
      doc.text(
        "• Bespoke artisan garments are eligible for doorstep fitting assistance or return within 14 days of delivery.\n" +
          "• In case of returns, credit notes are issued in compliance with GST Section 34.\n" +
          "• This is a computer-generated invoice authenticated for GST filing.",
        MARGIN + 8,
        currentY + 66,
        { width: leftBoxWidth - 16, lineGap: 1.5 }
      );

      // Right Box: Price & Tax Calculation Breakdown
      doc.rect(rightBoxX, currentY, rightBoxWidth, summaryBoxHeight).fillAndStroke("#FFFFFF", COLOR_BORDER);

      let sumY = currentY + 6;
      function renderSummaryLine(label, amountStr, isBold = false, isAccent = false, isGreen = false) {
        doc.font(isBold ? "Helvetica-Bold" : "Helvetica").fontSize(7.5);
        doc.fillColor(isAccent ? COLOR_PRIMARY : COLOR_TEXT);
        doc.text(label, rightBoxX + 8, sumY, { width: rightBoxWidth - 90 });

        doc.fillColor(isAccent ? COLOR_PRIMARY : isGreen ? "#0D8A56" : COLOR_TEXT);
        doc.text(amountStr, rightBoxX, sumY, {
          align: "right",
          width: rightBoxWidth - 8,
        });
        sumY += 12;
      }

      const basicPrice = Number(invoice.client_breakdown?.basic_price ?? invoice.subtotal ?? 0);
      const discountVal = Number(
        invoice.client_breakdown?.discount_amount ??
          (Number(invoice.discount_amount || 0) + Number(invoice.coupon_discount || 0))
      );
      const taxableVal = Number(invoice.client_breakdown?.taxable_amount ?? invoice.taxable_amount ?? 0);
      const cgstVal = Number(invoice.cgst_amount || 0);
      const sgstVal = Number(invoice.sgst_amount || 0);
      const igstVal = Number(invoice.igst_amount || 0);
      const prodGst = Number(invoice.client_breakdown?.product_gst ?? (cgstVal + sgstVal + igstVal).toFixed(2));
      const prodTotal = Number(invoice.client_breakdown?.product_total ?? (taxableVal + prodGst).toFixed(2));

      let pndBase = Number(invoice.client_breakdown?.packing_delivery_charges ?? invoice.shipping_amount ?? 0);
      let pndGst = Number(invoice.client_breakdown?.gst_on_pnd ?? invoice.shipping_tax_amount ?? 0);
      if (pndGst === 0 && pndBase > 0) {
        const b = Number((pndBase / 1.18).toFixed(2));
        pndGst = Number((pndBase - b).toFixed(2));
        pndBase = b;
      }

      const discountPct = Number(
        invoice.client_breakdown?.discount_percentage ??
          (basicPrice > 0 ? Math.round((discountVal / basicPrice) * 100) : 0)
      );
      const gstRate = Number(
        invoice.client_breakdown?.product_gst_rate ??
          (taxableVal > 0 ? Math.round((prodGst / taxableVal) * 100) : 18)
      );
      const pndGstRate = Number(invoice.client_breakdown?.pnd_gst_rate ?? 18);
      const finalPayable = Number(
        invoice.client_breakdown?.final_payable ?? invoice.grand_total ?? (prodTotal + pndBase + pndGst)
      );

      renderSummaryLine("Basic Price", `Rs. ${basicPrice.toFixed(2)}`);

      if (discountVal > 0) {
        renderSummaryLine(`Discount - ${discountPct}%`, `-Rs. ${discountVal.toFixed(2)}`, false, false, true);
      }

      renderSummaryLine(`GST ${gstRate}%`, `Rs. ${prodGst.toFixed(2)}`);
      renderSummaryLine("Total", `Rs. ${prodTotal.toFixed(2)}`, true);
      renderSummaryLine("Packing and Delivery charges", `Rs. ${pndBase.toFixed(2)}`);
      renderSummaryLine(`GST on P&D ${pndGstRate}%`, `Rs. ${pndGst.toFixed(2)}`);

      if (Number(invoice.rounding_amount || 0) !== 0) {
        renderSummaryLine("Round-off Adjustment:", `Rs. ${Number(invoice.rounding_amount).toFixed(2)}`);
      }

      // Grand Total Highlight Bar
      doc.rect(rightBoxX, sumY + 2, rightBoxWidth, 22).fill(COLOR_PRIMARY);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#FFFFFF");
      doc.text("Final payable", rightBoxX + 8, sumY + 7);
      doc.text(`Rs. ${finalPayable.toFixed(2)}`, rightBoxX, sumY + 7, {
        align: "right",
        width: rightBoxWidth - 8,
      });

      // 7. FOOTER (Computer generated signature notice & single page guarantee)
      const footerY = 788;
      doc.rect(MARGIN, footerY, CONTENT_WIDTH, 0.5).stroke(COLOR_BORDER);
      doc.font("Helvetica").fontSize(6.8).fillColor(COLOR_MUTED);
      doc.text(
        "Bespoke Multi-Vendor Luxury Marketplace | Authorized Digital Sign-off | Subject to Chennai Jurisdiction",
        MARGIN,
        footerY + 4,
        { width: CONTENT_WIDTH, align: "center", lineBreak: false }
      );
      doc.text("Page 1 of 1", MARGIN, footerY + 14, {
        width: CONTENT_WIDTH,
        align: "center",
        lineBreak: false,
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export default {
  numberToIndianWords,
  generateInvoicePdf,
};
