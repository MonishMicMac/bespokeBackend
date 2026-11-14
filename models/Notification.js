import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Notification = sequelize.define(
  "Notification",
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    recipient_type: {
      type: DataTypes.STRING(50), // 'vendor', 'admin', 'user', 'all'
      allowNull: false,
      defaultValue: "vendor",
    },
    recipient_id: {
      type: DataTypes.STRING(100), // vendor ID, user ID, 'admin', or null
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING(50), // 'order', 'support', 'chat', 'refund', 'system', 'general'
      defaultValue: "order",
    },
    related_ticket_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    related_message_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    related_order_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    related_sale_order_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    data: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    read_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "notifications",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

// Auto-sync table if it doesn't exist
Notification.sync({ alter: false }).catch((err) => {
  console.error("⚠️ Failed to sync notifications table:", err.message);
});

export default Notification;
