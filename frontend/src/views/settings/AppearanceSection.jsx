import { useEffect, useState } from "react";
import { Button, Card, Field } from "../../components/ui.jsx";
import { APPEARANCE_COLOR_PRESETS, DEFAULT_APPEARANCE, THEME } from "../../theme.js";

/* ---------------- SETTINGS VIEW ---------------- */

/* ---------------- SOZLAMALAR ---------------- */
export function AppearanceSection({ appearance, onApply }) {
  const [customPrimary, setCustomPrimary] = useState(appearance.customPrimary || DEFAULT_APPEARANCE.customPrimary);
  const [customAccent, setCustomAccent] = useState(appearance.customAccent || DEFAULT_APPEARANCE.customAccent);

  useEffect(() => {
    setCustomPrimary(appearance.customPrimary || DEFAULT_APPEARANCE.customPrimary);
    setCustomAccent(appearance.customAccent || DEFAULT_APPEARANCE.customAccent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearance.customPrimary, appearance.customAccent]);

  function set(patch) {
    onApply({ ...appearance, ...patch });
  }
  function segmented(options, valueKey) {
    return (
      <div style={{ display: "flex", gap: 6, background: THEME.surface, borderRadius: 11, padding: 3 }}>
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => set({ [valueKey]: o.v })}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
              background: appearance[valueKey] === o.v ? THEME.card : "transparent",
              color: appearance[valueKey] === o.v ? THEME.violet : THEME.muted,
              boxShadow: appearance[valueKey] === o.v ? THEME.shadowSm : "none",
            }}
          >
            {o.l}
          </button>
        ))}
      </div>
    );
  }

  const COLOR_OPTS = [
    { v: "purple", l: "Purple", ...APPEARANCE_COLOR_PRESETS.purple },
    { v: "blue", l: "Blue", ...APPEARANCE_COLOR_PRESETS.blue },
    { v: "emerald", l: "Emerald", ...APPEARANCE_COLOR_PRESETS.emerald },
    { v: "orange", l: "Orange", ...APPEARANCE_COLOR_PRESETS.orange },
    { v: "pink", l: "Pink", ...APPEARANCE_COLOR_PRESETS.pink },
  ];

  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>Ko'rinish</div>
      <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 16 }}>Butun tizimning rangi va ko'rinishini sozlang. O'zgarishlar darhol qo'llanadi.</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>Rejim</div>
          {segmented([{ v: "dark", l: "Tungi" }, { v: "light", l: "Tiniq" }, { v: "soft", l: "Yumshoq" }], "mode")}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>Asosiy rang</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            {COLOR_OPTS.map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => set({ colorScheme: o.v })}
                title={o.l}
                style={{
                  width: 38, height: 38, borderRadius: "50%", cursor: "pointer", padding: 3,
                  background: "none", display: "flex", alignItems: "center", justifyContent: "center",
                  border: appearance.colorScheme === o.v ? `2.5px solid ${o.primary}` : `2px solid ${THEME.border}`,
                }}
              >
                <span style={{ width: "100%", height: "100%", borderRadius: "50%", display: "block", background: `linear-gradient(135deg, ${o.primary}, ${o.accent})` }} />
              </button>
            ))}
            <button
              type="button"
              onClick={() => set({ colorScheme: "custom" })}
              title="Custom"
              style={{
                width: 38, height: 38, borderRadius: "50%", cursor: "pointer", fontSize: 15,
                background: THEME.card, display: "flex", alignItems: "center", justifyContent: "center",
                border: appearance.colorScheme === "custom" ? `2.5px solid ${THEME.text}` : `2px dashed ${THEME.border}`,
              }}
            >
              🎨
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

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>Zichlik</div>
          {segmented([{ v: "compact", l: "Compact" }, { v: "comfortable", l: "Comfortable" }, { v: "spacious", l: "Spacious" }], "density")}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>Burchak radiusi</div>
          {segmented([{ v: "sharp", l: "Sharp" }, { v: "medium", l: "Medium" }, { v: "rounded", l: "Rounded" }], "radius")}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>Sidebar uslubi</div>
          {segmented([{ v: "classic", l: "Classic" }, { v: "modern", l: "Modern" }, { v: "minimal", l: "Minimal" }], "sidebarStyle")}
        </div>

        <Button variant="ghost" onClick={() => onApply(DEFAULT_APPEARANCE)} style={{ alignSelf: "flex-start" }}>
          Standart ko'rinishga qaytarish
        </Button>
      </div>
    </Card>
  );
}
export function AppearancePreviewCard({ appearance }) {
  return (
    <Card>
      <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>Ko'rinish namunasi</div>
      <div style={{ borderRadius: THEME.radius, overflow: "hidden", border: `1px solid ${THEME.border}`, display: "flex" }}>
        <div style={{ width: 84, background: THEME.ink, padding: 12, display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, background: `linear-gradient(135deg, ${THEME.violet}, ${THEME.cyan})` }} />
          <div style={{ width: "100%", height: 8, borderRadius: 4, background: THEME.violet }} />
          <div style={{ width: "70%", height: 8, borderRadius: 4, background: "rgba(255,255,255,0.15)" }} />
          <div style={{ width: "80%", height: 8, borderRadius: 4, background: "rgba(255,255,255,0.15)" }} />
        </div>
        <div style={{ flex: 1, background: THEME.surface, padding: 14 }}>
          <div style={{ background: THEME.card, borderRadius: Math.max(6, THEME.radius - 6), padding: 12, border: `1px solid ${THEME.borderSoft}` }}>
            <div style={{ fontSize: 10, color: THEME.muted, fontWeight: 700, textTransform: "uppercase" }}>UMUMIY BUYURTMA</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: THEME.text, marginTop: 4 }}>248 500 000 so'm</div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <div style={{ padding: "5px 10px", borderRadius: Math.max(6, THEME.radius - 10), background: THEME.violet, color: "#fff", fontSize: 10.5, fontWeight: 700 }}>Dashboard</div>
              <div style={{ padding: "5px 10px", borderRadius: Math.max(6, THEME.radius - 10), background: THEME.card, color: THEME.muted, fontSize: 10.5, fontWeight: 700, border: `1px solid ${THEME.border}` }}>Buyurtmalar</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: THEME.muted, marginTop: 10 }}>
        Chapdagi sozlamalarni o'zgartirsangiz, bu namuna va butun dastur darhol yangilanadi.
      </div>
    </Card>
  );
}
