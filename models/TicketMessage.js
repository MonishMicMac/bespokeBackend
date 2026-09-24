import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";
import Ticket from "./Ticket.js";

const TicketMessage = sequelize.define(
  "TicketMessage",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    ticket_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    sender_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    sender_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    receiver_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    receiver_type: {
      type: DataTypes.ENUM("customer", "vendor", "admin", "user"),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    file_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: null,
    },
    seen_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "ticket_messages",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

// Define associations
Ticket.hasMany(TicketMessage, { foreignKey: "ticket_id", as: "messages" });
TicketMessage.belongsTo(Ticket, { foreignKey: "ticket_id", as: "ticket" });

export default TicketMessage;
