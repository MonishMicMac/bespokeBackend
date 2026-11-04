import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const OrderAddon = sequelize.define(
  "OrderAddon",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    addon_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    sale_id: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    order_addon_id: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    action: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "1",
    },
  },
  {
    tableName: "order_addon",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default OrderAddon;

