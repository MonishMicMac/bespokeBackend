import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const DesignerPortfolio = sequelize.define(
  "DesignerPortfolio",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    designer_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    img_path: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    description: {
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
    tableName: "designer_portfolio",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default DesignerPortfolio;

