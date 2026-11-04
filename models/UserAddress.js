import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const UserAddress = sequelize.define(
  "UserAddress",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    pincode: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    state: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    city: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    house_building_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    area_colony: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    landmark_nearby: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "0",
    },
    lat: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    long: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "long",
    },
    action: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "0",
    },
    c_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "user_addresses",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default UserAddress;

