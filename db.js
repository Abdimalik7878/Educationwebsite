const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data.sqlite");

function openDb() {
  return new sqlite3.Database(DB_PATH);
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, function (err, row) {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, function (err, rows) {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initDb() {
  const db = openDb();

  await run(db, `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','editor')),
      created_at TEXT NOT NULL
    )
  `);

  await run(db, `
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      audience TEXT NOT NULL CHECK(audience IN ('junior','undergrad','general')),
      status TEXT NOT NULL CHECK(status IN ('draft','published')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await run(db, `
    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('text','image','video','callout','quiz')),
      data_json TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(page_id) REFERENCES pages(id) ON DELETE CASCADE
    )
  `);

  await run(db, `
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      originalname TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      size INTEGER NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  return db;
}

module.exports = { openDb, initDb, run, get, all };
