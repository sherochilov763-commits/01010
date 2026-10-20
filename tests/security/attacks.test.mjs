// Xavfsizlik testlari — HAQIQIY serverni ishga tushirib, ma'lum hujumlarni takrorlaydi.
// Har bir test audit paytida topilgan teshikka mos keladi. Test qizil bo'lsa — teshik qayta ochilgan.
//   npm run test:security
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 4900 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let srv, dir, admin, op;

const call = async (method, url, body, token, ip) => {
  const res = await fetch(B + url, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(ip ? { "x-forwarded-for": ip } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null; try { data = await res.json(); } catch { /* bo'sh */ }
  return { status: res.status, data };
};
const login = (who, pin, ip) => call("POST", "/api/auth/login", { ...who, pin }, null, ip);

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "uvix-sec-"));
  srv = spawn(process.execPath, ["server.js"], { cwd: path.join(ROOT, "backend"), env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(dir, "uvix.db") }, stdio: "ignore" });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(B + "/api/health")).ok) break; } catch { /* hali yo'q */ } await new Promise((r) => setTimeout(r, 150)); }
  const a = await call("POST", "/api/auth/bootstrap", { name: "Rahbar", pin: "482193" });
  admin = a.data.token;
  const emps = [{ id: a.data.employee.id, name: "Rahbar", role: "admin" }, { id: "op1", name: "Ali", role: "operator", pin: "5555" }];
  assert.equal((await call("PUT", "/api/kv/uvix:employees", { value: JSON.stringify(emps) }, admin)).status, 200);
  const orders = [{ id: "o1", orderNumber: "UV-1", customer: "Mijoz", agreementUzs: 1000000, payments: [{ id: "p1", amount: 500000, date: "2026-10-01", paymentType: "naqd" }] }];
  assert.equal((await call("PUT", "/api/kv/uvix:orders", { value: JSON.stringify(orders) }, admin)).status, 200);
  op = (await login({ employeeId: "op1" }, "5555", "203.0.113.1")).data.token;
});
after(() => { srv?.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ } });

test("PIN: ism oxiriga bo'sh joy qo'shib cheklovni chetlab o'tib bo'lmaydi", async () => {
  const codes = [];
  for (let i = 1; i <= 12; i++) codes.push((await login({ name: "Ali" + " ".repeat(i) }, String(1000 + i), "198.51.100.7")).status);
  assert.ok(codes.slice(8).every((c) => c === 429), `9-urinishdan boshlab 429 kutilgan: ${codes.join(",")}`);
});

test("PIN: katta-kichik harf va ID orqali ham bitta hisob", async () => {
  const ip = "198.51.100.8";
  for (let i = 0; i < 4; i++) await login({ name: "ALI" }, "0000", ip);
  for (let i = 0; i < 4; i++) await login({ employeeId: "op1" }, "0000", ip);
  assert.equal((await login({ name: "ali" }, "0000", ip)).status, 429);
});

test("PIN: ko'p IP'dan hujum ham to'xtatiladi", async () => {
  const codes = [];
  for (let i = 0; i < 40; i++) codes.push((await login({ name: "Rahbar" }, "000000", `192.0.2.${i}`)).status);
  assert.ok(codes.slice(30).every((c) => c === 429), codes.join(","));
});

test("Ma'lumot: operator buyurtmalarni buzilgan matn bilan almashtira olmaydi", async () => {
  for (const [key, value] of [["uvix:orders", "WIPED"], ["uvix:orders", '"str"'], ["uvix:orders", "{}"], ["uvix:leads", "oops"], ["uvix:customers", "null"], ["uvix:categories", "[]"]]) {
    const r = await call("PUT", `/api/kv/${key}`, { value }, op);
    assert.equal(r.status, 400, `${key} = ${value} → ${r.status}`);
  }
  const r = await call("GET", "/api/kv/uvix:orders", undefined, admin);
  assert.equal(JSON.parse(r.data.value)[0].id, "o1", "buyurtmalar joyida qolishi kerak");
});

test("Pul: operator buyurtmani o'chira, summani yoki to'lovni o'zgartira olmaydi", async () => {
  await call("PUT", "/api/kv/uvix:orders", { value: "[]" }, op);
  const forged = [{ id: "o1", orderNumber: "UV-1", customer: "Mijoz", agreementUzs: 10, payments: [{ id: "p1", amount: 9999999, date: "2026-10-01", paymentType: "naqd" }] }];
  await call("PUT", "/api/kv/uvix:orders", { value: JSON.stringify(forged) }, op);
  const o = JSON.parse((await call("GET", "/api/kv/uvix:orders", undefined, admin)).data.value)[0];
  assert.equal(o.agreementUzs, 1000000);
  assert.equal(o.payments[0].amount, 500000);
});

test("Kirish: token'siz va soxta token bilan ma'lumot berilmaydi", async () => {
  assert.equal((await call("GET", "/api/kv/uvix:orders")).status, 401);
  assert.equal((await call("GET", "/api/kv/uvix:orders", undefined, "eyJhbGciOiJub25lIn0.eyJzdWIiOiJvcDEifQ.")).status, 401);
});

test("Maxfiylik: xodimlar ro'yxatida PIN (hatto hash) qaytmaydi", async () => {
  const pub = await call("GET", "/api/auth/employees");
  assert.ok(!JSON.stringify(pub.data).includes("$2"), "ochiq ro'yxatda hash bor");
  const priv = await call("GET", "/api/kv/uvix:employees", undefined, op);
  assert.ok(!priv.data.value.includes("$2"), "xodimga hash yuborilgan");
});

test("Fayllar: yo'l bilan boshqa faylni o'qib bo'lmaydi", async () => {
  for (const f of ["..%2Fuvix.db", "..%2F..%2Fserver.js", "uvix.secret"]) {
    const r = await fetch(`${B}/api/photos/${f}`);
    assert.equal(r.status, 404, f);
  }
});
