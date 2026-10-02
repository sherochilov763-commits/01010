// PeriodPicker.jsx — CRM natijalari va arxiv uchun davr tanlagich
import { getInputStyle } from "../../components/ui.jsx";
import { THEME } from "../../theme.js";

export const PERIOD_OPTIONS = [
  { key: "month", label: "Joriy oy" },
  { key: "prev", label: "O'tgan oy" },
  { key: "quarter", label: "Chorak" },
  { key: "year", label: "Yil" },
  { key: "range", label: "Oraliq" },
];

export function PeriodPicker({ value, onChange, withAll = false }) {
  const opts = withAll ? [...PERIOD_OPTIONS, { key: "all", label: "Barchasi" }] : PERIOD_OPTIONS;
  const seg = (active) => ({ padding: "0 12px", height: 28, borderRadius: 6, border: 0, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap",
    background: active ? THEME.chip : "transparent", color: active ? THEME.text : THEME.muted });
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} data-testid="period-picker">
      <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 9, background: THEME.card, border: `1px solid ${THEME.border}`, overflowX: "auto", maxWidth: "100%" }} role="radiogroup" aria-label="Davr">
        {opts.map((o) => (
          <button key={o.key} type="button" role="radio" aria-checked={value.mode === o.key} data-period={o.key} style={seg(value.mode === o.key)} onClick={() => onChange({ ...value, mode: o.key })}>{o.label}</button>
        ))}
      </div>
      {value.mode === "range" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="date" value={value.from || ""} onChange={(e) => onChange({ ...value, from: e.target.value })} style={{ ...getInputStyle(), width: 150 }} aria-label="Boshlanish sanasi" />
          <span style={{ color: THEME.muted }}>—</span>
          <input type="date" value={value.to || ""} onChange={(e) => onChange({ ...value, to: e.target.value })} style={{ ...getInputStyle(), width: 150 }} aria-label="Tugash sanasi" />
        </div>
      )}
    </div>
  );
}
