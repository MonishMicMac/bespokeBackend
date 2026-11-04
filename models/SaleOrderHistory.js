import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const SaleOrderHistory = sequelize.define(
  "SaleOrderHistory",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },

    sale_order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    order_history: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    order_status: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "remark", // Database column name is 'remark'
    },
  },
  {
    tableName: "sale_order_history",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default SaleOrderHistory;
