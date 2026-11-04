import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const ProductAddonImage = sequelize.define(
  "ProductAddonImage",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    addon_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    product_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    img_path: {
      type: DataTypes.TEXT("long"),
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
    tableName: "product_addon_images",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default ProductAddonImage;

