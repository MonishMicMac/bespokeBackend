import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const ProductSize = sequelize.define(
  "ProductSize",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    size: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    product_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    measurement_id: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    details_value: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    action: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
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
    tableName: "product_size_details",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default ProductSize;

