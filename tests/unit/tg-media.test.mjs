// Chat fayllari: bir xabar — bir xil fayl nomi (qayta yuklanmaydi, disk to'lmaydi)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const breq = createRequire(path.resolve(here, "../../backend/package.json"));
const { mediaBase } = breq("./telegram-userbot.js");

test("bir xil akkaunt + chat + xabar — doim bir xil nom", () => {
  assert.equal(mediaBase("111", "222", 5), mediaBase("111", "222", 5));
  assert.match(mediaBase("111", "222", 5), /^tg[0-9a-f]{24}$/);
});
test("boshqa xabar, chat yoki akkaunt (UVIX / ONYX) — boshqa nom", () => {
  const a = mediaBase("111", "222", 5);
  assert.notEqual(a, mediaBase("111", "222", 6));
  assert.notEqual(a, mediaBase("111", "333", 5));
  assert.notEqual(a, mediaBase("999", "222", 5));
});
test("ID noma'lum bo'lsa — null (eski tasodifiy nomga qaytadi)", () => {
  assert.equal(mediaBase("", "222", 5), null);
  assert.equal(mediaBase("111", "222", null), null);
});
