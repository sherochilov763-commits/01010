// storage-stats.js — Sozlamalar → Ma'lumotlar → «Xotira»: baza hajmi, buyurtmalar soni, rasmlar va chat fayllari qancha joy egallagani.
// Diskdagi papkalar har so'rovda emas, 60 soniyada bir marta sanaladi.
const fs = require("fs");
const path = require("path");

function dirStats(dir, filter) {
  let size = 0, count = 0;
  const walk = (d) => {
    let list = [];
    try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (filter && !filter(e.name)) continue;
      try { size += fs.statSync(p).size; count++; } catch { /* o'chirilgan */ }
    }
  };
  walk(dir);
  return { size, count };
}
const fileSize = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };

function compute({ dbPath, uploadsDir, attDir, getStmt }) {
  const json = (k, d) => { try { return JSON.parse(getStmt.get(k)?.value || "null") ?? d; } catch { return d; } };
  const orders = json("uvix:orders", []);
  const live = (orders || []).filter((o) => o && !o.deletedAt);
  // Buyurtmalarga biriktirilgan fayllar (asosiy rasm + kichik nusxa)
  const orderFiles = new Set();
  for (const o of orders || []) for (const p of (o && o.photos) || []) { if (p?.filename) orderFiles.add(p.filename); if (p?.thumbFilename) orderFiles.add(p.thumbFilename); }
  const photos = dirStats(uploadsDir, (n) => orderFiles.has(n));
  const other = dirStats(uploadsDir, (n) => !orderFiles.has(n));
  const att = dirStats(attDir);
  const db = fileSize(dbPath) + fileSize(dbPath + "-wal");
  let disk = null;
  try { const s = fs.statfsSync(path.dirname(dbPath)); disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize }; } catch { /* eski Node */ }
  const ordersJson = (getStmt.get("uvix:orders")?.value || "").length;
  return {
    at: new Date().toISOString(),
    db: { size: db, orders: live.length, ordersBytes: ordersJson, transactions: (json("uvix:transactions", []) || []).filter((t) => t && !t.deletedAt).length, leads: (json("uvix:leads", []) || []).length },
    files: { orderPhotos: photos, chat: other, attendance: att },
    total: db + photos.size + other.size + att.size,
    disk,
    // ~5000+ buyurtmada telefonlar sekinlasha boshlaydi — oldindan aytamiz
    archiveHint: live.length >= 5000,
  };
}

module.exports = function registerStorageStats(app, { requireAuth, requireAdmin, dbPath, uploadsDir, attDir, getStmt }) {
  let cache = null;
  app.get("/api/system/storage", requireAuth, requireAdmin, (req, res) => {
    if (!cache || Date.now() - cache.t > 60000 || req.query.fresh) cache = { t: Date.now(), v: compute({ dbPath, uploadsDir, attDir, getStmt }) };
    res.json(cache.v);
  });
  return { compute: () => compute({ dbPath, uploadsDir, attDir, getStmt }) };
};
module.exports.compute = compute;
