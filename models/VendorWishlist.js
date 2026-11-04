import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const VendorWishlist = sequelize.define(
  "VendorWishlist",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    designer_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    action: {
      type: DataTypes.ENUM("0", "1"),
      defaultValue: "0",
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
    tableName: "vendor_wishlist",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default VendorWishlist;

