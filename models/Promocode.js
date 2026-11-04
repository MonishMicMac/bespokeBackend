import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Promocode = sequelize.define(
  "Promocode",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    code: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM("percentage", "flat"),
      allowNull: false,
    },
    value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    max_discount_cap: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    min_order_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0.0,
    },
    min_items_count: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    per_user_limit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1,
    },
    usage_limit: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    used_count: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    status: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: "promo_codes",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

// Model helper methods
Promocode.prototype.isLimitReached = function () {
  if (this.usage_limit === null || this.usage_limit === undefined) {
    return false;
  }
  return Number(this.used_count) >= Number(this.usage_limit);
};

export const PromoCode = Promocode;
export default Promocode;

