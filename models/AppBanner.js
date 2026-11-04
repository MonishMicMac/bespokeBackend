import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const AppBanner = sequelize.define(
  "AppBanner",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    img_path: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    type: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    navigate: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    searchfield_id: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    searchfield_text: {
      type: DataTypes.STRING(150),
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
    tableName: "app_banners",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default AppBanner;

