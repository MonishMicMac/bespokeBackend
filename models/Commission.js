import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Commission = sequelize.define(
  "Commission",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    commission_percentage: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    action: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      defaultValue: "0",
    },
  },
  {
    tableName: "commission",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Commission;

