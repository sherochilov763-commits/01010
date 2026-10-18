// Rollar va huquqlar: andoza → rol sozlamasi → xodim istisnosi; server va brauzer ro'yxati bir xil
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const P = require("../../backend/permissions.js");
const F = await import("../../frontend/src/lib/permissions.js");

test("brauzer nusxasi server ro'yxati bilan bir xil", () => {
  assert.deepEqual(F.PERMS, P.PERMS);
  assert.deepEqual([...F.LOCKED], [...P.LOCKED]);
  assert.deepEqual(F.ROLES, P.ROLES);
  assert.deepEqual(F.GROUPS, P.GROUPS);
});
test("har huquqda har rol uchun to'g'ri andoza qiymati", () => {
  for (const p of P.PERMS) for (const r of P.ROLES) {
    assert.equal(P.clean(p, p.def[r]), p.def[r], `${p.k} / ${r}`);
  }
});
test("rahbar hamma narsaga ega, sozlama unga ta'sir qilmaydi", () => {
  const eff = P.resolve({ role: "admin" }, { admin: { "kassa.view": false } });
  for (const p of P.PERMS) assert.ok(P.can(eff, p.k), p.k);
});
test("rol sozlamasi andozani almashtiradi, istisno esa rol sozlamasini", () => {
  const cfg = { operator: { "kassa.view": "line", "orders.delete": "no" } };
  const a = P.resolve({ role: "operator" }, cfg);
  assert.equal(a["kassa.view"], "line");
  assert.equal(a["orders.delete"], "no");
  const b = P.resolve({ role: "operator", permOver: { "kassa.view": "none" } }, cfg);
  assert.equal(b["kassa.view"], "none");
  assert.equal(P.can(b, "kassa.view"), false);
});
test("qulflangan huquqlarni hech kimga berib bo'lmaydi", () => {
  const eff = P.resolve({ role: "manager", permOver: { "sys.roles": true, "sys.backup": true } }, { manager: { "sys.trash": true } });
  for (const k of P.LOCKED) assert.equal(P.can(eff, k), false, k);
});
test("ishchi rollarga ofis huquqlari berilmaydi", () => {
  const eff = P.resolve({ role: "installer", permOver: { "kassa.view": "all", "jobs.reopen": true, "paint.view": true } }, {});
  assert.equal(P.can(eff, "kassa.view"), false);
  assert.equal(P.can(eff, "jobs.reopen"), false);
  assert.equal(eff["paint.view"], true);
});
test("noto'g'ri qiymatlar tozalanadi", () => {
  assert.deepEqual(P.cleanMap({ "kassa.view": "yes", "orders.view": "hammasi", "approve.limit": -5, "x.y": 1, "orders.delete": "req" }), { "orders.delete": "req" });
});
test("eski huquqlar (perm.cash/profit/approveLimit) yangi kalitlarga o'tadi", () => {
  const eff = P.resolve({ role: "manager", perm: { cash: false, profit: true, approveLimit: 300000 } }, {});
  assert.equal(P.can(eff, "kassa.view"), false);
  assert.ok(P.limitOk(eff, 300000));
  assert.ok(!P.limitOk(eff, 300001));
});
test("so'rov (req) — «direct» talabida yo'q hisoblanadi", () => {
  const eff = P.resolve({ role: "operator", permOver: { "orders.delete": "req" } }, {});
  assert.equal(P.can(eff, "orders.delete"), true);
  assert.equal(P.can(eff, "orders.delete", "direct"), false);
});
test("scope darajasi: line < all", () => {
  const eff = P.resolve({ role: "manager" }, {});
  assert.equal(P.can(eff, "orders.view", "line"), true);
  assert.equal(P.can(eff, "orders.view", "all"), eff["orders.view"] === "all");
});
