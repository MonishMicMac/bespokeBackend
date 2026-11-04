import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const ReturnProduct = sequelize.define(
  "ReturnProduct",
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
    refund_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    return_status: {
      type: DataTypes.ENUM(
        "initiate",
        "refund processed",
        "product collected",
        "delivered to vendor"
      ),
      allowNull: false,
      defaultValue: "initiate",
    },
  },
  {
    tableName: "return_products",
    timestamps: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  }
);

export default ReturnProduct;

