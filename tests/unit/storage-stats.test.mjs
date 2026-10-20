// «Xotira» (25-band): buyurtma rasmlari, chat fayllari, davomat va baza alohida sanaladi
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { compute } = require("../../backend/storage-stats.js");

test("xotira: rasm + kichik nusxa — buyurtmaniki, qolgani — chat; o'chirilgan buyurtma sanalmaydi", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uvix-st-"));
  const up = path.join(dir, "uploads"), att = path.join(dir, "attendance-photos", "2026-10");
  fs.mkdirSync(up, { recursive: true }); fs.mkdirSync(att, { recursive: true });
  fs.writeFileSync(path.join(up, "a.jpg"), Buffer.alloc(1000));
  fs.writeFileSync(path.join(up, "a_t.jpg"), Buffer.alloc(100));
  fs.writeFileSync(path.join(up, "chat.mp4"), Buffer.alloc(5000));
  fs.writeFileSync(path.join(att, "x.jpg"), Buffer.alloc(300));
  const dbPath = path.join(dir, "uvix.db"); fs.writeFileSync(dbPath, Buffer.alloc(2000));
  const kv = {
    "uvix:orders": JSON.stringify([{ id: "1", photos: [{ filename: "a.jpg", thumbFilename: "a_t.jpg" }] }, { id: "2", deletedAt: "x" }]),
    "uvix:transactions": "[]", "uvix:leads": "[]",
  };
  const r = compute({ dbPath, uploadsDir: up, attDir: path.join(dir, "attendance-photos"), getStmt: { get: (k) => (kv[k] ? { value: kv[k] } : undefined) } });
  assert.deepEqual(r.files.orderPhotos, { size: 1100, count: 2 });
  assert.deepEqual(r.files.chat, { size: 5000, count: 1 });
  assert.deepEqual(r.files.attendance, { size: 300, count: 1 });
  assert.equal(r.db.orders, 1);
  assert.equal(r.db.size, 2000);
  assert.equal(r.total, 2000 + 1100 + 5000 + 300);
  assert.equal(r.archiveHint, false);
});
