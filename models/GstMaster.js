import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const GstMaster = sequelize.define(
  "GstMaster",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    rate: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    gst_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    gst_percentage: {
      type: DataTypes.STRING(255),
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
    tableName: "gst_masters",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default GstMaster;
