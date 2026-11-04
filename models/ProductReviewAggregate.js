import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const ProductReviewAggregate = sequelize.define(
  "ProductReviewAggregate",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    product_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    one_star_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 0,
    },
    two_star_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 0,
    },
    three_star_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 0,
    },
    four_star_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 0,
    },
    five_star_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 0,
    },
    total_reviews: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 0,
    },
    total_average: {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 0.0,
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
    tableName: "product_review_aggregates",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default ProductReviewAggregate;

