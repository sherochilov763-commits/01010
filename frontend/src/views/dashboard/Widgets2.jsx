// Widgets2.jsx — yangi Dashboard bloklari (eskiz 51–56): 4 raqam, tushum grafigi, menejerlar, diqqat, so'nggi to'lovlar,
// rasxod (dumaloq), to'lov turlari, oylik xarajatlar, qarz yoshi, ishlab chiqarish, mijozlar va chek; ixtiyoriylar.
import { useMemo, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, ChevronRight, CircleDashed, Clock, CreditCard, Landmark, Maximize2, Package, Palette, Plus, Send, ShieldCheck, Trash2, Trophy, Wallet } from "lucide-react";
import { Button, Card, Modal, getInputStyle } from "../../components/ui.jsx";
import { fmt, localDateStr, money } from "../../lib/format.js";
import { LINE_META, lineColor } from "../../lib/lines.js";
import { PROD_LABEL, prodColors } from "../../lib/production.js";
import { THEME } from "../../theme.js";

export const mln = (v) => { const n = Number(v) || 0; const a = Math.abs(n); const s = n < 0 ? "−" : ""; return a >= 1e6 ? `${s}${(Math.round(a / 1e5) / 10).toLocaleString("ru-RU")} mln` : `${s}${fmt(Math.round(a))}`; };
const UZ_M = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
export const dayUz = (iso) => { if (!iso) return ""; const [, m, d] = String(iso).slice(0, 10).split("-").map(Number); return `${d}-${UZ_M[m - 1]}`; };

export function Spark({ values, color, w = 96, h = 28 }) {
  const v = values && values.length > 1 ? values : [0, 0];
  const max = Math.max(1, ...v);
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 3 - (x / max) * (h - 6)).toFixed(1)}`).join(" ");
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ display: "block", flexShrink: 0 }}><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}
export function Delta({ pct, abs, good = "up", suffix }) {
  if (pct == null && abs == null) return null;
  const v = pct != null ? pct : abs;
  if (v === 0) return <span style={{ fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.chip, borderRadius: 6, padding: "1px 6px" }}>0{pct != null ? "%" : ""}</span>;
  const up = v > 0, isGood = good === "up" ? up : !up;
  const txt = pct != null ? `${up ? "+" : "−"}${Math.abs(pct)}%` : `${up ? "+" : "−"}${mln(Math.abs(abs))}`;
  return <span data-delta style={{ fontSize: 11.5, fontWeight: 700, color: isGood ? THEME.greenText || THEME.green : THEME.rose, background: isGood ? THEME.greenBg : THEME.roseBg, borderRadius: 6, padding: "1px 6px", whiteSpace: "nowrap" }}>{txt}{suffix || ""}</span>;
}
const Head = ({ title, right, children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
    <b style={{ fontSize: 14.5, fontWeight: 650 }}>{title}</b>{children}
    {right != null && <span style={{ marginLeft: "auto", fontSize: 12, color: THEME.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{right}</span>}
  </div>
);
const More = ({ text, onClick }) => onClick ? <button type="button" onClick={onClick} style={{ marginTop: 12, padding: 0, border: 0, background: "none", color: THEME.blue || THEME.violet, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>{text} →</button> : null;
const box = { padding: "16px 18px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" };

/* ---------- 1. To'rtta asosiy raqam ---------- */
function Kpi({ id, label, value, sub, spark, color, onClick, valueColor }) {
  return (
    <Card className="uvix-dash-card" onClick={onClick} data-kpi={id} style={{ padding: "14px 16px", cursor: onClick ? "pointer" : "default", minWidth: 0 }}>
      <div style={{ fontSize: 12.5, color: THEME.muted }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 4, minWidth: 0 }}>
        <b style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: valueColor || THEME.text }}>{value}</b>
        {spark && <span style={{ marginLeft: "auto", minWidth: 0, overflow: "hidden" }}><Spark values={spark} color={color} /></span>}
      </div>
      <div style={{ marginTop: 5, fontSize: 12, color: THEME.muted, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{sub}</div>
    </Card>
  );
}
export function KpiRow({ k, prevLabel, canCash, cashNow, kassaNow, line, onGo }) {
  return (
    <div data-testid="dash-kpis" className="uvix-kpi-row" style={{ display: "grid", gridTemplateColumns: `repeat(${canCash ? 4 : 3}, minmax(0, 1fr))`, gap: 12 }}>
      <Kpi id="income" label="Tushum (kelgan pul)" value={mln(k.income)} color={THEME.green} spark={k.incomeSpark} onClick={() => onGo("operations", { typeFilter: "kirim" })}
        sub={k.incomeChange == null ? <span>oldingi davrda tushum yo'q</span> : <><Delta pct={k.incomeChange} /> <span>{prevLabel}</span></>} />
      <Kpi id="new" label="Yangi buyurtmalar" value={mln(k.newSum)} color={THEME.blue || THEME.violet} spark={k.newSpark} onClick={() => onGo("orders", {})}
        sub={<>{k.newChange != null && <Delta pct={k.newChange} />} <span>{k.newCount} ta</span></>} />
      <Kpi id="debt" label="Qarzdorlik" value={mln(k.debtNow)} color={THEME.rose} valueColor={k.debtNow > 0 ? THEME.text : THEME.muted} onClick={() => onGo("orders", { onlyDebt: true })}
        sub={<><Delta abs={k.debtDelta} good="down" /> <span>{k.debtors} mijoz</span></>} />
      {canCash && <Kpi id="cash" label="Kassada pul" value={mln(cashNow)} valueColor={cashNow < 0 ? THEME.rose : THEME.text} onClick={() => onGo("kassa", {})}
        sub={line === "all" && kassaNow ? <span>UVIX {mln(kassaNow.totals.UVIXPRINT)} · ONYX {mln(kassaNow.totals.UVONYX)}</span> : <span>hozir · Kassalar</span>} />}
    </div>
  );
}

/* ---------- 2. Tushum dinamikasi (o'tgan davr — punktir) ---------- */
export function RevenueChart({ cur, prev, title = "Tushum dinamikasi", prevLabel }) {
  const [hover, setHover] = useState(null);
  const bucket = cur.length > 62; // uzun oraliq — haftalarga yig'iladi
  const group = (arr) => { if (!bucket) return arr; const out = []; for (let i = 0; i < arr.length; i += 7) out.push({ date: arr[i].date, value: arr.slice(i, i + 7).reduce((s, x) => s + x.value, 0) }); return out; };
  const c = group(cur), p = group(prev || []);
  const max = Math.max(1, ...c.map((x) => x.value), ...p.map((x) => x.value)) * 1.08;
  const n = c.length;
  const h = hover != null ? c[hover] : null;
  return (
    <Card className="uvix-dash-card" data-testid="dash-revenue" style={box}>
      <Head title={title} right={h ? `${dayUz(h.date)}${bucket ? " (hafta)" : ""}: ${money(h.value)}${p[hover] ? ` · oldin ${mln(p[hover].value)}` : ""}` : <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: THEME.blue || THEME.violet, marginRight: 5 }} />shu davr &nbsp;<span style={{ letterSpacing: 1 }}>┅</span> {prevLabel || "oldingi"}</span>} />
      <div style={{ position: "relative", flex: 1, minHeight: 170, marginTop: 14 }} onMouseLeave={() => setHover(null)}>
        <div style={{ position: "absolute", inset: "0 0 18px 0", display: "flex", alignItems: "flex-end", gap: n > 40 ? 1 : 3 }}>
          {c.map((x, i) => (
            <div key={x.date} onMouseEnter={() => setHover(i)} title={`${dayUz(x.date)}: ${money(x.value)}`} style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", cursor: "default" }}>
              <div style={{ width: "100%", height: `${(x.value / max) * 100}%`, minHeight: x.value > 0 ? 2 : 0, background: THEME.blue || THEME.violet, opacity: hover == null || hover === i ? (i === n - 1 ? 1 : 0.85) : 0.45, borderRadius: "3px 3px 0 0" }} />
            </div>
          ))}
        </div>
        {p.length > 1 && (
          <svg viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" style={{ position: "absolute", inset: "0 0 18px 0", width: "100%", height: "calc(100% - 18px)", pointerEvents: "none" }} aria-hidden="true">
            <polyline points={p.slice(0, n).map((x, i) => `${i + 0.5},${100 - (x.value / max) * 100}`).join(" ")} fill="none" stroke={THEME.dim} strokeWidth="1.6" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", fontSize: 10.5, color: THEME.dim }}>
          {c.map((x, i) => <span key={x.date} style={{ flex: 1, textAlign: "center", whiteSpace: "nowrap", overflow: "visible" }}>{i % Math.max(1, Math.ceil(n / 8)) === 0 ? Number(x.date.slice(8)) : ""}</span>)}
        </div>
      </div>
    </Card>
  );
}

/* ---------- 3. Menejerlar (ixcham) + to'liq jadval ---------- */
const AV = ["#2563EB", "#DB2777", "#0E7C6B", "#7C3AED", "#EA580C", "#0891B2", "#65A30D", "#B45309"];
const avColor = (name) => { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AV[h % AV.length]; };
const ini = (name) => String(name || "?").trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
function Av({ name, size = 26 }) { return <span title={name} style={{ width: size, height: size, borderRadius: "50%", background: name === "Belgilanmagan" ? THEME.dim : avColor(name), color: "#fff", fontSize: size * 0.36, fontWeight: 800, display: "inline-grid", placeItems: "center", flexShrink: 0 }}>{ini(name)}</span>; }
export function ManagersPanel({ ms, hl, plans, onExpand }) {
  const cols = [["d", "Bugun"], ["w", "Hafta"], ["m", "Oy"]];
  const cell = (v, on) => <td style={{ padding: "8px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums", background: on ? (THEME.isDark ? "#1E3A5F55" : "#F2F7FF") : undefined, whiteSpace: "nowrap" }}><b style={{ fontSize: on ? 13 : 12.5, fontWeight: on ? 700 : 600, color: v ? THEME.text : THEME.dim }}>{v ? mln(v) : "—"}</b></td>;
  return (
    <Card className="uvix-dash-card" data-testid="dash-managers" style={box}>
      <Head title="Menejerlar">
        <button type="button" onClick={onExpand} data-testid="managers-expand" style={{ marginLeft: "auto", border: 0, background: "none", color: THEME.blue || THEME.violet, fontWeight: 700, fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>Kengaytirish <Maximize2 size={13} /></button>
      </Head>
      {ms.rows.length === 0 ? <div style={{ color: THEME.muted, fontSize: 13, padding: "20px 0", textAlign: "center" }}>Bu oy hali to'lov yo'q</div> : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6, fontSize: 12.5 }}>
          <thead><tr><th />{cols.map(([k, l]) => <th key={k} style={{ padding: "4px 6px", fontSize: 11, fontWeight: hl === k ? 800 : 600, color: hl === k ? THEME.blue || THEME.violet : THEME.muted, textAlign: "right" }}>{l}</th>)}</tr></thead>
          <tbody>
            {ms.rows.slice(0, 6).map((r, i) => {
              const plan = plans?.[r.name];
              return [
                <tr key={r.name} data-manager={r.name} style={{ borderTop: `1px solid ${THEME.border}` }}>
                  <td style={{ padding: "8px 6px", minWidth: 0 }}><span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}><Av name={r.name} size={24} /><b style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>{r.name.split(" ")[0]}</b>{i === 0 && r.m > 0 && <Trophy size={13} color="#D97706" />}</span></td>
                  {cell(r.d, hl === "d")}{cell(r.w, hl === "w")}{cell(r.m, hl === "m")}
                </tr>,
                plan > 0 ? <tr key={r.name + "p"}><td colSpan={4} style={{ padding: "0 6px 7px" }} title={`Oylik reja: ${money(plan)} · ${Math.round((r.m / plan) * 100)}%`}><span style={{ display: "block", height: 4, borderRadius: 2, background: THEME.chip }}><i style={{ display: "block", height: "100%", width: `${Math.min(100, (r.m / plan) * 100)}%`, background: avColor(r.name), borderRadius: 2 }} /></span></td></tr> : null,
              ];
            })}
            <tr style={{ borderTop: `2px solid ${THEME.text}` }}><td style={{ padding: "8px 6px" }}><b>Jami</b></td>{cell(ms.total.d, hl === "d")}{cell(ms.total.w, hl === "w")}{cell(ms.total.m, hl === "m")}</tr>
          </tbody>
        </table>
      )}
      {Object.keys(plans || {}).length > 0 && <div style={{ fontSize: 11, color: THEME.muted, marginTop: 6 }}>chiziq — oylik reja bajarilishi</div>}
    </Card>
  );
}
export function ManagersModal({ ms, hl, plans, canEdit, onSavePlans, onClose, onExport, rangeLabel }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(Object.entries(plans || {}).map(([k, v]) => [k, fmt(v)])));
  const [editing, setEditing] = useState(false);
  const th = (t, al = "right", on = false) => <th style={{ padding: "8px 10px", fontSize: 11.5, color: on ? THEME.blue || THEME.violet : THEME.muted, fontWeight: on ? 800 : 600, textAlign: al, whiteSpace: "nowrap" }}>{t}</th>;
  const td = (v, on, cnt) => <td style={{ padding: "10px", textAlign: "right", fontVariantNumeric: "tabular-nums", background: on ? (THEME.isDark ? "#1E3A5F55" : "#F2F7FF") : undefined, whiteSpace: "nowrap" }}><b style={{ color: v ? THEME.text : THEME.dim }}>{v ? fmt(v) : "—"}</b>{cnt ? <small style={{ display: "block", fontSize: 10.5, color: THEME.muted }}>{cnt} ta to'lov</small> : null}</td>;
  const save = () => { const next = {}; for (const [k, v] of Object.entries(draft)) { const n = parseInt(String(v).replace(/\D/g, ""), 10); if (n > 0) next[k] = n; } onSavePlans(next); setEditing(false); };
  return (
    <Modal title="Menejerlar — tushum" onClose={onClose} width={980}>
      <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 10 }}>Buyurtma mas'uli bo'yicha · to'lov kelgan sana bo'yicha · ko'k ustun — tepada tanlangan davr</div>
      <div style={{ overflowX: "auto" }} className="uvix-scroll">
        <table data-testid="managers-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
          <thead><tr style={{ borderBottom: `1px solid ${THEME.border}` }}>{th("Menejer", "left")}{th("Bugun", "right", hl === "d")}{th("Hafta (du–bugun)", "right", hl === "w")}{th("Oy boshidan", "right", hl === "m")}{rangeLabel ? th(rangeLabel, "right", hl === "x") : null}{th("O'tgan oy (shu kunlar)")}{th("Oylik reja", "left")}{th("8 hafta", "left")}</tr></thead>
          <tbody>
            {ms.rows.map((r, i) => {
              const plan = plans?.[r.name];
              return (
                <tr key={r.name} style={{ borderTop: `1px solid ${THEME.border}` }}>
                  <td style={{ padding: "10px" }}><span style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ width: 14, color: THEME.dim, fontWeight: 800, fontSize: 12 }}>{i + 1}</span><Av name={r.name} size={28} /><b>{r.name}</b>{i === 0 && r.m > 0 && <Trophy size={14} color="#D97706" />}</span></td>
                  {td(r.d, hl === "d", r.dc)}{td(r.w, hl === "w")}{td(r.m, hl === "m", r.mc)}{rangeLabel ? td(r.x, hl === "x") : null}{td(r.prevM, false)}
                  <td style={{ padding: "10px", width: 170 }}>
                    {editing ? <input value={draft[r.name] || ""} onChange={(e) => setDraft((d) => ({ ...d, [r.name]: fmt(parseInt(e.target.value.replace(/\D/g, ""), 10) || 0) }))} inputMode="numeric" placeholder="reja, so'm" data-plan={r.name} style={{ ...getInputStyle(), height: 32, padding: "0 8px", fontSize: 12.5 }} />
                      : plan > 0 ? <><span style={{ display: "block", height: 7, borderRadius: 4, background: THEME.chip }}><i style={{ display: "block", height: "100%", width: `${Math.min(100, (r.m / plan) * 100)}%`, background: avColor(r.name), borderRadius: 4 }} /></span><small style={{ fontSize: 11, color: THEME.muted }}>{Math.round((r.m / plan) * 100)}% · reja {mln(plan)}</small></> : <small style={{ color: THEME.dim }}>reja yo'q</small>}
                  </td>
                  <td style={{ padding: "10px" }}><Spark values={r.weeks} color={avColor(r.name)} w={80} h={24} /></td>
                </tr>
              );
            })}
            <tr style={{ borderTop: `2px solid ${THEME.text}`, background: THEME.isDark ? THEME.hover : "#FAFAFB" }}>
              <td style={{ padding: "10px" }}><b>Jami</b></td>{td(ms.total.d, hl === "d", ms.total.dc)}{td(ms.total.w, hl === "w")}{td(ms.total.m, hl === "m", ms.total.mc)}{rangeLabel ? td(ms.total.x, hl === "x") : null}{td(ms.total.prevM)}<td /><td />
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
        {onExport && <Button variant="ghost" onClick={onExport}>Excel ↓</Button>}
        {canEdit && (editing ? <><Button variant="ghost" onClick={() => setEditing(false)}>Bekor</Button><Button onClick={save} data-testid="plans-save">Rejani saqlash</Button></> : <Button variant="ghost" onClick={() => setEditing(true)} data-testid="plans-edit">Oylik reja qo'yish</Button>)}
      </div>
      {canEdit && <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 8, textAlign: "right" }}>Reja — faqat ko'rsatkich: kassa, hisobot va maoshga ta'sir qilmaydi. Bo'sh qoldirilsa — ko'rinmaydi.</div>}
    </Modal>
  );
}

/* ---------- 4. Diqqat talab qiladi ---------- */
const TONE = { green: ["#15803D", Package], amber: ["#B45309", Wallet], violet: ["#7C3AED", Palette], blue: ["#1F5FD6", Clock], rose: ["#DC2626", Send] };
export function AttentionCard({ items, onAction }) {
  return (
    <Card className="uvix-dash-card" data-testid="dash-attention" style={box}>
      <Head title="Diqqat talab qiladi" right={items.length ? `${items.length} ta` : null} />
      {items.length === 0 ? <div style={{ display: "flex", alignItems: "center", gap: 8, color: THEME.muted, fontSize: 13, padding: "18px 0" }}><CheckCircle2 size={17} color={THEME.green} /> Hammasi joyida</div> : (
        <div style={{ marginTop: 4 }}>
          {items.slice(0, 5).map((it, i) => {
            const [c, Icon] = TONE[it.tone] || TONE.blue;
            return (
              <button key={it.key} type="button" data-attn={it.key} onClick={() => onAction(it)} className="uvix-row"
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 4px", border: 0, borderTop: i ? `1px solid ${THEME.border}` : 0, background: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: THEME.text }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: c + "1A", color: c, display: "grid", placeItems: "center", flexShrink: 0 }}><Icon size={15} /></span>
                <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 13 }}>{it.title}</b><small style={{ display: "block", fontSize: 11.5, color: THEME.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.sub}</small></span>
                <span style={{ fontSize: 12, fontWeight: 700, color: c, whiteSpace: "nowrap" }}>{it.action || "Ko'rish"} <ChevronRight size={13} style={{ verticalAlign: -2 }} /></span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ---------- 5. So'nggi to'lovlar ---------- */
export function RecentPayments({ orders, onOpen }) {
  const list = useMemo(() => {
    const out = [];
    for (const o of orders || []) { if (o.deletedAt) continue; for (const p of o.payments || []) if (!p.deletedAt) out.push({ ...p, order: o }); }
    return out.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 6);
  }, [orders]);
  const today = localDateStr(new Date());
  return (
    <Card className="uvix-dash-card" data-testid="dash-recent-pay" style={box}>
      <Head title="So'nggi to'lovlar" />
      {list.length === 0 ? <div style={{ color: THEME.muted, fontSize: 13, padding: "18px 0" }}>Hali to'lov yo'q</div> : list.map((p, i) => (
        <button key={p.id || i} type="button" onClick={() => onOpen(p.order)} className="uvix-row" style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 2px", border: 0, borderTop: i ? `1px solid ${THEME.border}` : 0, background: "none", width: "100%", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: THEME.text, fontSize: 12.5 }}>
          <span style={{ color: THEME.muted, width: 44, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{p.date === today && p.createdAt ? new Date(p.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : String(p.date || "").slice(5).split("-").reverse().join(".")}</span>
          <b style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.order.customer || p.order.orderNumber}</b>
          <span style={{ color: THEME.muted, whiteSpace: "nowrap" }}>{String(p.order.manager || "").split(" ")[0]}</span>
          <b style={{ color: THEME.greenText || THEME.green, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>+{fmt(p.amount)}</b>
        </button>
      ))}
    </Card>
  );
}

/* ---------- 6. Korxona rasxodi (dumaloq) ---------- */
const PIE = ["#2563EB", "#0E7C6B", "#F59E0B", "#7C3AED", "#A1A1AA"];
function Donut({ parts, size = 148, w = 22 }) {
  const tot = parts.reduce((s, p) => s + p.value, 0) || 1;
  const r = size / 2 - w / 2 - 2, cx = size / 2;
  let a0 = -Math.PI / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {parts.length === 0 && <circle cx={cx} cy={cx} r={r} fill="none" stroke={THEME.chip} strokeWidth={w} />}
      {parts.map((p, i) => {
        const a1 = a0 + (2 * Math.PI * p.value) / tot, gap = parts.length > 1 ? 0.025 : 0;
        if (parts.length === 1) { a0 = a1; return <circle key={i} cx={cx} cy={cx} r={r} fill="none" stroke={PIE[i]} strokeWidth={w} />; }
        const x0 = cx + r * Math.cos(a0 + gap), y0 = cx + r * Math.sin(a0 + gap), x1 = cx + r * Math.cos(a1 - gap), y1 = cx + r * Math.sin(a1 - gap);
        const d = `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
        a0 = a1;
        return <path key={i} d={d} fill="none" stroke={p.other ? PIE[4] : PIE[i]} strokeWidth={w} />;
      })}
    </svg>
  );
}
export function ExpenseDonut({ data, onOpen }) {
  return (
    <Card className="uvix-dash-card" data-testid="dash-expense" style={box}>
      <Head title="Korxona rasxodi" right="kategoriya bo'yicha" />
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", width: 148, height: 148, flexShrink: 0 }}>
          <Donut parts={data.parts} />
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}><div><small style={{ fontSize: 10.5, color: THEME.muted }}>Jami rasxod</small><b style={{ display: "block", fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{mln(data.total)}</b>{data.change != null && data.change !== 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: data.change > 0 ? THEME.rose : THEME.greenText || THEME.green }}>{data.change > 0 ? "+" : "−"}{Math.abs(data.change)}%</span>}</div></div>
        </div>
        <div style={{ flex: "1 1 150px", minWidth: 0 }}>
          {data.parts.length === 0 ? <div style={{ fontSize: 13, color: THEME.muted }}>Bu davrda rasxod yo'q</div> : data.parts.map((p, i) => (
            <div key={p.name} data-exp-cat={p.name} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, marginTop: 7, whiteSpace: "nowrap" }}>
              <i style={{ width: 9, height: 9, borderRadius: 3, background: p.other ? PIE[4] : PIE[i], flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{p.name}</span>
              <b style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{mln(p.value)}</b>
              <span style={{ width: 34, textAlign: "right", color: THEME.muted, fontSize: 11.5 }}>{data.total ? Math.round((p.value / data.total) * 100) : 0}%</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: "auto" }}><More text="Rasxod bo'limi" onClick={onOpen} /></div>
    </Card>
  );
}

/* ---------- 7. To'lov turlari ---------- */
const PT = [["naqd", "Naqd", Banknote, "#0891B2"], ["karta", "Karta", CreditCard, "#7C3AED"], ["bank", "Bank", Landmark, "#D97706"]];
export function PayTypesCard({ data, onOpen }) {
  const n = PT.reduce((s, [k]) => s + data.cur[k].n, 0);
  return (
    <Card className="uvix-dash-card" data-testid="dash-paytypes" style={box}>
      <Head title="To'lov turlari" right={`kelgan pul · ${n} ta to'lov`} />
      <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", gap: data.total ? 2 : 0, marginTop: 12, background: THEME.chip }}>
        {PT.map(([k, , , c]) => data.cur[k].sum > 0 && <i key={k} style={{ flex: data.cur[k].sum, background: c }} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, marginTop: 12 }}>
        {PT.map(([k, l, I, c]) => (
          <div key={k} data-paytype={k} style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, padding: "9px 10px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: c, fontSize: 12, fontWeight: 700 }}><I size={14} />{l}</div>
            <b style={{ display: "block", fontSize: 15, marginTop: 4, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{mln(data.cur[k].sum)}</b>
            <small style={{ fontSize: 11, color: THEME.muted, whiteSpace: "nowrap" }}>{data.share[k]}% · {data.cur[k].n} ta</small>
          </div>
        ))}
      </div>
      {data.prevShare && <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 10 }}>Oldingi davrda: naqd {data.prevShare.naqd}% · karta {data.prevShare.karta}% · bank {data.prevShare.bank}%</div>}
      <div style={{ marginTop: "auto" }}><More text="Kassalar" onClick={onOpen} /></div>
    </Card>
  );
}

/* ---------- 8. Oylik xarajatlar (doimiy xarajatlar qoplandimi) ---------- */
function Ring({ pct, color, size = 46 }) {
  const r = size / 2 - 5, c = 2 * Math.PI * r;
  return <svg width={size} height={size} aria-hidden="true"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={THEME.chip} strokeWidth="6" /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} /></svg>;
}
const UZ_MONTH = (d = new Date()) => UZ_M[d.getMonth()];
export function FixedCostsCard({ fc, canEdit, onEdit }) {
  const empty = fc.rows.length === 0;
  return (
    <Card className="uvix-dash-card" data-testid="dash-fixed" style={box}>
      <Head title="Oylik xarajatlar" right={`${UZ_MONTH()} · ${fc.daysLeft} kun qoldi`} />
      {empty ? (
        <div style={{ fontSize: 13, color: THEME.muted, lineHeight: 1.5, marginTop: 12 }}>
          Ijara, ish haqi, kommunal kabi <b style={{ color: THEME.text }}>doimiy xarajatlarni</b> kiriting — oy davomida ular qoplandimi, ko'rinib turadi.
          {canEdit ? <div style={{ marginTop: 12 }}><Button onClick={onEdit} data-testid="fixed-setup"><Plus size={14} /> Doimiy xarajatlarni kiritish</Button></div> : <div style={{ marginTop: 8 }}>Rahbar kiritadi.</div>}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
            {fc.coveredOn ? <span style={{ width: 46, height: 46, borderRadius: "50%", background: THEME.greenBg, color: THEME.green, display: "grid", placeItems: "center", flexShrink: 0 }}><ShieldCheck size={24} /></span>
              : <span style={{ position: "relative", width: 46, height: 46, flexShrink: 0 }}><Ring pct={fc.pct} color={THEME.amber} /><b style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 11 }}>{fc.pct}%</b></span>}
            <div style={{ minWidth: 0 }}>
              <b data-testid="fixed-status" style={{ display: "block", fontSize: 18, color: fc.coveredOn ? THEME.green : THEME.amber }}>{fc.coveredOn ? "Qoplandi" : `${mln(fc.remain)} qoldi`}</b>
              <span style={{ fontSize: 12, color: THEME.muted }}>{fc.coveredOn ? dayUz(fc.coveredOn) : fc.eta ? (fc.eta === "keyingi oy" ? "shu tezlikda bu oy yetmaydi" : `shu tezlikda ~${dayUz(fc.eta)}da qoplanadi`) : "hali tushum yo'q"}</span>
            </div>
            {fc.coveredOn && <div style={{ marginLeft: "auto", textAlign: "right" }}><small style={{ fontSize: 11, color: THEME.muted }}>Ortiqcha</small><b style={{ display: "block", fontSize: 17, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>+{mln(fc.extra)}</b></div>}
          </div>
          <div style={{ display: "flex", fontSize: 11, color: THEME.muted, marginTop: 12 }}><span>Kerak <b style={{ color: THEME.text }}>{mln(fc.need)}</b></span><span style={{ marginLeft: "auto" }}>Topildi <b style={{ color: THEME.text }}>{mln(fc.found)}</b></span></div>
          <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginTop: 5, background: THEME.chip, gap: fc.coveredOn ? 2 : 0 }}>
            {fc.coveredOn ? <><i style={{ flex: fc.need, background: THEME.green }} /><i style={{ flex: Math.max(0, fc.extra), background: "#86EFAC" }} /></> : <i style={{ width: `${fc.pct}%`, background: THEME.amber }} />}
          </div>
          <div style={{ fontSize: 11, color: THEME.muted, marginTop: 6 }} title="O'zgaruvchan xarajat: Material, Kraska, Brak">Topildi = tushgan pul {mln(fc.income)} − material/kraska {mln(fc.variable)}</div>
          <div style={{ marginTop: 8 }}>
            {fc.rows.slice(0, 4).map((x) => (
              <div key={x.id || x.name} data-fixed={x.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: `1px solid ${THEME.border}`, fontSize: 12.5 }}>
                {x.status === "paid" ? <CheckCircle2 size={15} color={THEME.green} /> : <CircleDashed size={15} color={x.status === "part" ? THEME.amber : THEME.dim} />}
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
                <span style={{ fontSize: 11, color: x.status === "paid" ? THEME.green : THEME.muted, whiteSpace: "nowrap" }}>{x.status === "paid" ? "to'landi" : x.status === "part" ? `${mln(x.spent)} / ${mln(x.plan)}` : x.day ? `${x.day}-sana` : "kutilmoqda"}</span>
                <b style={{ width: 70, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{mln(x.need)}</b>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: "auto", paddingTop: 8, fontSize: 12 }}>
            <span style={{ color: THEME.muted }}>{fc.rows.length > 4 ? `+ yana ${fc.rows.length - 4} ta · ` : ""}{fc.rows.filter((x) => x.status === "paid").length}/{fc.rows.length} to'langan</span>
            {canEdit && <button type="button" onClick={onEdit} data-testid="fixed-edit" style={{ marginLeft: "auto", border: 0, background: "none", color: THEME.blue || THEME.violet, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Tahrirlash →</button>}
          </div>
        </>
      )}
    </Card>
  );
}
export function FixedCostsModal({ items, categories, onSave, onClose }) {
  const [rows, setRows] = useState(() => (items?.length ? items : [{ id: "f1", name: "Ijara", amount: 0, category: "Ijara", day: 5 }, { id: "f2", name: "Ish haqi", amount: 0, category: "Xodimlar", day: 30 }, { id: "f3", name: "Kommunal", amount: 0, category: "Kommunal", day: 10 }]).map((x) => ({ ...x, amountStr: x.amount ? fmt(x.amount) : "" })));
  const cats = Object.keys(categories || {});
  const set = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const total = rows.reduce((s, x) => s + (parseInt(String(x.amountStr).replace(/\D/g, ""), 10) || 0), 0);
  const save = () => onSave(rows.map((x) => ({ id: x.id || `f${Math.random().toString(36).slice(2, 8)}`, name: String(x.name || "").trim().slice(0, 60), amount: parseInt(String(x.amountStr).replace(/\D/g, ""), 10) || 0, category: x.category || "", subcategory: x.subcategory || "", day: Math.min(31, Math.max(1, parseInt(x.day, 10) || 1)) })).filter((x) => x.name && x.amount > 0));
  const inp = { ...getInputStyle(), height: 34, padding: "0 9px", fontSize: 13 };
  return (
    <Modal title="Doimiy xarajatlar" onClose={onClose} width={720}>
      <div style={{ fontSize: 12.5, color: THEME.muted, lineHeight: 1.5, marginBottom: 10 }}>Har oy takrorlanadigan xarajatlar (ijara, ish haqi, kommunal…). Rasxod bo'limida <b style={{ color: THEME.text }}>shu kategoriyadan</b> chiqim kiritilsa — avtomatik «to'landi» bo'ladi. Haqiqatda ko'proq to'lansa — haqiqiysi hisoblanadi. Ish haqini bitta qatorda (hammaniki) yozish mumkin.</div>
      <div style={{ overflowX: "auto" }} className="uvix-scroll">
        <table data-testid="fixed-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
          <thead><tr>{[["Nomi", "left"], ["Oylik summa", "right"], ["Rasxod kategoriyasi", "left"], ["To'lov kuni", "left"], ["", "left"]].map(([t, a]) => <th key={t} style={{ padding: "6px", fontSize: 11.5, color: THEME.muted, fontWeight: 600, textAlign: a }}>{t}</th>)}</tr></thead>
          <tbody>
            {rows.map((x, i) => (
              <tr key={x.id || i} data-fixed-row={i}>
                <td style={{ padding: 4 }}><input value={x.name} onChange={(e) => set(i, "name", e.target.value)} placeholder="Ijara" style={inp} /></td>
                <td style={{ padding: 4, width: 150 }}><input value={x.amountStr} onChange={(e) => set(i, "amountStr", fmt(parseInt(e.target.value.replace(/\D/g, ""), 10) || 0))} inputMode="numeric" placeholder="0" style={{ ...inp, textAlign: "right" }} /></td>
                <td style={{ padding: 4, width: 200 }}><select value={x.category || ""} onChange={(e) => set(i, "category", e.target.value)} style={inp}><option value="">— kategoriya —</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select></td>
                <td style={{ padding: 4, width: 100 }}><input value={x.day || ""} onChange={(e) => set(i, "day", e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="5" style={{ ...inp, textAlign: "center" }} title="Har oyning nechanchi sanasi" /></td>
                <td style={{ padding: 4, width: 36 }}><button type="button" aria-label="O'chirish" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} style={{ border: 0, background: "none", color: THEME.muted, cursor: "pointer" }}><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", alignItems: "center", marginTop: 10 }}>
        <button type="button" data-testid="fixed-add" onClick={() => setRows((r) => [...r, { id: `f${Date.now().toString(36)}`, name: "", amountStr: "", category: "", day: "" }])} style={{ border: 0, background: "none", color: THEME.blue || THEME.violet, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>+ Xarajat qo'shish</button>
        <span style={{ marginLeft: "auto", fontSize: 13 }}>Jami oyiga <b>{fmt(total)}</b></span>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <Button variant="ghost" onClick={onClose}>Bekor</Button>
        <Button onClick={save} data-testid="fixed-save">Saqlash</Button>
      </div>
    </Modal>
  );
}

/* ---------- 9. Qarzdorlik yoshi ---------- */
const AGE = [["0–7 kun", "#F59E0B"], ["8–30 kun", "#EA580C"], ["30+ kun", "#DC2626"]];
export function DebtAgingCard({ ag, onRemind, onOpen, canRemind }) {
  const [busy, setBusy] = useState("");
  return (
    <Card className="uvix-dash-card" data-testid="dash-aging" style={box}>
      <Head title="Qarzdorlik yoshi" right={`${mln(ag.total)} · ${ag.count} mijoz`} />
      <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", gap: 2, marginTop: 12, background: THEME.chip }}>
        {ag.buckets.map((v, i) => v > 0 && <i key={i} style={{ flex: v, background: AGE[i][1] }} />)}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 11.5, flexWrap: "wrap" }}>{AGE.map(([l, c], i) => <span key={l} data-age={i} style={{ whiteSpace: "nowrap" }}><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: c }} /> {l} <b>{mln(ag.buckets[i])}</b></span>)}</div>
      <div style={{ marginTop: 8 }}>
        {ag.top.length === 0 ? <div style={{ fontSize: 13, color: THEME.muted, padding: "10px 0" }}>Qarz yo'q</div> : ag.top.map((c) => (
          <div key={c.name} data-debtor={c.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: `1px solid ${THEME.border}`, fontSize: 12.5 }}>
            <b style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</b>
            <span style={{ color: c.days > 30 ? THEME.rose : THEME.muted, fontSize: 11.5, whiteSpace: "nowrap" }}>{c.days} kun</span>
            <b style={{ color: THEME.rose, width: 70, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{mln(c.debt)}</b>
            {canRemind && <button type="button" data-remind={c.name} disabled={!!busy} onClick={async () => { setBusy(c.name); try { await onRemind(c.name); } finally { setBusy(""); } }} title="Qarz eslatmasi — navbatga qo'shiladi, matnni ko'rib yuborasiz"
              style={{ fontSize: 11, fontWeight: 700, color: THEME.blue || THEME.violet, border: `1px solid ${THEME.border}`, borderRadius: 6, padding: "2px 7px", background: THEME.card, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{busy === c.name ? "…" : "Eslatma"}</button>}
          </div>
        ))}
      </div>
      <div style={{ marginTop: "auto" }}><More text="Qarzdorlar" onClick={onOpen} /></div>
    </Card>
  );
}

/* ---------- 10. Ishlab chiqarish ---------- */
const STAGES4 = ["new", "design", "printing", "ready"];
export function ProductionCard({ pr, onOpen }) {
  const keys = [...STAGES4, ...Object.keys(pr.counts).filter((k) => !STAGES4.includes(k))].filter((k, i) => i < 4 || pr.counts[k]);
  return (
    <Card className="uvix-dash-card" data-testid="dash-production" style={box}>
      <Head title="Ishlab chiqarish" right="hozir" />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(keys.length, 5)}, minmax(0,1fr))`, gap: 6, marginTop: 12 }}>
        {keys.slice(0, 5).map((k) => (
          <button key={k} type="button" data-prod={k} onClick={() => onOpen({ stage: k })} style={{ textAlign: "center", background: THEME.isDark ? THEME.hover : "#F7F7F8", border: 0, borderRadius: 10, padding: "8px 2px", cursor: "pointer", fontFamily: "inherit" }}>
            <b style={{ display: "block", fontSize: 19, color: k === "new" ? THEME.muted : prodColors(k).color }}>{pr.counts[k] || 0}</b>
            <small style={{ fontSize: 10.5, color: THEME.muted, whiteSpace: "nowrap" }}>{PROD_LABEL[k] || k}</small>
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, marginTop: 14 }}>
        <div><small style={{ fontSize: 11, color: THEME.muted, whiteSpace: "nowrap" }}>O'rtacha muddat</small><b style={{ display: "block", fontSize: 16 }}>{pr.avgDays == null ? "—" : `${String(pr.avgDays).replace(".", ",")} kun`}</b></div>
        <div title="Ochilganiga 7 kundan oshgan, hali tayyor bo'lmagan"><small style={{ fontSize: 11, color: THEME.muted, whiteSpace: "nowrap" }}>7+ kun turibdi</small><b style={{ display: "block", fontSize: 16, color: pr.stuck ? THEME.rose : THEME.text }}>{pr.stuck} ta</b></div>
        <div title="Davrda tayyor bo'lgan buyurtmalar maydoni"><small style={{ fontSize: 11, color: THEME.muted }}>Bosilgan</small><b style={{ display: "block", fontSize: 16 }}>{String(pr.area).replace(".", ",")} m²</b></div>
      </div>
      <div style={{ marginTop: "auto" }}><More text="Buyurtmalar" onClick={() => onOpen({})} /></div>
    </Card>
  );
}

/* ---------- 11. Mijozlar va chek ---------- */
export function CustomersCard({ cs, onOpen }) {
  const tot = cs.fresh + cs.returning;
  return (
    <Card className="uvix-dash-card" data-testid="dash-customers" style={box}>
      <Head title="Mijozlar va chek" right="shu davr" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <div><small style={{ fontSize: 11, color: THEME.muted }}>O'rtacha chek</small><b style={{ display: "block", fontSize: 18, fontVariantNumeric: "tabular-nums" }}>{mln(cs.avg)}</b><Delta pct={cs.avgChange} /></div>
        <div title="Davrda ochilgan buyurtmalar kelishuv summasidan to'langan qismi"><small style={{ fontSize: 11, color: THEME.muted }}>Yig'ilgan (kelishuvdan)</small><b style={{ display: "block", fontSize: 18 }}>{cs.collected == null ? "—" : `${cs.collected}%`}</b><span style={{ fontSize: 11, color: THEME.muted }}>qolgani qarz</span></div>
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: THEME.muted }}>Yangi va qaytgan mijozlar</div>
      <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", gap: tot ? 2 : 0, marginTop: 5, background: THEME.chip }}>
        {cs.fresh > 0 && <i style={{ flex: cs.fresh, background: THEME.blue || THEME.violet }} />}{cs.returning > 0 && <i style={{ flex: cs.returning, background: "#93C5FD" }} />}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginTop: 5 }}><span><b>{cs.fresh}</b> yangi</span><span><b>{cs.returning}</b> qaytgan{tot ? ` (${Math.round((cs.returning / tot) * 100)}%)` : ""}</span></div>
      <div style={{ marginTop: "auto" }}><More text="Mijozlar" onClick={onOpen} /></div>
    </Card>
  );
}

/* ---------- Ixtiyoriylar ---------- */
export function LineShareCard({ orders, period, paymentsIn }) {
  const s = { UVIXPRINT: 0, UVONYX: 0 };
  for (const p of paymentsIn(orders, period)) s[p.order.subcategory === "UVONYX" ? "UVONYX" : "UVIXPRINT"] += p.amount || 0;
  const t = s.UVIXPRINT + s.UVONYX;
  return (
    <Card className="uvix-dash-card" data-testid="dash-lineshare" style={box}>
      <Head title="Yo'nalishlar ulushi" right="tushum" />
      <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", gap: 2, marginTop: 14, background: THEME.chip }}>{Object.keys(s).map((l) => s[l] > 0 && <i key={l} style={{ flex: s[l], background: lineColor(l, THEME.isDark) }} />)}</div>
      {Object.keys(s).map((l) => <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: lineColor(l, THEME.isDark) }} />{LINE_META[l].name}<b style={{ marginLeft: "auto" }}>{mln(s[l])}</b><span style={{ width: 38, textAlign: "right", color: THEME.muted }}>{t ? Math.round((s[l] / t) * 100) : 0}%</span></div>)}
    </Card>
  );
}
export function FunnelCard({ leads, period }) {
  const inP = (l) => { const d = String(l.createdAt || "").slice(0, 10); return d >= period.from && d <= period.to; };
  const L = (leads || []).filter(inP);
  const quote = L.filter((l) => l.quote || ["negotiation", "design", "printing", "ready", "won"].includes(l.stage)).length;
  const order = L.filter((l) => l.orderId || l.orderIds?.length || l.stage === "won").length;
  const won = L.filter((l) => l.stage === "won").length;
  const rows = [["Lidlar", L.length], ["Smeta / muzokara", quote], ["Buyurtma", order], ["Yopilgan (yutuq)", won]];
  return (
    <Card className="uvix-dash-card" data-testid="dash-funnel" style={box}>
      <Head title="CRM voronkasi" right="davrda kelgan lidlar" />
      {rows.map(([l, n], i) => (
        <div key={l} style={{ marginTop: 10 }}>
          <div style={{ display: "flex", fontSize: 12.5 }}><span>{l}</span><b style={{ marginLeft: "auto" }}>{n}{i && L.length ? ` · ${Math.round((n / L.length) * 100)}%` : ""}</b></div>
          <span style={{ display: "block", height: 8, borderRadius: 4, background: THEME.chip, marginTop: 4 }}><i style={{ display: "block", height: "100%", width: `${L.length ? (n / L.length) * 100 : 0}%`, background: THEME.blue || THEME.violet, opacity: 0.35 + i * 0.2, borderRadius: 4 }} /></span>
        </div>
      ))}
    </Card>
  );
}
export function TopMaterialsCard({ list }) {
  const max = Math.max(1, ...list.map((x) => x.sum));
  return (
    <Card className="uvix-dash-card" data-testid="dash-materials" style={box}>
      <Head title="Material bo'yicha" right="yangi buyurtmalar" />
      {list.length === 0 ? <div style={{ fontSize: 13, color: THEME.muted, marginTop: 12 }}>Ma'lumot yo'q</div> : list.map((x) => (
        <div key={x.name} style={{ marginTop: 10 }}>
          <div style={{ display: "flex", fontSize: 12.5, gap: 6 }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span><span style={{ color: THEME.muted }}>{x.n} ta{x.area ? ` · ${Math.round(x.area * 10) / 10} m²` : ""}</span><b style={{ marginLeft: "auto" }}>{mln(x.sum)}</b></div>
          <span style={{ display: "block", height: 6, borderRadius: 3, background: THEME.chip, marginTop: 4 }}><i style={{ display: "block", height: "100%", width: `${(x.sum / max) * 100}%`, background: THEME.blue || THEME.violet, borderRadius: 3 }} /></span>
        </div>
      ))}
    </Card>
  );
}
export function ForecastCard({ f }) {
  const pct = f.prevMonth > 0 ? Math.round(((f.projected - f.prevMonth) / f.prevMonth) * 100) : null;
  return (
    <Card className="uvix-dash-card" data-testid="dash-forecast" style={box}>
      <Head title="Oy oxiri prognozi" right={`${f.elapsed}/${f.total} kun`} />
      <b style={{ fontSize: 26, marginTop: 10, display: "block", fontVariantNumeric: "tabular-nums" }}>~{mln(f.projected)}</b>
      <div style={{ fontSize: 12, color: THEME.muted, marginTop: 4 }}>Shu tezlikda (hozircha {mln(f.income)}) · o'tgan oy {mln(f.prevMonth)} {pct != null && <Delta pct={pct} />}</div>
      <span style={{ display: "block", height: 8, borderRadius: 4, background: THEME.chip, marginTop: 12 }}><i style={{ display: "block", height: "100%", width: `${(f.elapsed / f.total) * 100}%`, background: THEME.green, borderRadius: 4 }} /></span>
    </Card>
  );
}
export { AlertTriangle };
