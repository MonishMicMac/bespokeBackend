import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const VendorLogin = sequelize.define(
  "VendorLogin",
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    shop_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    seller_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    img_path: {
      type: DataTypes.STRING(255),
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
    gst_no: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    pan_no: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    pan_photo: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    c_date: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
    },
    is_banned: {
      type: DataTypes.ENUM("0", "1"),
      defaultValue: "0",
    },
    banned_remarks: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    email_otp: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    otp_expires_at: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    fcm: {
      type: DataTypes.TEXT,
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
    action: {
      type: DataTypes.ENUM("0", "1", "2"),
      defaultValue: "0",
    },
    mobile: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    is_customization: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    rating: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
    },
    vendor_type: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    approval_status: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    brand_business_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    seller_type_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    business_address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    contact_person: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    mobile_otp: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
  },
  {
    tableName: "vendor_login",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default VendorLogin;
