// RolesSection.jsx — Sozlamalar → «Rollar va huquqlar» (faqat rahbar).
// Chapda rollar, o'ngda guruhlar bo'yicha tugmalar: har rol andoza bilan keladi, rahbar faqat farqini o'zgartiradi.
// Andozadan farq — sariq. «Rol bo'lib ko'rish» — shu roldagi xodim ko'zi bilan (faqat ko'rish).
// Shu fayldagi PermEditor va EmpOverrides — Xodimlar → ✎ oynasida ham ishlatiladi.
import { useEffect, useMemo, useState } from "react";
import { Briefcase, ChevronDown, ChevronLeft, ChevronRight, Crown, Eye, Factory, Headset, Lock, Palette, Plus, Printer, RotateCcw, Search, Settings2, ShoppingBag, Wallet, Wrench, X } from "lucide-react";
import { Card, useIsMobile } from "../../components/ui.jsx";
import { fetchRoles, saveRolePerms, startViewAs } from "../../storage.js";
import { GROUPS, LOCKED, PERMS, BY_KEY, can as canFn, isWorkerRole } from "../../lib/permissions.js";
import { THEME } from "../../theme.js";

export const ROLE_META = {
  admin: ["Rahbar", Crown], manager: ["Katta menejer", Briefcase], operator: ["Operator", Headset],
  designer: ["Dizayner", Palette], printer: ["Pechatchi", Printer], installer: ["Montajchi", Wrench],
};
const GROUP_ICON = { sales: ShoppingBag, finance: Wallet, production: Factory, system: Settings2 };
const SCOPE_L = { none: "Yo'q", own: "O'ziniki", line: "Yo'nalishi", all: "Hammasi" };
const REQ_L = [["yes", "Ha"], ["req", "So'rov"], ["no", "Yo'q"]];
const fmtSum = (n) => Math.round(Number(n) || 0).toLocaleString("ru-RU").replace(/\s/g, " ");
export const permsFor = (role) => PERMS.filter((p) => !isWorkerRole(role) || p.workers);
const defOf = (role) => Object.fromEntries(PERMS.map((p) => [p.k, p.def[role]]));

function Toggle({ on, onChange, disabled, label, testid }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} data-testid={testid}
      style={{ width: 40, height: 23, borderRadius: 12, border: 0, padding: 0, background: on ? THEME.greenSolid : THEME.border2, position: "relative", cursor: disabled ? "default" : "pointer", flexShrink: 0, opacity: disabled ? 0.5 : 1, transition: "background .15s" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 20 : 3, width: 17, height: 17, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.25)", transition: "left .15s" }} />
    </button>
  );
}
function Seg({ value, options, onChange, disabled, testid }) {
  return (
    <span role="radiogroup" data-testid={testid} style={{ display: "inline-flex", background: THEME.chip, borderRadius: 9, padding: 2, gap: 2, flexShrink: 0 }}>
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} disabled={disabled} onClick={() => onChange(v)} data-v={v}
          style={{ border: 0, borderRadius: 7, padding: "4px 9px", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: disabled ? "default" : "pointer", background: value === v ? THEME.card : "transparent", color: value === v ? THEME.text : THEME.muted, boxShadow: value === v ? THEME.shadowSm : "none", whiteSpace: "nowrap" }}>{l}</button>
      ))}
    </span>
  );
}

// Bitta huquqning qiymatini o'zgartirish (turiga qarab)
export function PermEditor({ p, value, onChange, disabled }) {
  const tid = `perm-${p.k}`;
  if (p.t === "bool") return <Toggle on={!!value} onChange={onChange} disabled={disabled} label={p.l} testid={tid} />;
  if (p.t === "req") return <Seg value={value} options={REQ_L} onChange={onChange} disabled={disabled} testid={tid} />;
  if (p.t === "scope") {
    const opts = p.opts.filter((o) => o !== "none");
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {value !== "none" && <Seg value={value} options={opts.map((o) => [o, SCOPE_L[o]])} onChange={onChange} disabled={disabled} testid={`${tid}-scope`} />}
        <Toggle on={value !== "none"} onChange={(on) => onChange(on ? (opts.includes("line") ? "line" : opts[0]) : "none")} disabled={disabled} label={p.l} testid={tid} />
      </span>
    );
  }
  if (p.t === "limit") {
    const on = value === -1 || value > 0;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {on && value !== -1 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input value={fmtSum(value)} disabled={disabled} onChange={(e) => onChange(Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1))} inputMode="numeric" data-testid={`${tid}-sum`} aria-label={`${p.l}: summa`}
              style={{ width: 110, height: 30, borderRadius: 8, border: `1px solid ${THEME.border2}`, padding: "0 8px", fontFamily: "inherit", fontSize: 13, fontWeight: 600, textAlign: "right", background: THEME.card, color: THEME.text }} />
            <span style={{ fontSize: 12, color: THEME.muted }}>so'm</span>
          </span>)}
        {on && <Seg value={value === -1 ? "inf" : "sum"} options={[["sum", "Summagacha"], ["inf", "Cheksiz"]]} onChange={(m) => onChange(m === "inf" ? -1 : 500000)} disabled={disabled} testid={`${tid}-mode`} />}
        <Toggle on={on} onChange={(v) => onChange(v ? 500000 : 0)} disabled={disabled} label={p.l} testid={tid} />
      </span>
    );
  }
  return null;
}
// Qiymatni qisqa matn bilan (jurnal, istisno ro'yxati)
export function valText(p, v) {
  if (p.t === "bool") return v ? "ha" : "yo'q";
  if (p.t === "req") return v === "yes" ? "ha" : v === "req" ? "so'rov bilan" : "yo'q";
  if (p.t === "scope") return (SCOPE_L[v] || v).toLowerCase();
  if (p.t === "limit") return v === -1 ? "cheksiz" : v > 0 ? `${fmtSum(v)} so'm gacha` : "yo'q";
  return String(v);
}

export function RolesSection({ employees = [] }) {
  const isMobile = useIsMobile();
  const [cfg, setCfg] = useState(null);
  const [counts, setCounts] = useState({});
  const [role, setRole] = useState(isMobile ? null : "manager");
  const [draft, setDraft] = useState(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { fetchRoles().then((r) => { setCfg(r.roles || {}); setCounts(r.counts || {}); }).catch((e) => setMsg(e.message)); }, []);
  const saved = useMemo(() => (role && cfg ? { ...defOf(role), ...(cfg[role] || {}) } : null), [role, cfg]);
  useEffect(() => { setDraft(saved); }, [saved]);
  const list = role ? permsFor(role) : [];
  const changed = draft && saved ? list.filter((p) => JSON.stringify(draft[p.k]) !== JSON.stringify(saved[p.k])) : [];
  const diffN = (r) => (cfg ? Object.keys(cfg[r] || {}).length : 0);
  const onN = (r, vals) => permsFor(r).filter((p) => canFn(vals, p.k)).length;

  async function save() {
    setBusy(true); setMsg("");
    try {
      const out = Object.fromEntries(list.filter((p) => !LOCKED.has(p.k)).map((p) => [p.k, draft[p.k]]));
      setCfg(await saveRolePerms(role, out));
      window.dispatchEvent(new Event("uvix:perms-changed"));
      setMsg("Saqlandi — xodimlarda bir daqiqa ichida kuchga kiradi");
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function viewAs() {
    try { await startViewAs({ role }); window.location.assign(window.location.pathname); } catch (e) { setMsg(e.message); }
  }

  const roleList = (
    <div data-testid="roles-list" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: THEME.muted, padding: "2px 8px 6px" }}>ROLLAR</div>
      {Object.entries(ROLE_META).map(([r, [label, I]]) => {
        const on = role === r, locked = r === "admin";
        const vals = cfg ? { ...defOf(r), ...(cfg[r] || {}) } : defOf(r);
        return (
          <button key={r} type="button" disabled={locked} onClick={() => setRole(r)} data-role={r} aria-pressed={on}
            style={{ display: "flex", alignItems: "center", gap: 9, padding: isMobile ? "12px 12px" : "9px 10px", borderRadius: 11, border: isMobile ? `1px solid ${on ? THEME.blue : THEME.border}` : 0, background: on ? THEME.card : isMobile ? THEME.card : "transparent", boxShadow: on && !isMobile ? THEME.shadowSm : "none", color: on ? THEME.blue : THEME.text, fontFamily: "inherit", fontSize: 14, fontWeight: 600, textAlign: "left", cursor: locked ? "default" : "pointer" }}>
            <I size={16} />
            <span style={{ flex: 1, minWidth: 0 }}>{label}
              <small style={{ display: "block", fontSize: 11.5, color: THEME.muted, fontWeight: 500 }}>{locked ? "hamma narsa · qulflangan" : `${counts[r] || 0} xodim · ${onN(r, vals)}/${permsFor(r).length}`}</small>
            </span>
            {locked ? <Lock size={13} color={THEME.muted} /> : diffN(r) > 0 && <span data-role-diff={r} style={{ fontSize: 11, fontWeight: 700, color: THEME.amberText, background: THEME.amberBg, borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" }}>{diffN(r)} farq</span>}
            {isMobile && !locked && <ChevronRight size={16} color={THEME.muted} />}
          </button>
        );
      })}
    </div>
  );

  const editor = role && draft && (
    <div data-testid="role-editor" style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        {isMobile && <button type="button" onClick={() => setRole(null)} aria-label="Orqaga" style={{ border: 0, background: "none", padding: 0, color: THEME.text, cursor: "pointer", display: "grid" }}><ChevronLeft size={20} /></button>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 17 }}>{ROLE_META[role][0]}</b>
          <div style={{ fontSize: 12, color: THEME.muted }}>{employees.filter((e) => e.role === role && !e.deletedAt).map((e) => e.name).join(" · ") || "bu rolda xodim yo'q"}</div>
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${THEME.border2}`, borderRadius: 9, height: 34, padding: "0 10px", width: isMobile ? "100%" : 190 }}>
          <Search size={14} color={THEME.muted} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Huquq qidirish…" data-testid="perm-search" style={{ border: 0, outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 13, color: THEME.text, flex: 1, minWidth: 0 }} />
        </span>
        <button type="button" onClick={viewAs} data-testid="role-viewas" disabled={!counts[role]} title={counts[role] ? "Shu rol bo'lib ko'rish (faqat ko'rish)" : "Bu rolda xodim yo'q"}
          style={{ height: 34, padding: "0 12px", borderRadius: 9, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, fontFamily: "inherit", fontWeight: 700, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6, cursor: counts[role] ? "pointer" : "default", opacity: counts[role] ? 1 : 0.5 }}><Eye size={14} /> Rol bo'lib ko'rish</button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: THEME.greenText, background: THEME.greenBg, borderRadius: 999, padding: "3px 10px" }} data-testid="perm-on-count">{onN(role, draft)} / {list.length} yoqilgan</span>
        {list.some((p) => draft[p.k] !== p.def[role]) && <span style={{ fontSize: 12, fontWeight: 700, color: THEME.amberText, background: THEME.amberBg, borderRadius: 999, padding: "3px 10px" }}>{list.filter((p) => draft[p.k] !== p.def[role]).length} ta andozadan farq</span>}
        {list.some((p) => draft[p.k] !== p.def[role]) && <button type="button" onClick={() => setDraft(defOf(role))} data-testid="role-reset" style={{ fontSize: 12, fontWeight: 700, color: THEME.text, background: THEME.chip, borderRadius: 999, padding: "3px 10px", border: 0, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}><RotateCcw size={12} /> Andozaga qaytarish</button>}
      </div>
      {isWorkerRole(role) && <div style={{ fontSize: 12.5, color: THEME.muted, background: THEME.chip, borderRadius: 10, padding: "8px 10px", margin: "8px 0", lineHeight: 1.45 }}>{ROLE_META[role][0]} — ishchi ilovasida ishlaydi (o'z vazifalari). Shuning uchun faqat ishchiga tegishli huquqlar ko'rsatiladi; pul summalari hech qachon ko'rinmaydi.</div>}
      {GROUPS.map(([g, gl]) => {
        const items = list.filter((p) => p.g === g && (!q || p.l.toLowerCase().includes(q.toLowerCase())));
        if (!items.length) return null;
        const GI = GROUP_ICON[g];
        const isOpen = !!q || (open[g] ?? (isWorkerRole(role) || g === "sales" || g === "finance"));
        return (
          <div key={g} data-perm-group={g} style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, marginTop: 10, background: THEME.card }}>
            <button type="button" onClick={() => setOpen((o) => ({ ...o, [g]: !isOpen }))} aria-expanded={isOpen}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "11px 12px", border: 0, background: "none", fontFamily: "inherit", fontWeight: 700, fontSize: 14, color: THEME.text, cursor: "pointer" }}>
              {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<GI size={15} /> {gl}
              <small style={{ marginLeft: "auto", color: THEME.muted, fontWeight: 600, fontSize: 12 }}>{items.filter((p) => canFn(draft, p.k)).length} / {items.length}</small>
            </button>
            {isOpen && (
              <div style={{ borderTop: `1px solid ${THEME.border}`, padding: "0 12px" }}>
                {items.map((p, i) => {
                  const locked = LOCKED.has(p.k);
                  const diff = !locked && draft[p.k] !== p.def[role];
                  return (
                    <div key={p.k} data-perm-row={p.k} data-diff={diff ? "1" : "0"}
                      style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile && p.t !== "bool" ? "column" : "row", gap: isMobile ? 8 : 12, padding: "10px 12px", margin: "0 -12px", borderBottom: i < items.length - 1 ? `1px solid ${THEME.border}` : 0, background: diff ? THEME.amberBg : "transparent" }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>
                        {locked && <Lock size={12} style={{ verticalAlign: -1, marginRight: 4, color: THEME.muted }} />}{p.l}
                        <small style={{ display: "block", fontSize: 12, fontWeight: 500, color: diff ? THEME.amberText : THEME.muted }}>{diff ? `andozadan farq · andoza: ${valText(p, p.def[role])}` : locked ? "faqat rahbar — xavfsizlik uchun berilmaydi" : p.h}</small>
                      </span>
                      <PermEditor p={p} value={locked ? p.def[role] : draft[p.k]} disabled={locked} onChange={(v) => setDraft((d) => ({ ...d, [p.k]: v }))} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {changed.length > 0 && (
        <div data-testid="roles-savebar" style={{ position: "sticky", bottom: 12, marginTop: 14, background: "#18181B", color: "#fff", borderRadius: 14, padding: "9px 10px 9px 16px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 10px 26px rgba(0,0,0,.3)", zIndex: 5 }}>
          <span style={{ flex: 1, fontSize: 13.5 }}>{changed.length} ta o'zgarish · {ROLE_META[role][0]} ({counts[role] || 0} xodim)</span>
          <button type="button" onClick={() => setDraft(saved)} style={{ height: 32, padding: "0 12px", borderRadius: 9, border: 0, background: "#3F3F46", color: "#fff", fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>Bekor</button>
          <button type="button" onClick={save} disabled={busy} data-testid="roles-save" style={{ height: 32, padding: "0 14px", borderRadius: 9, border: 0, background: "#16A34A", color: "#fff", fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>Saqlash</button>
        </div>
      )}
    </div>
  );

  if (!cfg) return <Card><div style={{ color: THEME.muted, fontSize: 13 }}>{msg || "Yuklanmoqda…"}</div></Card>;
  return (
    <Card>
      <div data-testid="roles-section" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {(!isMobile || !role) && <div style={{ width: isMobile ? "100%" : 230, flexShrink: 0 }}>{roleList}</div>}
        {editor}
      </div>
      {msg && <div role="status" style={{ marginTop: 10, fontSize: 13, color: THEME.greenText }}>{msg}</div>}
    </Card>
  );
}

// Xodimga istisno: rolidan farqli huquqlar (Xodimlar → ✎)
export function EmpOverrides({ role, value, onChange, base }) {
  const bv = (p) => (base && p.k in base ? base[p.k] : p.def[role]);
  const [adding, setAdding] = useState(false);
  const entries = Object.entries(value || {}).filter(([k]) => BY_KEY.has(k) && !LOCKED.has(k));
  const avail = permsFor(role).filter((p) => !LOCKED.has(p.k) && !(p.k in (value || {})));
  return (
    <div data-testid="emp-overrides" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ fontSize: 13.5 }}>Faqat shu xodimga istisno</b>
        {entries.length > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: THEME.amberText, background: THEME.amberBg, borderRadius: 999, padding: "1px 8px" }}>{entries.length}</span>}
        <button type="button" onClick={() => setAdding((v) => !v)} data-testid="override-add" style={{ marginLeft: "auto", border: 0, background: "none", color: THEME.blue, fontFamily: "inherit", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}><Plus size={14} /> Qo'shish</button>
      </div>
      {adding && (
        <select autoFocus defaultValue="" data-testid="override-pick" onChange={(e) => { const p = BY_KEY.get(e.target.value); if (p) onChange({ ...(value || {}), [p.k]: bv(p) }); setAdding(false); }}
          style={{ height: 38, borderRadius: 10, border: `1px solid ${THEME.border2}`, padding: "0 8px", fontFamily: "inherit", fontSize: 13.5, background: THEME.card, color: THEME.text }}>
          <option value="" disabled>Qaysi huquq?</option>
          {GROUPS.map(([g, gl]) => <optgroup key={g} label={gl}>{avail.filter((p) => p.g === g).map((p) => <option key={p.k} value={p.k}>{p.l}</option>)}</optgroup>)}
        </select>
      )}
      {entries.length === 0 && !adding && <div style={{ fontSize: 12.5, color: THEME.muted }}>Yo'q — rolidagi huquqlar amal qiladi.</div>}
      {entries.length > 0 && (
        <div style={{ background: THEME.amberBg, border: `1px solid ${THEME.amberBorder || THEME.border}`, borderRadius: 12, padding: "4px 12px" }}>
          {entries.map(([k, v], i) => {
            const p = BY_KEY.get(k);
            return (
              <div key={k} data-override={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < entries.length - 1 ? `1px solid ${THEME.border}` : 0, flexWrap: "wrap" }}>
                <span style={{ flex: 1, minWidth: 140, fontSize: 13, fontWeight: 600 }}>{p.l}<small style={{ display: "block", fontWeight: 500, color: THEME.amberText, fontSize: 11.5 }}>rolida: {valText(p, bv(p))}</small></span>
                <PermEditor p={p} value={v} onChange={(nv) => onChange({ ...value, [k]: nv })} />
                <button type="button" onClick={() => { const n = { ...value }; delete n[k]; onChange(n); }} aria-label="Istisnoni olib tashlash" style={{ border: 0, background: "none", color: THEME.muted, cursor: "pointer", padding: 2, display: "grid" }}><X size={15} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
