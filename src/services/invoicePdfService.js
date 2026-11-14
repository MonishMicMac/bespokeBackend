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
      // Create A4 PDF Document (595.28 x 841.89 points)
      const doc = new PDFDocument({
        size: "A4",
        margin: 32,
        bufferPages: true,
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

      const MARGIN = 32;
      const PAGE_WIDTH = 595.28;
      const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2; // 531.28 pt

      // Theme Colors
      const COLOR_PRIMARY = "#C00078"; // Bespoke Magenta
      const COLOR_TEXT = "#24212A"; // Dark Text
      const COLOR_MUTED = "#5A5565"; // Subdued Gray
      const COLOR_LIGHT_BG = "#FAF6F9"; // Light Magenta tint
      const COLOR_BORDER = "#E8DFE6"; // Subtle border
      const COLOR_HEADER_FILL = "#F4EBF2";

      // 1. TOP BRAND & DOCUMENT HEADER
      let currentY = MARGIN;

      // Brand Title & Tagline
      doc.rect(MARGIN, currentY, CONTENT_WIDTH, 4).fill(COLOR_PRIMARY);
      currentY += 12;

      // Left: Brand Name
      doc.font("Helvetica-Bold").fontSize(18).fillColor(COLOR_PRIMARY);
      doc.text("BESPOKE", MARGIN, currentY, { continued: true });
      doc.font("Helvetica").fontSize(12).fillColor(COLOR_TEXT);
      doc.text("  |  LUXURY ATELIER & DESIGNER APPAREL");

      // Right: Document Title Badge
      const docTitle = String(invoice.document_title || (invoice.seller_gstin_snapshot ? "TAX INVOICE" : "BILL OF SUPPLY")).toUpperCase();
      doc.font("Helvetica-Bold").fontSize(14).fillColor(COLOR_PRIMARY);
      doc.text(docTitle, MARGIN, currentY, {
        align: "right",
        width: CONTENT_WIDTH,
      });

      currentY += 24;

      // Invoice Meta Details Bar (Left: Invoice No & Date | Right: Place of Supply & Order No)
      doc.rect(MARGIN, currentY, CONTENT_WIDTH, 26).fill(COLOR_LIGHT_BG);
      doc.rect(MARGIN, currentY, CONTENT_WIDTH, 26).stroke(COLOR_BORDER);

      const invDate = invoice.invoice_date
        ? new Date(invoice.invoice_date).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : new Date().toLocaleDateString("en-IN");

      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLOR_TEXT);
      doc.text(`Invoice No: `, MARGIN + 8, currentY + 8, { continued: true });
      doc.font("Helvetica").text(`${invoice.invoice_number}   `, { continued: true });
      doc.font("Helvetica-Bold").text(`Date: `, { continued: true });
      doc.font("Helvetica").text(`${invDate}   `, { continued: true });
      doc.font("Helvetica-Bold").text(`FY: `, { continued: true });
      doc.font("Helvetica").text(`${invoice.financial_year || "2026-27"}`);

      const placeOfSupply = `${invoice.place_of_supply || "Tamil Nadu"} (Code: ${invoice.seller_state_code_snapshot || "33"})`;
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLOR_TEXT);
      doc.text(
        `Place of Supply: ${placeOfSupply}  |  Reverse Charge: ${invoice.reverse_charge ? "Yes" : "No"}`,
        MARGIN,
        currentY + 8,
        { align: "right", width: CONTENT_WIDTH - 8 }
      );

      currentY += 34;

      // 2. THREE-SECTION ADDRESSES: SELLER | SHIPPING FROM | DELIVERED TO
      const colWidth = (CONTENT_WIDTH - 16) / 3; // ~171.7 pt each
      const boxHeight = 110;

      // Seller Data
      const sellerName = invoice.seller_name_snapshot || "Bespoke Platform Seller";
      const sellerShop = invoice.seller_shop_name_snapshot ? `(${invoice.seller_shop_name_snapshot})` : "";
      const sellerGst = invoice.seller_gstin_snapshot || "Unregistered / None";
      const sellerPan = invoice.seller_pan_snapshot || "N/A";
      const sellerPhone = invoice.seller_phone_snapshot || "";
      const sellerEmail = invoice.seller_email_snapshot || "";

      // Shipping From Data
      const shipFrom = typeof invoice.shipping_from_snapshot === "string"
        ? JSON.parse(invoice.shipping_from_snapshot || "{}")
        : (invoice.shipping_from_snapshot || {});
      const shipFromAddr = shipFrom.street || shipFrom.address || "Vendor Workshop Dispatch Center";
      const shipFromCity = [shipFrom.city, shipFrom.state, shipFrom.pincode ? `- ${shipFrom.pincode}` : ""].filter(Boolean).join(", ");

      // Delivered To (Customer) Data
      const delTo = typeof invoice.delivered_to_snapshot === "string"
        ? JSON.parse(invoice.delivered_to_snapshot || "{}")
        : (invoice.delivered_to_snapshot || {});
      const custName = invoice.customer_name_snapshot || delTo.name || "Customer";
      const delAddrLine1 = [delTo.house_building_name, delTo.area_colony, delTo.landmark_nearby].filter(Boolean).join(", ") || delTo.street || "Delivery Address on File";
      const delAddrCity = [delTo.city, delTo.state, delTo.pincode ? `- ${delTo.pincode}` : ""].filter(Boolean).join(", ");
      const custPhone = delTo.phone || delTo.mobile || "N/A";

      // Draw Box 1: Seller Details
      const col1X = MARGIN;
      doc.rect(col1X, currentY, colWidth, boxHeight).fillAndStroke("#FFFFFF", COLOR_BORDER);
      doc.rect(col1X, currentY, colWidth, 18).fill(COLOR_HEADER_FILL);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOR_PRIMARY);
      doc.text("SOLD BY / SELLER DETAILS", col1X + 6, currentY + 5);

      let textY = currentY + 23;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_TEXT);
      doc.text(sellerName.substring(0, 32), col1X + 6, textY);
      textY += 10;
      if (sellerShop) {
        doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(COLOR_MUTED);
        doc.text(sellerShop.substring(0, 32), col1X + 6, textY);
        textY += 10;
      }
      doc.font("Helvetica").fontSize(7.5).fillColor(COLOR_MUTED);
      doc.text(`GSTIN: ${sellerGst}`, col1X + 6, textY);
      textY += 10;
      doc.text(`PAN: ${sellerPan}`, col1X + 6, textY);
      textY += 10;
      if (invoice.seller_state_snapshot) {
        doc.text(`State: ${invoice.seller_state_snapshot} (${invoice.seller_state_code_snapshot || "33"})`, col1X + 6, textY);
        textY += 10;
      }
      if (sellerEmail) {
        doc.text(`Email: ${sellerEmail.substring(0, 26)}`, col1X + 6, textY);
        textY += 10;
      }
      if (sellerPhone) {
        doc.text(`Phone: ${sellerPhone}`, col1X + 6, textY);
      }

      // Draw Box 2: Shipping From (Dispatch Address)
      const col2X = col1X + colWidth + 8;
      doc.rect(col2X, currentY, colWidth, boxHeight).fillAndStroke("#FFFFFF", COLOR_BORDER);
      doc.rect(col2X, currentY, colWidth, 18).fill(COLOR_HEADER_FILL);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOR_PRIMARY);
      doc.text("SHIPPING FROM (DISPATCH)", col2X + 6, currentY + 5);

      textY = currentY + 23;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_TEXT);
      doc.text(shipFrom.business_name || shipFrom.name || sellerName.substring(0, 32), col2X + 6, textY);
      textY += 11;
      doc.font("Helvetica").fontSize(7.5).fillColor(COLOR_MUTED);
      doc.text(shipFromAddr, col2X + 6, textY, { width: colWidth - 12, height: 35 });
      textY += 34;
      doc.text(shipFromCity, col2X + 6, textY, { width: colWidth - 12 });
      textY += 18;
      doc.text(`Contact: ${shipFrom.phone || sellerPhone || "N/A"}`, col2X + 6, textY);

      // Draw Box 3: Delivered To (Shipping Destination)
      const col3X = col2X + colWidth + 8;
      doc.rect(col3X, currentY, colWidth, boxHeight).fillAndStroke("#FFFFFF", COLOR_BORDER);
      doc.rect(col3X, currentY, colWidth, 18).fill(COLOR_HEADER_FILL);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOR_PRIMARY);
      doc.text("DELIVERED TO (SHIPPING ADDRESS)", col3X + 6, currentY + 5);

      textY = currentY + 23;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_TEXT);
      doc.text(custName.substring(0, 32), col3X + 6, textY);
      textY += 11;
      doc.font("Helvetica").fontSize(7.5).fillColor(COLOR_MUTED);
      doc.text(delAddrLine1, col3X + 6, textY, { width: colWidth - 12, height: 35 });
      textY += 34;
      doc.text(delAddrCity, col3X + 6, textY, { width: colWidth - 12 });
      textY += 18;
      doc.text(`Phone: ${custPhone}`, col3X + 6, textY);

      currentY += boxHeight + 10;

      // 3. ORDER & PAYMENT SUMMARY BAR
      doc.rect(MARGIN, currentY, CONTENT_WIDTH, 22).fill(COLOR_LIGHT_BG);
      doc.rect(MARGIN, currentY, CONTENT_WIDTH, 22).stroke(COLOR_BORDER);

      const payMethod = invoice.payment_method || "Online Razorpay / Card";
      const payTxn = invoice.payment_id || invoice.payment_transaction_id || "N/A";
      const payStatus = String(invoice.payment_status || "PAID").toUpperCase();

      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_TEXT);
      doc.text(`Order ID: `, MARGIN + 8, currentY + 7, { continued: true });
      doc.font("Helvetica").text(`#${invoice.order_id}   `, { continued: true });
      doc.font("Helvetica-Bold").text(`Payment Mode: `, { continued: true });
      doc.font("Helvetica").text(`${payMethod}   `, { continued: true });
      doc.font("Helvetica-Bold").text(`Transaction ID: `, { continued: true });
      doc.font("Helvetica").text(`${payTxn.substring(0, 22)}`);

      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(payStatus === "PAID" ? "#0D8A56" : COLOR_PRIMARY);
      doc.text(`Status: ${payStatus}`, MARGIN, currentY + 7, {
        align: "right",
        width: CONTENT_WIDTH - 8,
      });

      currentY += 28;

      // 4. ITEMIZED PRODUCT TABLE
      // Column Widths (Sum must equal CONTENT_WIDTH = 531.28)
      // S.No: 24 | Product Name & HSN: 165 | Variant/Spec: 70 | Qty: 26 | Unit Price: 48 | Discount: 44 | Taxable: 50 | GST%: 44 | Total: 60 = 531
      const cols = [
        { label: "S.No", width: 24, align: "center" },
        { label: "Product & HSN Code", width: 165, align: "left" },
        { label: "Variant / Spec", width: 70, align: "left" },
        { label: "Qty", width: 26, align: "center" },
        { label: "Unit Price", width: 48, align: "right" },
        { label: "Discount", width: 44, align: "right" },
        { label: "Taxable Val", width: 50, align: "right" },
        { label: "GST %", width: 44, align: "center" },
        { label: "Total (₹)", width: 60, align: "right" },
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

        // Background alternating tint
        if (index % 2 === 1) {
          doc.rect(MARGIN, currentY, CONTENT_WIDTH, rowHeight).fill("#FDFBFD");
        }
        doc.rect(MARGIN, currentY, CONTENT_WIDTH, rowHeight).stroke(COLOR_BORDER);

        let cX = MARGIN;

        // 1. S.No
        doc.font("Helvetica").fontSize(7.5).fillColor(COLOR_TEXT);
        doc.text(String(index + 1), cX, currentY + 6, {
          width: cols[0].width,
          align: cols[0].align,
        });
        cX += cols[0].width;

        // 2. Product Name & HSN
        const prodName = item.product_name_snapshot || "Bespoke Apparel Item";
        const hsn = item.hsn_code ? `HSN: ${item.hsn_code}` : "HSN: 6204";
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOR_TEXT);
        doc.text(prodName, cX + 4, currentY + 4, {
          width: cols[1].width - 8,
          height: 14,
          ellipsis: true,
        });
        doc.font("Helvetica").fontSize(6.5).fillColor(COLOR_MUTED);
        doc.text(hsn, cX + 4, currentY + 18, {
          width: cols[1].width - 8,
        });
        cX += cols[1].width;

        // 3. Variant / Spec
        const variant = item.variant_snapshot || "Standard";
        doc.font("Helvetica").fontSize(7).fillColor(COLOR_TEXT);
        doc.text(variant, cX + 2, currentY + 6, {
          width: cols[2].width - 4,
          height: 20,
          ellipsis: true,
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
        doc.text(`₹${Number(item.unit_price || 0).toFixed(2)}`, cX, currentY + 8, {
          width: cols[4].width - 4,
          align: cols[4].align,
        });
        cX += cols[4].width;

        // 6. Discount
        const discVal = Number(item.discount_amount || 0);
        doc.font("Helvetica").fontSize(7.5).fillColor(discVal > 0 ? "#0D8A56" : COLOR_MUTED);
        doc.text(discVal > 0 ? `-₹${discVal.toFixed(2)}` : "₹0.00", cX, currentY + 8, {
          width: cols[5].width - 4,
          align: cols[5].align,
        });
        cX += cols[5].width;

        // 7. Taxable Value
        doc.font("Helvetica").fontSize(7.5).fillColor(COLOR_TEXT);
        doc.text(`₹${Number(item.taxable_amount || 0).toFixed(2)}`, cX, currentY + 8, {
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
        doc.text(`₹${Number(item.total_amount || 0).toFixed(2)}`, cX, currentY + 8, {
          width: cols[8].width - 4,
          align: cols[8].align,
        });

        currentY += rowHeight;
      });

      currentY += 8;

      // 5. BOTTOM SUMMARY: AMOUNT IN WORDS (LEFT) | PRICE & TAX BREAKDOWN (RIGHT)
      const leftBoxWidth = 270;
      const rightBoxWidth = CONTENT_WIDTH - leftBoxWidth - 10;
      const rightBoxX = MARGIN + leftBoxWidth + 10;

      // Left Box: Amount in words + Guarantee/Policies
      doc.rect(MARGIN, currentY, leftBoxWidth, 120).fillAndStroke("#FFFFFF", COLOR_BORDER);
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
      doc.rect(rightBoxX, currentY, rightBoxWidth, 120).fillAndStroke("#FFFFFF", COLOR_BORDER);

      let sumY = currentY + 6;
      function renderSummaryLine(label, amountStr, isBold = false, isAccent = false, isGreen = false) {
        doc.font(isBold ? "Helvetica-Bold" : "Helvetica").fontSize(7.5);
        doc.fillColor(isAccent ? COLOR_PRIMARY : COLOR_TEXT);
        doc.text(label, rightBoxX + 8, sumY);

        doc.fillColor(isAccent ? COLOR_PRIMARY : isGreen ? "#0D8A56" : COLOR_TEXT);
        doc.text(amountStr, rightBoxX, sumY, {
          align: "right",
          width: rightBoxWidth - 8,
        });
        sumY += 11;
      }

      renderSummaryLine("Items Subtotal:", `₹${Number(invoice.subtotal || 0).toFixed(2)}`);

      if (Number(invoice.discount_amount || 0) > 0) {
        renderSummaryLine("Product Discounts:", `-₹${Number(invoice.discount_amount).toFixed(2)}`, false, false, true);
      }
      if (Number(invoice.coupon_discount || 0) > 0) {
        renderSummaryLine("Promo Coupon Discount:", `-₹${Number(invoice.coupon_discount).toFixed(2)}`, false, false, true);
      }

      renderSummaryLine("Net Taxable Amount:", `₹${Number(invoice.taxable_amount || 0).toFixed(2)}`, true);

      // Taxes: CGST + SGST or IGST
      if (Number(invoice.cgst_amount || 0) > 0 || Number(invoice.sgst_amount || 0) > 0) {
        renderSummaryLine("CGST (Central Tax):", `₹${Number(invoice.cgst_amount || 0).toFixed(2)}`);
        renderSummaryLine("SGST (State Tax):", `₹${Number(invoice.sgst_amount || 0).toFixed(2)}`);
      } else if (Number(invoice.igst_amount || 0) > 0) {
        renderSummaryLine("IGST (Integrated Tax):", `₹${Number(invoice.igst_amount || 0).toFixed(2)}`);
      }

      const shipVal = Number(invoice.shipping_amount || 0);
      renderSummaryLine("Delivery / Shipping:", shipVal > 0 ? `₹${shipVal.toFixed(2)}` : "FREE (Complimentary)");

      if (Number(invoice.rounding_amount || 0) !== 0) {
        renderSummaryLine("Round-off Adjustment:", `₹${Number(invoice.rounding_amount).toFixed(2)}`);
      }

      // Grand Total Highlight Bar
      doc.rect(rightBoxX, sumY + 1, rightBoxWidth, 22).fill(COLOR_PRIMARY);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#FFFFFF");
      doc.text("GRAND TOTAL:", rightBoxX + 8, sumY + 6);
      doc.text(`₹${Number(invoice.grand_total || 0).toFixed(2)}`, rightBoxX, sumY + 6, {
        align: "right",
        width: rightBoxWidth - 8,
      });

      // 6. FOOTER (Computer generated signature notice & page number)
      const footerY = 800;
      doc.rect(MARGIN, footerY, CONTENT_WIDTH, 0.5).stroke(COLOR_BORDER);
      doc.font("Helvetica").fontSize(7).fillColor(COLOR_MUTED);
      doc.text(
        "Bespoke Multi-Vendor Luxury Marketplace | Authorized Digital Sign-off | Subject to Chennai Jurisdiction",
        MARGIN,
        footerY + 6,
        { width: CONTENT_WIDTH, align: "center" }
      );

      // Page numbers (bufferPages enables total count)
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.font("Helvetica").fontSize(7).fillColor(COLOR_MUTED);
        doc.text(
          `Page ${i + 1} of ${range.count}`,
          MARGIN,
          footerY + 16,
          { width: CONTENT_WIDTH, align: "center" }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

