import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Order = sequelize.define(
  "Order",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    delivery_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    payable_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    order_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    address_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    transaction_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    razorpay_order_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    payment_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    razorpay_status: {
      type: DataTypes.ENUM("pending", "created", "paid", "failed"),
      defaultValue: "pending",
    },
    payment_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    coupen_id: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    discount_amt: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    discount_used: {
      type: DataTypes.ENUM("0", "1", "2"),
      defaultValue: "0",
    },
    order_history: {
      type: DataTypes.STRING(255),
      defaultValue: "Pending",
    },
    decline_remarks: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: "orders",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Order;

