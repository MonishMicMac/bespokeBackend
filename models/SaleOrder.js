import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const SaleOrder = sequelize.define(
  "SaleOrder",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    vendor_id: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    order_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    product_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    size: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    material_id: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    material_amount: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    quantity: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    amount: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    addon_amount: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    commission_percentage: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    total_amount: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    price_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    seller_amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    bespoke_commision_amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    single_product_price: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    is_customisable: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: false,
      defaultValue: '0',
    },
    order_customisable_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    is_alter: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: false,
      defaultValue: '0',
    },
    alter_amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    material_length_in_mtr: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    action: {
      type: DataTypes.ENUM('0', '1', '2'),
      allowNull: false,
      defaultValue: '0',
    },
    order_history: {
      type: DataTypes.ENUM('Pending','Approved','Ready_to_Ship','Dispatched','Decline_Order','material_procurement','Design_Approved','Production_Started'),
      allowNull: true,
    },
    tracking_number: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    shipping_provider: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    estimated_delivery: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    cancel_remark: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    sale_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    measurment_details: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    cancelled_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    pickup_tracking_number: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    pickup_shipping_provider: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    pickup_estimated_delivery: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    drop_tracking_number: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    drop_shipping_provider: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    drop_estimated_delivery: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
  },
  {
    tableName: "sale_order",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

await SaleOrder.sync({ alter: true });
export default SaleOrder;
