import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const UserLogin = sequelize.define(
  "UserLogin",
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    img_path: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    mobile: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    shop_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    gst_no: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    pan_no: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    otp: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    pincode: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    fcm: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    c_date: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
    },
    action: {
      type: DataTypes.ENUM("0", "1", "2"),
      defaultValue: "0",
    },
    is_banned: {
      type: DataTypes.ENUM("0", "1"),
      defaultValue: "0",
    },
    banned_remarks: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    otp_expires_at: {
      type: DataTypes.STRING(200),
      allowNull: true,
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
    tableName: "user_login",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default UserLogin;
