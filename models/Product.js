import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Product = sequelize.define(
  "Product",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    room_id: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    product_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    vendor_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    product_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    hsn_code: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    main_image: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
    product_type: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
    },
    product_types: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    wear_type_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    subcategory: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    gender: {
      type: DataTypes.ENUM("male", "female", "unisex", "kids"),
      allowNull: true,
    },
    is_customizable: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    is_alter: {
      type: DataTypes.TINYINT,
      allowNull: true,
    },
    alter_charge: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    measurement_guide_image: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    rating: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    action: {
      type: DataTypes.ENUM("0", "1", "2"),
      defaultValue: "0",
    },
    is_active: {
      type: DataTypes.ENUM("0", "1"),
      defaultValue: "0",
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
    tableName: "products",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Product;

