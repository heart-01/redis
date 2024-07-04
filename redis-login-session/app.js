const express = require("express");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();
const redis = require("redis");
const session = require("express-session");
const RedisStore = require("connect-redis").default;

const app = express();
app.use(bodyParser.json());

const db = new sqlite3.Database("database.sqlite");
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
    cookie: { secure: false },
  })
);

db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS authors (id INTEGER PRIMARY KEY, name TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS books (id INTEGER PRIMARY KEY, title TEXT, author_id INTEGER, FOREIGN KEY(author_id) REFERENCES authors(id))");
});

const REDIS_EXPIRED = 3600;

// Create author
app.post("/authors", async (req, res) => {
  const { name } = req.body;
  try {
    await new Promise((resolve, reject) => {
      db.run("INSERT INTO authors (name) VALUES (?)", [name], (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.lastID);
      });
    });
    const lastId = await new Promise((resolve, reject) => {
      db.get("SELECT last_insert_rowid() as id", (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row.id);
      });
    });
    res.status(201).json({ id: lastId, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get authors
app.get("/authors", async (req, res) => {
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all("SELECT * FROM authors", [], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
    res.status(201).json({ authors: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create book
app.post("/books", async (req, res) => {
  const { title, author_id } = req.body;
  try {
    await new Promise((resolve, reject) => {
      db.run("INSERT INTO books (title, author_id) VALUES (?, ?)", [title, author_id], (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.lastID);
      });
    });
    const lastId = await new Promise((resolve, reject) => {
      db.get("SELECT last_insert_rowid() as id", (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row.id);
      });
    });
    await redisClient.del("books"); // Clear cache
    res.status(201).json({ id: lastId, title, author_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get books
app.get("/books", async (req, res) => {
  try {
    const booksCache = await redisClient.get("books");
    if (booksCache) {
      res.status(200).json({ books: JSON.parse(booksCache) });
      return;
    }
    const rows = await new Promise((resolve, reject) => {
      db.all("SELECT * FROM books", [], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
    await redisClient.setEx("books", REDIS_EXPIRED, JSON.stringify(rows));
    res.status(201).json({ books: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
