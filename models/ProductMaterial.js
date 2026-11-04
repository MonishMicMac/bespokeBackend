import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const ProductMaterial = sequelize.define(
  "ProductMaterial",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
    product_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    material_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    main_img_path: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    product_type: {
      type: DataTypes.TINYINT,
      allowNull: true,
    },
    action: {
      type: DataTypes.ENUM("0", "1"),
      defaultValue: "0",
    },
    is_active: {
      type: DataTypes.ENUM("0", "1"),
      defaultValue: "1",
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
    tableName: "product_materials",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default ProductMaterial;

