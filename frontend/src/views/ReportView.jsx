import { Avatar as UiAvatar } from "../components/ui.jsx";
// ReportView.jsx — «Hisobot va tahlil»: foyda va zarar, pul oqimi, oyma-oy dinamika, menejerlar reytingi,
// oldingi davr / o'tgan yil bilan taqqoslash, Excel va PDF (PDF serverda yaratiladi).
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, Lightbulb, RefreshCw, Send } from "lucide-react";
import { Button, Card, EmptyState, getInputStyle, useIsMobile } from "../components/ui.jsx";
import { exportWorkbook } from "../lib/excel.js";
import { inRange, todayStr } from "../lib/format.js";
import { THEME } from "../theme.js";
import { downloadAnalyticsPdf, fetchAnalytics, sendAnalyticsPdf } from "../storage.js";

const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const minS = (a, b) => (a < b ? a : b);
const num = (n) => `${n < 0 ? "−" : ""}${Math.round(Math.abs(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
const mln = (n) => { const v = (n || 0) / 1e6; if (Math.abs(v) >= 1000) return `${v < 0 ? "−" : ""}${(Math.round(Math.abs(v) / 100) / 10).toLocaleString("ru-RU")} mlrd`; return `${v < 0 ? "−" : ""}${Math.abs(v) >= 100 ? Math.round(Math.abs(v)) : (Math.round(Math.abs(v) * 10) / 10).toLocaleString("ru-RU")} mln`; };
const pctOf = (cur, prev) => (prev ? ((cur - prev) / Math.abs(prev)) * 100 : cur ? null : 0);

// Davr: oy / chorak / yil (strelkalar bilan) yoki oraliq
function rangeFor(kind, offset, custom) {
  const now = new Date();
  const today = ymd(now);
  if (kind === "month") {
    const f = new Date(now.getFullYear(), now.getMonth() + offset, 1), t = new Date(f.getFullYear(), f.getMonth() + 1, 0);
    return { from: ymd(f), to: minS(ymd(t), today), title: `${MONTHS[f.getMonth()]} ${f.getFullYear()}` };
  }
  if (kind === "quarter") {
    const q0 = Math.floor(now.getMonth() / 3) + offset;
    const f = new Date(now.getFullYear(), q0 * 3, 1), t = new Date(f.getFullYear(), f.getMonth() + 3, 0);
    return { from: ymd(f), to: minS(ymd(t), today), title: `${Math.floor(f.getMonth() / 3) + 1}-chorak ${f.getFullYear()}` };
  }
  if (kind === "year") {
    const y = now.getFullYear() + offset;
    return { from: `${y}-01-01`, to: minS(`${y}-12-31`, today), title: `${y}-yil` };
  }
  return { from: custom.from, to: custom.to, title: "Oraliq" };
}

function Delta({ v, invert = false, suffix = "%", abs }) {
  if (v == null) return <span style={{ fontSize: 12, fontWeight: 700, color: THEME.muted }}>yangi</span>;
  if (Math.abs(v) < 0.05 && abs == null) return <span style={{ fontSize: 12, fontWeight: 700, color: THEME.muted }}>0%</span>;
  const good = invert ? v < 0 : v > 0;
  return <span style={{ fontSize: 12, fontWeight: 700, color: good ? THEME.green : THEME.rose, whiteSpace: "nowrap" }}>{v > 0 ? "▲" : "▼"} {abs != null ? abs : `${Math.abs(v).toFixed(1).replace(".", ",")}${suffix}`}</span>;
}

export function ReportView({ orders, transactions, categories }) {
  const isMobile = useIsMobile(900);
  const [kind, setKind] = useState("month");
  const [offset, setOffset] = useState(() => (new Date().getDate() <= 5 ? -1 : 0)); // oy boshida — o'tgan oy
  const [custom, setCustom] = useState(() => ({ from: todayStr().slice(0, 8) + "01", to: todayStr() }));
  const [cmp, setCmp] = useState("prev");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const range = rangeFor(kind, offset, custom);

  useEffect(() => {
    let alive = true;
    setErr("");
    fetchAnalytics(range.from, range.to, cmp).then((d) => alive && setData(d)).catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [range.from, range.to, cmp, orders, transactions]);

  const setPeriod = (k) => { setKind(k); setOffset(k === "month" && new Date().getDate() <= 5 ? -1 : 0); };
  async function pdf() {
    setBusy("pdf"); setMsg(null);
    try {
      const blob = await downloadAnalyticsPdf(range.from, range.to, cmp);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `UVIX_hisobot_${range.from}_${range.to}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy("");
  }
  async function tg() {
    setBusy("tg"); setMsg(null);
    try { const r = await sendAnalyticsPdf(range.from, range.to, cmp); setMsg({ ok: r.ok, text: r.message }); } catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy("");
  }
  function excel() {
    const o = orders.filter((x) => inRange(x.date, range.from, range.to));
    const t = transactions.filter((x) => inRange(x.date, range.from, range.to));
    exportWorkbook(o, t, categories, `${range.from} — ${range.to}`, `UVIX_hisobot_${range.from}_${range.to}.xlsx`);
  }

  const seg = (items, value, onChange, testid) => (
    <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 12, background: THEME.surface, overflowX: "auto", maxWidth: "100%" }} data-testid={testid}>
      {items.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={value === k}
          style={{ padding: "7px 12px", borderRadius: 9, border: 0, cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap",
            background: value === k ? THEME.card : "transparent", color: value === k ? THEME.text : THEME.muted, boxShadow: value === k ? THEME.shadowSm : "none" }}>{l}</button>
      ))}
    </div>
  );
  const navBtn = { width: 32, height: 32, borderRadius: 9, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.text, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* boshqaruv paneli */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {seg([["month", "Oy"], ["quarter", "Chorak"], ["year", "Yil"], ["custom", "Oraliq"]], kind, setPeriod, "an-period")}
        {kind !== "custom" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button type="button" style={navBtn} onClick={() => setOffset((o) => o - 1)} aria-label="Oldingi"><ChevronLeft size={16} /></button>
            <div style={{ fontWeight: 700, fontSize: 14.5, minWidth: 120, textAlign: "center" }} data-testid="an-title">{range.title}</div>
            <button type="button" style={{ ...navBtn, opacity: offset >= 0 ? 0.4 : 1 }} disabled={offset >= 0} onClick={() => setOffset((o) => Math.min(0, o + 1))} aria-label="Keyingi"><ChevronRight size={16} /></button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} style={{ ...getInputStyle(), width: "auto" }} />
            <span style={{ color: THEME.muted }}>—</span>
            <input type="date" value={custom.to} min={custom.from} max={todayStr()} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} style={{ ...getInputStyle(), width: "auto" }} />
          </div>
        )}
        {seg([["prev", "Oldingi davr bilan"], ["yoy", "O'tgan yil bilan"]], cmp, setCmp, "an-cmp")}
        <div style={{ flex: 1 }} />
        <Button variant="ghost" onClick={excel} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Download size={14} /> Excel</Button>
        <Button variant="ghost" onClick={tg} disabled={!!busy} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Send size={14} /> {busy === "tg" ? "Yuborilmoqda…" : "Telegram'ga"}</Button>
        <Button onClick={pdf} disabled={!!busy} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><FileText size={14} /> {busy === "pdf" ? "Tayyorlanmoqda…" : "PDF hisobot"}</Button>
      </div>
      {msg && <div style={{ fontSize: 13, color: msg.ok ? THEME.green : THEME.rose }}>{msg.text}</div>}
      {err && <Card><div style={{ color: THEME.rose, fontSize: 13 }}>{err}</div></Card>}
      {!data && !err && <Card><div style={{ color: THEME.muted, fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}><RefreshCw size={14} className="uvix-spin" /> Hisoblanmoqda…</div></Card>}
      {data && <Report d={data} isMobile={isMobile} />}
    </div>
  );
}

function Report({ d, isMobile }) {
  const { cur, prev, delta } = d;
  const empty = !cur.orders && !cur.cashIn && !cur.cashOut;
  return (
    <>
      <div style={{ fontSize: 13, color: THEME.muted }} data-testid="an-sub">{d.label} · {d.cmp.label} bilan taqqoslanmoqda</div>
      {empty ? <Card><EmptyState text="Bu davrda buyurtma, to'lov yoki rasxod yo'q" /></Card> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(4, minmax(0,1fr))", gap: 10 }}>
            <Kpi label="Tushum (buyurtmalar)" value={mln(cur.revenue)} sub={<><Delta v={delta.revenue} /> <span style={{ color: THEME.muted }}>· {cur.orders} ta</span></>} />
            <Kpi label="Qo'shilgan qiymat" value={mln(cur.added)} sub={<Delta v={delta.added} />} />
            <Kpi label="Sof foyda" value={mln(cur.net)} color={cur.net >= 0 ? THEME.green : THEME.rose} sub={<><Delta v={delta.net} /> <span style={{ color: THEME.muted }}>· marja {cur.margin.toFixed(1).replace(".", ",")}%</span></>} />
            <Kpi label="Qarzdorlik (davr oxiri)" value={mln(cur.debt)} color={THEME.rose} sub={<Delta v={delta.debt} invert abs={`${mln(Math.abs(delta.debt))} ${delta.debt > 0 ? "ko'paydi" : "kamaydi"}`} />} />
          </div>
          {d.insights.length > 0 && (
            <Card style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, background: THEME.violetSoft }} data-testid="an-insights">
              {d.insights.map((s, i) => <div key={i} style={{ display: "flex", gap: 10, fontSize: 13, lineHeight: 1.5 }}><Lightbulb size={15} style={{ color: THEME.violet, flexShrink: 0, marginTop: 2 }} />{s}</div>)}
            </Card>
          )}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.05fr) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
            <PnL d={d} />
            <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
              <Trend series={d.series} />
              <Cash d={d} />
            </div>
          </div>
          <Managers d={d} isMobile={isMobile} />
        </>
      )}
    </>
  );
}

function Kpi({ label, value, sub, color }) {
  return (
    <Card style={{ padding: 16, minWidth: 0 }}>
      <div style={{ fontSize: 12.5, color: THEME.muted }}>{label}</div>
      <div style={{ fontFamily: THEME.fontNum, fontWeight: 700, fontSize: 22, margin: "6px 0 4px", color: color || THEME.text, letterSpacing: -0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      <div style={{ fontSize: 12 }}>{sub}</div>
    </Card>
  );
}

function PnL({ d }) {
  const { cur, prev, delta } = d;
  const maxCat = Math.max(1, ...d.cats.map((c) => c.cur));
  const Row = ({ label, v, p, kind = "line", invert, bar }) => {
    const ch = pctOf(Math.abs(v), Math.abs(p));
    const st = { line: {}, sum: { fontWeight: 700, borderBottom: `2px solid ${THEME.text}` }, net: { fontWeight: 700, fontSize: 15, borderBottom: 0, paddingTop: 14 } }[kind];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto 70px", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${THEME.border}`, fontSize: 13.5, ...st }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: kind === "line" && invert ? 14 : 0, color: kind === "line" && invert ? THEME.mutedDark : THEME.text, minWidth: 0 }}>
          {bar != null && <span style={{ width: 70, height: 6, borderRadius: 4, background: THEME.chip, overflow: "hidden", flexShrink: 0 }}><span style={{ display: "block", height: "100%", width: `${bar}%`, background: THEME.violet }} /></span>}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        </div>
        <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontFamily: kind === "net" ? THEME.fontNum : undefined, color: kind === "net" ? (v >= 0 ? THEME.green : THEME.rose) : undefined }} title={`Oldingi: ${num(p)}`}>{num(v)}{kind === "net" ? " so'm" : ""}</div>
        <div style={{ textAlign: "right" }}><Delta v={ch} invert={invert} /></div>
      </div>
    );
  };
  return (
    <Card style={{ padding: 20, minWidth: 0 }} data-testid="an-pnl">
      <div style={{ fontWeight: 700, fontSize: 15 }}>Foyda va zarar</div>
      <div style={{ fontSize: 12.5, color: THEME.muted, margin: "4px 0 10px", lineHeight: 1.45 }}>Buyurtma sanasi bo'yicha. Material, kraska va brak — tannarxda; «Shaxsiy» foydadan tashqari. Foiz — {d.cmp.label} ga nisbatan.</div>
      <Row label="Tushum — buyurtmalar summasi" v={cur.revenue} p={prev.revenue} />
      <Row label="Kraska" v={-cur.kraska} p={-prev.kraska} invert />
      <Row label="Material" v={-cur.material} p={-prev.material} invert />
      <Row label="Brak" v={-cur.brak} p={-prev.brak} invert />
      <Row label="Qo'shilgan qiymat" v={cur.added} p={prev.added} kind="sum" />
      {d.cats.map((c) => <Row key={c.name} label={c.name} v={-c.cur} p={-c.prev} invert bar={(c.cur / maxCat) * 100} />)}
      <Row label="Operatsion rasxodlar jami" v={-cur.opex} p={-prev.opex} kind="sum" invert />
      <Row label="Sof foyda" v={cur.net} p={prev.net} kind="net" />
      {cur.owner > 0 && <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 4 }}>Shaxsiy xarajatlar (foydadan olingan): {num(cur.owner)} so'm</div>}
    </Card>
  );
}

function Trend({ series }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...series.map((s) => Math.max(s.revenue, s.costs)));
  const minNet = Math.min(0, ...series.map((s) => s.net));
  const top = max, bottom = minNet; // y o'qi: manfiy foyda ham sig'adi
  const H = 200, W = 600, L = 44, B = 22;
  const y = (v) => 8 + ((top - v) / (top - bottom || 1)) * (H - B - 8);
  const step = (W - L) / series.length, bw = Math.min(16, step / 2 - 3);
  const ticks = [top, top / 2, 0].concat(bottom < 0 ? [bottom] : []);
  const h = hover != null ? series[hover] : null;
  return (
    <Card style={{ padding: 20, minWidth: 0 }} data-testid="an-trend">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Oyma-oy: tushum, rasxod va foyda</div>
        <div style={{ fontSize: 12, color: THEME.muted }}>oxirgi 12 oy</div>
      </div>
      <div style={{ fontSize: 12.5, color: THEME.text, minHeight: 20, margin: "8px 0 4px" }}>
        {h ? <>{h.label}: tushum <b>{mln(h.revenue)}</b> · rasxod <b>{mln(h.costs)}</b> · foyda <b style={{ color: h.net >= 0 ? THEME.green : THEME.rose }}>{mln(h.net)}</b></> : <span style={{ color: THEME.muted }}>Ustunga olib boring — oy tafsiloti</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Oyma-oy grafik" onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => <g key={i}><line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke={THEME.border} strokeDasharray={t === 0 ? "" : "3 4"} /><text x={0} y={y(t) + 4} fontSize="10.5" fill={THEME.muted}>{t === 0 ? "0" : mln(t).replace(" mln", "")}</text></g>)}
        {series.map((s, i) => {
          const x = L + i * step + step / 2;
          const last = i === series.length - 1;
          return (
            <g key={s.month} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} style={{ cursor: "pointer" }}>
              <rect x={L + i * step} y={0} width={step} height={H - B} fill="transparent" />
              <rect x={x - bw - 1} y={y(s.revenue)} width={bw} height={Math.max(0, y(0) - y(s.revenue))} rx={3} fill={THEME.violet} opacity={hover === i || last ? 1 : 0.7} />
              <rect x={x + 1} y={y(s.costs)} width={bw} height={Math.max(0, y(0) - y(s.costs))} rx={3} fill={THEME.rose} opacity={hover === i || last ? 0.95 : 0.55} />
              <text x={x} y={H - 6} fontSize="10.5" fill={THEME.muted} textAnchor="middle">{s.label}</text>
            </g>
          );
        })}
        <polyline fill="none" stroke={THEME.green} strokeWidth="2.5" strokeLinejoin="round" points={series.map((s, i) => `${L + i * step + step / 2},${y(s.net)}`).join(" ")} style={{ pointerEvents: "none" }} />
        {series.map((s, i) => <circle key={i} cx={L + i * step + step / 2} cy={y(s.net)} r={i === series.length - 1 || hover === i ? 4.5 : 3} fill={THEME.green} style={{ pointerEvents: "none" }} />)}
      </svg>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: THEME.muted, marginTop: 6 }}>
        <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: THEME.violet, marginRight: 6, verticalAlign: -1 }} />Tushum</span>
        <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: THEME.rose, marginRight: 6, verticalAlign: -1 }} />Rasxod (tannarx + operatsion)</span>
        <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: THEME.green, marginRight: 6, verticalAlign: -1 }} />Sof foyda</span>
      </div>
    </Card>
  );
}

function Cash({ d }) {
  const { cur, delta } = d;
  const box = (label, v, color, sub) => (
    <div style={{ background: THEME.surface, borderRadius: 14, padding: 14, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: THEME.muted }}>{label}</div>
      <div style={{ fontSize: 15.5, fontWeight: 700, marginTop: 4, color, lineHeight: 1.2, wordBreak: "break-word" }}>{v}</div>
      {sub && <div style={{ marginTop: 2 }}>{sub}</div>}
    </div>
  );
  return (
    <Card style={{ padding: 20 }} data-testid="an-cash">
      <div style={{ fontWeight: 700, fontSize: 15 }}>Pul oqimi (kassa)</div>
      <div style={{ fontSize: 12.5, color: THEME.muted, margin: "4px 0 12px" }}>Haqiqatda kelgan to'lovlar va to'langan barcha rasxodlar</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8 }}>
        {box("Kirdi", mln(cur.cashIn), THEME.green, <Delta v={delta.cashIn} />)}
        {box("Chiqdi", mln(cur.cashOut), THEME.rose)}
        {box("Sof oqim", `${cur.cashNet >= 0 ? "+" : ""}${mln(cur.cashNet)}`, cur.cashNet >= 0 ? THEME.text : THEME.rose)}
      </div>
    </Card>
  );
}

function Managers({ d, isMobile }) {
  const list = d.managers;
  if (!list.length) return null;
  const cols = ["Buyurtmalar", "Aylanma", "Yig'ilgan to'lov", "O'rtacha chek", "Lid → buyurtma", "Qarz ulushi", "Oldingiga"];
  const debtColor = (p) => (p <= 10 ? THEME.green : p <= 20 ? THEME.amber : THEME.rose);
  return (
    <Card style={{ padding: 20 }} data-testid="an-managers">
      <div style={{ fontWeight: 700, fontSize: 15 }}>Menejerlar reytingi</div>
      <div style={{ fontSize: 12.5, color: THEME.muted, margin: "4px 0 12px" }}>Buyurtmadagi «Mas'ul menejer» bo'yicha, aylanma tartibida. Konversiya — menejer kiritgan lidlardan buyurtmaga aylanganlari.</div>
      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((m, i) => (
            <div key={m.name} style={{ background: THEME.surface, borderRadius: 14, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Rank i={i} /><b style={{ flex: 1 }}>{m.name}</b><Delta v={m.change} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 6, marginTop: 10, fontSize: 12 }}>
                <Mini l="Aylanma" v={mln(m.revenue)} /><Mini l="Buyurtma" v={m.orders} /><Mini l="Yig'ilgan" v={mln(m.collected)} />
                <Mini l="O'rtacha" v={mln(m.avg)} /><Mini l="Konversiya" v={m.conversion == null ? "—" : `${Math.round(m.conversion)}%`} /><Mini l="Qarz" v={`${Math.round(m.debtShare)}%`} color={debtColor(m.debtShare)} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead><tr>{["Menejer", ...cols].map((h, i) => <th key={h} style={{ fontSize: 12, color: THEME.muted, fontWeight: 600, textAlign: i ? "right" : "left", padding: "0 10px 10px", borderBottom: `1px solid ${THEME.border}`, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>
              {list.map((m, i) => (
                <tr key={m.name} style={{ borderBottom: `1px solid ${THEME.border}` }}>
                  <td style={{ padding: "11px 10px", whiteSpace: "nowrap" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><Rank i={i} /><Avatar30 name={m.name} />{m.name}</span></td>
                  <td style={tdR}>{m.orders}</td>
                  <td style={tdR}>{mln(m.revenue)}</td>
                  <td style={tdR}>{mln(m.collected)}</td>
                  <td style={tdR}>{m.orders ? mln(m.avg) : "—"}</td>
                  <td style={tdR}>{m.conversion == null ? "—" : `${Math.round(m.conversion)}%`}</td>
                  <td style={{ ...tdR, color: debtColor(m.debtShare) }}>{m.revenue ? `${Math.round(m.debtShare)}%` : "—"}</td>
                  <td style={tdR}><Delta v={m.change} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
const tdR = { padding: "11px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
function Rank({ i }) {
  return <span style={{ width: 26, height: 26, borderRadius: 8, display: "inline-grid", placeItems: "center", fontWeight: 700, fontSize: 12, flexShrink: 0, background: i === 0 ? `${THEME.amber}33` : THEME.chip, color: i === 0 ? THEME.amber : THEME.text }}>{i + 1}</span>;
}
const Avatar30 = ({ name }) => <UiAvatar name={name} size={30} />;
function Mini({ l, v, color }) {
  return <div><div style={{ color: THEME.muted, fontSize: 11 }}>{l}</div><div style={{ fontWeight: 700, color }}>{v}</div></div>;
}
