// appearance.js — xodimning shaxsiy ko'rinishi (mavzu, urg'u rangi, zichlik, avtomatik tun).
// Kompaniya standarti va rollar bo'yicha mavzu "uvix:appearance" kalitida (faqat admin yozadi).
// Shaxsiy tanlov "uvix:apr:<xodim id>" ichki kalitida saqlanadi; null — standartga ergashadi.
const MODES = new Set(["light", "soft", "dark", "paper", "cmyk", "contrast", "navy", "warm", "oled"]);
const NIGHT = new Set(["dark", "navy", "warm", "oled"]);
const SCHEMES = new Set(["blue", "graphite", "emerald", "indigo", "orange", "purple", "pink", "terracotta", "sky", "amber", "electric", "hc", "cmyk", "custom"]);
const ENUMS = {
  density: new Set(["compact", "comfortable", "spacious"]),
  radius: new Set(["sharp", "medium", "rounded"]),
  sidebarStyle: new Set(["modern", "classic", "minimal"]),
  autoDark: new Set(["off", "system", "schedule"]),
};
const HEX = /^#[0-9a-fA-F]{6}$/;
const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

function cleanAppearance(a) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  const out = { v: 2 };
  if (MODES.has(a.mode)) out.mode = a.mode;
  if (SCHEMES.has(a.colorScheme)) out.colorScheme = a.colorScheme;
  if (HEX.test(a.customPrimary || "")) out.customPrimary = a.customPrimary;
  if (HEX.test(a.customAccent || "")) out.customAccent = a.customAccent;
  for (const [k, set] of Object.entries(ENUMS)) if (set.has(a[k])) out[k] = a[k];
  if (NIGHT.has(a.nightTheme)) out.nightTheme = a.nightTheme;
  if (HHMM.test(a.nightFrom || "")) out.nightFrom = a.nightFrom;
  if (HHMM.test(a.nightTo || "")) out.nightTo = a.nightTo;
  return out.mode ? out : null;
}
// Kompaniya standartidagi rollar bo'yicha mavzu: { designer: "oled", printer: "contrast", ... }
function cleanRoleDefaults(rd) {
  if (!rd || typeof rd !== "object") return undefined;
  const out = {};
  for (const role of ["admin", "manager", "operator", "designer", "printer", "installer"]) {
    if (MODES.has(rd[role])) out[role] = rd[role];
  }
  return Object.keys(out).length ? out : undefined;
}

function registerAppearance(app, { requireAuth, getStmt, upsertStmt, deleteStmt }) {
  const keyOf = (user) => `uvix:apr:${user.id}`;
  app.get("/api/me/appearance", requireAuth, (req, res) => {
    const row = getStmt.get(keyOf(req.user));
    let appearance = null;
    try { appearance = row ? cleanAppearance(JSON.parse(row.value)) : null; } catch { appearance = null; }
    res.json({ appearance });
  });
  app.put("/api/me/appearance", requireAuth, (req, res) => {
    const a = req.body?.appearance;
    if (a === null) { deleteStmt.run(keyOf(req.user)); return res.json({ appearance: null }); }
    const clean = cleanAppearance(a);
    if (!clean) return res.status(400).json({ error: "invalid_appearance", message: "Ko'rinish noto'g'ri" });
    upsertStmt.run(keyOf(req.user), JSON.stringify(clean));
    res.json({ appearance: clean });
  });
}

module.exports = { registerAppearance, cleanAppearance, cleanRoleDefaults, MODES, NIGHT, SCHEMES };
