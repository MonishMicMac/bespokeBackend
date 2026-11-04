import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Measurement = sequelize.define(
  "Measurement",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    type: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    img_path: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    size_details: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    action: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
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
    tableName: "measurements",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Measurement;

