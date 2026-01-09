const path = require("path");
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const slugify = require("slugify");

const { initDb, run, get, all } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: __dirname }),
  secret: process.env.SESSION_SECRET || "change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true }
}));

app.use("/public", express.static(path.join(__dirname, "public")));

const uploadDir = path.join(__dirname, "public", "uploads");
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeBase = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
    const stamp = Date.now();
    cb(null, `${stamp}_${safeBase}`);
  }
});
const upload = multer({ storage });

function nowIso() { return new Date().toISOString(); }
function safeSlug(input) { return slugify(input, { lower: true, strict: true, trim: true }); }
function parseJsonSafe(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/admin/login");
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect("/admin/login");
  if (req.session.user.role !== "admin") return res.status(403).send("Forbidden: admin only");
  next();
}

function renderBlocks(blocks) {
  return blocks.map(b => ({ ...b, data: parseJsonSafe(b.data_json, {}) }));
}

let db;
(async () => {
  db = await initDb();

  const fs = require("fs");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const existing = await get(db, "SELECT id FROM users WHERE username=?", ["admin"]);
  if (!existing) {
    const password_hash = await bcrypt.hash("admin123", 10);
    await run(db,
      "INSERT INTO users (username, password_hash, role, created_at) VALUES (?,?,?,?)",
      ["admin", password_hash, "admin", nowIso()]
    );
  }

  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
})().catch(err => { console.error(err); process.exit(1); });

// ---------- Public ----------
app.get("/", async (req, res) => {
  const pages = await all(db, "SELECT * FROM pages WHERE status='published' ORDER BY updated_at DESC");
  res.render("public/home", { pages, user: req.session.user || null });
});

app.get("/p/:slug", async (req, res) => {
  const page = await get(db, "SELECT * FROM pages WHERE slug=? AND status='published'", [req.params.slug]);
  if (!page) return res.status(404).render("public/notfound", { user: req.session.user || null });

  const blocks = await all(db, "SELECT * FROM blocks WHERE page_id=? ORDER BY position ASC", [page.id]);
  res.render("public/page", { page, blocks: renderBlocks(blocks), user: req.session.user || null });
});

// ---------- Admin Auth ----------
app.get("/admin/login", (req, res) => res.render("admin/login", { error: null }));

app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await get(db, "SELECT * FROM users WHERE username=?", [username]);
  if (!user) return res.render("admin/login", { error: "Invalid username or password" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.render("admin/login", { error: "Invalid username or password" });

  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.redirect("/admin");
});

app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// ---------- Admin Dashboard ----------
app.get("/admin", requireAuth, async (req, res) => {
  const pages = await all(db, "SELECT * FROM pages ORDER BY updated_at DESC");
  res.render("admin/dashboard", { user: req.session.user, pages });
});

// Pages CRUD
app.get("/admin/pages/new", requireAuth, (req, res) => {
  res.render("admin/page_form", { user: req.session.user, page: null, error: null });
});

app.post("/admin/pages/new", requireAuth, async (req, res) => {
  const { title, slug, audience, status } = req.body;
  const finalSlug = safeSlug(slug || title || "");
  if (!title || !finalSlug) return res.render("admin/page_form", { user: req.session.user, page: null, error: "Title and slug are required." });

  try {
    const t = nowIso();
    await run(db,
      "INSERT INTO pages (title, slug, audience, status, created_at, updated_at) VALUES (?,?,?,?,?,?)",
      [title, finalSlug, audience || "general", status || "draft", t, t]
    );
    res.redirect("/admin");
  } catch {
    res.render("admin/page_form", { user: req.session.user, page: null, error: "Slug already exists. Choose another." });
  }
});

app.get("/admin/pages/:id/edit", requireAuth, async (req, res) => {
  const page = await get(db, "SELECT * FROM pages WHERE id=?", [req.params.id]);
  if (!page) return res.status(404).send("Page not found");
  res.render("admin/page_form", { user: req.session.user, page, error: null });
});

app.post("/admin/pages/:id/edit", requireAuth, async (req, res) => {
  const { title, slug, audience, status } = req.body;
  const page = await get(db, "SELECT * FROM pages WHERE id=?", [req.params.id]);
  if (!page) return res.status(404).send("Page not found");

  const finalSlug = safeSlug(slug || title || "");
  if (!title || !finalSlug) return res.render("admin/page_form", { user: req.session.user, page, error: "Title and slug are required." });

  try {
    await run(db,
      "UPDATE pages SET title=?, slug=?, audience=?, status=?, updated_at=? WHERE id=?",
      [title, finalSlug, audience || "general", status || "draft", nowIso(), req.params.id]
    );
    res.redirect("/admin");
  } catch {
    res.render("admin/page_form", { user: req.session.user, page, error: "Slug already exists. Choose another." });
  }
});

app.post("/admin/pages/:id/delete", requireAuth, async (req, res) => {
  if (req.session.user.role !== "admin") return res.status(403).send("Only admin can delete pages.");
  await run(db, "DELETE FROM pages WHERE id=?", [req.params.id]);
  res.redirect("/admin");
});

// Blocks
app.get("/admin/pages/:id/blocks", requireAuth, async (req, res) => {
  const page = await get(db, "SELECT * FROM pages WHERE id=?", [req.params.id]);
  if (!page) return res.status(404).send("Page not found");
  const blocks = await all(db, "SELECT * FROM blocks WHERE page_id=? ORDER BY position ASC", [page.id]);
  res.render("admin/blocks", { user: req.session.user, page, blocks: blocks.map(b => ({ ...b, data: parseJsonSafe(b.data_json, {}) })) });
});

app.post("/admin/pages/:id/blocks/add", requireAuth, async (req, res) => {
  const page = await get(db, "SELECT * FROM pages WHERE id=?", [req.params.id]);
  if (!page) return res.status(404).send("Page not found");

  const type = req.body.type;
  const countRow = await get(db, "SELECT COUNT(*) as c FROM blocks WHERE page_id=?", [page.id]);
  const pos = (countRow?.c || 0) + 1;
  const t = nowIso();

  let data = {};
  if (type === "text") data = { heading: "", body: "" };
  if (type === "image") data = { heading: "", imageUrl: "", caption: "" };
  if (type === "video") data = { heading: "", mode: "youtube", youtubeUrl: "", mp4Url: "", caption: "" };
  if (type === "callout") data = { kind: "Key idea", body: "" };
  if (type === "quiz") data = { title: "Quick Quiz", questions: [{ q: "Sample question 1?", options: ["A","B","C","D"], answer: 0 }] };

  await run(db,
    "INSERT INTO blocks (page_id, type, data_json, position, created_at, updated_at) VALUES (?,?,?,?,?,?)",
    [page.id, type, JSON.stringify(data), pos, t, t]
  );
  res.redirect(`/admin/pages/${page.id}/blocks`);
});

app.get("/admin/blocks/:blockId/edit", requireAuth, async (req, res) => {
  const block = await get(db, "SELECT * FROM blocks WHERE id=?", [req.params.blockId]);
  if (!block) return res.status(404).send("Block not found");
  const page = await get(db, "SELECT * FROM pages WHERE id=?", [block.page_id]);
  const data = parseJsonSafe(block.data_json, {});
  res.render("admin/block_edit", { user: req.session.user, page, block, data, error: null });
});

app.post("/admin/blocks/:blockId/edit", requireAuth, async (req, res) => {
  const block = await get(db, "SELECT * FROM blocks WHERE id=?", [req.params.blockId]);
  if (!block) return res.status(404).send("Block not found");
  const page = await get(db, "SELECT * FROM pages WHERE id=?", [block.page_id]);

  const type = block.type;
  let data = {};

  if (type === "text") {
    data = { heading: req.body.heading || "", body: req.body.body || "" };
  } else if (type === "image") {
    data = { heading: req.body.heading || "", imageUrl: req.body.imageUrl || "", caption: req.body.caption || "" };
  } else if (type === "video") {
    data = {
      heading: req.body.heading || "",
      mode: req.body.mode || "youtube",
      youtubeUrl: req.body.youtubeUrl || "",
      mp4Url: req.body.mp4Url || "",
      caption: req.body.caption || ""
    };
  } else if (type === "callout") {
    data = { kind: req.body.kind || "Key idea", body: req.body.body || "" };
  } else if (type === "quiz") {
    const parsed = parseJsonSafe(req.body.quiz_json, null);
    if (!parsed || !Array.isArray(parsed.questions)) {
      return res.render("admin/block_edit", { user: req.session.user, page, block, data: parseJsonSafe(block.data_json, {}), error: "Invalid quiz JSON. Ensure it has { title, questions: [...] }." });
    }
    data = parsed;
  }

  await run(db, "UPDATE blocks SET data_json=?, updated_at=? WHERE id=?", [JSON.stringify(data), nowIso(), block.id]);
  res.redirect(`/admin/pages/${page.id}/blocks`);
});

app.post("/admin/blocks/:blockId/delete", requireAuth, async (req, res) => {
  const block = await get(db, "SELECT * FROM blocks WHERE id=?", [req.params.blockId]);
  if (!block) return res.status(404).send("Block not found");
  const pageId = block.page_id;
  await run(db, "DELETE FROM blocks WHERE id=?", [block.id]);

  const blocks = await all(db, "SELECT * FROM blocks WHERE page_id=? ORDER BY position ASC", [pageId]);
  for (let i = 0; i < blocks.length; i++) {
    await run(db, "UPDATE blocks SET position=?, updated_at=? WHERE id=?", [i + 1, nowIso(), blocks[i].id]);
  }
  res.redirect(`/admin/pages/${pageId}/blocks`);
});

app.post("/admin/blocks/:blockId/move", requireAuth, async (req, res) => {
  const dir = req.body.dir;
  const block = await get(db, "SELECT * FROM blocks WHERE id=?", [req.params.blockId]);
  if (!block) return res.status(404).send("Block not found");
  const pageId = block.page_id;

  const blocks = await all(db, "SELECT * FROM blocks WHERE page_id=? ORDER BY position ASC", [pageId]);
  const idx = blocks.findIndex(b => b.id === block.id);
  if (idx === -1) return res.redirect(`/admin/pages/${pageId}/blocks`);

  let swapIdx = idx;
  if (dir === "up") swapIdx = idx - 1;
  if (dir === "down") swapIdx = idx + 1;
  if (swapIdx < 0 || swapIdx >= blocks.length) return res.redirect(`/admin/pages/${pageId}/blocks`);

  const a = blocks[idx], b = blocks[swapIdx];
  await run(db, "UPDATE blocks SET position=?, updated_at=? WHERE id=?", [b.position, nowIso(), a.id]);
  await run(db, "UPDATE blocks SET position=?, updated_at=? WHERE id=?", [a.position, nowIso(), b.id]);

  res.redirect(`/admin/pages/${pageId}/blocks`);
});

// Media
app.get("/admin/media", requireAuth, async (req, res) => {
  const items = await all(db, "SELECT * FROM media ORDER BY created_at DESC");
  res.render("admin/media", { user: req.session.user, items });
});

app.post("/admin/media/upload", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.redirect("/admin/media");
  const url = `/public/uploads/${req.file.filename}`;
  await run(db,
    "INSERT INTO media (filename, originalname, mimetype, size, url, created_at) VALUES (?,?,?,?,?,?)",
    [req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, url, nowIso()]
  );
  res.redirect("/admin/media");
});

app.post("/admin/media/:id/delete", requireAuth, async (req, res) => {
  if (req.session.user.role !== "admin") return res.status(403).send("Only admin can delete media.");
  const item = await get(db, "SELECT * FROM media WHERE id=?", [req.params.id]);
  if (item) {
    const fs = require("fs");
    const filePath = path.join(__dirname, "public", "uploads", item.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await run(db, "DELETE FROM media WHERE id=?", [item.id]);
  }
  res.redirect("/admin/media");
});

// Users (admin only)
app.get("/admin/users", requireAdmin, async (req, res) => {
  const users = await all(db, "SELECT id, username, role, created_at FROM users ORDER BY created_at DESC");
  res.render("admin/users", { user: req.session.user, users, error: null });
});

app.post("/admin/users/new", requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  const users = await all(db, "SELECT id, username, role, created_at FROM users ORDER BY created_at DESC");
  if (!username || !password) return res.render("admin/users", { user: req.session.user, users, error: "Username and password required." });
  try {
    const password_hash = await bcrypt.hash(password, 10);
    await run(db,
      "INSERT INTO users (username, password_hash, role, created_at) VALUES (?,?,?,?)",
      [username, password_hash, (role === "admin" ? "admin" : "editor"), nowIso()]
    );
    res.redirect("/admin/users");
  } catch {
    res.render("admin/users", { user: req.session.user, users, error: "Username already exists." });
  }
});

app.post("/admin/users/:id/delete", requireAdmin, async (req, res) => {
  if (parseInt(req.params.id, 10) === req.session.user.id) return res.status(400).send("You cannot delete yourself.");
  await run(db, "DELETE FROM users WHERE id=?", [req.params.id]);
  res.redirect("/admin/users");
});
