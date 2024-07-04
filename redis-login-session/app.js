const express = require("express");
const bodyParser = require("body-parser");
const redis = require("redis");
const session = require("express-session");
const RedisStore = require("connect-redis").default;

const app = express();
app.use(bodyParser.json());

const redisClient = redis.createClient({
  url: "redis://localhost:6379",
});

redisClient.on("error", (err) => {
  console.log("Redis error:", err);
});

(async () => {
  await redisClient.connect();
})();

app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: "@$FG%$%%^HGHFGHE#$",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, HttpOnly: false, SameSite: "strict" },
  })
);

app.post("/login", (req, res) => {
  const { username } = req.body;
  if (username) {
    req.session.username = username; // Store the username in the session
    res.status(200).json({ message: "Logged in" });
  } else {
    res.status(400).json({ message: "Invalid username" });
  }
});

app.get("/status", (req, res) => {
  if (req.session.username) {
    res.status(200).json({ loggedIn: true, username: req.session.username });
  } else {
    res.status(401).json({ loggedIn: false });
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ message: "Failed to logout" });
    }

    res.status(200).json({ message: "Logged out" });
  });
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
