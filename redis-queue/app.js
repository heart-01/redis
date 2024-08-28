const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const redis = require("redis");
const RedisStore = require("connect-redis").default;
const sqlite3 = require("sqlite3").verbose();
const Queue = require("bull");
const nodemailer = require("nodemailer");

const app = express();
app.use(bodyParser.json());

const db = new sqlite3.Database("database.sqlite");
db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, email TEXT)");
});

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

// Create a new Bull queue for processing background jobs (emails)
const emailQueue = new Queue("emailQueue", {
  redis: { url: "redis://localhost:6379" },
});

emailQueue.process(async (job) => {
  console.log("Processing email job:", job.id, job.data);

  try {
    // config nodemailer transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "your-email@gmail.com",
        pass: "your-email-password",
      },
    });

    // info email
    const mailOptions = {
      from: '"Your App" <your-email@gmail.com>',
      to: job.data.email,
      subject: "Welcome to Our Service",
      text: `Hello ${job.data.username}, welcome to our service!`,
      html: `<b>Hello ${job.data.username}</b>, <br> Welcome to our service!`,
    };

    // send email
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: %s", info.messageId);
  } catch (error) {
    console.error("Error processing email job:", error);
  }
});

app.post("/register", async (req, res) => {
  const { username, email } = req.body;
  try {
    await new Promise((resolve, reject) => {
      db.run("INSERT INTO users (username, email) VALUES (?, ?)", [username, email], function (err) {
        if (err) reject(err);
        resolve(this.lastID);
      });
    });
    const lastID = await new Promise((resolve, reject) => {
      db.get("SELECT last_insert_rowid() as id", (err, row) => {
        if (err) reject(err);
        resolve(row.id);
      });
    });

    // Add a new job to the email queue
    await emailQueue.add({ username, email });

    res.json({ id: lastID, username, email });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/login", (req, res) => {
  const { username } = req.body;
  if (username) {
    req.session.username = username;
    res.json({ message: "Logged in" });
  }
  res.status(400).json({ error: "Username is required" });
});

app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.json({ message: "Logged out" });
  });
});

app.get("/status", (req, res) => {
  if (req.session.username) {
    res.json({ loggedIn: true, username: req.session.username });
  }
  res.json({ loggedIn: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
