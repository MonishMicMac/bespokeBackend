import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const SaleOrderShipment = sequelize.define(
  "SaleOrderShipment",
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
    shipment_type: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    shipping_provider: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    tracking_number: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    estimated_delivery: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    pickup_address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    delivery_address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    shipment_payload: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
    shipment_response: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
  },
  {
    tableName: "sale_order_shipments",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default SaleOrderShipment;

