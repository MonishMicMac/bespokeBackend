import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const DeliveryCharge = sequelize.define(
  "DeliveryCharge",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    delivery_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
  },
  {
    tableName: "delivery_charge",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default DeliveryCharge;

