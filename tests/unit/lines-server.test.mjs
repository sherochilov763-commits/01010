// Server: yo'nalish bo'yicha ajratish (backend/lines.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const L = require("../../backend/lines.js");

const orders = [
  { id: "a", subcategory: "UVIXPRINT", payments: [{ amount: 600, date: "2026-10-02" }] },
  { id: "b", subcategory: "UVONYX", payments: [{ amount: 400, date: "2026-10-03" }] },
];
const tx = [
  { id: "t1", line: "UVONYX", amount: 50, date: "2026-10-01" },
  { id: "t2", line: "common", amount: 1000, date: "2026-10-01" },
  { id: "t3", line: "UVIXPRINT", amount: 70, date: "2026-10-01" },
  { id: "t4", relatedOrderId: "b", amount: 5, date: "2026-10-01" },
];

test("scopeOf: rahbar va umumiy — hammasi, qolganlar — o'z yo'nalishi", () => {
  assert.equal(L.scopeOf({ role: "admin" }, { line: "UVONYX" }), null);
  assert.equal(L.scopeOf({ role: "operator" }, { line: "common" }), null);
  assert.equal(L.scopeOf({ role: "operator" }, { line: "UVONYX" }), "UVONYX");
  assert.equal(L.scopeOf({ role: "operator" }, {}), "UVIXPRINT");
});

test("GET: UVONYX xodimiga faqat ON buyurtma + o'z va umumiy rasxod (ulush bilan)", () => {
  assert.deepEqual(L.filterForClient("uvix:orders", orders, "UVONYX", orders).map((o) => o.id), ["b"]);
  const t = L.filterForClient("uvix:transactions", tx, "UVONYX", orders);
  assert.deepEqual(t.map((x) => x.id), ["t1", "t2", "t4"]);
  assert.equal(t.find((x) => x.id === "t2")._lineShare, 0.4);
  assert.equal(L.filterForClient("uvix:orders", orders, null, orders).length, 2);
});

test("PUT: boshqa yo'nalish va umumiy rasxod saqlanib qoladi, yangi rasxod — xodim yo'nalishiga", () => {
  const vis = L.filterForClient("uvix:transactions", tx, "UVONYX", orders);
  const incoming = [...vis.filter((x) => x.id !== "t1").map((x) => (x.id === "t2" ? { ...x, amount: 1 } : x)), { id: "n", amount: 9, line: "common" }];
  const out = L.mergeScopedPut("uvix:transactions", incoming, tx, "UVONYX", orders);
  const by = Object.fromEntries(out.map((x) => [x.id, x]));
  assert.equal(by.t1, undefined, "o'z rasxodini o'chira oladi");
  assert.equal(by.t2.amount, 1000, "umumiy rasxodni o'zgartira olmaydi");
  assert.equal(by.t2._lineShare, undefined);
  assert.ok(by.t3, "UVIXPRINT rasxodi saqlanadi");
  assert.equal(by.n.line, "UVONYX");
});

test("Yozish: boshqa yo'nalish buyurtmasini o'zgartirib bo'lmaydi, yangi buyurtma — o'z yo'nalishi", () => {
  const lm = L.lineMap(orders);
  assert.equal(L.prepareUpsert("uvix:orders", { ...orders[0], title: "x" }, orders[0], "UVONYX", lm), null);
  assert.equal(L.prepareUpsert("uvix:orders", { id: "z", subcategory: "UVIXPRINT" }, undefined, "UVONYX", lm).subcategory, "UVONYX");
  const out = L.mergeScopedPut("uvix:orders", [{ ...orders[1], title: "y" }], orders, "UVONYX", orders);
  assert.deepEqual(out.map((o) => o.id).sort(), ["a", "b"]);
});
