import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const SaleOrderReviewImage = sequelize.define(
  "SaleOrderReviewImage",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    review_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    image_path: {
      type: DataTypes.STRING(255),
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
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "sale_order_review_image",
    timestamps: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  }
);

export default SaleOrderReviewImage;

