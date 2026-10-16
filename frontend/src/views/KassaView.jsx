// KassaView.jsx — yo'nalishlar bo'yicha alohida kassalar (UVIXPRINT / UVONYX × naqd / karta / bank) va ichki o'tkazma.
// Rahbar hammasini ko'radi va o'tkazma qiladi; katta menejer (kassa huquqi bilan) — faqat o'z yo'nalishi kassasini.
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowRightLeft, Landmark, Trash2 } from "lucide-react";
import { Button, Card, ConfirmDialog, EmptyState, Field, Modal, getIconBtn, getInputStyle } from "../components/ui.jsx";
import { LineTag } from "../components/LineSwitcher.jsx";
import { storageGet, storageSet } from "../lib/kv.js";
import { LINE_META, LINES, lineColor, useLine } from "../lib/lines.js";
import { PAY_LABEL, PAY_TYPES, computeKassa } from "../lib/kassa.js";
import { fmt, money, shortDateUz, todayStr, uid } from "../lib/format.js";
import { THEME } from "../theme.js";

const KEY = "uvix:transfers";
const sgn = (v) => (v < 0 ? "−" : "") + fmt(Math.abs(Math.round(v)));

export function KassaView({ orders, transactions, isAdmin, canCash, currentUser, showToast }) {
  const { line } = useLine();
  const [transfers, setTransfers] = useState(null);
  const [form, setForm] = useState(false);
  const [del, setDel] = useState(null);
  useEffect(() => { storageGet(KEY, true, []).then((v) => setTransfers(Array.isArray(v) ? v : [])); }, []);
  const k = useMemo(() => computeKassa(orders, transactions, (transfers || []).filter((t) => !t.deletedAt)), [orders, transactions, transfers]);
  const lines = line === "all" ? LINES : [line];
  async function save(next) { setTransfers(next); await storageSet(KEY, true, next); }

  if (!isAdmin && !canCash) return <Card><EmptyState text="Kassani ko'rish uchun rahbar «Kassa qoldig'ini ko'radi» huquqini berishi kerak" /></Card>;
  const recent = (transfers || []).filter((t) => !t.deletedAt && (line === "all" || t.from?.line === line || t.to?.line === line)).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 30);
  const th = { padding: "9px 12px", fontSize: 11.5, fontWeight: 600, color: THEME.muted, textAlign: "right", whiteSpace: "nowrap" };
  const td = { padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: THEME.muted }}>Haqiqiy pul: kirim (to'lovlar) − chiqim (rasxodlar) ± o'tkazmalar. Umumiy rasxod — qaysi kassadan to'langan bo'lsa, o'shandan.</div>
        <div style={{ flex: 1 }} />
        {isAdmin && <Button onClick={() => setForm(true)} data-testid="transfer-new"><ArrowRightLeft size={14} /> Ichki o'tkazma</Button>}
      </div>
      {line === "all" && (
        <Card data-testid="kassa-total" style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "center" }}>
          <div><div style={{ fontSize: 12.5, color: THEME.muted }}>Jami pul (ikkala yo'nalish)</div><div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(k.totals.all)}</div></div>
          {LINES.map((l) => <div key={l}><div style={{ fontSize: 12.5, color: THEME.muted, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: lineColor(l, THEME.isDark) }} />{LINE_META[l].name}</div><div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(k.totals[l])}</div></div>)}
        </Card>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>
        {lines.map((l) => (
          <Card key={l} data-kassa={l} style={{ padding: 0, overflow: "hidden", borderTop: `4px solid ${lineColor(l, THEME.isDark)}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px" }}>
              <Landmark size={16} color={lineColor(l, THEME.isDark)} /><b style={{ fontSize: 15 }}>{LINE_META[l].name} kassasi</b>
              <div style={{ flex: 1 }} /><b data-kassa-total={l} style={{ fontSize: 16, fontVariantNumeric: "tabular-nums", color: k.totals[l] < 0 ? THEME.rose : THEME.text }}>{money(k.totals[l])}</b>
            </div>
            <div style={{ overflowX: "auto" }} className="uvix-scroll">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ borderTop: `1px solid ${THEME.border}`, borderBottom: `1px solid ${THEME.border}` }}><th style={{ ...th, textAlign: "left" }} /><th style={th}>Kirim</th><th style={th}>Chiqim</th><th style={th}>O'tkazma</th><th style={th}>Qoldiq</th></tr></thead>
                <tbody>
                  {PAY_TYPES.map((t) => { const x = k[l][t]; return (
                    <tr key={t} data-kassa-row={`${l}:${t}`} style={{ borderBottom: `1px solid ${THEME.border}` }}>
                      <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{PAY_LABEL[t]}</td>
                      <td style={td}>{fmt(x.in)}</td>
                      <td style={{ ...td, color: x.out ? THEME.rose : THEME.muted }}>{x.out ? "−" + fmt(x.out) : "0"}</td>
                      <td style={{ ...td, color: THEME.muted }}>{x.tin - x.tout ? (x.tin - x.tout > 0 ? "+" : "") + sgn(x.tin - x.tout) : "—"}</td>
                      <td data-bal style={{ ...td, fontWeight: 700, color: x.bal < 0 ? THEME.rose : THEME.text }}>{sgn(x.bal)}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
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
            {isAdmin && <button type="button" onClick={() => setDel(r)} className="uvix-iconbtn" style={getIconBtn()} aria-label="O'tkazmani o'chirish"><Trash2 size={13} color={THEME.rose} /></button>}
          </div>
        ))}
      </Card>
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
