const express = require("express");
const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "erp.sqlite");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let db;

function saveDatabase() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function run(sql, params = []) {
  db.run(sql, params);
}

function all(sql, params = []) {
  const statement = db.prepare(sql);
  statement.bind(params);
  const rows = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  return rows;
}

function one(sql, params = []) {
  return all(sql, params)[0] || null;
}

function validProduct(body) {
  const name = String(body.name || "").trim();
  const category = String(body.category || "").trim();
  const price = Number(body.price);
  const stock = Number(body.stock);
  if (!name || !category) return "Product name and category are required.";
  if (!Number.isFinite(price) || price < 0) return "Price must be zero or more.";
  if (!Number.isInteger(stock) || stock < 0) return "Stock must be a whole number, zero or more.";
  return null;
}

initSqlJs().then(SQL => {
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  if (one("SELECT id FROM products LIMIT 1") === null) {
    run("INSERT INTO products (name, category, price, stock) VALUES (?, ?, ?, ?)",
      ["Rice 1kg", "Grocery", 320, 25]);
    run("INSERT INTO products (name, category, price, stock) VALUES (?, ?, ?, ?)",
      ["Cooking Oil 1L", "Grocery", 590, 18]);
    run("INSERT INTO products (name, category, price, stock) VALUES (?, ?, ?, ?)",
      ["Laundry Soap", "Household", 180, 40]);
    saveDatabase();
  }

  // READ: list products, with optional search and category filter.
  app.get("/api/products", (req, res) => {
    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "").trim();
    let sql = "SELECT * FROM products WHERE name LIKE ?";
    const params = [`%${search}%`];
    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }
    sql += " ORDER BY id DESC";
    res.json(all(sql, params));
  });

  app.get("/api/categories", (req, res) => {
    res.json(all("SELECT DISTINCT category FROM products ORDER BY category"));
  });

  // CREATE: add a product.
  app.post("/api/products", (req, res) => {
    const error = validProduct(req.body);
    if (error) return res.status(400).json({ error });
    const { name, category, price, stock } = req.body;
    run("INSERT INTO products (name, category, price, stock) VALUES (?, ?, ?, ?)",
      [String(name).trim(), String(category).trim(), Number(price), Number(stock)]);
    saveDatabase();
    res.status(201).json(one("SELECT * FROM products WHERE id = last_insert_rowid()"));
  });

  // UPDATE: edit a product.
  app.put("/api/products/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid product ID." });
    const existing = one("SELECT id FROM products WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ error: "Product not found." });
    const error = validProduct(req.body);
    if (error) return res.status(400).json({ error });
    const { name, category, price, stock } = req.body;
    run("UPDATE products SET name = ?, category = ?, price = ?, stock = ? WHERE id = ?",
      [String(name).trim(), String(category).trim(), Number(price), Number(stock), id]);
    saveDatabase();
    res.json(one("SELECT * FROM products WHERE id = ?", [id]));
  });

  // DELETE: remove a product.
  app.delete("/api/products/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = one("SELECT id FROM products WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ error: "Product not found." });
    run("DELETE FROM products WHERE id = ?", [id]);
    saveDatabase();
    res.json({ message: "Product deleted successfully." });
  });

  app.get("/api/summary", (req, res) => {
    res.json({
      totalProducts: one("SELECT COUNT(*) AS count FROM products").count,
      totalUnits: one("SELECT COALESCE(SUM(stock), 0) AS count FROM products").count,
      inventoryValue: one("SELECT COALESCE(SUM(price * stock), 0) AS total FROM products").total
    });
  });

  app.listen(PORT, () => {
    console.log(`Store ERP is running at http://localhost:${PORT}`);
    console.log(`Database file: ${DB_PATH}`);
  });
}).catch(error => {
  console.error("Could not start the ERP:", error);
  process.exit(1);
});