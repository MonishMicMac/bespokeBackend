import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const ProductPrice = sequelize.define(
  "ProductPrice",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    material_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    product_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    size: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    actual_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    discount_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    qty: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    is_out_stock: {
      type: DataTypes.ENUM("0", "1"),
      defaultValue: "0",
    },
    product_type: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
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
    tableName: "product_prices",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default ProductPrice;

