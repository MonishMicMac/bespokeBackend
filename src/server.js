import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import sequelize from "../config/db.js";
import Chat from "../models/index.js";
import SaleOrderHistory from "../models/SaleOrderHistory.js";
import SaleOrder from "../models/SaleOrder.js";
import cors from "cors";

import "./redis/orderSubscriber.js"; // Listen to Redis Jobs
import { initSocket } from "./sockets/socket.js";
import orderRoutes from "./routes/orderRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import signupRoutes from "./routes/signupRoutes.js";
import saleOrderRoutes from "./routes/saleOrderRoutes.js";
import refundRoutes from "./routes/refundRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import customerAuthRoutes from "./routes/customerAuthRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import homepageRoutes from "./routes/homepageRoutes.js";
import wishlistRoutes from "./routes/wishlistRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import vendorDesignerRoutes from "./routes/vendorDesignerRoutes.js";
import userCartRoutes from "./routes/userCartRoutes.js";
import userWishlistRoutes from "./routes/userWishlistRoutes.js";
import userAddressRoutes from "./routes/userAddressRoutes.js";
import measurementRoutes from "./routes/measurementRoutes.js";
import promoRoutes from "./routes/promoRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const corsOptions = {
  origin: true,
  credentials: true, // This allows cookies to be sent/received
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], // Allowed methods
  allowedHeaders: ["Content-Type", "Authorization"], // Allowed headers
};

app.use(cors(corsOptions));
const server = http.createServer(app);

app.use(
  express.json({
    limit: "15mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📡 [bespokeBackend API] ${req.method} ${req.url}`);
  next();
});

// Homepage & Discovery Highlights Migrated Routes (Laravel API contracts)
app.use("/api", homepageRoutes);
app.use("/", homepageRoutes);

// Customer Authentication & Profile Migrated Routes (Laravel API contracts)
app.use("/api", userRoutes);
app.use("/", userRoutes);

// Customer Authentication & Account routes (Legacy / Alternative)
app.use("/api/auth", customerAuthRoutes);
app.use("/api", customerAuthRoutes);

// Boutiques & Designers Migrated Routes (Laravel API contracts)
app.use("/api", vendorDesignerRoutes);
app.use("/", vendorDesignerRoutes);

// Shopping Bag / Cart Migrated Routes (Laravel API contracts)
app.use("/api", userCartRoutes);
app.use("/", userCartRoutes);

// Wishlist / Favorites Migrated Routes (Laravel API contracts)
app.use("/api", userWishlistRoutes);
app.use("/", userWishlistRoutes);

// Customer Delivery Address Migrated Routes (Laravel API contracts)
app.use("/api", userAddressRoutes);
app.use("/", userAddressRoutes);

// Bespoke Measurement Engine Migrated Routes (Laravel API contracts)
app.use("/api", measurementRoutes);
app.use("/", measurementRoutes);

// Coupons & Discounts Migrated Routes (Laravel API contracts)
app.use("/api", promoRoutes);
app.use("/", promoRoutes);

// Customer Reviews Migrated Routes (Laravel API contracts)
app.use("/api", reviewRoutes);
app.use("/", reviewRoutes);

// Customer Wishlist / Favourites routes
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/favourites", wishlistRoutes);

// Customer Shopping Bag / Cart routes
app.use("/api/cart", cartRoutes);
app.use("/api/bag", cartRoutes);

// Product and catalog routes
app.use("/api", productRoutes);
app.use("/api/vendor", productRoutes);
app.use("/api/products", productRoutes);
app.use("/", productRoutes);

// Other business routes
app.use("/api", orderRoutes);
app.use("/bespoke-api", orderRoutes);
app.use("/", orderRoutes);
app.use("/api/vendor", orderRoutes);
app.use("/api/vendor", saleOrderRoutes);
app.use("/api/chat", chatRoutes);
app.use("/chat", chatRoutes);
app.use("/api/vendor", signupRoutes);
app.use("/api/vendor", refundRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/vendor/notifications", notificationRoutes);
app.use("/notifications", notificationRoutes);
app.use("/vendor/notifications", notificationRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: true, message: "bespokeBackend is running", port: PORT });
});

const io = new Server(server, {
  cors: { origin: "*" }
});

// Initialize socket handling
initSocket(io);

async function connectDB() {
  try {
    await sequelize.authenticate();
    console.log("✅ Database Connected Successfully");
    try {
      const [cols] = await sequelize.query("SHOW COLUMNS FROM `messages` LIKE 'sale_order_id'");
      if (!cols || cols.length === 0) {
        await sequelize.query("ALTER TABLE `messages` ADD COLUMN `sale_order_id` BIGINT UNSIGNED NULL AFTER `receiverType`, ADD INDEX `idx_messages_sale_order_id` (`sale_order_id`)");
        console.log("✅ Added sale_order_id column to messages table");
      }
    } catch (e) {
      console.warn("Notice checking messages sale_order_id column:", e.message);
    }
  } catch (error) {
    console.error("❌ Database Connection Failed:", error);
  }
}

connectDB();

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
