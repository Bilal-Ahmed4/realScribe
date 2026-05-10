require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");

// Import routes
const authRoutes = require("./routes/auth");
const roomRoutes = require("./routes/room");
const drawingRoutes = require("./routes/drawing");
const textRoutes = require("./routes/text");
const presenceRoutes = require("./routes/presence");

// Import socket handlers
const registerSocketHandlers = require("./socket/handlers");

const app = express();
const server = http.createServer(app);

// --- Configuration ---
const PORT = process.env.PORT || 3001;
const CORS_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());

// --- Middleware ---
app.use(
  cors({
    origin: CORS_ORIGINS,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["*"],
    credentials: true,
  }),
);
app.use(express.json());

// --- REST Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/room", roomRoutes);
app.use("/api/draw", drawingRoutes);
app.use("/api/text", textRoutes);
app.use("/api", presenceRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- Socket.IO ---
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
  pingInterval: 10000,
  pingTimeout: 5000,
});

registerSocketHandlers(io);

// --- MongoDB Connection ---
const MONGODB_URI = process.env.MONGODB_URI;
const MONGO_RETRY_MS = 5000;
let mongoConnected = false;
let mongoConnectInFlight = false;

const connectMongoWithRetry = async () => {
  if (!MONGODB_URI) {
    console.error("ERROR: MONGODB_URI environment variable is not set.");
    console.error(
      `Server is running, but database-dependent routes will fail until MONGODB_URI is configured.`,
    );
    return;
  }

  if (mongoConnected || mongoConnectInFlight) return;
  mongoConnectInFlight = true;

  try {
    await mongoose.connect(MONGODB_URI);
    mongoConnected = true;
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err.message);
    console.error(`Retrying MongoDB connection in ${MONGO_RETRY_MS / 1000}s...`);
    setTimeout(connectMongoWithRetry, MONGO_RETRY_MS);
  } finally {
    mongoConnectInFlight = false;
  }
};

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`CORS origins: ${CORS_ORIGINS.join(", ")}`);
  connectMongoWithRetry();
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down...");
  server.close(() => {
    mongoose.connection.close(false, () => {
      process.exit(0);
    });
  });
});
