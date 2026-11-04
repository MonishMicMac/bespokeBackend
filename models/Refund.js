import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Refund = sequelize.define(
  "Refund",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    sale_order_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    order_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    refund_status: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    transaction_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: "refunds",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Refund;

