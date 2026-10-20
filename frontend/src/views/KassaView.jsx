// KassaView.jsx — yo'nalishlar bo'yicha alohida kassalar (UVIXPRINT / UVONYX × naqd / karta / bank) va ichki o'tkazma.
// Rahbar hammasini ko'radi va o'tkazma qiladi; katta menejer (kassa huquqi bilan) — faqat o'z yo'nalishi kassasini.
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowRightLeft, FileSpreadsheet, FileText, List, Trash2, TrendingUp, Wallet } from "lucide-react";
import { Button, Card, ConfirmDialog, EmptyState, Field, Modal, getIconBtn, getInputStyle } from "../components/ui.jsx";
import { LineTag } from "../components/LineSwitcher.jsx";
import { saveTransfers, useTransfers } from "../lib/transfers.js";
import { LineHeader } from "../components/LineSelector.jsx";
import { ProfitLoss } from "./dashboard/ProfitLoss.jsx";
import { monthsBetween } from "../lib/pnl.js";
import { LINE_META, LINES, lineColor, useLine } from "../lib/lines.js";
import { PAY_LABEL, PAY_TYPES, computeKassa, kassaMoves, kassaReport } from "../lib/kassa.js";
import { fmt, money, shortDateUz, todayStr, uid } from "../lib/format.js";
import { THEME } from "../theme.js";
import { usePerms } from "../lib/perms.jsx";

const sgn = (v) => (v < 0 ? "−" : "") + fmt(Math.abs(Math.round(v)));
const signed = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(Math.round(v)));
const firstOfMonth = () => todayStr().slice(0, 7);
const monthEnd = (m) => { const [y, mo] = m.split("-").map(Number); return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`; };
const ROWS = [["open", "Boshida"], ["in", "Kirim"], ["out", "Chiqim"], ["tr", "O'tkazma"], ["close", "Oxirida"]];

// Davr tanlovi (Barchasi / Oy / Oraliq) — Kassalar va eksport uchun
export function usePeriod(initial = "month") {
  const [mode, setMode] = useState(initial);
  const [month, setMonth] = useState(firstOfMonth);
  const [from, setFrom] = useState(() => `${firstOfMonth()}-01`);
  const [to, setTo] = useState(todayStr);
  const range = mode === "month" ? { from: `${month}-01`, to: monthEnd(month) } : mode === "range" ? (from <= to ? { from, to } : { from: to, to: from }) : { from: "", to: "" };
  return { mode, setMode, month, setMonth, from, setFrom, to, setTo, range };
}
export function PeriodBar({ p, testid = "period" }) {
  const seg = (v, l) => (
    <button key={v} type="button" onClick={() => p.setMode(v)} aria-pressed={p.mode === v} data-period={v}
      style={{ height: 32, padding: "0 13px", border: 0, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, background: p.mode === v ? THEME.card : "transparent", color: p.mode === v ? THEME.text : THEME.muted, boxShadow: p.mode === v ? THEME.shadowSm : "none" }}>{l}</button>
  );
  return (
    <div data-testid={testid} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <div style={{ display: "inline-flex", gap: 2, background: THEME.chip, borderRadius: 10, padding: 3 }}>{seg("all", "Barchasi")}{seg("month", "Oy")}{seg("range", "Oraliq")}</div>
      {p.mode === "month" && <input type="month" value={p.month} onChange={(e) => e.target.value && p.setMonth(e.target.value)} style={{ ...getInputStyle(), width: "auto", height: 38 }} aria-label="Oy" />}
      {p.mode === "range" && <><input type="date" value={p.from} onChange={(e) => p.setFrom(e.target.value)} style={{ ...getInputStyle(), width: "auto", height: 38 }} aria-label="Dan" /><span style={{ color: THEME.muted }}>—</span><input type="date" value={p.to} onChange={(e) => p.setTo(e.target.value)} style={{ ...getInputStyle(), width: "auto", height: 38 }} aria-label="Gacha" /></>}
    </div>
  );
}
export function ExportButtons({ onExcel, onPdf, busy }) {
  const b = (on, I, l, c, t) => (
    <button type="button" onClick={on} disabled={!!busy} data-testid={t}
      style={{ height: 36, padding: "0 13px", borderRadius: 10, border: `1px solid ${THEME.border2}`, background: THEME.card, color: c, display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, fontFamily: "inherit", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>
      <I size={15} /> {l}
    </button>
  );
  return <>{onExcel && b(onExcel, FileSpreadsheet, busy === "xlsx" ? "…" : "Excel", THEME.isDark ? "#4ADE80" : "#107C41", "export-excel")}{onPdf && b(onPdf, FileText, busy === "pdf" ? "…" : "PDF", THEME.rose, "export-pdf")}</>;
}

export function KassaView({ orders, transactions, isAdmin, canCash, currentUser, showToast }) {
  const { line, split } = useLine();
  const transfers = useTransfers();
  const [form, setForm] = useState(false);
  const [del, setDel] = useState(null);
  const [tab, setTab] = useState("bal");
  const [busy, setBusy] = useState("");
  const [moveKassa, setMoveKassa] = useState("");
  const per = usePeriod("month");
  const active = useMemo(() => (transfers || []).filter((t) => !t.deletedAt), [transfers]);
  const k = useMemo(() => computeKassa(orders, transactions, active), [orders, transactions, active]);
  const rep = useMemo(() => kassaReport(orders, transactions, active, per.range), [orders, transactions, active, per.range.from, per.range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const moves = useMemo(() => kassaMoves(orders, transactions, active, per.range), [orders, transactions, active, per.range.from, per.range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines = line === "all" ? LINES : [line];
  const pnlMonths = useMemo(() => {
    if (per.mode === "month") return [per.month];
    const all = [...orders.flatMap((o) => (o.payments || []).map((p) => p.date)), ...transactions.map((t) => t.date)].filter(Boolean).sort();
    const from = per.range.from || all[0] || todayStr(), to = per.range.to || todayStr();
    return monthsBetween(from, to);
  }, [per.mode, per.month, per.range.from, per.range.to, orders, transactions]);
  async function save(next) { await saveTransfers(next); }

  const { can } = usePerms();
  const canTransfer = isAdmin || can("kassa.transfer");
  const canPnl = isAdmin || can("report.view");
  if (!isAdmin && (!canCash || !can("kassa.view"))) return <Card><EmptyState text="Kassani ko'rish uchun rahbar «Kassa qoldiqlari» huquqini berishi kerak" /></Card>;
  const recent = (transfers || []).filter((t) => !t.deletedAt && (line === "all" || t.from?.line === line || t.to?.line === line)).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 30);
  const th = { padding: "9px 12px", fontSize: 11.5, fontWeight: 600, color: THEME.muted, textAlign: "right", whiteSpace: "nowrap" };
  const td = { padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const sumLines = (ls) => ls.reduce((a, l) => { const x = rep.lines[l]; for (const kk of Object.keys(a)) a[kk] += x[kk]; return a; }, { open: 0, in: 0, out: 0, tin: 0, tout: 0, close: 0 });
  const tot = sumLines(lines);
  const periodLabel = per.mode === "all" ? "Boshidan" : per.mode === "month" ? "Oy" : "Davr";
  const cell = (r, kk) => kk === "tr" ? r.tin - r.tout : r[kk];
  const show = (r, kk) => {
    const v = cell(r, kk);
    if (kk === "in") return <span style={{ color: v ? THEME.greenText : THEME.muted }}>{v ? "+" + fmt(v) : "—"}</span>;
    if (kk === "out") return <span style={{ color: v ? THEME.rose : THEME.muted }}>{v ? "−" + fmt(v) : "—"}</span>;
    if (kk === "tr") return <span style={{ color: v > 0 ? THEME.greenText : v < 0 ? THEME.rose : THEME.muted }}>{v ? signed(v) : "—"}</span>;
    return <span style={{ color: v < 0 ? THEME.rose : undefined }}>{sgn(v)}</span>;
  };
  const exportArgs = () => ({ rep, moves, lines, range: per.range, mode: per.mode, months: pnlMonths, orders, transactions, split, user: currentUser?.name || "" });
  async function doExport(kind) {
    setBusy(kind);
    try { const m = await import("../lib/exportPro.js"); await (kind === "xlsx" ? m.exportKassaXlsx(exportArgs()) : m.exportKassaPdf(exportArgs())); }
    catch (e) { showToast?.(e.message || "Eksportda xato"); }
    finally { setBusy(""); }
  }
  const table = (ls, key) => (
    <Card key={key} style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }} className="uvix-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 620 }}>
          <thead><tr style={{ borderBottom: `1px solid ${THEME.border}`, background: THEME.isDark ? THEME.hover : "#FAFAFB" }}><th style={{ ...th, textAlign: "left" }}>Kassa</th>{ROWS.map(([kk, l]) => <th key={kk} style={th}>{kk === "open" ? `${periodLabel} boshida` : kk === "close" ? `${periodLabel} oxirida` : l}</th>)}</tr></thead>
          {ls.map((l) => (
            <tbody key={l} data-kassa={l}>
              <tr style={{ background: THEME.isDark ? THEME.hover : "#FAFAFB" }}><td colSpan={6} style={{ padding: "8px 12px", fontWeight: 800, fontSize: 12.5, color: lineColor(l, THEME.isDark) }}>● {LINE_META[l].name}<span data-kassa-total={l} style={{ float: "right", color: rep.lines[l].close < 0 ? THEME.rose : THEME.text }}>{money(rep.lines[l].close)}</span></td></tr>
              {PAY_TYPES.map((t) => { const r = rep.rows[l][t]; return (
                <tr key={t} data-kassa-row={`${l}:${t}`} style={{ borderBottom: `1px solid ${THEME.border}`, cursor: "pointer" }} onClick={() => { setMoveKassa(`${l}:${t}`); setTab("moves"); }} title="Harakatlarini ko'rish">
                  <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{PAY_LABEL[t]}</td>
                  {ROWS.map(([kk]) => <td key={kk} data-bal={kk === "close" ? "" : undefined} style={{ ...td, fontWeight: kk === "close" ? 700 : 500 }}>{show(r, kk)}</td>)}
                </tr>
              ); })}
            </tbody>
          ))}
          {ls.length > 1 && (() => { const x = sumLines(ls); return (
            <tbody><tr data-testid="kassa-sum" style={{ borderTop: `2px solid ${THEME.text}` }}><td style={{ ...td, textAlign: "left", fontWeight: 800 }}>Jami</td>{ROWS.map(([kk]) => <td key={kk} style={{ ...td, fontWeight: 800 }}>{show(x, kk)}</td>)}</tr></tbody>
          ); })()}
        </table>
      </div>
    </Card>
  );
  // Harakatlar: tanlangan kassa bo'yicha qoldiq bilan
  const mk = moveKassa ? moveKassa.split(":") : null;
  const visMoves = moves.filter((m) => (line === "all" || m.line === line || m.toLine === line) && (!mk || (m.line === mk[0] && m.type === mk[1]) || (m.kind === "transfer" && m.toLine === mk[0] && m.toType === mk[1])));
  const movesWithBal = (() => {
    if (!mk) return visMoves.map((m) => ({ ...m }));
    let bal = rep.rows[mk[0]][mk[1]].open;
    const asc = [...visMoves].reverse().map((m) => {
      const delta = m.kind === "in" ? m.amount : m.kind === "out" ? -m.amount : m.line === mk[0] && m.type === mk[1] ? -m.amount : m.amount;
      bal += delta; return { ...m, delta, bal };
    });
    return asc.reverse();
  })();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="kassa-view">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <PeriodBar p={per} testid="kassa-period" />
        <div style={{ flex: 1 }} />
        {canTransfer && <Button variant="ghost" onClick={() => setForm(true)} data-testid="transfer-new"><ArrowRightLeft size={14} /> O'tkazma</Button>}
        <ExportButtons busy={busy} onExcel={() => doExport("xlsx")} onPdf={() => doExport("pdf")} />
      </div>
      <div role="tablist" style={{ display: "flex", gap: 22, borderBottom: `1px solid ${THEME.border}` }}>
        {[["bal", "Qoldiqlar", Wallet], ...(canPnl ? [["pnl", "Foyda va zarar", TrendingUp]] : []), ["moves", "Harakatlar", List]].map(([v, l, I]) => (
          <button key={v} type="button" role="tab" aria-selected={tab === v} data-tab={v} onClick={() => setTab(v)}
            style={{ border: 0, background: "none", padding: "10px 2px", marginBottom: -1, borderBottom: `2.5px solid ${tab === v ? THEME.text : "transparent"}`, color: tab === v ? THEME.text : THEME.muted, fontWeight: tab === v ? 700 : 600, fontSize: 14.5, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}><I size={15} />{l}</button>
        ))}
      </div>

      {tab === "bal" && <>
        <div data-testid="kassa-total" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          {[[`${periodLabel} boshida`, sgn(tot.open), THEME.text], ["Kirim", "+" + fmt(tot.in), THEME.greenText], ["Chiqim", "−" + fmt(tot.out), THEME.rose], [per.mode === "all" ? "Hozir" : `${periodLabel} oxirida`, sgn(tot.close), tot.close < 0 ? THEME.rose : THEME.text]].map(([l, v, c], i) => (
            <Card key={l} style={{ padding: "12px 14px", border: i === 3 ? `1.5px solid ${THEME.text}` : undefined }}><div style={{ fontSize: 12, color: THEME.muted }}>{l}</div><div data-kpi={i} style={{ fontSize: 20, fontWeight: 700, color: c, fontVariantNumeric: "tabular-nums" }}>{v}</div></Card>
          ))}
        </div>
        {split && line === "all" ? LINES.map((l) => <div key={l}><LineHeader line={l} right={money(rep.lines[l].close)} />{table([l], l)}</div>) : table(lines, "one")}
        <div style={{ fontSize: 12.5, color: THEME.muted }}>Boshida + kirim − chiqim ± o'tkazma = oxirida. Umumiy rasxod — qaysi kassadan to'langan bo'lsa, o'shandan. Qatorni bosing — harakatlari.</div>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", fontWeight: 700, fontSize: 14, borderBottom: `1px solid ${THEME.border}` }}>Ichki o'tkazmalar</div>
          {!transfers ? <div style={{ padding: 16, color: THEME.muted, fontSize: 13 }}>Yuklanmoqda…</div> : recent.length === 0 ? <EmptyState text="Hali o'tkazma yo'q" /> : recent.map((r) => (
            <div key={r.id} data-transfer={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: `1px solid ${THEME.border}`, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: THEME.muted, width: 70 }}>{shortDateUz(r.date)}</span>
              <LineTag line={r.from.line} /><span style={{ fontSize: 12.5 }}>{PAY_LABEL[r.from.type]}</span>
              <ArrowRight size={13} color={THEME.muted} />
              <LineTag line={r.to.line} /><span style={{ fontSize: 12.5 }}>{PAY_LABEL[r.to.type]}</span>
              <span style={{ flex: 1, minWidth: 80, fontSize: 12.5, color: THEME.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.note}{r.createdBy ? ` · ${r.createdBy}` : ""}</span>
              <b style={{ fontVariantNumeric: "tabular-nums" }}>{money(r.amount)}</b>
              {canTransfer && <button type="button" onClick={() => setDel(r)} className="uvix-iconbtn" style={getIconBtn()} aria-label="O'tkazmani o'chirish"><Trash2 size={13} color={THEME.rose} /></button>}
            </div>
          ))}
        </Card>
      </>}

      {tab === "pnl" && canPnl && (
        split && line === "all"
          ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>{LINES.map((l) => <ProfitLoss key={l} orders={orders} transactions={transactions} months={pnlMonths} only={l} />)}</div>
          : <ProfitLoss orders={orders} transactions={transactions} months={pnlMonths} only={line === "all" ? null : line} />
      )}

      {tab === "moves" && (
        <Card style={{ padding: 0, overflow: "hidden" }} data-testid="kassa-moves">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${THEME.border}`, flexWrap: "wrap" }}>
            <b style={{ fontSize: 14 }}>{visMoves.length} ta harakat</b>
            <select value={moveKassa} onChange={(e) => setMoveKassa(e.target.value)} style={{ ...getInputStyle(), width: "auto", marginLeft: "auto" }} aria-label="Kassa">
              <option value="">Barcha kassalar</option>
              {lines.flatMap((l) => PAY_TYPES.map((t) => <option key={`${l}:${t}`} value={`${l}:${t}`}>{LINE_META[l].name} · {PAY_LABEL[t]}</option>))}
            </select>
          </div>
          {movesWithBal.length === 0 ? <EmptyState text="Bu davrda harakat yo'q" /> : (
            <div style={{ overflowX: "auto" }} className="uvix-scroll">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 620 }}>
                <thead><tr style={{ borderBottom: `1px solid ${THEME.border}` }}><th style={{ ...th, textAlign: "left" }}>Sana</th><th style={{ ...th, textAlign: "left" }}>Kassa</th><th style={{ ...th, textAlign: "left" }}>Tavsif</th><th style={th}>Summa</th>{mk && <th style={th}>Qoldiq</th>}</tr></thead>
                <tbody>
                  {movesWithBal.slice(0, 500).map((m, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${THEME.border}` }}>
                      <td style={{ ...td, textAlign: "left", color: THEME.muted }}>{shortDateUz(m.date)}</td>
                      <td style={{ ...td, textAlign: "left" }}><LineTag line={m.line} /> {PAY_LABEL[m.type]}{m.kind === "transfer" && <> <ArrowRight size={11} /> <LineTag line={m.toLine} /> {PAY_LABEL[m.toType]}</>}</td>
                      <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: 180 }}>{m.title}{m.who ? <span style={{ color: THEME.muted }}> · {m.who}</span> : null}</td>
                      <td style={{ ...td, fontWeight: 700, color: (m.delta ?? (m.kind === "in" ? 1 : m.kind === "out" ? -1 : 0)) > 0 ? THEME.greenText : (m.delta ?? (m.kind === "out" ? -1 : 0)) < 0 ? THEME.rose : THEME.text }}>{m.delta != null ? signed(m.delta) : m.kind === "in" ? "+" + fmt(m.amount) : m.kind === "out" ? "−" + fmt(m.amount) : fmt(m.amount)}</td>
                      {mk && <td style={{ ...td, fontWeight: 600, color: m.bal < 0 ? THEME.rose : undefined }}>{sgn(m.bal)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {form && <TransferForm kassa={k} onClose={() => setForm(false)} onSave={async (r) => { await save([{ ...r, id: uid(), createdBy: currentUser?.name || "", createdAt: new Date().toISOString() }, ...(transfers || [])]); setForm(false); showToast?.("O'tkazma saqlandi"); }} />}
      {del && <ConfirmDialog title="O'tkazmani o'chirish" message={`${money(del.amount)} — o'tkazma o'chiriladi, kassalar qayta hisoblanadi.`} confirmLabel="O'chirish" onConfirm={async () => { await save((transfers || []).map((t) => (t.id === del.id ? { ...t, deletedAt: new Date().toISOString(), deletedBy: currentUser?.name || "" } : t))); setDel(null); }} onCancel={() => setDel(null)} />}
    </div>
  );
}

function TransferForm({ kassa, onClose, onSave }) {
  const [from, setFrom] = useState({ line: "UVIXPRINT", type: "naqd" });
  const [to, setTo] = useState({ line: "UVONYX", type: "naqd" });
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const n = Number(String(amount).replace(/\D/g, "")) || 0;
  const pick = (v, set, testid) => (
    <div style={{ display: "flex", gap: 6 }} data-testid={testid}>
      <select value={v.line} onChange={(e) => set({ ...v, line: e.target.value })} style={getInputStyle()} data-part="line">{LINES.map((l) => <option key={l} value={l}>{LINE_META[l].name}</option>)}</select>
      <select value={v.type} onChange={(e) => set({ ...v, type: e.target.value })} style={getInputStyle()} data-part="type">{PAY_TYPES.map((t) => <option key={t} value={t}>{PAY_LABEL[t]}</option>)}</select>
    </div>
  );
  function submit() {
    if (from.line === to.line && from.type === to.type) return setErr("Qayerdan va qayerga bir xil kassa");
    if (n <= 0) return setErr("Summani kiriting");
    onSave({ date, from, to, amount: n, note: note.trim() });
  }
  return (
    <Modal title="Ichki o'tkazma" onClose={onClose} width={460}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label={`Qayerdan (qoldiq: ${money(kassa[from.line][from.type].bal)})`}>{pick(from, setFrom, "tr-from")}</Field>
        <Field label="Qayerga">{pick(to, setTo, "tr-to")}</Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Summa"><input value={amount} onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); setAmount(d ? fmt(Number(d)) : ""); }} inputMode="numeric" placeholder="0" style={getInputStyle()} data-testid="tr-amount" /></Field>
          <Field label="Sana"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={getInputStyle()} /></Field>
        </div>
        <Field label="Izoh"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: ijara uchun UVONYX ulushi" style={getInputStyle()} /></Field>
        <div style={{ fontSize: 12, color: THEME.muted }}>Bir yo'nalishdan ikkinchisiga yoki bir kassadan boshqasiga (masalan naqd → bank). Foyda hisobiga ta'sir qilmaydi.</div>
        {err && <div style={{ color: THEME.rose, fontSize: 12.5 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={submit} data-testid="tr-save">Saqlash</Button>
        </div>
      </div>
    </Modal>
  );
}
