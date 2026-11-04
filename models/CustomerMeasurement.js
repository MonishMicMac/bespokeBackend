import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const CustomerMeasurement = sequelize.define(
  "CustomerMeasurement",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    cust_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    customer_measurement_name_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    measurement_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    value: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
  },
  {
    tableName: "customer_measurement",
    timestamps: false,
  }
);

export default CustomerMeasurement;

