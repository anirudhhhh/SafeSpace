const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const { Server } = require("socket.io");
const { config, connectDB, redis } = require("./config");
const requestLogger = require("./middleware/requestLogger");
const limiter = require("./middleware/rateLimiter");
const authRoutes = require("./routes/auth");
const chatRoutes = require("./routes/chat");
const forumRoutes = require("./routes/forum");
const { setupSocket } = require("./socket");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["polling", "websocket"],
});

app.use(requestLogger);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: "10kb" }));

app.use("/api", limiter);

app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/forum", forumRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong" });
});

setupSocket(io);

async function start() {
  await connectDB();

  if (redis) {
    try {
      await redis.connect();
    } catch (err) {
      console.warn("Redis connection failed, continuing without Redis");
    }
  }

  server.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
}

start();
