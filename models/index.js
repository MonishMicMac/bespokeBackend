import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Message = sequelize.define(
  "Message",
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    senderId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    receiverId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    chatType: {
        type: DataTypes.STRING,
        defaultValue: "private",
        },
    messageType: {
      type: DataTypes.ENUM("text", "image", "file"),
      defaultValue: "text",
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    status: {
      type: DataTypes.ENUM("sent", "delivered", "read"),
      defaultValue: "sent",
    },
    deletedmsges: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    tableName: "messages",
    timestamps: true,
  }
);

// Create the table
await Message.sync({ alter: true });

export default Message;