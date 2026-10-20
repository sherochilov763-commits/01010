// Xavfsizlik: buzilgan qiymat bazaga yozilmasligi (kv-validate.js)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { validateKvValue } = require("../../backend/kv-validate.js");

const bad = (k, v, err) => { const r = validateKvValue(k, v); assert.equal(r.ok, false, `${k} = ${v}`); if (err) assert.equal(r.error, err); };
const good = (k, v) => assert.equal(validateKvValue(k, v).ok, true, `${k} = ${v}`);

test("JSON bo'lmagan matn rad etiladi (har qanday kalit)", () => {
  bad("uvix:orders", "WIPED", "invalid_json");
  bad("uvix:leads", "oops", "invalid_json");
  bad("uvix:something", "{broken", "invalid_json");
  bad("uvix:orders", "", "invalid_json");
});

test("ro'yxat kalitlari faqat massiv qabul qiladi", () => {
  for (const k of ["uvix:orders", "uvix:transactions", "uvix:leads", "uvix:customers", "uvix:audit", "uvix:employees", "uvix:transfers"]) {
    bad(k, '"str"', "must_be_array");
    bad(k, "{}", "must_be_array");
    bad(k, "null", "must_be_array");
    bad(k, "42", "must_be_array");
    good(k, "[]");
    good(k, '[{"id":"a"}]');
  }
});

test("sozlama kalitlari faqat obyekt qabul qiladi", () => {
  for (const k of ["uvix:settings", "uvix:categories", "uvix:appearance"]) {
    bad(k, "[]", "must_be_object");
    bad(k, "null", "must_be_object");
    bad(k, '"x"', "must_be_object");
    good(k, "{}");
    good(k, '{"Material":["Shisha"]}');
  }
});

test("boshqa kalitlarda istalgan haqiqiy JSON", () => {
  good("uvix:lastBackupDate", '"2026-10-21"');
  good("uvix:custom", "123");
  good("uvix:custom", "true");
});

test("matn bo'lmagan qiymat rad etiladi", () => {
  assert.equal(validateKvValue("uvix:orders", 123).ok, false);
  assert.equal(validateKvValue("uvix:orders", undefined).ok, false);
});
