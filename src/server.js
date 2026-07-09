import express from "express";
import http from "http";
import { Server } from "socket.io";
import sequelize from "../config/db.js";
import Chat from "../models/index.js";
import cors from "cors";

import "./redis/orderSubscriber.js"; // Listen to Redis Jobs
import { initSocket } from "./sockets/socket.js";
import orderRoutes from "./routes/orderRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import signupRoutes from "./routes/signupRoutes.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const corsOptions = {
  origin: true,
  credentials: true, // This allows cookies to be sent/received
  methods: ["GET", "POST", "PUT", "DELETE"], // Allowed methods
  allowedHeaders: ["Content-Type", "Authorization"], // Allowed headers
};

app.use(cors(corsOptions));
const server = http.createServer(app);

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use("/api", orderRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/vendor", signupRoutes);


const io = new Server(server, {
  cors: { origin: "*" }
});

// Initialize socket handling
initSocket(io);

async function connectDB() {
  try {
    await sequelize.authenticate();
    console.log("✅ Database Connected Successfully");
  } catch (error) {
    console.error("❌ Database Connection Failed:", error);
  }
}

connectDB();




const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});


