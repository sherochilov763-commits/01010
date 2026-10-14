import { useEffect, useMemo, useState } from "react";
import { Check, Monitor, Moon, Users } from "lucide-react";
import { Button, Card, Field, getInputStyle } from "../../components/ui.jsx";
import { APPEARANCE_COLOR_PRESETS, DEFAULT_APPEARANCE, NIGHT_THEMES, THEME, THEMES, applyThemeChoice, buildTheme, personalPart } from "../../theme.js";
import { ROLE_LABELS } from "../../constants.js";

// Urg'u ranglari tanlovi (mavzuga xos «Kontrast» va «Elektr» faqat o'sha mavzu tanlanganda ko'rinadi)
const COLOR_KEYS = ["blue", "graphite", "indigo", "emerald", "orange", "terracotta", "sky", "amber", "cmyk"];
const themeLabel = (key) => THEMES.find((t) => t.key === key)?.label || key;

// Mavzuning kichik namunasi — o'sha mavzu ranglari bilan chiziladi (joriy mavzuga bog'liq emas)
function ThemeThumb({ themeKey, scheme }) {
  const T = useMemo(() => buildTheme({ ...DEFAULT_APPEARANCE, ...applyThemeChoice({ colorScheme: scheme || "blue" }, themeKey) }), [themeKey, scheme]);
  return (
    <div aria-hidden style={{ display: "flex", height: 64, borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}`, background: T.surface }}>
      <div style={{ width: 26, background: T.navBg, borderRight: `1px solid ${T.navBorder}`, padding: "7px 5px", display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ height: 6, borderRadius: 2, background: T.navActiveBg, boxShadow: `inset 2px 0 0 ${T.violet}` }} />
        <span style={{ height: 4, borderRadius: 2, background: T.border2 }} />
        <span style={{ height: 4, borderRadius: 2, background: T.border2 }} />
      </div>
      <div style={{ flex: 1, padding: 7 }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 7px" }}>
          <div style={{ width: "46%", height: 4, borderRadius: 2, background: T.muted, opacity: 0.8 }} />
          <div style={{ width: "72%", height: 7, borderRadius: 2, background: T.text, marginTop: 4 }} />
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <span style={{ width: 26, height: 8, borderRadius: 3, background: T.violet }} />
            <span style={{ width: 16, height: 8, borderRadius: 3, background: T.cyan, opacity: 0.85 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppearanceSection({ appearance, onApply }) {
  const [customPrimary, setCustomPrimary] = useState(appearance.customPrimary || DEFAULT_APPEARANCE.customPrimary);
  const [customAccent, setCustomAccent] = useState(appearance.customAccent || DEFAULT_APPEARANCE.customAccent);

  useEffect(() => {
    setCustomPrimary(appearance.customPrimary || DEFAULT_APPEARANCE.customPrimary);
    setCustomAccent(appearance.customAccent || DEFAULT_APPEARANCE.customAccent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearance.customPrimary, appearance.customAccent]);

  // O'zgarish faqat shu xodim uchun saqlanadi (kompaniya standarti alohida)
  function set(patch) {
    onApply({ ...personalPart(appearance), ...patch });
  }
  function segmented(options, valueKey, testPrefix) {
    return (
      <div role="radiogroup" style={{ display: "flex", gap: 2, background: THEME.chip, borderRadius: 9, padding: 3 }}>
        {options.map((o) => {
          const on = (appearance[valueKey] || DEFAULT_APPEARANCE[valueKey]) === o.v;
          return (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={on}
              data-testid={testPrefix ? `${testPrefix}-${o.v}` : undefined}
              onClick={() => set({ [valueKey]: o.v })}
              style={{
                flex: 1, padding: "7px 0", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
                background: on ? THEME.card : "transparent",
                color: on ? THEME.text : THEME.muted,
                boxShadow: on ? THEME.shadowSm : "none",
              }}
            >
              {o.l}
            </button>
          );
        })}
      </div>
    );
  }

  const modeKey = THEMES.some((t) => t.key === appearance.mode) ? appearance.mode : "light";
  const colorOpts = COLOR_KEYS.concat(["hc", "electric"].includes(appearance.colorScheme) ? [appearance.colorScheme] : []).map((v) => {
    const p = APPEARANCE_COLOR_PRESETS[v];
    return { v, l: p.label, primary: THEME.isDark ? p.primaryDark : p.primary };
  });
  const auto = appearance.autoDark || "off";
  const label = (t) => <div style={{ fontSize: 12.5, fontWeight: 500, color: THEME.mutedDark, marginBottom: 8 }}>{t}</div>;

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5 }}>Ko'rinish</div>
        <span data-testid="appearance-source" style={{ fontSize: 11.5, fontWeight: 600, color: appearance.personal ? THEME.violet : THEME.muted, background: appearance.personal ? THEME.violetSoft : THEME.chip, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>
          {appearance.personal ? "Shaxsiy tanlov" : "Kompaniya standarti"}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 16, lineHeight: 1.45 }}>Tanlovingiz faqat sizga tegishli va darhol qo'llanadi. Boshqa xodimlarning ko'rinishi o'zgarmaydi.</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          {label("Mavzu")}
          <div role="radiogroup" aria-label="Mavzu" data-testid="theme-gallery" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {THEMES.map((t) => {
              const on = modeKey === t.key;
              return (
                <button key={t.key} type="button" role="radio" aria-checked={on} data-testid={`theme-${t.key}`}
                  onClick={() => onApply(applyThemeChoice(personalPart(appearance), t.key))}
                  style={{ textAlign: "left", padding: 8, borderRadius: 12, cursor: "pointer", fontFamily: "inherit", background: THEME.card, color: THEME.text,
                    border: on ? `2px solid ${THEME.violet}` : `1px solid ${THEME.border2}`, margin: on ? 0 : 1, position: "relative" }}>
                  <ThemeThumb themeKey={t.key} scheme={t.scheme || (on ? appearance.colorScheme : "blue")} />
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{t.label}</span>
                    {on && <span style={{ width: 18, height: 18, borderRadius: "50%", background: THEME.violet, color: THEME.onPrimary, display: "grid", placeItems: "center" }}><Check size={12} strokeWidth={3} /></span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 2 }}>{t.hint}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          {label("Asosiy rang")}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            {colorOpts.map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => set({ colorScheme: o.v })}
                title={o.l}
                data-testid={`scheme-${o.v}`}
                aria-pressed={appearance.colorScheme === o.v}
                style={{
                  height: 34, borderRadius: 8, cursor: "pointer", padding: "0 12px 0 8px", gap: 8, fontSize: 12.5, fontWeight: 600, color: THEME.text,
                  background: THEME.card, display: "flex", alignItems: "center",
                  border: appearance.colorScheme === o.v ? `1.5px solid ${THEME.text}` : `1px solid ${THEME.border2}`,
                }}
              >
                <span style={{ width: 16, height: 16, borderRadius: 5, display: "block", background: o.primary }} />
                {o.l}
              </button>
            ))}
            <button
              type="button"
              onClick={() => set({ colorScheme: "custom" })}
              title="Custom"
              style={{
                height: 34, borderRadius: 8, cursor: "pointer", padding: "0 12px", fontSize: 12.5, fontWeight: 600, color: THEME.text,
                background: THEME.card, display: "flex", alignItems: "center",
                border: appearance.colorScheme === "custom" ? `1.5px solid ${THEME.text}` : `1px dashed ${THEME.border2}`,
              }}
            >
              O'zim tanlayman
            </button>
          </div>
          {appearance.colorScheme === "custom" && (
            <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
              <Field label="Asosiy (Primary)">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="color"
                    value={customPrimary}
                    onChange={(e) => { setCustomPrimary(e.target.value); set({ colorScheme: "custom", customPrimary: e.target.value, customAccent }); }}
                    style={{ width: 40, height: 36, border: "none", borderRadius: 8, cursor: "pointer", padding: 0, background: "none" }}
                  />
                  <span style={{ fontSize: 12.5, fontFamily: "monospace", color: THEME.mutedDark }}>{customPrimary}</span>
                </div>
              </Field>
              <Field label="Urg'u (Accent)">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="color"
                    value={customAccent}
                    onChange={(e) => { setCustomAccent(e.target.value); set({ colorScheme: "custom", customPrimary, customAccent: e.target.value }); }}
                    style={{ width: 40, height: 36, border: "none", borderRadius: 8, cursor: "pointer", padding: 0, background: "none" }}
                  />
                  <span style={{ fontSize: 12.5, fontFamily: "monospace", color: THEME.mutedDark }}>{customAccent}</span>
                </div>
              </Field>
            </div>
          )}
        </div>

        <div data-testid="auto-night">
          {label(<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Moon size={14} /> Tungi mavzuga avtomatik o'tish</span>)}
          {segmented([{ v: "off", l: "O'chiq" }, { v: "system", l: "Qurilmaga mos" }, { v: "schedule", l: "Jadval bo'yicha" }], "autoDark", "auto")}
          {auto !== "off" && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
              <Field label="Tungi mavzu">
                <select data-testid="night-theme" value={NIGHT_THEMES.includes(appearance.nightTheme) ? appearance.nightTheme : "dark"} onChange={(e) => set({ nightTheme: e.target.value })} style={{ ...getInputStyle(), minWidth: 170 }}>
                  {NIGHT_THEMES.map((k) => <option key={k} value={k}>{themeLabel(k)}</option>)}
                </select>
              </Field>
              {auto === "schedule" && (
                <>
                  <Field label="Boshlanishi">
                    <input type="time" data-testid="night-from" value={appearance.nightFrom || "19:00"} onChange={(e) => e.target.value && set({ nightFrom: e.target.value })} style={{ ...getInputStyle(), width: 120 }} />
                  </Field>
                  <Field label="Tugashi">
                    <input type="time" data-testid="night-to" value={appearance.nightTo || "07:00"} onChange={(e) => e.target.value && set({ nightTo: e.target.value })} style={{ ...getInputStyle(), width: 120 }} />
                  </Field>
                </>
              )}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: THEME.dim, marginTop: 8, lineHeight: 1.45, display: "flex", gap: 6, alignItems: "flex-start" }}>
            <Monitor size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            {auto === "system" ? "Telefon yoki kompyuter qorong'i rejimga o'tganda UVIX ham tungi mavzuga o'tadi."
              : auto === "schedule" ? `Har kuni ${appearance.nightFrom || "19:00"} dan ${appearance.nightTo || "07:00"} gacha tungi mavzu, qolgan vaqtda «${themeLabel(modeKey)}».`
              : "Yoqilsa, kechqurun ko'zni charchatmaydigan qorong'i mavzuga o'zi o'tadi."}
          </div>
        </div>

        <div>
          {label("Zichlik")}
          {segmented([{ v: "compact", l: "Ixcham" }, { v: "comfortable", l: "O'rtacha" }, { v: "spacious", l: "Keng" }], "density")}
        </div>

        <div>
          {label("Burchak radiusi")}
          {segmented([{ v: "sharp", l: "To'g'ri" }, { v: "medium", l: "O'rtacha" }, { v: "rounded", l: "Yumaloq" }], "radius")}
        </div>

        <div>
          {label("Sidebar uslubi")}
          {segmented([{ v: "modern", l: "Standart" }, { v: "classic", l: "Chiziqli" }, { v: "minimal", l: "Minimal" }], "sidebarStyle")}
        </div>

        {appearance.personal && (
          <Button variant="ghost" data-testid="appearance-reset" onClick={() => onApply(null)} style={{ alignSelf: "flex-start" }}>
            Kompaniya standartiga qaytish
          </Button>
        )}
      </div>
    </Card>
  );
}

// Admin: shaxsiy mavzu tanlamagan xodimlar uchun kompaniya standarti va rollar bo'yicha mavzu
export function CompanyAppearanceCard({ appearance, company, onApply }) {
  const rd = company.roleDefaults || {};
  const setRole = (role, v) => {
    const next = { ...rd };
    if (v) next[role] = v; else delete next[role];
    onApply({ ...company, roleDefaults: next });
  };
  const sameAsMine = company.mode === appearance.mode && company.colorScheme === appearance.colorScheme;
  return (
    <Card data-testid="company-appearance">
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14.5, marginBottom: 4 }}><Users size={16} /> Kompaniya standarti</div>
      <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 14, lineHeight: 1.45 }}>
        O'z mavzusini tanlamagan xodimlar shu ko'rinishda ishlaydi. Rol bo'yicha mavzu, masalan, sexdagi planshetlarga «Yuqori kontrast», ishchi telefonlariga «OLED qora». Xodim xohlasa o'zi o'zgartiradi.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ fontSize: 13 }}>Hozirgi standart: <b data-testid="company-theme">{themeLabel(company.mode || "light")}</b></span>
        <Button variant="ghost" data-testid="company-from-mine" disabled={sameAsMine}
          onClick={() => onApply({ ...company, ...personalPart(appearance) })}>
          Mening ko'rinishimni standart qilish
        </Button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {["operator", "designer", "printer", "admin"].map((role) => (
          <Field key={role} label={ROLE_LABELS[role]}>
            <select data-testid={`role-theme-${role}`} value={rd[role] || ""} onChange={(e) => setRole(role, e.target.value)} style={getInputStyle()}>
              <option value="">Kompaniya standarti</option>
              {THEMES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
        ))}
      </div>
    </Card>
  );
}

export function AppearancePreviewCard({ appearance }) {
  return (
    <Card>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: THEME.mutedDark, marginBottom: 8 }}>Ko'rinish namunasi</div>
      <div style={{ borderRadius: THEME.radius, overflow: "hidden", border: `1px solid ${THEME.border}`, display: "flex" }}>
        <div style={{ width: 92, background: THEME.navBg, borderRight: `1px solid ${THEME.navBorder}`, padding: 10, display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
          <div style={{ width: 20, height: 20, borderRadius: 5, background: THEME.text, marginBottom: 4 }} />
          <div style={{ height: 20, borderRadius: 5, background: THEME.navActiveBg, display: "flex", alignItems: "center", padding: "0 6px", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: THEME.violet }} /><span style={{ flex: 1, height: 5, borderRadius: 3, background: THEME.text, opacity: 0.6 }} />
          </div>
          {[70, 82, 60].map((w) => <div key={w} style={{ width: `${w}%`, height: 5, borderRadius: 3, background: THEME.border2, margin: "6px 6px 0" }} />)}
        </div>
        <div style={{ flex: 1, background: THEME.surface, padding: 12 }}>
          <div style={{ background: THEME.card, borderRadius: Math.max(6, THEME.radius - 2), padding: 12, border: `1px solid ${THEME.border}` }}>
            <div style={{ fontSize: 11, color: THEME.muted }}>Buyurtmalar summasi</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: THEME.text, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>248 500 000 so'm</div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <div style={{ padding: "5px 10px", borderRadius: 6, background: THEME.violet, color: THEME.onPrimary, fontSize: 10.5, fontWeight: 600 }}>Buyurtma</div>
              <div style={{ padding: "5px 10px", borderRadius: 6, background: THEME.card, color: THEME.text, fontSize: 10.5, fontWeight: 600, border: `1px solid ${THEME.border2}` }}>Filtr</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: THEME.dim, marginTop: 10 }}>
        Sozlamalarni o'zgartirsangiz, bu namuna va butun dastur darhol yangilanadi.
      </div>
    </Card>
  );
}
