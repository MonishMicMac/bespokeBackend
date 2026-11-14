import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const InvoiceAdjustment = sequelize.define(
  "InvoiceAdjustment",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    credit_note_number: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    invoice_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    sale_order_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    refund_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    adjustment_type: {
      type: DataTypes.ENUM("REFUND", "RETURN", "CANCELLATION"),
      allowNull: false,
      defaultValue: "REFUND",
    },
    adjustment_date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    taxable_adjustment: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    cgst_adjustment: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    sgst_adjustment: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    igst_adjustment: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    total_refund_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    pdf_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  },
  {
    tableName: "invoice_adjustments",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default InvoiceAdjustment;

