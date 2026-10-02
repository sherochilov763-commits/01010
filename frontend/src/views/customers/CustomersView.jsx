import { Avatar as UiAvatar } from "../../components/ui.jsx";
// CustomersView.jsx — Mijozlar bazasi (buyurtmalar va lidlardan avtomatik) va Qarzdorlar ro'yxati.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Download, FileText, MessageCircle, Pencil, Phone, Plus, Search, Send, Users, Wallet } from "lucide-react";
import { Button, Card, EmptyState, Field, Incremental, Modal, getInputStyle, useIsMobile } from "../../components/ui.jsx";
import { THEME } from "../../theme.js";
import { LEAD_STAGES } from "../../constants.js";
import { money, moneyCompact, shortDateUz, todayStr, uid } from "../../lib/format.js";
import { buildCustomers, custKey, telLink, tgLink } from "../../lib/customers.js";
import { exportRows } from "../../lib/excel.js";
import { PaymentsModal } from "../orders/PaymentsModal.jsx";
import { TG_BLUE } from "../../components/LeadSource.jsx";
import { TelegramLinkCard } from "../../components/TelegramLinkCard.jsx";
import { fetchCustMsgConfig, fetchCustMsgLog, fetchDebtConfig, fetchRemindPreview, saveCustMsgConfig, saveDebtConfig, sendDebtDigest } from "../../storage.js";
import { InvoiceModal } from "../../components/InvoiceModal.jsx";

const WD = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];
const ageColor = (d) => (d > 30 ? THEME.rose : d > 7 ? THEME.amber : THEME.muted);

function Tabs({ tabs, tab, setTab }) {
  return (
    <div role="tablist" style={{ display: "flex", gap: 3, padding: 3, borderRadius: 12, background: THEME.surface, width: "fit-content", maxWidth: "100%", overflowX: "auto" }}>
      {tabs.map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={tab === k} data-custtab={k} onClick={() => setTab(k)}
          style={{ padding: "8px 14px", borderRadius: 10, border: 0, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap",
            background: tab === k ? THEME.card : "transparent", color: tab === k ? THEME.text : THEME.muted, boxShadow: tab === k ? THEME.shadowSm : "none" }}>{l}</button>
      ))}
    </div>
  );
}
const Avatar = ({ name, size = 36 }) => <UiAvatar name={name} size={size} />;
function IconLink({ href, title, color, children, onClick }) {
  const style = { width: 32, height: 32, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `${color}1F`, color, border: 0, cursor: "pointer", flexShrink: 0, textDecoration: "none" };
  if (onClick) return <button type="button" title={title} aria-label={title} onClick={(e) => { e.stopPropagation(); onClick(); }} style={style}>{children}</button>;
  return <a href={href} title={title} aria-label={title} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer" onClick={(e) => e.stopPropagation()} style={style}>{children}</a>;
}
function ContactButtons({ c, onOpenChat }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {c.phone && <IconLink href={telLink(c.phone)} title={`Qo'ng'iroq: ${c.phone}`} color={THEME.green}><Phone size={15} /></IconLink>}
      {c.chatLead ? <IconLink onClick={() => onOpenChat(c.chatLead)} title="Chatni ochish" color={TG_BLUE}><MessageCircle size={15} /></IconLink>
        : c.telegram ? <IconLink href={tgLink(c.telegram)} title={`@${c.telegram}`} color={TG_BLUE}><Send size={14} /></IconLink> : null}
    </div>
  );
}

export function CustomersView({ currentUser, isAdmin, orders, leads, profiles, transactions, onSaveCustomer, onAddPayment, onDeletePayment, onOpenChat, onOpenOrders }) {
  const today = todayStr();
  const all = useMemo(() => buildCustomers(orders, leads, profiles, today), [orders, leads, profiles, today]);
  const debtors = useMemo(() => all.filter((c) => c.debt > 0).sort((a, b) => b.debt - a.debt), [all]);
  const [tab, setTab] = useState("list");
  const [openId, setOpenId] = useState(null);
  const [edit, setEdit] = useState(null); // customer | {} (yangi)
  const [payFor, setPayFor] = useState(null);
  const [invoiceFor, setInvoiceFor] = useState(null); // { order, customer }
  const open = openId ? all.find((c) => c.id === openId) || all.find((c) => c.keys.some((k) => openId === `k:${k}`)) : null;
  const totalDebt = debtors.reduce((s, c) => s + c.debt, 0);
  const month = today.slice(0, 7);
  const newThisMonth = all.filter((c) => c.firstDate && String(c.firstDate).startsWith(month)).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <Kpi label="Mijozlar" value={all.length} icon={Users} color={THEME.violet} />
        <Kpi label="Bu oy yangi" value={newThisMonth} icon={Plus} color={THEME.cyan} />
        <Kpi label="Qarzdor mijozlar" value={debtors.length} icon={AlertTriangle} color={THEME.amber} onClick={() => setTab("debt")} />
        <Kpi label="Jami qarz" value={moneyCompact(totalDebt)} icon={Wallet} color={THEME.rose} onClick={() => setTab("debt")} />
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Tabs tabs={[["list", "Mijozlar"], ["debt", `Qarzdorlar${debtors.length ? ` (${debtors.length})` : ""}`], ...(isAdmin ? [["msg", "Xabarlar"]] : [])]} tab={tab} setTab={setTab} />
        <div style={{ flex: 1 }} />
        <Button onClick={() => setEdit({})} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={15} /> Mijoz</Button>
      </div>
      {tab === "list" && <ListTab all={all} onOpen={(c) => setOpenId(c.id)} onOpenChat={onOpenChat} />}
      {tab === "debt" && <DebtTab debtors={debtors} totalDebt={totalDebt} isAdmin={isAdmin} onOpen={(c) => setOpenId(c.id)} onPay={setPayFor} onInvoice={(order, customer) => setInvoiceFor({ order, customer })} onOpenChat={onOpenChat} />}
      {tab === "msg" && isAdmin && <MessagesTab />}
      {invoiceFor && <InvoiceModal order={invoiceFor.order} customer={invoiceFor.customer} isAdmin={isAdmin} onClose={() => setInvoiceFor(null)} />}
      {open && <CustomerCard c={open} onClose={() => setOpenId(null)} onEdit={() => setEdit(open)} onPay={setPayFor} onInvoice={(order) => setInvoiceFor({ order, customer: open })} onOpenChat={onOpenChat} onOpenOrders={onOpenOrders} />}
      {edit && <EditCustomer c={edit.id ? edit : null} all={all} onClose={() => setEdit(null)}
        onSave={(profile, merged) => { onSaveCustomer(profile, merged); setEdit(null); setOpenId(profile.id); }} />}
      {payFor && (
        <PaymentsModal order={orders.find((o) => o.id === payFor.id) || payFor} transactions={transactions} currentUser={currentUser} isAdmin={isAdmin}
          onClose={() => setPayFor(null)} onAddPayment={onAddPayment} onDeletePayment={onDeletePayment} />
      )}
    </div>
  );
}

function Kpi({ label, value, icon: Icon, color, onClick }) {
  return (
    <Card onClick={onClick} style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, cursor: onClick ? "pointer" : "default" }}>
      <span style={{ width: 36, height: 36, borderRadius: 11, background: `${color}1F`, color, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={17} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: THEME.muted }}>{label}</div>
        <div style={{ fontSize: 17, fontWeight: 700, fontFamily: THEME.fontNum, lineHeight: 1.2 }}>{value}</div>
      </div>
    </Card>
  );
}

// ---------------- Mijozlar ro'yxati ----------------
const SORTS = [["last", "Oxirgi buyurtma"], ["total", "Aylanma"], ["debt", "Qarz"], ["count", "Buyurtmalar soni"], ["name", "Nomi"]];
function ListTab({ all, onOpen, onOpenChat }) {
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("last");
  const [filter, setFilter] = useState("all");
  const list = useMemo(() => {
    const s = custKey(q);
    const digits = q.replace(/\D/g, "");
    let l = all.filter((c) => !s || c.keys.some((k) => k.includes(s)) || custKey(c.name).includes(s) || (digits.length >= 3 && String(c.phone).replace(/\D/g, "").includes(digits)) || (c.telegram && c.telegram.includes(s.replace(/^@/, ""))));
    if (filter === "debt") l = l.filter((c) => c.debt > 0);
    if (filter === "nophone") l = l.filter((c) => !c.phone);
    if (filter === "leads") l = l.filter((c) => !c.count);
    const by = { last: (a, b) => String(b.lastDate || "").localeCompare(String(a.lastDate || "")), total: (a, b) => b.total - a.total, debt: (a, b) => b.debt - a.debt, count: (a, b) => b.count - a.count, name: (a, b) => a.name.localeCompare(b.name) }[sort];
    return [...l].sort(by);
  }, [all, q, sort, filter]);

  function exportExcel() {
    exportRows(list.map((c) => ({ Mijoz: c.name, Telefon: c.phone, Telegram: c.telegram ? `@${c.telegram}` : "", "Buyurtmalar": c.count, "Aylanma (so'm)": c.total, "To'langan (so'm)": c.paid, "Qarz (so'm)": c.debt, "O'rtacha chek": c.avg, "Birinchi buyurtma": c.firstDate || "", "Oxirgi buyurtma": c.lastDate || "", Izoh: c.note })), "Mijozlar", `UVIX_mijozlar_${todayStr()}.xlsx`);
  }
  const chips = [["all", "Hammasi"], ["debt", "Qarzdor"], ["nophone", "Telefonsiz"], ["leads", "Faqat lid"]];
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 360 }}>
          <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: THEME.muted }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism, telefon yoki @nik" style={{ ...getInputStyle(), paddingLeft: 32 }} data-testid="cust-search" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ ...getInputStyle(), width: "auto" }}>
          {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {chips.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} style={{ padding: "6px 11px", borderRadius: 20, border: `1px solid ${filter === k ? THEME.violet : THEME.border}`, background: filter === k ? THEME.violetSoft : "transparent", color: filter === k ? THEME.text : THEME.muted, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {list.length > 0 && <Button variant="ghost" onClick={exportExcel} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Download size={15} /> Excel</Button>}
      </div>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {list.length === 0 ? <EmptyState text={q ? "Hech narsa topilmadi" : "Hali mijoz yo'q — buyurtma qo'shilganda shu yerda paydo bo'ladi"} /> : isMobile ? (
          <Incremental list={list} render={(c) => (
            <div key={c.id} data-cust={c.name} onClick={() => onOpen(c)} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderBottom: `1px solid ${THEME.border}`, cursor: "pointer" }}>
              <Avatar name={c.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>{c.count ? `${c.count} ta buyurtma · ${moneyCompact(c.total)}` : `${c.leads.length} ta lid`}{c.lastDate ? ` · ${shortDateUz(c.lastDate)}` : ""}</div>
                {c.debt > 0 && <div style={{ fontSize: 12, color: THEME.rose, fontWeight: 700, marginTop: 2 }}>Qarz: {money(c.debt)}</div>}
              </div>
              <ContactButtons c={c} onOpenChat={onOpenChat} />
            </div>
          )} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: THEME.surface, color: THEME.muted, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.3 }}>
                {["Mijoz", "Aloqa", "Buyurtmalar", "Aylanma", "Qarz", "Oxirgi buyurtma", ""].map((h, i) => <th key={i} style={{ padding: "11px 16px", textAlign: i >= 2 && i <= 4 ? "right" : "left", fontWeight: 700 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                <Incremental list={list} colSpan={7} render={(c) => (
                  <tr key={c.id} data-cust={c.name} className="uvix-row" onClick={() => onOpen(c)} style={{ borderTop: `1px solid ${THEME.border}`, cursor: "pointer" }}>
                    <td style={{ padding: "11px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar name={c.name} size={32} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700 }}>{c.name}</div>
                          <div style={{ fontSize: 12, color: THEME.muted }}>{[c.phone, c.telegram ? <span key="t" style={{ color: TG_BLUE }}>@{c.telegram}</span> : null].filter(Boolean).reduce((acc, x, i) => (i ? [...acc, " · ", x] : [x]), [])}{!c.phone && !c.telegram ? "aloqa yo'q" : null}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "11px 16px" }}><ContactButtons c={c} onOpenChat={onOpenChat} /></td>
                    <td style={{ padding: "11px 16px", textAlign: "right" }}>{c.count || <span style={{ color: THEME.muted }}>lid</span>}</td>
                    <td style={{ padding: "11px 16px", textAlign: "right", whiteSpace: "nowrap" }}>{c.total ? money(c.total) : "—"}</td>
                    <td style={{ padding: "11px 16px", textAlign: "right", whiteSpace: "nowrap", color: c.debt ? THEME.rose : THEME.muted, fontWeight: c.debt ? 700 : 400 }}>{c.debt ? money(c.debt) : "—"}</td>
                    <td style={{ padding: "11px 16px", whiteSpace: "nowrap", color: THEME.muted }}>{c.lastDate ? shortDateUz(c.lastDate) : "—"}</td>
                    <td style={{ padding: "11px 16px", color: THEME.muted }}><ChevronRight size={16} /></td>
                  </tr>
                )} />
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

// ---------------- Qarzdorlar ----------------
function DebtTab({ debtors, totalDebt, isAdmin, onOpen, onPay, onInvoice, onOpenChat }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = (id) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  function exportExcel() {
    const rows = debtors.flatMap((c) => c.debtOrders.map((d) => ({ Mijoz: c.name, Telefon: c.phone, "Buyurtma №": d.order.orderNumber, Sana: d.order.date, "Summa (so'm)": d.order.agreementUzs || 0, "Qarz (so'm)": d.debt, "Necha kun": d.days })));
    exportRows(rows, "Qarzdorlar", `UVIX_qarzdorlar_${todayStr()}.xlsx`);
  }
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: THEME.muted }}>Jami qarz: <b style={{ color: THEME.rose, fontSize: 15 }}>{money(totalDebt)}</b> · {debtors.length} mijoz · {debtors.reduce((s, c) => s + c.debtOrders.length, 0)} buyurtma</div>
        <div style={{ flex: 1 }} />
        {debtors.length > 0 && <Button variant="ghost" onClick={exportExcel} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Download size={15} /> Excel</Button>}
      </div>
      {debtors.length === 0 ? <Card><EmptyState text="Qarzdor mijoz yo'q 🎉" /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Incremental list={debtors} step={30} render={(c) => {
            const isOpen = expanded.has(c.id);
            return (
              <Card key={c.id} data-debtor={c.name} style={{ padding: 0, overflow: "hidden" }}>
                <div onClick={() => toggle(c.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", flexWrap: "wrap" }}>
                  {isOpen ? <ChevronDown size={16} style={{ color: THEME.muted }} /> : <ChevronRight size={16} style={{ color: THEME.muted }} />}
                  <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(c); }} style={{ border: 0, background: "none", padding: 0, color: THEME.text, fontWeight: 700, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>{c.name}</button>
                    <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
                      {c.debtOrders.length} ta buyurtma · <span style={{ color: ageColor(c.oldestDebtDays), fontWeight: 700 }}>eng eskisi {c.oldestDebtDays} kun</span>
                      {c.lastPayment ? ` · oxirgi to'lov ${shortDateUz(c.lastPayment.date)}` : " · to'lov yo'q"}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, color: THEME.rose, fontSize: 15, whiteSpace: "nowrap" }}>{money(c.debt)}</div>
                  <ContactButtons c={c} onOpenChat={onOpenChat} />
                </div>
                {isOpen && (
                  <div style={{ borderTop: `1px solid ${THEME.border}`, background: THEME.surface }}>
                    {c.debtOrders.map((d) => <DebtOrderRow key={d.order.id} d={d} onPay={onPay} onInvoice={(o) => onInvoice(o, c)} />)}
                  </div>
                )}
              </Card>
            );
          }} />
        </div>
      )}
      {isAdmin && <DigestSettings />}
    </>
  );
}
function DebtOrderRow({ d, onPay, onInvoice }) {
  const o = d.order;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px 10px 42px", borderTop: `1px solid ${THEME.borderSoft}`, flexWrap: "wrap", fontSize: 13 }}>
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <b>{o.orderNumber || "—"}</b> <span style={{ color: THEME.muted }}>· {shortDateUz(o.date)} · <span style={{ color: ageColor(d.days) }}>{d.days} kun</span></span>
        <div style={{ fontSize: 12, color: THEME.muted }}>Summa {money(o.agreementUzs || 0)} · to'langan {money((o.agreementUzs || 0) - d.debt)}</div>
      </div>
      <div style={{ fontWeight: 700, color: THEME.rose, whiteSpace: "nowrap" }}>{money(d.debt)}</div>
      <Button variant="ghost" onClick={() => onInvoice(o)} style={{ padding: "7px 10px", fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 5 }}><FileText size={13} /> Hisob-faktura</Button>
      <Button onClick={() => onPay(o)} style={{ padding: "7px 12px", fontSize: 12.5 }}>To'lov</Button>
    </div>
  );
}
function DigestSettings() {
  const [cfg, setCfg] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { fetchDebtConfig().then(setCfg).catch(() => {}); }, []);
  if (!cfg) return null;
  const save = async (patch) => { const next = { ...cfg, ...patch }; setCfg(next); try { setCfg(await saveDebtConfig(next)); setMsg({ ok: true, text: "Saqlandi" }); } catch (e) { setMsg({ ok: false, text: e.message }); } };
  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Send size={16} style={{ color: TG_BLUE }} /><div style={{ fontWeight: 700, fontSize: 14 }}>Kunlik qarz xulosasi (Telegram)</div></div>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, cursor: "pointer", lineHeight: 1.45 }}>
        <input type="checkbox" checked={cfg.enabled} onChange={(e) => save({ enabled: e.target.checked })} style={{ width: 18, height: 18, accentColor: THEME.violet, marginTop: 1 }} />
        <span>Har ish kuni adminning shaxsiy Telegram'iga: jami qarz, eng katta qarzdorlar (telefoni bilan), kecha to'langan va kecha qo'shilgan qarz.</span>
      </label>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="Vaqti"><input type="time" value={cfg.at} onChange={(e) => save({ at: e.target.value })} style={{ ...getInputStyle(), width: 120 }} /></Field>
        <Field label="Kunlar">
          <div style={{ display: "flex", gap: 4 }}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const on = cfg.days.includes(d);
              return <button key={d} type="button" onClick={() => save({ days: on ? cfg.days.filter((x) => x !== d) : [...cfg.days, d] })}
                style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${on ? THEME.violet : THEME.border}`, background: on ? THEME.violetSoft : "transparent", color: on ? THEME.text : THEME.muted, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{WD[d]}</button>;
            })}
          </div>
        </Field>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" onClick={async () => { setMsg(null); try { const r = await sendDebtDigest(); setMsg({ ok: r.ok, text: r.message }); } catch (e) { setMsg({ ok: false, text: e.message }); } }} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Send size={14} /> Hozir yuborish</Button>
      </div>
      <TelegramLinkCard compact />
      {msg && <div style={{ fontSize: 13, color: msg.ok ? THEME.green : THEME.rose, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{msg.text}</div>}
    </Card>
  );
}

// ---------------- Mijoz kartasi ----------------
function CustomerCard({ c, onClose, onEdit, onPay, onInvoice, onOpenChat, onOpenOrders }) {
  const [tab, setTab] = useState(c.count ? "orders" : "leads");
  const stats = [
    ["Buyurtmalar", c.count], ["Aylanma", moneyCompact(c.total)], ["O'rtacha chek", c.count ? moneyCompact(c.avg) : "—"],
    ["To'langan", moneyCompact(c.paid)], ["Qarz", c.debt ? money(c.debt) : "—", c.debt ? THEME.rose : null],
    ["Mijoz bo'lgan", c.firstDate ? shortDateUz(c.firstDate) : "—"],
  ];
  return (
    <Modal title="Mijoz" onClose={onClose} width={680}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="customer-card">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Avatar name={c.name} size={48} />
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{c.name}</div>
            <div style={{ fontSize: 13, color: THEME.muted, marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {c.phone ? <a href={telLink(c.phone)} style={{ color: THEME.text, textDecoration: "none" }}><Phone size={12} style={{ verticalAlign: -1 }} /> {c.phone}</a> : <span>Telefon yo'q</span>}
              {c.telegram && <a href={tgLink(c.telegram)} target="_blank" rel="noreferrer" style={{ color: TG_BLUE, textDecoration: "none", fontWeight: 600 }}>@{c.telegram}</a>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <ContactButtons c={c} onOpenChat={(l) => { onClose(); onOpenChat(l); }} />
            <Button variant="ghost" onClick={onEdit} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px" }}><Pencil size={14} /> Tahrirlash</Button>
          </div>
        </div>
        {c.note && <div style={{ fontSize: 13, background: THEME.chip, padding: "10px 12px", borderRadius: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{c.note}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
          {stats.map(([l, v, color]) => (
            <div key={l} style={{ background: THEME.surface, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 11.5, color: THEME.muted }}>{l}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: color || THEME.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</div>
            </div>
          ))}
        </div>
        <Tabs tabs={[["orders", `Buyurtmalar (${c.count})`], ["payments", `To'lovlar (${c.payments.length})`], ["leads", `Lidlar (${c.leads.length})`]]} tab={tab} setTab={setTab} />
        <div style={{ maxHeight: 340, overflowY: "auto" }} className="uvix-scroll">
          {tab === "orders" && (c.orders.length ? c.orders.map((o) => {
            const d = c.debtOrders.find((x) => x.order.id === o.id);
            return (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: `1px solid ${THEME.border}`, fontSize: 13, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <b>{o.orderNumber || "—"}</b> <span style={{ color: THEME.muted }}>· {shortDateUz(o.date)}{o.subcategory ? ` · ${o.subcategory}` : ""}{o.area ? ` · ${o.area} m²` : ""}</span>
                </div>
                <div style={{ whiteSpace: "nowrap" }}>{money(o.agreementUzs || 0)}</div>
                <button type="button" onClick={() => onInvoice(o)} title="Hisob-faktura" aria-label="Hisob-faktura" style={{ border: 0, background: THEME.chip, color: THEME.text, borderRadius: 8, width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><FileText size={14} /></button>
                {d ? <>
                  <span style={{ fontSize: 12, fontWeight: 700, color: THEME.rose, background: THEME.roseBg, padding: "3px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>qarz {money(d.debt)}</span>
                  <Button onClick={() => onPay(o)} style={{ padding: "6px 11px", fontSize: 12 }}>To'lov</Button>
                </> : <span style={{ fontSize: 12, fontWeight: 700, color: THEME.green, background: THEME.greenBg, padding: "3px 8px", borderRadius: 20 }}>to'langan</span>}
              </div>
            );
          }) : <EmptyState text="Buyurtma yo'q" />)}
          {tab === "payments" && (c.payments.length ? c.payments.map((p) => (
            <div key={p.id} style={{ display: "flex", gap: 10, padding: "9px 4px", borderBottom: `1px solid ${THEME.border}`, fontSize: 13 }}>
              <div style={{ flex: 1, color: THEME.muted }}>{shortDateUz(p.date)} · {p.order.orderNumber}{p.comment ? ` · ${p.comment}` : ""}</div>
              <div style={{ fontWeight: 700, color: THEME.green, whiteSpace: "nowrap" }}>+{money(p.amount)}</div>
            </div>
          )) : <EmptyState text="To'lov yo'q" />)}
          {tab === "leads" && (c.leads.length ? c.leads.map((l) => {
            const st = LEAD_STAGES.find((s) => s.key === l.stage);
            return (
              <div key={l.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 4px", borderBottom: `1px solid ${THEME.border}`, fontSize: 13, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 180px", minWidth: 0 }}>{l.jobTitle || l.notes || l.customer}<div style={{ fontSize: 12, color: THEME.muted }}>{l.createdAt ? shortDateUz(l.createdAt.slice(0, 10)) : ""}{l.phone ? ` · ${l.phone}` : ""}</div></div>
                {st && <span style={{ fontSize: 11.5, fontWeight: 700, color: st.color, background: `${st.color}1F`, padding: "3px 9px", borderRadius: 20 }}>{st.label}</span>}
                {l.telegramChatId && <Button variant="ghost" onClick={() => { onClose(); onOpenChat(l); }} style={{ padding: "6px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}><MessageCircle size={13} /> Chat</Button>}
              </div>
            );
          }) : <EmptyState text="CRM lidi yo'q" />)}
        </div>
        {c.count > 0 && <div style={{ display: "flex", justifyContent: "flex-end" }}><Button variant="ghost" onClick={() => { onClose(); onOpenOrders(c.name); }}>Buyurtmalar bo'limida ochish</Button></div>}
      </div>
    </Modal>
  );
}

// ---------------- Tahrirlash / yangi mijoz ----------------
function EditCustomer({ c, all, onClose, onSave }) {
  const p = c?.profile || {};
  const [name, setName] = useState(c?.name || "");
  const [phone, setPhone] = useState(c?.phone || "");
  const [telegram, setTelegram] = useState(c?.telegram ? `@${c.telegram}` : "");
  const [note, setNote] = useState(c?.note || "");
  const [merge, setMerge] = useState([]);
  const [mq, setMq] = useState("");
  const [err, setErr] = useState("");
  const others = useMemo(() => {
    const s = custKey(mq);
    return all.filter((x) => x.id !== c?.id && !merge.some((m) => m.id === x.id) && (!s || custKey(x.name).includes(s))).slice(0, 6);
  }, [all, c, merge, mq]);

  function submit() {
    const n = name.trim();
    if (!n) return setErr("Mijoz nomini kiriting");
    const key = custKey(n);
    const clash = all.find((x) => x.id !== c?.id && !merge.some((m) => m.id === x.id) && x.keys.includes(key));
    if (clash) return setErr(`«${clash.name}» nomli mijoz allaqachon bor — uni pastdagi «Birlashtirish» orqali qo'shing`);
    const aliases = [...new Set([...(c?.keys || []), ...merge.flatMap((m) => m.keys)].filter((k) => k && k !== key))];
    const profile = { ...p, id: p.id || `cu_${uid()}`, key, name: n, phone: phone.trim(), telegram: telegram.trim().replace(/^@/, ""), note: note.trim(), aliases };
    onSave(profile, merge.filter((m) => m.profile).map((m) => m.profile.id));
  }
  return (
    <Modal title={c ? "Mijozni tahrirlash" : "Yangi mijoz"} onClose={onClose} width={500}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Ism / kompaniya"><input value={name} onChange={(e) => setName(e.target.value)} style={getInputStyle()} data-testid="cust-name" /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Telefon"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" inputMode="tel" style={getInputStyle()} data-testid="cust-phone" /></Field>
          <Field label="Telegram"><input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@username" style={getInputStyle()} /></Field>
        </div>
        <Field label="Izoh"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Masalan: faqat naqd to'laydi, buxgalteri — Dilnoza" style={{ ...getInputStyle(), resize: "vertical" }} /></Field>
        {c && c.keys.length > 1 && <div style={{ fontSize: 12, color: THEME.muted }}>Boshqa nomlar: {c.keys.filter((k) => k !== custKey(name)).join(", ")}</div>}
        <Field label="Birlashtirish (bir mijoz turli nomlar bilan yozilgan bo'lsa)">
          <input value={mq} onChange={(e) => setMq(e.target.value)} placeholder="Boshqa nomni qidiring…" style={getInputStyle()} data-testid="cust-merge-q" />
          {mq && others.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {others.map((x) => <button key={x.id} type="button" onClick={() => { setMerge((m) => [...m, x]); setMq(""); }} style={{ padding: "5px 10px", borderRadius: 20, border: `1px dashed ${THEME.border}`, background: "transparent", color: THEME.text, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>+ {x.name}{x.count ? ` (${x.count})` : ""}</button>)}
            </div>
          )}
          {merge.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {merge.map((x) => <span key={x.id} style={{ padding: "5px 10px", borderRadius: 20, background: THEME.violetSoft, fontSize: 12.5 }}>{x.name} <button type="button" onClick={() => setMerge((m) => m.filter((y) => y.id !== x.id))} style={{ border: 0, background: "none", color: THEME.muted, cursor: "pointer" }}>×</button></span>)}
            </div>
          )}
        </Field>
        {err && <div style={{ color: THEME.rose, fontSize: 12.5 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={submit}>Saqlash</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Xabarlar (admin): rekvizitlar, avtomatik xabarlar, jurnal ----------------
const LOG_TYPE = { invoice: "Hisob-faktura", receipt: "To'lov qabul qilindi", debt: "Qarz eslatmasi" };
function MessagesTab() {
  const [cfg, setCfg] = useState(null);
  const [connected, setConnected] = useState(true);
  const [log, setLog] = useState([]);
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => {
    fetchCustMsgConfig().then((d) => { setCfg(d.config); setConnected(d.connected); }).catch(() => {});
    fetchCustMsgLog().then(setLog).catch(() => {});
    fetchRemindPreview().then(setPreview).catch(() => {});
  };
  useEffect(load, []);
  if (!cfg) return <Card><div style={{ color: THEME.muted, fontSize: 13 }}>Yuklanmoqda…</div></Card>;
  const set = (k) => (e) => setCfg((c) => ({ ...c, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  async function save() {
    setMsg(null);
    try { const d = await saveCustMsgConfig({ ...cfg, debtDays: Number(cfg.debtDays), remindEvery: Number(cfg.remindEvery), maxPerDay: Number(cfg.maxPerDay) }); setCfg(d.config); setMsg({ ok: true, text: "Saqlandi" }); fetchRemindPreview().then(setPreview).catch(() => {}); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
  }
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 };
  const check = { width: 18, height: 18, accentColor: THEME.violet, marginTop: 1, flexShrink: 0 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!connected && (
        <div style={{ display: "flex", gap: 10, padding: 14, borderRadius: 14, background: THEME.amberBg, fontSize: 13, lineHeight: 1.5 }}>
          <AlertTriangle size={18} style={{ color: THEME.amber, flexShrink: 0 }} />
          <div>Mijozlarga xabarlar <b>sizning Telegram akkauntingiz</b> orqali boradi — u hozir ulanmagan. Sozlamalar → Telegram akkaunt bo'limida ulang.</div>
        </div>
      )}
      <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Hisob-faktura rekvizitlari</div>
        <div style={grid}>
          <Field label="Karta raqami"><input value={cfg.cardNumber} onChange={set("cardNumber")} placeholder="8600 1234 5678 9012" inputMode="numeric" style={getInputStyle()} data-testid="cm-card" /></Field>
          <Field label="Karta egasi"><input value={cfg.cardHolder} onChange={set("cardHolder")} placeholder="Ism Familiya" style={getInputStyle()} /></Field>
          <Field label="Menejer telefoni"><input value={cfg.managerPhone} onChange={set("managerPhone")} placeholder="+998 90 000 00 00" inputMode="tel" style={getInputStyle()} /></Field>
          <Field label="Menejer ismi"><input value={cfg.managerName} onChange={set("managerName")} placeholder="Aziza, menejer" style={getInputStyle()} /></Field>
        </div>
        <Field label="Logotip ostidagi yozuv"><input value={cfg.companyLine} onChange={set("companyLine")} placeholder="UV bosma ustaxonasi · Toshkent" style={getInputStyle()} /></Field>
        <div style={{ fontSize: 12, color: THEME.muted }}>Hisob-faktura faqat qo'lda yuboriladi: Buyurtmalar ro'yxatidagi yoki mijoz kartasidagi <FileText size={12} style={{ verticalAlign: -2 }} /> tugmasi orqali.</div>
      </Card>

      <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Mijozga avtomatik xabarlar</div>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, cursor: "pointer", lineHeight: 1.45 }}>
          <input type="checkbox" checked={cfg.receipt} onChange={set("receipt")} style={check} data-testid="cm-receipt" />
          <span><b>To'lov qabul qilindi</b> — buyurtmaga to'lov kiritilganda mijozga kvitansiya: summa, to'lov turi va qolgan qarz (yoki «to'liq to'landi»).</span>
        </label>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, cursor: "pointer", lineHeight: 1.45 }}>
          <input type="checkbox" checked={cfg.debtRemind} onChange={set("debtRemind")} style={check} data-testid="cm-remind" />
          <span><b>Qarz eslatmasi</b> — qarz {cfg.debtDays || 7} kundan oshsa, mijozga yumshoq eslatma: qaysi buyurtmalar, qancha qolgan va karta raqami. Har mijozga ko'pi bilan {cfg.remindEvery || 7} kunda bir marta.</span>
        </label>
        {cfg.debtRemind && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", paddingLeft: 28 }}>
            <Field label="Necha kundan keyin"><input value={cfg.debtDays} onChange={set("debtDays")} inputMode="numeric" style={{ ...getInputStyle(), width: 110 }} /></Field>
            <Field label="Qayta eslatish (kun)"><input value={cfg.remindEvery} onChange={set("remindEvery")} inputMode="numeric" style={{ ...getInputStyle(), width: 110 }} /></Field>
            <Field label="Vaqti"><input type="time" value={cfg.remindAt} onChange={set("remindAt")} style={{ ...getInputStyle(), width: 120 }} /></Field>
            <Field label="Kuniga ko'pi bilan"><input value={cfg.maxPerDay} onChange={set("maxPerDay")} inputMode="numeric" style={{ ...getInputStyle(), width: 110 }} /></Field>
            <Field label="Kunlar">
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const on = cfg.days.includes(d);
                  return <button key={d} type="button" onClick={() => setCfg((c) => ({ ...c, days: on ? c.days.filter((x) => x !== d) : [...c.days, d] }))}
                    style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${on ? THEME.violet : THEME.border}`, background: on ? THEME.violetSoft : "transparent", color: on ? THEME.text : THEME.muted, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{WD[d]}</button>;
                })}
              </div>
            </Field>
          </div>
        )}
        <div style={{ fontSize: 12, color: THEME.muted, lineHeight: 1.5 }}>Xabar faqat Telegrami ma'lum mijozlarga boradi (CRM chati yoki mijoz kartasidagi @username). Telegram akkauntni cheklamasligi uchun xabarlar orasida pauza qilinadi.</div>
        {msg && <div style={{ fontSize: 13, color: msg.ok ? THEME.green : THEME.rose }}>{msg.text}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}><Button onClick={save} data-testid="cm-save">Saqlash</Button></div>
      </Card>

      {cfg.debtRemind && preview && (
        <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Navbatdagi eslatma kimlarga boradi</div>
          {preview.list.length === 0 ? <div style={{ fontSize: 13, color: THEME.muted }}>Hozircha hech kimga — muddati o'tgan qarz yo'q yoki yaqinda eslatilgan.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {preview.list.slice(0, 12).map((x) => (
                <div key={x.name} style={{ display: "flex", gap: 10, fontSize: 13, padding: "6px 0", borderBottom: `1px solid ${THEME.border}`, opacity: x.to ? 1 : 0.55 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{x.name} <span style={{ color: THEME.muted }}>· {x.oldest} kun</span></span>
                  <b style={{ color: THEME.rose, whiteSpace: "nowrap" }}>{money(x.debt)}</b>
                  <span style={{ width: 130, textAlign: "right", color: x.to ? TG_BLUE : THEME.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.to || "Telegrami yo'q"}</span>
                </div>
              ))}
            </div>
          )}
          {preview.sample && (
            <div>
              <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 6 }}>Xabar namunasi:</div>
              <div style={{ fontSize: 13, background: "#2B5278", color: "#fff", padding: "10px 12px", borderRadius: "14px 14px 4px 14px", whiteSpace: "pre-wrap", lineHeight: 1.45, maxWidth: 420 }}>{preview.sample}</div>
            </div>
          )}
        </Card>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", fontWeight: 700, fontSize: 14, borderBottom: `1px solid ${THEME.border}` }}>Yuborilgan xabarlar</div>
        {log.length === 0 ? <EmptyState text="Hali xabar yuborilmagan" /> : log.slice(0, 50).map((l, i) => (
          <div key={i} style={{ display: "flex", gap: 10, padding: "9px 16px", borderBottom: `1px solid ${THEME.border}`, fontSize: 13, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: THEME.muted, width: 110, flexShrink: 0 }}>{new Date(l.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
            <span style={{ fontWeight: 600, width: 150, flexShrink: 0 }}>{LOG_TYPE[l.type] || l.type}</span>
            <span style={{ flex: "1 1 160px", minWidth: 0 }}>{l.customer}{l.orderNumber ? <span style={{ color: THEME.muted }}> · {l.orderNumber}</span> : null} <span style={{ color: TG_BLUE }}>{l.to}</span></span>
            {l.ok ? <span style={{ color: THEME.green, fontWeight: 700 }}>✓ yuborildi</span> : <span style={{ color: THEME.rose }} title={l.error}>✗ {l.error}</span>}
          </div>
        ))}
      </Card>
    </div>
  );
}
