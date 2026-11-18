// Smeta hisobi: formula, yaxlitlash, dollar kursi, «qatordan» maydon, xatolar; brauzer va server nusxasi bir xil
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as fe from "../../frontend/src/lib/quoteCalc.js";
const require = createRequire(import.meta.url);
const be = require("../../backend/quote-calc.js");

test("brauzer va server nusxasi — bir xil kod", () => {
  const strip = (s) => s.split("\n").filter((l) => !/^\/\/ (quote-calc|quoteCalc)\.js|^\/\/ AYNAN SHU|^module\.exports|^export \{/.test(l)).join("\n");
  assert.equal(strip(readFileSync(new URL("../../frontend/src/lib/quoteCalc.js", import.meta.url), "utf8")), strip(readFileSync(new URL("../../backend/quote-calc.js", import.meta.url), "utf8")));
});

const EX = [
  { id: "a", kind: "material", name: "Akril 3 mm", calc: "m2", cur: "usd", price: 14, parts: [{ w: 1200, h: 600, n: 2 }, { w: 800, h: 400, n: 4 }, { w: 300, h: 300, n: 6 }] },
  { id: "b", kind: "pechat", name: "UV pechat", calc: "m2", cur: "usd", price: 9, areaFrom: "a" },
  { id: "c", kind: "ish", name: "Lazer kesish", calc: "pcs", cur: "uzs", price: 12000, qty: 12 },
  { id: "d", kind: "montaj", name: "O'rnatish", calc: "lump", cur: "uzs", price: 200000 },
  { id: "e", kind: "dizayn", name: "Maket", calc: "lump", cur: "uzs", price: 100000 },
];

test("140-eskiz misoli: 3,26 m², $ va so'm, jami 1 407 000", () => {
  for (const lib of [fe, be]) {
    const r = lib.computeQuote(EX, 12840);
    assert.equal(r.error, undefined);
    const [a, b, c, d, e] = r.items;
    assert.equal(a.area, 3.26); assert.equal(a.totalUsd, 45.64); assert.equal(a.total, 586000);
    assert.equal(b.area, 3.26); assert.equal(b.totalUsd, 29.34); assert.equal(b.total, 377000);
    assert.equal(c.total, 144000); assert.equal(d.total, 200000); assert.equal(e.total, 100000);
    assert.equal(r.total, 1407000); assert.equal(r.totalUsd, 74.98);
    assert.deepEqual(r.area, { pechat: 3.26, material: 3.26 });
    assert.equal(r.total, r.items.reduce((s, i) => s + i.total, 0));
  }
});

test("so'm: butun so'm, yaxlitlash yo'q; maydon 0,01 m² gacha", () => {
  const r = be.computeQuote([{ id: "x", kind: "material", calc: "m2", cur: "uzs", price: 180000, parts: [{ w: 333, h: 333, n: 1 }] }]);
  assert.equal(r.items[0].area, 0.11); assert.equal(r.total, 19800);
  const r2 = be.computeQuote([{ id: "x", kind: "material", calc: "m2", cur: "uzs", price: 180000, parts: [{ w: "1 200", h: "2000" }] }]);
  assert.equal(r2.items[0].area, 2.4); assert.equal(r2.items[0].parts[0].n, 1); assert.equal(r2.total, 432000);
});

test("$ summa 1 000 so'mgacha yaxlitlanadi", () => {
  assert.equal(be.computeQuote([{ id: "x", kind: "ish", calc: "lump", cur: "usd", price: "10,5" }], 12840).total, 135000); // 134 820 → 135 000
  assert.equal(be.computeQuote([{ id: "x", kind: "ish", calc: "lump", cur: "usd", price: 10 }], 12849.5).total, 128000); // 128 495 → 128 000
});

test("xatolar: kurs, o'lcham, dona, 0 summa, noma'lum qator, takror id", () => {
  assert.match(be.computeQuote([], 0).error, /Kamida bitta/);
  assert.match(be.computeQuote([{ kind: "ish", calc: "lump", cur: "usd", price: 5 }], 0).error, /kursini/);
  assert.match(be.computeQuote([{ kind: "material", calc: "m2", cur: "uzs", price: 5, parts: [] }]).error, /o'lchamlarni/);
  assert.match(be.computeQuote([{ kind: "material", calc: "m2", cur: "uzs", price: 5, parts: [{ w: 0, h: 10 }] }]).error, /eni va bo'yini/);
  assert.match(be.computeQuote([{ kind: "ish", calc: "pcs", cur: "uzs", price: 5, qty: 0 }]).error, /dona sonini/);
  assert.match(be.computeQuote([{ kind: "ish", calc: "lump", cur: "uzs", price: 0 }]).error, /0 bo'lmasligi/);
  assert.match(be.computeQuote([{ id: "p", kind: "pechat", calc: "m2", cur: "uzs", price: 5, areaFrom: "zz" }]).error, /topilmadi/);
  assert.match(be.computeQuote([{ id: "p", kind: "pechat", calc: "m2", cur: "uzs", price: 5, areaFrom: "p" }]).error, /topilmadi/);
  assert.match(be.computeQuote([{ id: "a", kind: "ish", calc: "lump", cur: "uzs", price: 5 }, { id: "a", kind: "ish", calc: "lump", cur: "uzs", price: 5 }]).error, /takror/);
  assert.match(be.computeQuote([{ kind: "ish", calc: "lump", cur: "uzs", price: -5 }]).error, /narxni/);
});

test("zanjir yo'q: «qatordan» olingan qatordan yana olib bo'lmaydi", () => {
  const r = be.computeQuote([
    { id: "a", kind: "material", calc: "m2", cur: "uzs", price: 1000, parts: [{ w: 1000, h: 1000 }] },
    { id: "b", kind: "pechat", calc: "m2", cur: "uzs", price: 1000, areaFrom: "a" },
    { id: "c", kind: "pechat", calc: "m2", cur: "uzs", price: 1000, areaFrom: "b" },
  ]);
  assert.match(r.error, /3-qator/);
});

test("tasodifiy smetalar: jami = qatorlar yig'indisi, ikki nusxa bir xil", () => {
  let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let k = 0; k < 300; k++) {
    const items = [];
    const cnt = 1 + rnd(6);
    for (let i = 0; i < cnt; i++) {
      const calc = ["m2", "pcs", "lump"][rnd(3)], cur = rnd(3) ? "uzs" : "usd";
      const it = { id: `i${i}`, kind: be.KINDS[rnd(5)], calc, cur, price: cur === "usd" ? 1 + rnd(5000) / 100 : 1000 + rnd(500000) };
      if (calc === "m2") it.parts = Array.from({ length: 1 + rnd(4) }, () => ({ w: 50 + rnd(3000), h: 50 + rnd(3000), n: 1 + rnd(5) }));
      if (calc === "pcs") it.qty = 1 + rnd(100);
      items.push(it);
    }
    const a = be.computeQuote(items, 12000 + rnd(1000)), b = fe.computeQuote(JSON.parse(JSON.stringify(items)), a.rate || 12500);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
    if (!a.error) assert.equal(a.total, a.items.reduce((s, i) => s + i.total, 0));
  }
});
