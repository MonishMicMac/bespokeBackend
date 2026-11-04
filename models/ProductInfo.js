import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const ProductInfo = sequelize.define(
  "ProductInfo",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    product_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    details_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    details_value: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    action: {
      type: DataTypes.ENUM("0", "1"),
      defaultValue: "0",
    },
    c_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "product_info",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default ProductInfo;

