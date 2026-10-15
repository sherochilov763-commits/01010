// A1: pul ma'lumotlari himoyasi — server qoidalari (sof funksiyalar)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { guardOrders, guardAudit, deviceOf } = require("../../backend/money-guard.js");

const op = { id: "aziza", name: "Aziza", role: "operator" };
const admin = { id: "a1", name: "Admin", role: "admin" };
const P = (id, amount, extra = {}) => ({ id, amount, date: "2026-10-14", paymentType: "naqd", createdBy: "Aziza", ...extra });
const base = () => [{ id: "o1", orderNumber: "UV-1", agreementUzs: 1000, payments: [P("p1", 500)] }];
const T = "2026-10-15T10:00:00.000Z";

test("operator to'lov qo'sha oladi (createdBy serverdan)", () => {
  const next = [{ ...base()[0], payments: [P("p1", 500), P("p2", 300, { createdBy: "Boshqa" })] }];
  const g = guardOrders(next, base(), op, T);
  assert.equal(g.violations.length, 0);
  assert.equal(g.list[0].payments.length, 2);
  assert.equal(g.list[0].payments[1].createdBy, "Aziza");
});
test("operator to'lov summasini o'zgartira olmaydi", () => {
  const next = [{ ...base()[0], payments: [P("p1", 100)] }];
  const g = guardOrders(next, base(), op, T);
  assert.equal(g.list[0].payments[0].amount, 500);
  assert.equal(g.violations[0].kind, "payment_edit");
});
test("operator to'lovni o'chira olmaydi (soft delete)", () => {
  const next = [{ ...base()[0], payments: [P("p1", 500, { deletedAt: T, deletedBy: "Aziza" })] }];
  const g = guardOrders(next, base(), op, T);
  assert.equal(g.list[0].payments[0].deletedAt, undefined);
  assert.equal(g.violations[0].kind, "payment_delete");
});
test("ro'yxatdan olib tashlangan to'lov — saqlanib qoladi, ogohlantirishsiz (eskirgan nusxa)", () => {
  const next = [{ ...base()[0], payments: [] }];
  const g = guardOrders(next, base(), op, T);
  assert.equal(g.list[0].payments.length, 1);
  assert.equal(g.violations.length, 0);
});
test("admin keyin o'zgartirgan to'lov — eskirgan nusxa urinish emas", () => {
  const db = [{ ...base()[0], payments: [P("p1", 400, { editedAt: "2026-10-15T09:00:00Z" })] }];
  const g = guardOrders(base(), db, op, T);
  assert.equal(g.list[0].payments[0].amount, 400);
  assert.equal(g.violations.length, 0);
});
test("operator buyurtmani o'chira olmaydi", () => {
  const next = [{ ...base()[0], deletedAt: T, deletedBy: "Aziza" }];
  const g = guardOrders(next, base(), op, T);
  assert.equal(g.list[0].deletedAt, undefined);
  assert.equal(g.violations[0].kind, "order_delete");
});
test("operator summani oshira oladi, kamaytira olmaydi", () => {
  let g = guardOrders([{ ...base()[0], agreementUzs: 2000 }], base(), op, T);
  assert.equal(g.list[0].agreementUzs, 2000);
  assert.equal(g.list[0].totalAt, T);
  g = guardOrders([{ ...base()[0], agreementUzs: 100 }], base(), op, T);
  assert.equal(g.list[0].agreementUzs, 1000);
  assert.equal(g.violations[0].kind, "order_total");
});
test("admin oshirgan summa, operatorning eskirgan nusxasi — urinish emas", () => {
  const db = [{ ...base()[0], agreementUzs: 3000, totalAt: "2026-10-15T09:00:00Z" }];
  const g = guardOrders(base(), db, op, T);
  assert.equal(g.list[0].agreementUzs, 3000);
  assert.equal(g.violations.length, 0);
});
test("PUT ro'yxatida yo'q buyurtma qaytariladi", () => {
  const g = guardOrders([], base(), op, T);
  assert.equal(g.list.length, 1);
});
test("noto'g'ri yangi to'lov rad etiladi", () => {
  const next = [{ ...base()[0], payments: [P("p1", 500), P("p9", -5)] }];
  const g = guardOrders(next, base(), op, T);
  assert.equal(g.list[0].payments.length, 1);
  assert.equal(g.violations[0].kind, "payment_invalid");
});
test("yangi buyurtma: o'chirilgan holda yaratib bo'lmaydi, to'lovlar tozalanadi", () => {
  const g = guardOrders([...base(), { id: "o2", agreementUzs: 50, deletedAt: T, payments: [P("q1", 10, { createdBy: "X", deletedAt: T })] }], base(), op, T);
  const o2 = g.list.find((o) => o.id === "o2");
  assert.equal(o2.deletedAt, undefined);
  assert.equal(o2.payments[0].deletedAt, undefined);
  assert.equal(o2.payments[0].createdBy, "Aziza");
});
test("admin: hamma narsa mumkin, versiya belgisi qo'yiladi", () => {
  const g = guardOrders([{ ...base()[0], agreementUzs: 10, payments: [P("p1", 50)] }], base(), admin, T);
  assert.equal(g.violations.length, 0);
  assert.equal(g.list[0].agreementUzs, 10);
  assert.equal(g.list[0].totalAt, T);
  assert.equal(g.list[0].payments[0].editedAt, T);
  assert.equal(g.list[0].payments[0].editedBy, "Admin");
});
test("izohni o'zgartirish mumkin", () => {
  const g = guardOrders([{ ...base()[0], payments: [P("p1", 500, { comment: "2-avans" })] }], base(), op, T);
  assert.equal(g.list[0].payments[0].comment, "2-avans");
  assert.equal(g.violations.length, 0);
});
test("jurnal faqat qo'shiladi, kim/qachon serverdan", () => {
  const cur = [{ id: "e1", who: "Admin", what: "eski", when: "2026-01-01" }];
  const out = guardAudit([{ id: "e1", who: "X", what: "o'zgartirildi" }, { id: "e2", who: "Admin", what: "yangi", when: "1999", src: "server" }], cur, op, "telefon · Chrome", T);
  assert.equal(out.length, 2);
  assert.equal(out[1].what, "eski");
  assert.deepEqual(out[0], { id: "e2", who: "Aziza", what: "yangi", when: T, dev: "telefon · Chrome" });
  assert.equal(guardAudit([], cur, op, "x", T).length, 1); // o'chirib bo'lmaydi
});
test("qurilma aniqlash", () => {
  assert.equal(deviceOf({ headers: {} }), "API");
  assert.equal(deviceOf({ headers: { "user-agent": "curl/8" } }), "API");
  assert.equal(deviceOf({ headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17.0 Mobile Safari/604.1" } }), "telefon · Safari");
  assert.equal(deviceOf({ headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/129.0 Safari/537.36" } }), "kompyuter · Chrome");
});
