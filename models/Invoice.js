import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Invoice = sequelize.define(
  "Invoice",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    invoice_number: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    order_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    sale_order_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    seller_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    seller_type: {
      type: DataTypes.ENUM("vendor", "platform"),
      allowNull: false,
      defaultValue: "vendor",
    },
    invoice_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "TAX_INVOICE", // 'TAX_INVOICE' | 'BILL_OF_SUPPLY'
    },
    document_title: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: "TAX INVOICE",
    },
    invoice_date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    financial_year: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "2026-27",
    },
    place_of_supply: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: "Tamil Nadu",
    },
    reverse_charge: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    // Immutable Snapshots
    seller_name_snapshot: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    seller_shop_name_snapshot: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    seller_gstin_snapshot: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    seller_pan_snapshot: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    seller_email_snapshot: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    seller_phone_snapshot: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    seller_state_snapshot: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    seller_state_code_snapshot: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    shipping_from_snapshot: {
      type: DataTypes.JSON,
      allowNull: false,
    },

    customer_name_snapshot: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    delivered_to_snapshot: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    billing_address_snapshot: {
      type: DataTypes.JSON,
      allowNull: false,
    },

    // Payment Information
    payment_method: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    payment_transaction_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    payment_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    payment_status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "PAID",
    },
    payment_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Financial Values (Safe decimals)
    subtotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    discount_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    coupon_discount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    taxable_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    cgst_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    sgst_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    igst_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    shipping_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    shipping_tax_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    rounding_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    grand_total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    refund_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },

    status: {
      type: DataTypes.ENUM("ISSUED", "CANCELLED", "ADJUSTED"),
      allowNull: false,
      defaultValue: "ISSUED",
    },
    pdf_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  },
  {
    tableName: "invoices",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Invoice;

