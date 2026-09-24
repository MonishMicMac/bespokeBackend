import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Ticket = sequelize.define(
  "Ticket",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    sale_order_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      defaultValue: null,
    },
    ticket_code: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    vendor_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      defaultValue: null,
    },
    ticket_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: "order",
    },
    priority: {
      type: DataTypes.ENUM("critical", "high", "medium", "n/a"),
      defaultValue: "n/a",
    },
    status: {
      type: DataTypes.ENUM("open", "closed"),
      defaultValue: "open",
    },
    create_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "tickets",
    timestamps: true,
    createdAt: "create_date",
    updatedAt: "updated_date",
  }
);

export default Ticket;
