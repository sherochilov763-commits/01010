// Telefon pastki menyusi: rol standarti, eski standart, qo'lda tanlangan panel (Nav.jsx — esbuild bilan yig'iladi)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const front = path.resolve(here, "../../frontend");
const req = createRequire(path.join(front, "package.json"));
const esbuild = req("esbuild");
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "uvix-nav-")), "nav.mjs");
await esbuild.build({
  stdin: { contents: `export { normalizeNav, roleBar } from ${JSON.stringify(path.join(front, "src/components/Nav.jsx"))};`, resolveDir: front, loader: "js" },
  bundle: true, platform: "node", format: "esm", outfile: out, jsx: "automatic", loader: { ".js": "jsx" }, logLevel: "error",
  define: { "import.meta.env": JSON.stringify({ VITE_API_BASE: "/api", BASE_URL: "/" }) },
});
const { normalizeNav, roleBar } = await import(out);
const J = JSON.stringify;

test("operator va admin standartlari", () => {
  assert.equal(J(normalizeNav(null, "operator").mobileBar), J(["dashboard", "chats", "orders", "crm"]));
  assert.equal(J(normalizeNav({}, "admin").mobileBar), J(["dashboard", "orders", "crm", "operations"]));
  assert.equal(J(normalizeNav({}, "x").mobileBar), J(["dashboard", "orders", "expense", "crm"]));
});
test("eski standart saqlangan — rol standarti; qo'lda (barSet) — o'zgarmaydi", () => {
  assert.equal(J(normalizeNav({ mobileBar: ["dashboard", "orders", "expense", "crm"] }, "operator").mobileBar), J(roleBar("operator")));
  assert.equal(J(normalizeNav({ mobileBar: ["dashboard", "orders", "expense", "crm"], barSet: true }, "operator").mobileBar), J(["dashboard", "orders", "expense", "crm"]));
  assert.equal(J(normalizeNav({ mobileBar: ["orders", "paint"] }, "admin").mobileBar), J(["orders", "paint"]));
});
test("tozalash: noma'lum kalitlar, 4 tadan ko'p emas, sozlamalarni yashirib bo'lmaydi", () => {
  assert.equal(J(normalizeNav({ mobileBar: ["hack", "orders"] }, "admin").mobileBar), J(["orders"]));
  assert.equal(normalizeNav({ mobileBar: ["orders", "crm", "chats", "paint", "report"] }, "admin").mobileBar.length, 4);
  assert.equal(J(normalizeNav({ hidden: ["paint", "settings"] }, "admin").hidden), J(["paint"]));
});
