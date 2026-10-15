// A3: xato barmoq izi — bir xil xato bitta yozuv bo'lib yig'iladi (build xeshi va raqamlar farq qilsa ham)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { fingerprint } = require("../../backend/error-reports.js");

test("build xeshi o'zgarsa ham bir xil xato", () => {
  const a = fingerprint("TypeError: x is undefined", "Error\n    at Ed (http://h/assets/index-AAA.js:1:2)\n    at vo (http://h/assets/react-1.js:3:4)");
  const b = fingerprint("TypeError: x is undefined", "Error\n    at Ed (http://h/assets/index-BBB.js:9:9)\n    at vo (http://h/assets/react-2.js:7:7)");
  assert.equal(a, b);
});
test("raqamlar farqi — bir xil xato", () => {
  assert.equal(fingerprint("Cannot read 12 of undefined", ""), fingerprint("Cannot read 345 of undefined", ""));
});
test("boshqa xabar — boshqa xato", () => {
  assert.notEqual(fingerprint("TypeError: a", ""), fingerprint("TypeError: b", ""));
});
