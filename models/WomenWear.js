import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const WomenWear = sequelize.define(
  "WomenWear",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    type: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "2",
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    product_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    brand_logo: {
      type: DataTypes.TEXT("long"),
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
    tableName: "women_wear",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default WomenWear;

