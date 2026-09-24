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

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use("/api", orderRoutes);
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


