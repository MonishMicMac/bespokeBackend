import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const UserLogin = sequelize.define(
  "UserLogin",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    img_path: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    mobile: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    otp: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    pincode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    fcm: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    c_date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    },
    action: {
      type: DataTypes.ENUM('0', '1', '2'),
      allowNull: false,
      defaultValue: '0',
    },
    is_banned: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: false,
      defaultValue: '0',
    },
    banned_remarks: {
      type: DataTypes.STRING,
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
    shop_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    gst_no: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    pan_no: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "user_login",
    timestamps: false,
  }
);

await UserLogin.sync({ alter: true });

export default UserLogin;