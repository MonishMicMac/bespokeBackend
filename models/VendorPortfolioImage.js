import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const VendorPortfolioImage = sequelize.define(
  "VendorPortfolioImage",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    vendor_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    image: {
      type: DataTypes.STRING(255),
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
    tableName: "vendor_portfolio_images",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default VendorPortfolioImage;

