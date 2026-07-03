import express from "express";
import http from "http";
import { Server } from "socket.io";

import "./redis/orderSubscriber.js"; // Listen to Redis Jobs
import { initSocket } from "./sockets/socket.js";
import orderRoutes from "./routes/orderRoutes.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use("/api", orderRoutes);

const io = new Server(server, {
  cors: { origin: "*" }
});

// Initialize socket handling
initSocket(io);

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});


