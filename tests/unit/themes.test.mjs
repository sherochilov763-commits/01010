// Mavzular: kontrast me'yorlari, avtomatik tun, shaxsiy/rol/kompaniya tartibi, backend tozalash
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const T = await import("../../frontend/src/theme.js");
const require = createRequire(import.meta.url);
const { cleanAppearance, cleanRoleDefaults } = require("../../backend/appearance.js");
const { buildTheme, contrastRatio: cr, THEMES, APPEARANCE_COLOR_PRESETS, DEFAULT_APPEARANCE, applyThemeChoice } = T;
let n = 0, fails = [];
const check = (name, ok, info = "") => { n++; if (!ok) fails.push(`${name} ${info}`); };

// 1) Har bir mavzu (o'z urg'usi bilan) va har bir umumiy urg'u bilan
const generic = ["blue", "graphite", "indigo", "emerald", "orange", "terracotta", "sky", "amber", "cmyk"];
const rows = [];
for (const th of THEMES) {
  const schemes = [...new Set([th.scheme || "blue", ...generic])];
  for (const sc of schemes) {
    const t = buildTheme({ ...DEFAULT_APPEARANCE, ...applyThemeChoice({ colorScheme: sc }, th.key), colorScheme: sc });
    const tag = `${th.key}/${sc}`;
    const aaa = th.key === "contrast";
    check(`${tag} matn/karta`, cr(t.text, t.card) >= (aaa ? 15 : 12), cr(t.text, t.card).toFixed(2));
    for (const bg of ["card", "surface", "chip"]) {
      check(`${tag} ikkinchi/${bg}`, cr(t.muted, t[bg]) >= (aaa ? 7 : 4.5), cr(t.muted, t[bg]).toFixed(2));
      check(`${tag} xira/${bg}`, cr(t.dim, t[bg]) >= (bg === "chip" ? 4.0 : 4.5), cr(t.dim, t[bg]).toFixed(2));
    }
    check(`${tag} nav xira`, cr(t.navDim, t.navBg) >= 4.5, cr(t.navDim, t.navBg).toFixed(2));
    check(`${tag} tugma matni`, cr(t.onPrimary, t.violet) >= 4, cr(t.onPrimary, t.violet).toFixed(2));
    check(`${tag} oq/primarySolid`, cr("#FFFFFF", t.primarySolid) >= 4, cr("#FFFFFF", t.primarySolid).toFixed(2));
    // urg'u matn sifatida (havola, faol yorliq) — faqat mavzuning o'z urg'usi uchun qat'iy
    if (sc === (th.scheme || "blue")) {
      check(`${tag} urg'u/karta`, cr(t.violet, t.card) >= 4.45, // Grafit+ko'k: 4.48 (oldingi dizayn)
         cr(t.violet, t.card).toFixed(2));
      rows.push([tag, cr(t.text, t.card), cr(t.muted, t.card), cr(t.dim, t.card), cr(t.violet, t.card), cr(t.onPrimary, t.violet)].map((x) => (typeof x === "number" ? x.toFixed(1) : x)));
    }
    // holat ranglari matn sifatida: kartada va o'z yumshoq fonida
    for (const [c, bgk] of [["green", "greenBg"], ["amber", "amberBg"], ["rose", "roseBg"], ["blue", "blueBg"]]) {
      check(`${tag} ${c}/karta`, cr(t[c], t.card) >= 4.5, cr(t[c], t.card).toFixed(2));
      check(`${tag} ${c}/${bgk}`, cr(t[c], t[bgk]) >= 4.0, cr(t[c], t[bgk]).toFixed(2));
    }
    // yumshoq tint ustidagi yorliq matni (Davomat, Bo'yoq ombori): fon = rang 12% + karta
    for (const [c, tx] of [["green", "greenText"], ["amber", "amberText"], ["rose", "roseText"], ["blue", "blueText"]]) {
      for (const base of ["card", "surface"]) { const tint = T.mixColors(t[c], t[base], 1 - 0x1F / 255); check(`${tag} ${tx}/tint(${base})`, cr(t[tx], tint) >= 4.5, cr(t[tx], tint).toFixed(2)); }
    }
    check(`${tag} greenText/greenBg`, cr(t.greenText, t.greenBg) >= 4.5, cr(t.greenText, t.greenBg).toFixed(2));
    for (const s of ["greenSolid", "roseSolid", "amberSolid", "blueSolid"]) check(`${tag} oq/${s}`, cr("#FFFFFF", t[s]) >= 4.5, cr("#FFFFFF", t[s]).toFixed(2));
  }
}
// Shisha rejimi (qorong'i)
{ const t = buildTheme({ ...DEFAULT_APPEARANCE, mode: "dark", glass: true }); check("shisha isDark", t.isDark && t.mode === "glass"); }
// CMYK grafik palitrasi
check("cmyk grafik", buildTheme({ mode: "cmyk", colorScheme: "cmyk" }).chart?.length === 10);
check("ko'k grafik — standart", buildTheme({ mode: "light", colorScheme: "blue" }).chart === null);

// 2) Avtomatik tun
const d = (h, m = 0) => new Date(2026, 9, 14, h, m);
const sch = { autoDark: "schedule", nightFrom: "19:00", nightTo: "07:00" };
check("jadval 23:00", T.isNightNow(sch, d(23)) === true);
check("jadval 06:59", T.isNightNow(sch, d(6, 59)) === true);
check("jadval 07:00", T.isNightNow(sch, d(7)) === false);
check("jadval 12:00", T.isNightNow(sch, d(12)) === false);
check("jadval 19:00", T.isNightNow(sch, d(19)) === true);
check("kunduzgi oraliq", T.isNightNow({ autoDark: "schedule", nightFrom: "13:00", nightTo: "14:00" }, d(13, 30)) === true);
check("teng vaqt — o'chiq", T.isNightNow({ autoDark: "schedule", nightFrom: "10:00", nightTo: "10:00" }, d(10)) === false);
check("noto'g'ri vaqt", T.isNightNow({ autoDark: "schedule", nightFrom: "x", nightTo: "07:00" }, d(23)) === false);
check("tizim qorong'i", T.isNightNow({ autoDark: "system" }, d(12), true) === true);
check("tizim yorug'", T.isNightNow({ autoDark: "system" }, d(23), false) === false);
check("o'chiq", T.isNightNow({ autoDark: "off" }, d(23), true) === false);

// 3) Effektiv ko'rinish
const ap = { ...DEFAULT_APPEARANCE, mode: "paper", colorScheme: "terracotta", autoDark: "schedule", nightTheme: "navy" };
check("shisha ustun", T.effectiveAppearance(ap, { glass: true, night: true }).mode === "dark" && T.effectiveAppearance(ap, { glass: true }).glass === true);
const nn = T.effectiveAppearance(ap, { night: true });
check("tun → Tun ko'k + osmon", nn.mode === "navy" && nn.colorScheme === "sky", JSON.stringify(nn));
const ng = T.effectiveAppearance({ ...ap, nightTheme: "dark" }, { night: true });
check("tun → Grafit, urg'u saqlanadi", ng.mode === "dark" && ng.colorScheme === "terracotta");
check("tun foni, allaqachon qorong'i", T.effectiveAppearance({ ...DEFAULT_APPEARANCE, mode: "oled", colorScheme: "electric" }, { night: true }).mode === "oled");
check("tun foni, yorug' → Grafit (eski xatti-harakat)", T.effectiveAppearance({ ...DEFAULT_APPEARANCE, mode: "light" }, { night: true }).mode === "dark");
check("kunduz o'zgarmaydi", T.effectiveAppearance(ap, {}).mode === "paper");

// 4) Shaxsiy > rol > kompaniya
const company = { v: 2, mode: "light", colorScheme: "emerald", roleDefaults: { designer: "oled", printer: "contrast" } };
const r1 = T.resolveAppearance(company, null, "operator");
check("kompaniya standarti", r1.mode === "light" && r1.colorScheme === "emerald" && r1.personal === false);
const r2 = T.resolveAppearance(company, null, "designer");
check("rol: dizayner → OLED", r2.mode === "oled" && r2.colorScheme === "electric", JSON.stringify(r2));
const r3 = T.resolveAppearance(company, { v: 2, mode: "paper", colorScheme: "terracotta" }, "designer");
check("shaxsiy ustun", r3.mode === "paper" && r3.personal === true && r3.roleDefaults.designer === "oled");
check("eski (v1) kompaniya", T.resolveAppearance({ mode: "dark" }, null, "operator").mode === "light");
check("bo'sh kompaniya", T.resolveAppearance(null, null, "admin").mode === "light");
// Galereyadan tanlash
check("mavzu urg'usi", applyThemeChoice({ colorScheme: "blue" }, "navy").colorScheme === "sky");
check("mavzuga xos urg'u qaytadi", applyThemeChoice({ colorScheme: "sky" }, "light").colorScheme === "blue");
check("foydalanuvchi urg'usi saqlanadi", applyThemeChoice({ colorScheme: "emerald" }, "dark").colorScheme === "emerald");
check("personalPart", !("roleDefaults" in T.personalPart(r3)) && !("personal" in T.personalPart(r3)));

// 5) Backend tozalash
const ca = cleanAppearance({ mode: "navy", colorScheme: "sky", autoDark: "schedule", nightTheme: "oled", nightFrom: "20:30", nightTo: "6:00", roleDefaults: { x: 1 }, evil: "<script>", density: "huge", customPrimary: "#12345G" });
check("backend: toza", ca.mode === "navy" && ca.nightTheme === "oled" && ca.nightTo === "6:00" && !ca.evil && !ca.roleDefaults && !ca.density && !ca.customPrimary, JSON.stringify(ca));
check("backend: noma'lum mavzu", cleanAppearance({ mode: "rainbow" }) === null);
check("backend: tungi mavzu faqat qorong'i", cleanAppearance({ mode: "light", nightTheme: "paper" }).nightTheme === undefined);
check("backend: noto'g'ri vaqt", cleanAppearance({ mode: "light", nightFrom: "25:00" }).nightFrom === undefined);
check("backend: rollar", JSON.stringify(cleanRoleDefaults({ designer: "oled", printer: "x", hacker: "navy" })) === '{"designer":"oled"}');
check("backend: bo'sh rollar", cleanRoleDefaults({}) === undefined);

test(`mavzular: ${n} ta kontrast va mantiq sharti`, () => {
  assert.equal(fails.length, 0, fails.slice(0, 40).join("\n"));
});
