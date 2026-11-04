import Product from "./Product.js";
import ProductMaterial from "./ProductMaterial.js";
import ProductPrice from "./ProductPrice.js";
import ProductImage from "./ProductImage.js";
import ProductMaterialImage from "./ProductMaterialImage.js";
import ProductInfo from "./ProductInfo.js";
import ProductAddon from "./ProductAddon.js";
import ProductAddonImage from "./ProductAddonImage.js";
import ProductMeasurement from "./ProductMeasurement.js";
import Measurement from "./Measurement.js";
import ProductSize from "./ProductSize.js";
import Size from "./Size.js";
import ProductReviewAggregate from "./ProductReviewAggregate.js";
import SaleOrder from "./SaleOrder.js";
import SaleOrderHistory from "./SaleOrderHistory.js";
import SaleOrderReview from "./SaleOrderReview.js";
import SaleOrderReviewImage from "./SaleOrderReviewImage.js";
import CustomerReview from "./CustomerReview.js";
import ReviewImage from "./ReviewImage.js";
import VendorLogin from "./VendorLogin.js";
import UserLogin from "./UserLogin.js";
import UserFavourites from "./UserFavourites.js";
import UserCartItem from "./UserCartItem.js";
import CartAddon from "./CartAddon.js";
import Category from "./Category.js";
import Subcategory from "./Subcategory.js";
import VendorPortfolioImage from "./VendorPortfolioImage.js";
import DesignerPortfolio from "./DesignerPortfolio.js";
import DesignerSpecialities from "./DesignerSpecialities.js";
import ShopWishlist from "./ShopWishlist.js";
import Designer from "./Designer.js";
import DesignerWishlist from "./DesignerWishlist.js";
import UserAddress from "./UserAddress.js";
import Order from "./Order.js";
import CustomerMeasurementName from "./CustomerMeasurementName.js";
import CustomerMeasurement from "./CustomerMeasurement.js";
import Promocode, { PromoCode } from "./Promocode.js";
import DeliveryCharge from "./DeliveryCharge.js";
import Commission from "./Commission.js";
import Refund from "./Refund.js";
import ReturnProduct from "./ReturnProduct.js";
import SaleOrderShipment from "./SaleOrderShipment.js";
import OrderAddon from "./OrderAddon.js";

let associationsInitialized = false;

export function initProductAssociations() {
  if (associationsInitialized) return;
  associationsInitialized = true;

  // Product relationships
  Product.belongsTo(VendorLogin, { foreignKey: "vendor_id", as: "vendor" });
  Product.belongsTo(Category, { foreignKey: "category", as: "categoryRel" });
  Product.belongsTo(Subcategory, { foreignKey: "subcategory", as: "subcategoryRel" });
  Product.hasMany(ProductInfo, { foreignKey: "product_id", as: "productInfo" });
  Product.hasMany(ProductPrice, { foreignKey: "product_id", as: "prices" });
  Product.hasMany(ProductMaterial, { foreignKey: "product_id", as: "productMaterials" });
  Product.hasMany(ProductImage, { foreignKey: "product_id", as: "images" });
  Product.hasMany(ProductMaterialImage, { foreignKey: "product_id", as: "materialImages" });
  Product.hasMany(ProductMeasurement, { foreignKey: "product_id", as: "product_measurements" });
  Product.hasMany(ProductSize, { foreignKey: "product_id", as: "productSizes" });
  Product.hasMany(ProductAddon, { foreignKey: "product_id", as: "addons" });
  Product.hasOne(ProductReviewAggregate, { foreignKey: "product_id", as: "reviewAggregate" });

  // ProductMaterial relationships
  ProductMaterial.belongsTo(Product, { foreignKey: "product_id", as: "product" });
  ProductMaterial.hasMany(ProductMaterialImage, { foreignKey: "product_material_id", as: "images" });
  ProductMaterial.hasMany(ProductPrice, { foreignKey: "material_id", as: "prices" });
  ProductMaterial.hasMany(ProductAddon, { foreignKey: "material_id", as: "addons" });

  // ProductPrice relationships
  ProductPrice.belongsTo(Product, { foreignKey: "product_id", as: "product" });
  ProductPrice.belongsTo(ProductMaterial, { foreignKey: "material_id", as: "material" });
  ProductPrice.belongsTo(Size, { foreignKey: "size", as: "sizeRel" });

  // ProductImage
  ProductImage.belongsTo(Product, { foreignKey: "product_id", as: "product" });

  // ProductMaterialImage
  ProductMaterialImage.belongsTo(Product, { foreignKey: "product_id", as: "product" });
  ProductMaterialImage.belongsTo(ProductMaterial, { foreignKey: "product_material_id", as: "material" });

  // ProductInfo
  ProductInfo.belongsTo(Product, { foreignKey: "product_id", as: "product" });

  // ProductAddon
  ProductAddon.belongsTo(Product, { foreignKey: "product_id", as: "product" });
  ProductAddon.belongsTo(ProductMaterial, { foreignKey: "material_id", as: "material" });
  ProductAddon.hasMany(ProductAddonImage, { foreignKey: "addon_id", as: "addonImages" });

  // ProductAddonImage
  ProductAddonImage.belongsTo(ProductAddon, { foreignKey: "addon_id", as: "addon" });

  // ProductMeasurement
  ProductMeasurement.belongsTo(Product, { foreignKey: "product_id", as: "product" });
  ProductMeasurement.belongsTo(Measurement, { foreignKey: "measurement_id", as: "measurement" });

  // ProductSize
  ProductSize.belongsTo(Product, { foreignKey: "product_id", as: "product" });
  ProductSize.belongsTo(Measurement, { foreignKey: "measurement_id", as: "measurement" });

  // ProductReviewAggregate
  ProductReviewAggregate.belongsTo(Product, { foreignKey: "product_id", as: "product" });

  // SaleOrder relationships
  SaleOrder.belongsTo(Product, { foreignKey: "product_id", as: "product" });
  SaleOrder.belongsTo(ProductPrice, { foreignKey: "price_id", as: "priceRelation" });
  SaleOrder.belongsTo(ProductMaterial, { foreignKey: "material_id", as: "material" });
  SaleOrder.belongsTo(VendorLogin, { foreignKey: "vendor_id", as: "vendor" });
  SaleOrder.belongsTo(Order, { foreignKey: "order_id", as: "order" });
  SaleOrder.hasMany(SaleOrderHistory, { foreignKey: "sale_order_id", as: "statusHistory" });
  SaleOrder.hasMany(OrderAddon, { foreignKey: "sale_id", as: "addons" });
  SaleOrder.hasOne(ReturnProduct, { foreignKey: "sale_order_id", as: "returnProduct" });
  SaleOrder.hasOne(Refund, { foreignKey: "sale_order_id", as: "refund" });
  SaleOrder.hasMany(SaleOrderShipment, { foreignKey: "sale_order_id", as: "shipments" });
  SaleOrder.hasOne(SaleOrderReview, { foreignKey: "sale_order_id", as: "review" });

  // SaleOrderHistory relationships
  SaleOrderHistory.belongsTo(SaleOrder, { foreignKey: "sale_order_id", as: "saleOrder" });

  // Order relationships
  Order.hasMany(SaleOrder, { foreignKey: "order_id", as: "items" });
  Order.hasMany(SaleOrder, { foreignKey: "order_id", as: "saleOrders" });
  Order.belongsTo(UserLogin, { foreignKey: "user_id", as: "user" });
  UserLogin.hasMany(Order, { foreignKey: "user_id", as: "orders" });
  Order.hasMany(Refund, { foreignKey: "order_id", as: "refunds" });

  // OrderAddon relationships
  OrderAddon.belongsTo(SaleOrder, { foreignKey: "sale_id", as: "saleOrder" });
  OrderAddon.belongsTo(ProductAddon, { foreignKey: "addon_id", as: "productAddon" });

  // ReturnProduct relationships
  ReturnProduct.belongsTo(SaleOrder, { foreignKey: "sale_order_id", as: "saleOrder" });

  // Refund relationships
  Refund.belongsTo(SaleOrder, { foreignKey: "sale_order_id", as: "saleOrder" });
  Refund.belongsTo(Order, { foreignKey: "order_id", as: "order" });
  Refund.belongsTo(UserLogin, { foreignKey: "user_id", as: "user" });

  // SaleOrderShipment relationships
  SaleOrderShipment.belongsTo(SaleOrder, { foreignKey: "sale_order_id", as: "saleOrder" });

  // SaleOrderReview
  SaleOrderReview.belongsTo(SaleOrder, { foreignKey: "sale_order_id", as: "saleOrder" });
  SaleOrderReview.belongsTo(UserLogin, { foreignKey: "user_id", as: "user" });
  SaleOrderReview.hasMany(SaleOrderReviewImage, { foreignKey: "review_id", as: "images" });

  // SaleOrderReviewImage
  SaleOrderReviewImage.belongsTo(SaleOrderReview, { foreignKey: "review_id", as: "review" });

  // CustomerReview
  CustomerReview.belongsTo(Product, { foreignKey: "product_id", as: "product" });
  CustomerReview.belongsTo(UserLogin, { foreignKey: "user_id", as: "user" });
  CustomerReview.hasMany(ReviewImage, { foreignKey: "customer_review_id", as: "reviewImages" });

  // ReviewImage
  ReviewImage.belongsTo(CustomerReview, { foreignKey: "customer_review_id", as: "customerReview" });

  // UserCartItem
  UserCartItem.belongsTo(ProductPrice, { foreignKey: "price_id", as: "priceRelation" });
  UserCartItem.belongsTo(UserLogin, { foreignKey: "user_id", as: "user" });
  UserCartItem.hasMany(CartAddon, { foreignKey: "cart_id", as: "cartAddons" });
  CartAddon.belongsTo(UserCartItem, { foreignKey: "cart_id", as: "cartItem" });
  CartAddon.belongsTo(ProductAddon, { foreignKey: "add_on_id", as: "productAddon" });
  ProductAddon.hasMany(CartAddon, { foreignKey: "add_on_id", as: "cartAddons" });

  // UserFavourites
  UserFavourites.belongsTo(ProductPrice, { foreignKey: "price_id", as: "priceRelation" });
  UserFavourites.belongsTo(UserLogin, { foreignKey: "user_id", as: "user" });

  // UserAddress & Order relationships
  UserAddress.belongsTo(UserLogin, { foreignKey: "user_id", as: "user" });
  UserLogin.hasMany(UserAddress, { foreignKey: "user_id", as: "addresses" });
  Order.belongsTo(UserAddress, { foreignKey: "address_id", as: "address" });
  UserAddress.hasMany(Order, { foreignKey: "address_id", as: "orders" });

  // CustomerMeasurement & CustomerMeasurementName relationships
  CustomerMeasurementName.belongsTo(UserLogin, { foreignKey: "user_id", as: "user" });
  UserLogin.hasMany(CustomerMeasurementName, { foreignKey: "user_id", as: "measurementProfiles" });
  CustomerMeasurementName.hasMany(CustomerMeasurement, { foreignKey: "customer_measurement_name_id", as: "measurements" });
  CustomerMeasurement.belongsTo(CustomerMeasurementName, { foreignKey: "customer_measurement_name_id", as: "measurementName" });
  CustomerMeasurement.belongsTo(Measurement, { foreignKey: "measurement_id", as: "measurement" });
  CustomerMeasurement.belongsTo(UserLogin, { foreignKey: "cust_id", as: "user" });
  Measurement.hasMany(CustomerMeasurement, { foreignKey: "measurement_id", as: "customerMeasurements" });

  // Promocode & Order relationships (orders.coupen_id -> promo_codes.id)
  Order.belongsTo(Promocode, { foreignKey: "coupen_id", as: "promocode" });
  Promocode.hasMany(Order, { foreignKey: "coupen_id", as: "orders" });
}

initProductAssociations();

export {
  Product,
  ProductMaterial,
  ProductPrice,
  ProductImage,
  ProductMaterialImage,
  ProductInfo,
  ProductAddon,
  ProductAddonImage,
  ProductMeasurement,
  Measurement,
  ProductSize,
  Size,
  ProductReviewAggregate,
  SaleOrder,
  SaleOrderHistory,
  SaleOrderReview,
  SaleOrderReviewImage,
  CustomerReview,
  ReviewImage,
  VendorLogin,
  UserLogin,
  UserFavourites,
  UserCartItem,
  UserCartItem as UserCart,
  CartAddon,
  Category,
  Subcategory,
  VendorPortfolioImage,
  DesignerPortfolio,
  DesignerSpecialities,
  ShopWishlist,
  Designer,
  DesignerWishlist,
  UserAddress,
  Order,
  CustomerMeasurementName,
  CustomerMeasurement,
  Promocode,
  PromoCode,
  DeliveryCharge,
  Commission,
  Refund,
  ReturnProduct,
  SaleOrderShipment,
  OrderAddon,
};
