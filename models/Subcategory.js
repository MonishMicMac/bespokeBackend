import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Subcategory = sequelize.define(
  "Subcategory",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    category_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    category_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    img_path: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    action: {
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
    tableName: "subcategories",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Subcategory;

