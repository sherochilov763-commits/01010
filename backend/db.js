// db.js — SQLite ma'lumotlar bazasini ochish/yaratish
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "uvix.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

// Oddiy key-value jadval: frontend har bir "bo'lim"ni (transactions, employees,
// categories, audit) bitta JSON qiymat sifatida shu yerda saqlaydi.
// Bu Claude artifact'dagi window.storage bilan bir xil ishlaydi, shuning
// uchun frontend kodini deyarli o'zgartirmasdan ko'chirish mumkin bo'ldi.
db.exec(`
  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
module.exports.DB_PATH = DB_PATH;
