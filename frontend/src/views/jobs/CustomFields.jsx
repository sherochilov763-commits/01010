// CustomFields.jsx — o'zim qo'shgan ustunlar (✦): katakni bosib to'ldirish, formadagi maydon.
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { THEME } from "../../theme.js";
import { fmtCustom } from "./jobsPrefs.js";

const inputStyle = { height: 34, border: `1.5px solid ${THEME.blue}`, borderRadius: 8, padding: "0 8px", fontFamily: "inherit", fontSize: 13.5, background: THEME.card, color: THEME.text, outline: "none", width: "100%", boxSizing: "border-box" };

export function CustomInput({ f, value, onChange, employees = [], autoFocus, onDone, style }) {
  const st = { ...inputStyle, ...(style || {}) };
  const key = (e) => { if (e.key === "Enter") onDone?.(); if (e.key === "Escape") onDone?.(true); };
  if (f.type === "check") {
    return (
      <button type="button" onClick={() => onChange(!value)} aria-pressed={!!value} data-cf-input={f.id}
        style={{ width: 26, height: 26, borderRadius: 7, border: `1.5px solid ${value ? THEME.green : THEME.border2}`, background: value ? THEME.green : THEME.card, color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", padding: 0 }}>
        {value && <Check size={15} strokeWidth={3} />}
      </button>
    );
  }
  if (f.type === "select" || f.type === "person") {
    const opts = f.type === "select" ? f.options.map((o) => [o, o]) : employees.filter((e) => e.role !== "admin").map((e) => [e.id, e.name]);
    return (
      <select autoFocus={autoFocus} value={value ?? ""} onChange={(e) => { onChange(e.target.value || null); }} onBlur={() => onDone?.()} onKeyDown={key} style={st} data-cf-input={f.id}>
        <option value="">—</option>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    );
  }
  return (
    <input autoFocus={autoFocus} type={f.type === "date" ? "date" : "text"} inputMode={f.type === "number" ? "decimal" : undefined} value={value ?? ""}
      onChange={(e) => onChange(e.target.value)} onBlur={() => onDone?.()} onKeyDown={key} style={st} data-cf-input={f.id} placeholder={f.type === "number" ? "0" : ""} />
  );
}

// Jadval katagi / panel qatori: qiymat yoki «+ kiritish»; bosilsa — shu yerning o'zida tahrir
export function CustomValue({ f, j, employees, onSave, align = "left" }) {
  const v = j.custom?.[f.id];
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(v ?? "");
  const saved = useRef(false);
  useEffect(() => { if (!edit) setDraft(v ?? ""); }, [v, edit]);
  if (f.kinds?.length && !f.kinds.includes(j.kind)) return <span style={{ color: THEME.dim }}>·</span>;
  if (f.type === "check") return <span onClick={(e) => e.stopPropagation()}><CustomInput f={f} value={!!v} onChange={(nv) => onSave({ [f.id]: nv })} /></span>;
  if (edit) {
    const done = (cancel) => {
      if (saved.current) return; saved.current = true;
      setEdit(false);
      if (!cancel && String(draft ?? "") !== String(v ?? "")) onSave({ [f.id]: draft === "" ? null : draft });
    };
    return (
      <span onClick={(e) => e.stopPropagation()} style={{ display: "block", minWidth: 90 }}>
        <CustomInput f={f} value={draft} employees={employees} autoFocus onChange={(nv) => { setDraft(nv ?? ""); if (f.type === "select" || f.type === "person" || f.type === "date") { saved.current = true; setEdit(false); if (String(nv ?? "") !== String(v ?? "")) onSave({ [f.id]: nv || null }); } }} onDone={done} />
      </span>
    );
  }
  const txt = fmtCustom(f, v, employees);
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); saved.current = false; setEdit(true); }} data-cf={f.id} data-cf-job={j.id}
      style={{ border: 0, background: "none", padding: "2px 0", cursor: "text", fontFamily: "inherit", fontSize: 13.5, textAlign: align, color: txt ? THEME.text : THEME.blue, fontWeight: txt ? 600 : 500, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {txt || "+ kiritish"}
    </button>
  );
}
