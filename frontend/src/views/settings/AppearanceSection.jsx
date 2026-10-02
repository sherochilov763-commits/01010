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
      <div style={{ display: "flex", gap: 2, background: THEME.chip, borderRadius: 9, padding: 3 }}>
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => set({ [valueKey]: o.v })}
            style={{
              flex: 1, padding: "7px 0", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
              background: appearance[valueKey] === o.v ? THEME.card : "transparent",
              color: appearance[valueKey] === o.v ? THEME.text : THEME.muted,
              boxShadow: appearance[valueKey] === o.v ? THEME.shadowSm : "none",
            }}
          >
            {o.l}
          </button>
        ))}
      </div>
    );
  }

  const COLOR_OPTS = ["blue", "graphite", "indigo", "emerald", "orange"].map((v) => {
    const p = APPEARANCE_COLOR_PRESETS[v];
    return { v, l: p.label, primary: THEME.isDark ? p.primaryDark : p.primary };
  });

  return (
    <Card>
      <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 4 }}>Ko'rinish</div>
      <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 16 }}>Butun tizimning rangi va ko'rinishini sozlang. O'zgarishlar darhol qo'llanadi.</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: THEME.mutedDark, marginBottom: 8 }}>Rejim</div>
          {segmented([{ v: "light", l: "Yorug'" }, { v: "soft", l: "Kulrang" }, { v: "dark", l: "Grafit (tungi)" }], "mode")}
        </div>

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: THEME.mutedDark, marginBottom: 8 }}>Asosiy rang</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            {COLOR_OPTS.map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => set({ colorScheme: o.v })}
                title={o.l}
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

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: THEME.mutedDark, marginBottom: 8 }}>Zichlik</div>
          {segmented([{ v: "compact", l: "Ixcham" }, { v: "comfortable", l: "O'rtacha" }, { v: "spacious", l: "Keng" }], "density")}
        </div>

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: THEME.mutedDark, marginBottom: 8 }}>Burchak radiusi</div>
          {segmented([{ v: "sharp", l: "To'g'ri" }, { v: "medium", l: "O'rtacha" }, { v: "rounded", l: "Yumaloq" }], "radius")}
        </div>

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: THEME.mutedDark, marginBottom: 8 }}>Sidebar uslubi</div>
          {segmented([{ v: "modern", l: "Standart" }, { v: "classic", l: "Chiziqli" }, { v: "minimal", l: "Minimal" }], "sidebarStyle")}
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
