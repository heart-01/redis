const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const redis = require("redis");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// config socket.io with cors
const io = new Server(server, {
  cors: {
    origin: "http://localhost:8000",
    methods: ["GET", "POST"],
  },
});

// config cors for express
app.use(
  cors({
    origin: "http://localhost:8000",
  })
);

const redisClient = redis.createClient({
  url: "redis://localhost:6379",
});

redisClient.on("error", (err) => {
  console.log("Redis error:", err);
});

(async () => {
  await redisClient.connect();
})();

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// save message to Redis
async function saveMessage(message) {
  await redisClient.lPush("messages", JSON.stringify(message));
}

// get messages from Redis
async function getMessages() {
  const messages = await redisClient.lRange("messages", 0, -1);
  return messages.map((message) => JSON.parse(message));
}

io.on("connection", (socket) => {
  console.log("a user connected");

  getMessages().then((messages) => {
    messages.forEach((message) => {
      socket.emit("chat message", message);
    });
  });

  socket.on("chat message", async (msg) => {
    const message = { user: socket.id, text: msg, timestamp: new Date() };
    io.emit("chat message", message);
    await saveMessage(message);
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
