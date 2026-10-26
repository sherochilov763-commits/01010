// CardView.jsx — «Karta»: shaxsiy karta (Uzcard) kirim-chiqimi CardXabar Telegram xabarlaridan.
// Chiqimni rasxodga yozish, kirimni buyurtma to'loviga bog'lash yoki «shaxsiy» deb belgilash mumkin.
// Faqat rahbar ko'radi (server ham tekshiradi).
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, CreditCard, Download, Link2, RefreshCw, Search, Send, User, X } from "lucide-react";
import { Button, Card, Modal, getInputStyle, useIsMobile } from "../../components/ui.jsx";
import { THEME } from "../../theme.js";
import { cardAccountLogin, disconnectCardAccount, fetchCardAccount, fetchCardTx, markCardTx, syncCardTx } from "../../storage.js";
import { TelegramLoginModal } from "../settings/TelegramAccountSection.jsx";
import { fmt, localDateStr, money, uid } from "../../lib/format.js";
import { orderDebt } from "../../lib/finance.js";
import { exportRows } from "../../lib/excel.js";
import { TransactionForm } from "../expenses/TransactionForm.jsx";

const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
const pad = (n) => String(n).padStart(2, "0");
const sum = (n) => (Number(n) || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 }).replace(/,/g, ".");
const hm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dayKey = (iso) => localDateStr(new Date(iso));
function dayTitle(key) {
  const today = localDateStr(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (key === today) return "Bugun";
  if (key === localDateStr(y)) return "Kecha";
  const [yy, m, d] = key.split("-").map(Number);
  return `${d}-${MONTHS[m - 1]}${yy !== new Date().getFullYear() ? ` ${yy}` : ""}`;
}
function ago(iso) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "hozirgina";
  if (s < 3600) return `${Math.round(s / 60)} daqiqa oldin`;
  if (s < 86400) return `${Math.round(s / 3600)} soat oldin`;
  return `${Math.round(s / 86400)} kun oldin`;
}
const PERIODS = [["today", "Bugun"], ["week", "Hafta"], ["month", "Oy"], ["all", "Hammasi"]];
function periodStart(p) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (p === "today") return d;
  if (p === "week") { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
  if (p === "month") { d.setDate(1); return d; }
  return null;
}
const FILTERS = [["all", "Hammasi"], ["in", "Kirim"], ["out", "Chiqim"], ["open", "Belgilanmagan"]];
const isOpen = (t) => !t.personal && !t.txId && !t.orderId;
const titleOf = (t) => t.merchant || t.kind || "Karta";

function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      style={{ padding: "7px 12px", borderRadius: 999, border: `1px solid ${active ? THEME.text : THEME.border}`, background: active ? THEME.text : THEME.card,
        color: active ? THEME.card : THEME.text, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{children}</button>
  );
}
function Metric({ label, value, color }) {
  return (
    <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: color || THEME.text, fontFamily: THEME.fontNum, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}
function StatusTag({ t }) {
  const tag = (txt, color, bg, Icon) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 7px", borderRadius: 6, fontSize: 11.5, fontWeight: 600, color, background: bg, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {Icon && <Icon size={11} />}{txt}
    </span>
  );
  if (t.personal) return tag("Shaxsiy", THEME.muted, THEME.chip, User);
  if (t.txId) return tag(`Rasxod: ${t.label || "yozilgan"}`, THEME.greenText, THEME.greenBg, Check);
  if (t.orderId) return tag(`Buyurtma ${t.label || ""}`, THEME.blueText, THEME.blueBg, Link2);
  return t.dir === "in" ? tag("Buyurtmaga bog'lash", THEME.blueText, THEME.blueBg) : tag("Rasxodga yozish", THEME.amberText, THEME.amberBg);
}

export function CardView({ currentUser, settings, orders, categories, employees, onAddCategory, onAddSubcategory, onSaveTx, onAddPayment }) {
  const isMobile = useIsMobile();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [period, setPeriod] = useState("month");
  const [filter, setFilter] = useState("all");
  const [card, setCard] = useState("all");
  const [sel, setSel] = useState(null); // tanlangan yozuv (amallar oynasi)
  const [mode, setMode] = useState(null); // "expense" | "order"
  const [sheet, setSheet] = useState(false); // amallar oynasi ochiqmi
  // Amallar oynasidan rasxod/buyurtma oynasiga o'tish: avval birinchisi yopilib, «orqaga» yozuvi olib tashlanadi,
  // keyingisi shundan keyin ochiladi — aks holda kechikib kelgan «orqaga» hodisasi yangi oynani ham yopib yuboradi
  function chooseMode(m) {
    setSheet(false);
    let done = false;
    const go = () => { if (done) return; done = true; window.removeEventListener("popstate", go); setMode(m); };
    window.addEventListener("popstate", go);
    setTimeout(go, 500);
  }
  const closeAll = () => { setSel(null); setSheet(false); setMode(null); };

  const [account, setAccount] = useState(null); // karta uchun ulangan shaxsiy Telegram
  const [linking, setLinking] = useState(false);
  const load = useCallback(() => {
    fetchCardAccount().then(setAccount).catch(() => {});
    return fetchCardTx().then((d) => { setData(d); setErr(""); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // yangi xabarlar har 30 soniyada
    return () => clearInterval(t);
  }, [load]);
  async function sync() {
    setSyncing(true);
    try { const d = await syncCardTx(); setData(d); setErr(""); } catch (e) { setErr(e.message); }
    setSyncing(false);
  }
  async function mark(t, patch) {
    const item = await markCardTx(t.id, patch);
    setData((d) => ({ ...d, items: d.items.map((x) => (x.id === item.id ? item : x)) }));
    return item;
  }

  const items = data?.items || [];
  const cards = useMemo(() => [...new Set(items.map((t) => t.card).filter(Boolean))], [items]);
  const inPeriod = useMemo(() => {
    const from = periodStart(period);
    return items.filter((t) => (card === "all" || t.card === card) && (!from || new Date(t.at) >= from));
  }, [items, period, card]);
  const shown = inPeriod.filter((t) => filter === "all" || (filter === "open" ? isOpen(t) : t.dir === filter));
  const totIn = inPeriod.filter((t) => t.dir === "in").reduce((s, t) => s + t.amount, 0);
  const totOut = inPeriod.filter((t) => t.dir === "out").reduce((s, t) => s + t.amount, 0);
  const latest = items.find((t) => (card === "all" || t.card === card) && t.balance != null);
  const openCount = inPeriod.filter(isOpen).length;

  const status = data?.status || [];
  const found = status.find((s) => s.found);
  const anyConnected = status.some((s) => s.connected);
  const lastAt = items[0]?.receivedAt || items[0]?.msgAt;

  const groups = useMemo(() => {
    const m = new Map();
    shown.forEach((t) => { const k = dayKey(t.at); if (!m.has(k)) m.set(k, []); m.get(k).push(t); });
    return [...m.entries()];
  }, [shown]);

  function exportExcel() {
    const rows = shown.map((t) => ({
      Sana: dayKey(t.at), Vaqt: hm(t.at), Turi: t.dir === "in" ? "Kirim" : "Chiqim", Amal: t.kind, Joy: t.merchant,
      Summa: t.dir === "in" ? t.amount : -t.amount, Qoldiq: t.balance ?? "", Karta: t.card ? `***${t.card}` : "",
      Holat: t.personal ? "Shaxsiy" : t.txId ? `Rasxod: ${t.label || ""}` : t.orderId ? `Buyurtma ${t.label || ""}` : "", Izoh: t.note || "",
    }));
    exportRows(rows, "Karta", `karta-${localDateStr(new Date())}`, { title: "Karta kirim-chiqimi", totals: false, user: currentUser?.name });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <CreditCard size={20} color={THEME.text} />
        <span style={{ fontSize: 13, color: THEME.muted, flex: 1, minWidth: 160 }}>
          {found ? <>Uzcard{cards.length === 1 ? ` ••${cards[0]}` : ""} · oxirgi xabar {ago(lastAt) || "—"}</> : "Shaxsiy karta kirim-chiqimi"}
        </span>
        {data && (found
          ? <span style={{ fontSize: 12, fontWeight: 600, color: THEME.greenText, background: THEME.greenBg, padding: "3px 10px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 4 }}><Check size={13} /> CardXabar ulangan</span>
          : <span style={{ fontSize: 12, fontWeight: 600, color: THEME.amberText, background: THEME.amberBg, padding: "3px 10px", borderRadius: 8 }}>{anyConnected ? "CardXabar topilmadi" : "Telegram ulanmagan"}</span>)}
        <Button variant="ghost" onClick={sync} disabled={syncing} style={{ display: "inline-flex", alignItems: "center", gap: 6 }} title="CardXabar chatini qayta o'qish">
          <RefreshCw size={15} className={syncing ? "uvix-spin" : ""} /> {syncing ? "O'qilmoqda…" : "Yangilash"}
        </Button>
      </div>

      {err && <Card><div style={{ color: THEME.rose, fontSize: 13 }}>{err}</div></Card>}
      {!data && !err && <Card><div style={{ color: THEME.muted, fontSize: 13 }}>Yuklanmoqda…</div></Card>}
      {data && !found && account?.status !== "connected" && (
        <Card data-testid="card-connect">
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>CardXabar qaysi Telegram'da?</div>
          <div style={{ fontSize: 13, color: THEME.muted, lineHeight: 1.6, marginBottom: 12 }}>
            Kartangiz ulangan shaxsiy Telegram akkauntni ulang. Faqat CardXabar chati o'qiladi — boshqa chatlar CRM'ga tushmaydi, xodimlar ko'rmaydi.
          </div>
          {account?.status === "expired" && <div style={{ fontSize: 12.5, color: THEME.roseText, marginBottom: 10 }}>Oldingi ulanish uzilgan: {account.message || "sessiya tugagan"}. Qayta ulang.</div>}
          <Button onClick={() => setLinking(true)} data-testid="card-connect-btn" style={{ width: "100%", justifyContent: "center", display: "inline-flex", alignItems: "center", gap: 6 }}><Send size={15} /> Telegram akkauntni ulash</Button>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 8, textAlign: "center" }}>QR kod (kompyuterda) yoki telefon raqam + kod</div>
        </Card>
      )}
      {data && !found && account?.status === "connected" && (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Bu akkauntda CardXabar chati topilmadi</div>
          <div style={{ fontSize: 13, color: THEME.muted, lineHeight: 1.6 }}>Ulangan akkauntda @CardXabar boti bilan suhbat bo'lishi kerak. Botga kartani qo'shib, «Yangilash»ni bosing yoki pastdan boshqa akkauntni ulang.</div>
        </Card>
      )}

      {data && (found || items.length > 0) && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PERIODS.map(([k, l]) => <Chip key={k} active={period === k} onClick={() => setPeriod(k)}>{l}</Chip>)}
            {cards.length > 1 && <span style={{ width: 8 }} />}
            {cards.length > 1 && [["all", "Barcha kartalar"], ...cards.map((c) => [c, `••${c}`])].map(([k, l]) => <Chip key={k} active={card === k} onClick={() => setCard(k)}>{l}</Chip>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(3, minmax(0,1fr))", gap: 10 }}>
            <Metric label="Kirim" value={`+${sum(totIn)}`} color={THEME.greenText} />
            <Metric label="Chiqim" value={`−${sum(totOut)}`} color={THEME.roseText} />
            {!isMobile && <Metric label="Kartadagi qoldiq" value={latest ? `${sum(latest.balance)} so'm` : "—"} />}
          </div>
          {isMobile && (
            <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, color: THEME.muted }}>Kartadagi qoldiq</span>
              <span style={{ fontSize: 17, fontWeight: 700, fontFamily: THEME.fontNum }}>{latest ? `${sum(latest.balance)} so'm` : "—"}</span>
            </div>
          )}

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {FILTERS.map(([k, l]) => <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>{l}{k === "open" && openCount ? ` · ${openCount}` : ""}</Chip>)}
          </div>

          <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 14, overflow: "hidden", background: THEME.card }}>
            {groups.length === 0 && <div style={{ padding: "28px 16px", textAlign: "center", color: THEME.muted, fontSize: 13 }}>Bu davrda yozuv yo'q</div>}
            {groups.map(([k, list]) => (
              <div key={k}>
                <div style={{ padding: "8px 14px", fontSize: 12, fontWeight: 700, color: THEME.muted, background: THEME.surface, borderBottom: `1px solid ${THEME.border}` }}>{dayTitle(k)}</div>
                {list.map((t) => (
                  <button key={t.id} type="button" onClick={() => { setSel(t); setMode(null); setSheet(true); }} data-testid="card-row"
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", border: 0, borderBottom: `1px solid ${THEME.border}`, background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: THEME.text, opacity: t.personal ? 0.65 : 1 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: t.dir === "in" ? THEME.greenBg : THEME.roseBg, color: t.dir === "in" ? THEME.greenText : THEME.roseText }}>
                      {t.dir === "in" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titleOf(t)}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: THEME.muted, marginTop: 2, minWidth: 0 }}>
                        <span style={{ flexShrink: 0 }}>{hm(t.at)}</span><span style={{ minWidth: 0, display: "flex" }}><StatusTag t={t} /></span>
                      </span>
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", fontFamily: THEME.fontNum, color: t.dir === "in" ? THEME.greenText : THEME.roseText }}>
                      {t.dir === "in" ? "+" : "−"}{sum(t.amount)}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={exportExcel} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Download size={15} /> Excel</Button>
          </div>
        </>
      )}

      {data && account?.status === "connected" && (
        <div data-testid="card-account" style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", border: `1px solid ${THEME.border}`, borderRadius: 12, background: THEME.card }}>
          <Send size={18} color={THEME.text} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account.user?.name || "Telegram"}{account.user?.phone ? ` · +${String(account.user.phone).replace(/^\+/, "").replace(/^(\d{3})\d+(\d{2})$/, "$1 •• ••• $2")}` : ""}</div>
            <div style={{ fontSize: 12, color: THEME.muted }}>Karta uchun akkaunt · {status.find((x) => x.line === "CARD")?.found ? "CardXabar topildi" : "CardXabar topilmadi"}</div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: THEME.greenText, background: THEME.greenBg, padding: "3px 8px", borderRadius: 8 }}>Ulangan</span>
          <Button variant="ghost" onClick={async () => { if (!window.confirm("Karta uchun Telegram akkaunt uzilsinmi? Yozilgan karta yozuvlari qoladi.")) return; setAccount(await disconnectCardAccount().catch(() => account)); load(); }} style={{ padding: "6px 10px", fontSize: 12.5 }}>Uzish</Button>
        </div>
      )}
      {linking && (
        <TelegramLoginModal settings={{ ...(settings || {}), telegramUserPhone: "" }} loginFn={cardAccountLogin} title="Karta uchun Telegram akkaunt"
          onClose={() => { setLinking(false); load(); }}
          onDone={() => { load(); setTimeout(() => { sync(); }, 2500); }} />
      )}

      {sel && sheet && <ActionSheet t={sel} onClose={closeAll} onMode={chooseMode} onMark={async (p) => { await mark(sel, p); closeAll(); }} />}
      {sel && mode === "expense" && (
        <TransactionForm currentUser={currentUser} categories={categories} orders={orders} employees={employees}
          preset={{ amount: Math.round(sel.amount), date: dayKey(sel.at), paymentType: "karta", note: `${titleOf(sel)}${sel.card ? ` · karta ••${sel.card}` : ""}` }}
          onAddCategory={onAddCategory} onAddSubcategory={onAddSubcategory} onClose={closeAll}
          onSave={async (tx) => {
            onSaveTx(tx, false);
            const t = sel;
            closeAll();
            await mark(t, { txId: tx.id, label: [tx.category, tx.subcategory].filter(Boolean).join(" / "), personal: false }).catch((e) => setErr(e.message));
          }} />
      )}
      {sel && mode === "order" && (
        <OrderPicker t={sel} orders={orders} onClose={closeAll}
          onPick={async (o) => {
            const p = { id: uid(), amount: Math.round(sel.amount), date: dayKey(sel.at), paymentType: "karta", comment: `Karta${sel.card ? ` ••${sel.card}` : ""} · ${titleOf(sel)}`, createdBy: currentUser?.name || "", createdAt: new Date().toISOString() };
            onAddPayment(o.id, [p]);
            const t = sel;
            closeAll();
            await mark(t, { orderId: o.id, paymentId: p.id, label: `${o.orderNumber || ""} · ${o.customer || ""}`.trim(), personal: false }).catch((e) => setErr(e.message));
          }} />
      )}
    </div>
  );
}

function ActionSheet({ t, onClose, onMode, onMark }) {
  const [note, setNote] = useState(t.note || "");
  const [busy, setBusy] = useState(false);
  const run = async (p) => { setBusy(true); try { await onMark(p); } finally { setBusy(false); } };
  const row = (k, v) => v ? <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "5px 0" }}><span style={{ color: THEME.muted }}>{k}</span><span style={{ textAlign: "right" }}>{v}</span></div> : null;
  const linked = t.txId || t.orderId;
  return (
    <Modal title={titleOf(t)} onClose={onClose} width={420}>
      <div style={{ fontSize: 26, fontWeight: 800, fontFamily: THEME.fontNum, color: t.dir === "in" ? THEME.greenText : THEME.roseText, marginBottom: 8 }}>
        {t.dir === "in" ? "+" : "−"}{sum(t.amount)} <span style={{ fontSize: 15, fontWeight: 600 }}>{t.currency === "UZS" ? "so'm" : t.currency}</span>
      </div>
      <div style={{ borderTop: `1px solid ${THEME.border}`, borderBottom: `1px solid ${THEME.border}`, padding: "6px 0", marginBottom: 12 }}>
        {row("Amal", t.kind)}
        {row("Vaqt", `${dayTitle(dayKey(t.at))}, ${hm(t.at)}`)}
        {row("Karta", t.card ? `••${t.card}` : "")}
        {row("Qoldiq", t.balance != null ? `${sum(t.balance)} so'm` : "")}
        {row("Holat", t.personal ? "Shaxsiy" : t.txId ? `Rasxod: ${t.label || "yozilgan"}` : t.orderId ? `Buyurtma ${t.label || ""}` : "Belgilanmagan")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {!linked && !t.personal && t.dir === "out" && <Button onClick={() => onMode("expense")} disabled={busy}>Rasxodga yozish</Button>}
        {!linked && !t.personal && t.dir === "in" && <Button onClick={() => onMode("order")} disabled={busy}>Buyurtmaga bog'lash</Button>}
        {!linked && <Button variant="ghost" disabled={busy} onClick={() => run({ personal: !t.personal })}>{t.personal ? "Shaxsiy emas" : "Shaxsiy (biznesga aloqasi yo'q)"}</Button>}
        {linked && (
          <>
            <div style={{ fontSize: 12.5, color: THEME.muted, lineHeight: 1.5 }}>
              Bog'lanishni olib tashlash {t.txId ? "rasxodni" : "to'lovni"} o'chirmaydi — kerak bo'lsa {t.txId ? "Rasxod" : "Buyurtmalar"} bo'limidan o'chiring.
            </div>
            <Button variant="ghost" disabled={busy} onClick={() => run({ txId: null, orderId: null, paymentId: null, label: null })}>Bog'lanishni olib tashlash</Button>
          </>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Izoh" maxLength={300} style={{ ...getInputStyle(), flex: 1 }} />
          <Button variant="ghost" disabled={busy || note === (t.note || "")} onClick={() => run({ note })}>Saqlash</Button>
        </div>
      </div>
    </Modal>
  );
}

function OrderPicker({ t, orders, onClose, onPick }) {
  const [q, setQ] = useState("");
  const amt = Math.round(t.amount);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = (orders || []).filter((o) => !o.deletedAt);
    const hits = s ? base.filter((o) => `${o.customer || ""} ${o.orderNumber || ""} ${o.phone || ""}`.toLowerCase().includes(s)) : base.filter((o) => orderDebt(o) > 0);
    // Qarzi summaga teng yoki yaqin buyurtmalar — tepada
    return hits.map((o) => ({ o, debt: orderDebt(o) })).sort((a, b) => (Math.abs(a.debt - amt) - Math.abs(b.debt - amt))).slice(0, 30);
  }, [orders, q, amt]);
  return (
    <Modal title={`Buyurtmaga bog'lash · +${fmt(amt)}`} onClose={onClose} width={460}>
      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={15} color={THEME.muted} style={{ position: "absolute", left: 10, top: 11 }} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mijoz yoki buyurtma raqami" style={{ ...getInputStyle(), paddingLeft: 32, width: "100%" }} />
        {q && <button type="button" aria-label="Tozalash" onClick={() => setQ("")} style={{ position: "absolute", right: 8, top: 8, border: 0, background: "transparent", cursor: "pointer", color: THEME.muted }}><X size={15} /></button>}
      </div>
      {!q && <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 6 }}>Qarzi bor buyurtmalar (summaga yaqini tepada)</div>}
      <div style={{ display: "flex", flexDirection: "column", maxHeight: 360, overflowY: "auto", border: `1px solid ${THEME.border}`, borderRadius: 10 }}>
        {list.length === 0 && <div style={{ padding: 16, fontSize: 13, color: THEME.muted, textAlign: "center" }}>Buyurtma topilmadi</div>}
        {list.map(({ o, debt }) => (
          <button key={o.id} type="button" onClick={() => onPick(o)}
            style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: 0, borderBottom: `1px solid ${THEME.border}`, background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: THEME.text }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.customer || "—"}</span>
              <span style={{ fontSize: 12, color: THEME.muted }}>{o.orderNumber} · {o.date}</span>
            </span>
            <span style={{ fontSize: 12.5, whiteSpace: "nowrap", color: debt > 0 ? (debt === amt ? THEME.greenText : THEME.amberText) : THEME.muted, fontWeight: 600 }}>
              {debt > 0 ? `qarz ${money(debt)}` : "to'langan"}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
