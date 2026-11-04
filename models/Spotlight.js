import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Spotlight = sequelize.define(
  "Spotlight",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    shop_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    shop_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    background_image: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
    price: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING(200),
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
    tableName: "spotlight",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Spotlight;

