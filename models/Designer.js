import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Designer = sequelize.define(
  "Designer",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    designer_id: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    designer_name: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    designer_image: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
    designer_title: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    designer_rating: {
      type: DataTypes.STRING(50),
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
    tableName: "designer",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Designer;

