// Xavfsizlik: PIN'ni taxmin qilishdan himoya (login-guard.js)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createLoginGuard, normName } = require("../../backend/login-guard.js");

const clock = () => { let t = 1_000_000; return { now: () => t, add: (ms) => { t += ms; } }; };
const MIN = 60 * 1000;

test("ism yozilishi bir xil hisobga tushadi (bo'sh joy, katta harf)", () => {
  assert.equal(normName("Ali"), normName("  ALI  "));
  assert.equal(normName("Ali  Valiyev"), normName("ali valiyev"));
  assert.equal(normName("Ali "), "ali");
});

test("bitta IP: 8 ta xatodan keyin bloklanadi", () => {
  const c = clock();
  const g = createLoginGuard({ now: c.now });
  for (let i = 0; i < 8; i++) { assert.ok(g.check("1.1.1.1", "e1").ok); g.fail("1.1.1.1", "e1"); }
  assert.equal(g.check("1.1.1.1", "e1").ok, false);
});

test("ko'p IP'dan hujum: xodim bo'yicha 30 ta xatodan keyin bloklanadi", () => {
  const c = clock();
  const g = createLoginGuard({ now: c.now });
  for (let i = 0; i < 30; i++) { const ip = `10.0.0.${i}`; assert.ok(g.check(ip, "e1").ok); g.fail(ip, "e1"); }
  assert.equal(g.check("10.0.9.9", "e1").ok, false, "yangi IP ham bloklangan bo'lishi kerak");
  assert.ok(g.check("10.0.9.9", "e2").ok, "boshqa xodimga ta'sir qilmaydi");
});

test("to'g'ri PIN shu IP hisobini tozalaydi", () => {
  const c = clock();
  const g = createLoginGuard({ now: c.now });
  for (let i = 0; i < 7; i++) g.fail("1.1.1.1", "e1");
  g.success("1.1.1.1", "e1");
  for (let i = 0; i < 7; i++) { assert.ok(g.check("1.1.1.1", "e1").ok); g.fail("1.1.1.1", "e1"); }
});

test("10 daqiqadan keyin qayta ochiladi", () => {
  const c = clock();
  const g = createLoginGuard({ now: c.now });
  for (let i = 0; i < 8; i++) g.fail("1.1.1.1", "e1");
  assert.equal(g.check("1.1.1.1", "e1").ok, false);
  c.add(10 * MIN + 1);
  assert.ok(g.check("1.1.1.1", "e1").ok);
});

test("kunlik chegara: 100 ta xato — 24 soatga qulf va adminga bir marta xabar", () => {
  const c = clock();
  const locked = [];
  const g = createLoginGuard({ now: c.now, onDailyLock: (id) => locked.push(id) });
  let fails = 0;
  // Har 10 daqiqada 30 tadan (har safar yangi IP) — 10 daqiqalik chegaradan qochib bo'lmaydi, lekin kunlik chegara ushlaydi
  while (fails < 100) {
    for (let i = 0; i < 30 && fails < 100; i++, fails++) { assert.ok(g.check(`9.9.${fails}.1`, "e1").ok); g.fail(`9.9.${fails}.1`, "e1"); }
    c.add(10 * MIN + 1);
  }
  const r = g.check("8.8.8.8", "e1");
  assert.equal(r.ok, false);
  assert.equal(r.daily, true);
  assert.deepEqual(locked, ["e1"]);
  c.add(24 * 60 * MIN);
  assert.ok(g.check("8.8.8.8", "e1").ok);
});

test("mavjud bo'lmagan ismlar bilan IP bo'yicha 60 ta cheklov", () => {
  const c = clock();
  const g = createLoginGuard({ now: c.now });
  for (let i = 0; i < 60; i++) g.fail("5.5.5.5", null);
  assert.equal(g.check("5.5.5.5", null).ok, false);
  assert.equal(g.check("5.5.5.5", "e1").ok, false, "shu IP'dan haqiqiy xodimga ham");
  assert.ok(g.check("6.6.6.6", "e1").ok);
});

test("xotira cheksiz o'smaydi", () => {
  const c = clock();
  const g = createLoginGuard({ now: c.now });
  for (let i = 0; i < 6000; i++) g.fail(`ip${i}`, null);
  c.add(11 * MIN);
  g.fail("last", null);
  assert.ok(g._size() < 10);
});
