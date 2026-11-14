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
} from "../models/setupAssociations.js";
import InvoiceService, { resolveStateCode, getFinancialYear } from "../src/services/invoiceService.js";
import { generateInvoicePdf, numberToIndianWords } from "../src/services/invoicePdfService.js";
import sequelize from "../config/db.js";
import fs from "fs";
import path from "path";

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
    failedCount++;
  }
}

async function runTestSuite() {
  console.log("=".repeat(80));
  console.log("  BESPOKE INVOICE SYSTEM - COMPREHENSIVE VERIFICATION TEST SUITE (25 SCENARIOS)");
  console.log("=".repeat(80));

  const testTimestamp = Date.now();
  let testUserId = null;
  let testVendorAId = null;
  let testVendorBId = null;
  let testAddressId = null;
  let testPrepaidOrderId = null;
  let testCodOrderId = null;
  let testPendingOrderId = null;
  let testFailedOrderId = null;
  let testMultiVendorOrderId = null;

  try {
    // SETUP TEST FIXTURES
    console.log("\n--- Setting up test users, vendors, and orders ---");

    // 1. Customer
    const testUser = await UserLogin.create({
      username: `Test Customer ${testTimestamp}`,
      name: `Test Customer ${testTimestamp}`,
      mobile: `9899${String(testTimestamp).slice(-6)}`,
      email: `customer_${testTimestamp}@bespoketest.com`,
      gender: "Male",
    });
    testUserId = testUser.id;

    // 2. Customer Address (Tamil Nadu)
    const testAddress = await UserAddress.create({
      user_id: String(testUserId),
      name: `Loki ${testTimestamp}`,
      phone: "9876543210",
      house_building_name: "Apt 4B, Royal Enclave",
      area_colony: "Poes Garden",
      city: "Chennai",
      state: "Tamil Nadu",
      pincode: "600086",
      type: "0",
    });
    testAddressId = testAddress.id;

    // 3. Vendor A (Tamil Nadu - Same state for Intra-state CGST+SGST)
    const vendorA = await VendorLogin.create({
      seller_name: "Kanchipuram Silk Atelier",
      shop_name: "Silk Studio Chennai",
      brand_business_name: "Kanchipuram Silks Pvt Ltd",
      gst_no: "33AAAAA0000A1Z5", // 33 = Tamil Nadu
      pan_no: "AAAAA0000A",
      email: `silk_${testTimestamp}@kanchi.com`,
      mobile: `9841${String(testTimestamp).slice(-6)}1`,
      business_address: "12 Gandhi Road, Kanchipuram",
      state: "Tamil Nadu",
      pincode: "631501",
    });
    testVendorAId = vendorA.id;

    // 4. Vendor B (Karnataka - Inter-state for IGST)
    const vendorB = await VendorLogin.create({
      seller_name: "Mysore Heritage Weaves",
      shop_name: "Mysore Royal Couture",
      brand_business_name: "Mysore Weavers LLP",
      gst_no: "29BBBBB0000B1Z8", // 29 = Karnataka
      pan_no: "BBBBB0000B",
      email: `weaves_${testTimestamp}@mysore.com`,
      mobile: `9841${String(testTimestamp).slice(-6)}2`,
      business_address: "45 Palace Cross, Bangalore",
      state: "Karnataka",
      pincode: "560001",
    });
    testVendorBId = vendorB.id;

    // 5. Vendor C (Unregistered / No GSTIN - for Bill of Supply)
    const vendorC = await VendorLogin.create({
      seller_name: "Local Khadi Artisan",
      shop_name: "Khadi Gram",
      brand_business_name: "Local Craft Co",
      gst_no: null, // No GST
      email: `artisan_${testTimestamp}@khadi.com`,
      mobile: `9841${String(testTimestamp).slice(-6)}3`,
      business_address: "Rural Craft Village, Madurai",
      state: "Tamil Nadu",
      pincode: "625001",
    });
    const testVendorCId = vendorC.id;

    console.log("✅ Fixtures created successfully.");

    // =========================================================================
    // SCENARIO 1: Successful prepaid order generates invoice
    // =========================================================================
    console.log("\n--- Scenario 1: Successful prepaid order generates invoice ---");
    const prepaidOrder = await Order.create({
      order_id: `ORD_${testTimestamp}_1`,
      user_id: testUserId,
      address_id: testAddressId,
      price: 2500.0,
      payable_price: 2500.0,
      delivery_amount: 0.0,
      razorpay_status: "paid",
      payment_id: `pay_${testTimestamp}_1`,
      transaction_id: `txn_${testTimestamp}_1`,
      order_history: "Approved",
    });
    testPrepaidOrderId = prepaidOrder.id;

    await SaleOrder.create({
      order_id: testPrepaidOrderId,
      vendor_id: String(testVendorAId),
      product_id: 101,
      size: "M",
      quantity: "1",
      single_product_price: 2500,
      seller_amount: 2250,
      bespoke_commision_amount: 250,
      alter_amount: 0,
      amount: "2500.00",
      total_amount: "2500.00",
      order_status: "Order_Placed",
    });

    const res1 = await InvoiceService.getOrCreateInvoicesForOrder(testPrepaidOrderId);
    assert(res1.eligible === true, "Prepaid order marked eligible for invoice");
    assert(res1.invoices.length === 1, "Exactly one invoice generated for single-vendor prepaid order");
    assert(res1.invoices[0].payment_status === "PAID", "Invoice payment status recorded as PAID");
    assert(res1.invoices[0].document_title === "TAX INVOICE", "Registered vendor produces TAX INVOICE");

    // =========================================================================
    // SCENARIO 2: COD Order confirmed generates invoice
    // =========================================================================
    console.log("\n--- Scenario 2: Cash on Delivery (COD) order generates invoice ---");
    const codOrder = await Order.create({
      order_id: `ORD_${testTimestamp}_2`,
      user_id: testUserId,
      address_id: testAddressId,
      price: 1500.0,
      payable_price: 1500.0,
      delivery_amount: 50.0,
      razorpay_status: "pending",
      transaction_id: "COD",
      order_history: "Approved",
    });
    testCodOrderId = codOrder.id;

    await SaleOrder.create({
      order_id: testCodOrderId,
      vendor_id: String(testVendorAId),
      product_id: 102,
      size: "L",
      quantity: "1",
      single_product_price: 1500,
      seller_amount: 1350,
      bespoke_commision_amount: 150,
      alter_amount: 0,
      amount: "1500.00",
      total_amount: "1500.00",
      order_status: "Order_Placed",
    });

    const res2 = await InvoiceService.getOrCreateInvoicesForOrder(testCodOrderId);
    assert(res2.eligible === true, "COD placed order marked eligible for invoice");
    assert(res2.invoices.length === 1, "Invoice generated for COD order");
    assert(res2.invoices[0].payment_method === "Cash on Delivery", "Payment method correctly stored as COD");

    // =========================================================================
    // SCENARIO 3: Pending online unpaid order is NOT eligible
    // =========================================================================
    console.log("\n--- Scenario 3: Pending unpaid online payment is NOT eligible ---");
    const pendingOrder = await Order.create({
      order_id: `ORD_${testTimestamp}_3`,
      user_id: testUserId,
      address_id: testAddressId,
      price: 3000.0,
      payable_price: 3000.0,
      delivery_amount: 0.0,
      razorpay_status: "pending",
      transaction_id: null,
      order_history: "Pending",
    });
    testPendingOrderId = pendingOrder.id;

    const res3 = await InvoiceService.getOrCreateInvoicesForOrder(testPendingOrderId);
    assert(res3.eligible === false, "Pending unpaid order is NOT eligible for invoice");
    assert(res3.status === "INVOICE_UNAVAILABLE", "Status returns INVOICE_UNAVAILABLE");

    // =========================================================================
    // SCENARIO 4: Failed payment is NOT eligible
    // =========================================================================
    console.log("\n--- Scenario 4: Failed online payment is NOT eligible ---");
    const failedOrder = await Order.create({
      order_id: `ORD_${testTimestamp}_4`,
      user_id: testUserId,
      address_id: testAddressId,
      price: 1800.0,
      payable_price: 1800.0,
      delivery_amount: 0.0,
      razorpay_status: "failed",
      order_history: "Decline_Order",
    });
    testFailedOrderId = failedOrder.id;

    const res4 = await InvoiceService.getOrCreateInvoicesForOrder(testFailedOrderId);
    assert(res4.eligible === false, "Failed order does NOT generate an invoice");

    // =========================================================================
    // SCENARIO 5: Duplicate concurrent requests idempotency
    // =========================================================================
    console.log("\n--- Scenario 5: Duplicate concurrent requests idempotency ---");
    const [c1, c2] = await Promise.all([
      InvoiceService.getOrCreateInvoicesForOrder(testPrepaidOrderId),
      InvoiceService.getOrCreateInvoicesForOrder(testPrepaidOrderId),
    ]);
    assert(c1.invoices[0].id === c2.invoices[0].id, "Concurrent requests return identical invoice ID");
    const countCheck = await Invoice.count({ where: { order_id: testPrepaidOrderId } });
    assert(countCheck === 1, "Exactly ONE invoice exists in DB for this seller and order");

    // =========================================================================
    // SCENARIO 6: Repeated downloads do not mutate invoice number or date
    // =========================================================================
    console.log("\n--- Scenario 6: Repeated invoice access does not mutate invoice ---");
    const originalNum = res1.invoices[0].invoice_number;
    const originalDate = res1.invoices[0].invoice_date;
    const fetchAgain = await InvoiceService.getInvoiceById(res1.invoices[0].id, { userId: testUserId });
    assert(fetchAgain.invoice_number === originalNum, "Invoice number remains completely unchanged");
    assert(new Date(fetchAgain.invoice_date).getTime() === new Date(originalDate).getTime(), "Invoice date remains completely unchanged");

    // =========================================================================
    // SCENARIO 7: Multiple vendors in one order create separate seller invoices
    // =========================================================================
    console.log("\n--- Scenario 7: Multi-vendor order creates separate seller invoices ---");
    const multiOrder = await Order.create({
      order_id: `ORD_${testTimestamp}_MULTI`,
      user_id: testUserId,
      address_id: testAddressId,
      price: 5000.0,
      payable_price: 5000.0,
      delivery_amount: 0.0,
      razorpay_status: "paid",
      payment_id: `pay_${testTimestamp}_multi`,
      transaction_id: `txn_${testTimestamp}_multi`,
      order_history: "Approved",
    });
    testMultiVendorOrderId = multiOrder.id;

    // Item from Vendor A (₹2,000)
    await SaleOrder.create({
      order_id: testMultiVendorOrderId,
      vendor_id: String(testVendorAId),
      product_id: 201,
      size: "M",
      quantity: "1",
      single_product_price: 2000,
      seller_amount: 1800,
      bespoke_commision_amount: 200,
      alter_amount: 0,
      amount: "2000.00",
      total_amount: "2000.00",
      order_status: "Order_Placed",
    });

    // Item from Vendor B (₹3,000)
    await SaleOrder.create({
      order_id: testMultiVendorOrderId,
      vendor_id: String(testVendorBId),
      product_id: 202,
      size: "XL",
      quantity: "1",
      single_product_price: 3000,
      seller_amount: 2700,
      bespoke_commision_amount: 300,
      alter_amount: 0,
      amount: "3000.00",
      total_amount: "3000.00",
      order_status: "Order_Placed",
    });

    const res7 = await InvoiceService.getOrCreateInvoicesForOrder(testMultiVendorOrderId);
    assert(res7.invoices.length === 2, "Multi-vendor order creates exactly 2 distinct seller invoices");

    // =========================================================================
    // SCENARIO 8: Multiple items from SAME vendor grouped in 1 invoice
    // =========================================================================
    console.log("\n--- Scenario 8: Multiple products from same vendor grouped in 1 invoice ---");
    const sameVendorOrder = await Order.create({
      order_id: `ORD_${testTimestamp}_SAME`,
      user_id: testUserId,
      address_id: testAddressId,
      price: 3500.0,
      payable_price: 3500.0,
      delivery_amount: 0.0,
      razorpay_status: "paid",
      payment_id: `pay_${testTimestamp}_same`,
      order_history: "Approved",
    });

    await SaleOrder.create({
      order_id: sameVendorOrder.id,
      vendor_id: String(testVendorAId),
      product_id: 301,
      size: "S",
      quantity: "1",
      single_product_price: 1500,
      seller_amount: 1350,
      bespoke_commision_amount: 150,
      alter_amount: 0,
      amount: "1500.00",
      total_amount: "1500.00",
      order_status: "Order_Placed",
    });
    await SaleOrder.create({
      order_id: sameVendorOrder.id,
      vendor_id: String(testVendorAId),
      product_id: 302,
      size: "M",
      quantity: "1",
      single_product_price: 2000,
      seller_amount: 1800,
      bespoke_commision_amount: 200,
      alter_amount: 0,
      amount: "2000.00",
      total_amount: "2000.00",
      order_status: "Order_Placed",
    });

    const res8 = await InvoiceService.getOrCreateInvoicesForOrder(sameVendorOrder.id);
    assert(res8.invoices.length === 1, "Exactly 1 invoice created for multiple items from same vendor");
    assert(res8.invoices[0].items.length === 2, "Invoice contains both products as itemized lines");

    // =========================================================================
    // SCENARIO 9: Distinct Seller GSTINs are never mixed
    // =========================================================================
    console.log("\n--- Scenario 9: Distinct Seller GSTINs are never mixed ---");
    const invVendorA = res7.invoices.find((i) => i.seller_id === testVendorAId);
    const invVendorB = res7.invoices.find((i) => i.seller_id === testVendorBId);
    assert(invVendorA.seller_gstin_snapshot === "33AAAAA0000A1Z5", "Vendor A invoice has Vendor A's GSTIN");
    assert(invVendorB.seller_gstin_snapshot === "29BBBBB0000B1Z8", "Vendor B invoice has Vendor B's GSTIN");
    assert(invVendorA.seller_gstin_snapshot !== invVendorB.seller_gstin_snapshot, "GSTINs strictly kept separated");

    // =========================================================================
    // SCENARIO 10: Shipping From address snapshot
    // =========================================================================
    console.log("\n--- Scenario 10: Shipping From address snapshot from vendor workshop ---");
    const shipFromA = typeof invVendorA.shipping_from_snapshot === "string"
      ? JSON.parse(invVendorA.shipping_from_snapshot)
      : invVendorA.shipping_from_snapshot;
    assert(shipFromA.city === "Chennai" || shipFromA.street.includes("Kanchipuram"), "Shipping From contains vendor workshop address");
    assert(shipFromA.state === "Tamil Nadu", "Shipping From state accurately captured");

    // =========================================================================
    // SCENARIO 11: Delivered To address snapshot
    // =========================================================================
    console.log("\n--- Scenario 11: Delivered To address snapshot ---");
    const delToSnap = typeof invVendorA.delivered_to_snapshot === "string"
      ? JSON.parse(invVendorA.delivered_to_snapshot)
      : invVendorA.delivered_to_snapshot;
    assert(delToSnap.house_building_name === "Apt 4B, Royal Enclave", "Delivered to building captured in snapshot");
    assert(delToSnap.pincode === "600086", "Customer pincode captured in snapshot");

    // =========================================================================
    // SCENARIO 12: Billing address snapshot
    // =========================================================================
    console.log("\n--- Scenario 12: Billing address snapshot ---");
    const billSnap = typeof invVendorA.billing_address_snapshot === "string"
      ? JSON.parse(invVendorA.billing_address_snapshot)
      : invVendorA.billing_address_snapshot;
    assert(billSnap.name !== undefined, "Billing address snapshot stored");

    // =========================================================================
    // SCENARIO 13: Customer changes address after order - invoice is IMMUTABLE
    // =========================================================================
    console.log("\n--- Scenario 13: Customer changes profile address later - snapshot immutable ---");
    await testAddress.update({
      house_building_name: "NEW MANSION 999",
      city: "Coimbatore",
      pincode: "641001",
    });

    const refetchedInv = await Invoice.findByPk(invVendorA.id);
    const snapAfterChange = typeof refetchedInv.delivered_to_snapshot === "string"
      ? JSON.parse(refetchedInv.delivered_to_snapshot)
      : refetchedInv.delivered_to_snapshot;
    assert(snapAfterChange.house_building_name === "Apt 4B, Royal Enclave", "Historical invoice retains original address despite customer profile updates");
    assert(snapAfterChange.city === "Chennai", "Historical city unchanged");

    // =========================================================================
    // SCENARIO 14: Vendor changes business address later - invoice is IMMUTABLE
    // =========================================================================
    console.log("\n--- Scenario 14: Vendor changes business address later - snapshot immutable ---");
    await vendorA.update({
      business_address: "NEW RELOCATED FACTORY 888",
    });
    const snapVendorAfter = typeof refetchedInv.shipping_from_snapshot === "string"
      ? JSON.parse(refetchedInv.shipping_from_snapshot)
      : refetchedInv.shipping_from_snapshot;
    assert(!snapVendorAfter.street.includes("NEW RELOCATED FACTORY"), "Historical invoice retains original vendor workshop address");

    // =========================================================================
    // SCENARIO 15: Discounts and Promo Codes Allocation
    // =========================================================================
    console.log("\n--- Scenario 15: Discounts and Promo Codes Allocation ---");
    const discountOrder = await Order.create({
      order_id: `ORD_${testTimestamp}_DISC`,
      user_id: testUserId,
      address_id: testAddressId,
      price: 2000.0,
      payable_price: 1800.0,
      delivery_amount: 0.0,
      discount_amt: "200.00",
      razorpay_status: "paid",
      payment_id: `pay_${testTimestamp}_disc`,
      order_history: "Approved",
    });

    await SaleOrder.create({
      order_id: discountOrder.id,
      vendor_id: String(testVendorAId),
      product_id: 401,
      size: "M",
      quantity: "1",
      single_product_price: 2000,
      seller_amount: 1800,
      bespoke_commision_amount: 200,
      alter_amount: 0,
      amount: "2000.00",
      total_amount: "2000.00",
      discount_amount: 100.0, // Item level discount
      order_status: "Order_Placed",
    });

    const res15 = await InvoiceService.getOrCreateInvoicesForOrder(discountOrder.id);
    const inv15 = res15.invoices[0];
    assert(Number(inv15.discount_amount) === 100.0, "Item discount recorded on invoice");
    assert(Number(inv15.coupon_discount) === 200.0, "Coupon discount recorded on invoice");
    assert(Number(inv15.grand_total) === 1700.0, "Grand total reflects item and coupon deductions");

    // =========================================================================
    // SCENARIO 16: Tax-inclusive calculations (no double taxing)
    // =========================================================================
    console.log("\n--- Scenario 16: Tax-inclusive price calculation ---");
    const item1 = invVendorA.items[0];
    // Taxable + Tax = Total
    const taxSum = Number((Number(item1.taxable_amount) + Number(item1.cgst_amount) + Number(item1.sgst_amount) + Number(item1.igst_amount)).toFixed(2));
    assert(Math.abs(taxSum - Number(item1.total_amount)) <= 0.05, "Taxable amount + Tax equals Total line amount (tax-inclusive)");

    // =========================================================================
    // SCENARIO 17: Intra-state vs Inter-state GST breakdown
    // =========================================================================
    console.log("\n--- Scenario 17: Intra-state (CGST+SGST) vs Inter-state (IGST) ---");
    // Vendor A (TN) -> Customer (TN) = Intra-state
    assert(Number(invVendorA.cgst_amount) > 0 && Number(invVendorA.sgst_amount) > 0, "Intra-state supply splits tax into CGST and SGST");
    assert(Number(invVendorA.igst_amount) === 0, "Intra-state supply has IGST = 0");

    // Vendor B (Karnataka) -> Customer (TN) = Inter-state
    assert(Number(invVendorB.igst_amount) > 0, "Inter-state supply calculates full IGST");
    assert(Number(invVendorB.cgst_amount) === 0 && Number(invVendorB.sgst_amount) === 0, "Inter-state supply has CGST = 0 and SGST = 0");

    // =========================================================================
    // SCENARIO 18: Missing GSTIN generates "BILL OF SUPPLY"
    // =========================================================================
    console.log("\n--- Scenario 18: Unregistered vendor produces 'BILL OF SUPPLY' ---");
    const unregOrder = await Order.create({
      order_id: `ORD_${testTimestamp}_UNREG`,
      user_id: testUserId,
      address_id: testAddressId,
      price: 800.0,
      payable_price: 800.0,
      delivery_amount: 0.0,
      razorpay_status: "paid",
      payment_id: `pay_${testTimestamp}_unreg`,
      order_history: "Approved",
    });

    await SaleOrder.create({
      order_id: unregOrder.id,
      vendor_id: String(testVendorCId),
      product_id: 501,
      size: "M",
      quantity: "1",
      single_product_price: 800,
      seller_amount: 720,
      bespoke_commision_amount: 80,
      alter_amount: 0,
      amount: "800.00",
      total_amount: "800.00",
      order_status: "Order_Placed",
    });

    const res18 = await InvoiceService.getOrCreateInvoicesForOrder(unregOrder.id);
    assert(res18.invoices[0].document_title === "BILL OF SUPPLY", "Unregistered seller produces BILL OF SUPPLY");
    assert(res18.invoices[0].invoice_type === "BILL_OF_SUPPLY", "Invoice type set to BILL_OF_SUPPLY");

    // =========================================================================
    // SCENARIO 19: Missing address gracefully handles with platform fallback
    // =========================================================================
    console.log("\n--- Scenario 19: Missing address gracefully handles with fallback ---");
    const noAddrOrder = await Order.create({
      order_id: `ORD_${testTimestamp}_NOADDR`,
      user_id: testUserId,
      address_id: 999999, // Non-existent address
      price: 1200.0,
      payable_price: 1200.0,
      delivery_amount: 0.0,
      razorpay_status: "paid",
      payment_id: `pay_${testTimestamp}_noaddr`,
      order_history: "Approved",
    });

    await SaleOrder.create({
      order_id: noAddrOrder.id,
      vendor_id: String(testVendorAId),
      product_id: 601,
      size: "M",
      quantity: "1",
      single_product_price: 1200,
      seller_amount: 1080,
      bespoke_commision_amount: 120,
      alter_amount: 0,
      amount: "1200.00",
      total_amount: "1200.00",
      order_status: "Order_Placed",
    });

    const res19 = await InvoiceService.getOrCreateInvoicesForOrder(noAddrOrder.id);
    assert(res19.eligible === true, "Gracefully generates invoice even if address_id missing");
    assert(res19.invoices[0].delivered_to_snapshot !== null, "Default delivery snapshot supplied");

    // =========================================================================
    // SCENARIO 20: Partial Refund creates Credit Note without mutating invoice
    // =========================================================================
    console.log("\n--- Scenario 20: Partial refund creates credit note without mutating invoice ---");
    const refundSaleOrder = await SaleOrder.findOne({ where: { order_id: testPrepaidOrderId } });
    const creditNote1 = await InvoiceService.createCreditNoteForRefund({
      saleOrderId: refundSaleOrder.id,
      refundId: 1001,
      reason: "Customer altered sleeve fitting",
      amount: 500.0,
    });

    assert(creditNote1 !== null, "Credit note created successfully");
    assert(creditNote1.credit_note_number.includes("CN-"), "Credit note follows sequential CN numbering series");
    assert(Number(creditNote1.total_refund_amount) === 500.0, "Credit note records accurate refund amount");

    const invAfterPartial = await Invoice.findByPk(res1.invoices[0].id);
    assert(invAfterPartial.status === "ADJUSTED", "Invoice status marked ADJUSTED");
    assert(Number(invAfterPartial.grand_total) === 2500.0, "Original invoice grand total remains pristine (never altered)");
    assert(Number(invAfterPartial.refund_amount) === 500.0, "Invoice tracks total refund amount separately");

    // =========================================================================
    // SCENARIO 21: Full refund updates invoice status to CANCELLED
    // =========================================================================
    console.log("\n--- Scenario 21: Full refund updates status to CANCELLED ---");
    await InvoiceService.createCreditNoteForRefund({
      saleOrderId: refundSaleOrder.id,
      refundId: 1002,
      reason: "Garment returned in full",
      amount: 2000.0,
    });

    const invAfterFull = await Invoice.findByPk(res1.invoices[0].id);
    assert(invAfterFull.status === "CANCELLED", "Invoice marked CANCELLED on 100% refund");
    assert(Number(invAfterFull.refund_amount) === 2500.0, "Total refund matches invoice total");

    // =========================================================================
    // SCENARIO 22: Customer unauthorized invoice access
    // =========================================================================
    console.log("\n--- Scenario 22: Customer unauthorized invoice access ---");
    let caughtCustomerAuth = false;
    try {
      await InvoiceService.getInvoiceById(invVendorA.id, { userId: 999999 });
    } catch (err) {
      caughtCustomerAuth = err.message.includes("Unauthorized");
    }
    assert(caughtCustomerAuth === true, "Customer 999999 blocked from viewing customer 76's invoice");

    // =========================================================================
    // SCENARIO 23: Vendor unauthorized invoice access
    // =========================================================================
    console.log("\n--- Scenario 23: Vendor unauthorized invoice access ---");
    let caughtVendorAuth = false;
    try {
      // Vendor B trying to access Vendor A's invoice
      await InvoiceService.getInvoiceById(invVendorA.id, { vendorId: testVendorBId });
    } catch (err) {
      caughtVendorAuth = err.message.includes("Unauthorized");
    }
    assert(caughtVendorAuth === true, "Vendor B blocked from viewing Vendor A's invoice");

    // =========================================================================
    // SCENARIO 24: PDF storage failure recovery
    // =========================================================================
    console.log("\n--- Scenario 24: PDF storage auto-recovery ---");
    if (invVendorA.pdf_path && fs.existsSync(invVendorA.pdf_path)) {
      fs.unlinkSync(invVendorA.pdf_path); // Simulate missing file
    }
    const recovered = await InvoiceService.getOrCreateInvoicesForOrder(testMultiVendorOrderId);
    const invA_afterRecover = recovered.invoices.find((i) => i.id === invVendorA.id);
    assert(fs.existsSync(invA_afterRecover.pdf_path), "Missing PDF automatically regenerated and restored to storage");

    // =========================================================================
    // SCENARIO 25: Multi-page invoice & formatting helpers
    // =========================================================================
    console.log("\n--- Scenario 25: PDF layout & Indian Number Words ---");
    const wordsTest1 = numberToIndianWords(4500.0);
    const wordsTest2 = numberToIndianWords(125430.5);
    assert(wordsTest1 === "Rupees Four Thousand Five Hundred Only", "Indian currency words 4500 correctly formatted");
    assert(wordsTest2.includes("Lakh") && wordsTest2.includes("Paise"), "Lakhs and Paise formatted in Indian style");

    const pdfBuffer = await generateInvoicePdf(invVendorA);
    assert(Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 2000, "Valid A4 PDF buffer generated (size > 2KB)");

    console.log("\n--- Cleaning up test records ---");
    // Clean up
    await InvoiceAdjustment.destroy({ where: { invoice_id: res1.invoices[0].id } });
    await InvoiceItem.destroy({ where: {} });
    await Invoice.destroy({ where: {} });
    await SaleOrder.destroy({ where: { order_id: [testPrepaidOrderId, testCodOrderId, testPendingOrderId, testFailedOrderId, testMultiVendorOrderId, sameVendorOrder.id, discountOrder.id, unregOrder.id, noAddrOrder.id] } });
    await Order.destroy({ where: { id: [testPrepaidOrderId, testCodOrderId, testPendingOrderId, testFailedOrderId, testMultiVendorOrderId, sameVendorOrder.id, discountOrder.id, unregOrder.id, noAddrOrder.id] } });
    await UserAddress.destroy({ where: { id: testAddressId } });
    await VendorLogin.destroy({ where: { id: [testVendorAId, testVendorBId, testVendorCId] } });
    await UserLogin.destroy({ where: { id: testUserId } });
    console.log("🧹 Test cleanup completed cleanly.");

  } catch (globalErr) {
    console.error("❌ Test suite uncaught error:", globalErr);
    failedCount++;
  }

  console.log("\n" + "=".repeat(80));
  console.log(`  TEST RESULTS: ${passedCount} PASSED | ${failedCount} FAILED`);
  console.log("=".repeat(80));

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite();

