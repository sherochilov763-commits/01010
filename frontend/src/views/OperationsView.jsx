import { useEffect, useMemo, useState } from "react";
import { ExportMenu } from "../components/ExportMenu.jsx";
import { ArrowDownLeft, ArrowUpRight, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useBackToClose } from "../lib/history.js";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, Pagination, getIconBtn, getInputStyle, usePagination, useIsMobile, MobileRow } from "../components/ui.jsx";
import { exportWorkbook } from "../lib/excel.js";
import { inRange, money, paymentTypeLabel, todayStr, shortDateUz } from "../lib/format.js";
import { THEME } from "../theme.js";

/* ---------------- OPERATIONS VIEW (to'lovlar + rasxodlar birlashtirilgan) ---------------- */
export function OperationsView({ orders, transactions, isAdmin, onDeletePayment, onDeleteExpense, currentUser, categories, initialFilter }) {
  const isMobile = useIsMobile();
  const catNames = Object.keys(categories || {});
  const [search, setSearch] = useState(initialFilter?.search || "");
  const [typeFilter, setTypeFilter] = useState(initialFilter?.typeFilter || "all");
  const [payFilter, setPayFilter] = useState(initialFilter?.payFilter || "all");
  const [catFilter, setCatFilter] = useState(initialFilter?.catFilter || "all");
  const [from, setFrom] = useState(initialFilter?.from || "");
  const [to, setTo] = useState(initialFilter?.to || "");
  const [confirmDel, setConfirmDel] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const allOps = useMemo(() => {
    const paymentOps = [];
    orders.forEach((o) => {
      (o.payments || []).filter((p) => !p.deletedAt).forEach((p) => {
        paymentOps.push({
          opId: `pay-${p.id}`, type: "kirim", date: p.date, category: o.subcategory, customer: o.customer,
          orderNumber: o.orderNumber, orderId: o.id, paymentId: p.id, paymentType: p.paymentType,
          amount: p.amount, note: p.comment, createdBy: p.createdBy,
        });
      });
    });
    const expenseOps = transactions.map((t) => ({
      opId: `exp-${t.id}`, type: "chiqim", date: t.date, category: t.category, customer: "",
      orderNumber: "", txId: t.id, paymentType: t.paymentType, amount: t.amount, createdBy: t.createdBy,
      // Umumiy rasxod (yo'nalish ko'rinishida) — faqat shu yo'nalish ulushi
      note: t._share != null ? `Umumiy rasxod · ${Math.round(t._share * 100)}% ulush (to'liq ${Number(t._fullAmount || 0).toLocaleString("ru-RU")} so'm)${t.note ? ` · ${t.note}` : ""}` : t.note,
    }));
    return [...paymentOps, ...expenseOps];
  }, [orders, transactions]);

  const filtered = useMemo(() => {
    return allOps
      .filter((t) => typeFilter === "all" || t.type === typeFilter)
      .filter((t) => payFilter === "all" || t.paymentType === payFilter)
      .filter((t) => catFilter === "all" || t.category === catFilter)
      .filter((t) => inRange(t.date, from, to) || (!from && !to))
      .filter((t) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (t.customer || "").toLowerCase().includes(q) ||
          (t.orderNumber || "").toLowerCase().includes(q) ||
          (t.note || "").toLowerCase().includes(q) ||
          (t.category || "").toLowerCase().includes(q);
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [allOps, typeFilter, payFilter, catFilter, from, to, search]);
  const { page, setPage, totalPages, pageItems } = usePagination(filtered, [typeFilter, payFilter, catFilter, from, to, search]);

  function exportExcel(kind = "xlsx") {
    const filteredOrderIds = new Set(filtered.filter((o) => o.type === "kirim").map((o) => o.orderId));
    const relatedOrders = orders.filter((o) => filteredOrderIds.has(o.id));
    const filteredExpenses = transactions.filter((t) => filtered.some((f) => f.type === "chiqim" && f.txId === t.id));
    return exportWorkbook(relatedOrders, filteredExpenses, categories, "Operatsiyalar", `UVIX_operatsiyalar_${todayStr()}.xlsx`, { kind });
  }

  const anyFilter = typeFilter !== "all" || payFilter !== "all" || catFilter !== "all" || from || to;
  const clearAll = () => { setSearch(""); setTypeFilter("all"); setPayFilter("all"); setCatFilter("all"); setFrom(""); setTo(""); };

  // ---------- Telefon (eskiz 65): qidiruv + filtr tugmasi, Kirim/Chiqim segmenti, kunlar bo'yicha guruhlangan ro'yxat ----------
  if (isMobile) {
    const sumIn = filtered.filter((t) => t.type === "kirim").reduce((a, t) => a + (t.amount || 0), 0);
    const sumOut = filtered.filter((t) => t.type === "chiqim").reduce((a, t) => a + (t.amount || 0), 0);
    const groups = [];
    pageItems.forEach((t) => { const g = groups[groups.length - 1]; if (g && g.date === t.date) g.list.push(t); else groups.push({ date: t.date, list: [t] }); });
    const today = todayStr();
    return (
      <div className="uvix-mops" data-testid="ops-phone">
        <div style={{ display: "flex", gap: 8 }}>
          <label className="uvix-mops-search" style={{ background: THEME.isDark ? THEME.card : "rgba(118,118,128,0.12)", color: THEME.muted }}>
            <Search size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mijoz, buyurtma №, izoh" aria-label="Qidiruv" style={{ color: THEME.text }} />
          </label>
          <button type="button" onClick={() => setFilterOpen(true)} aria-label="Filtr" data-testid="ops-filter-btn" className="uvix-mops-fbtn" style={{ background: THEME.card, border: `1px solid ${THEME.border}`, color: THEME.text }}>
            <SlidersHorizontal size={18} />
            {anyFilter && <i style={{ background: THEME.rose }} />}
          </button>
        </div>
        <div className="uvix-mops-seg" role="group" aria-label="Turi" style={{ background: THEME.isDark ? THEME.card : "rgba(118,118,128,0.12)" }}>
          {[["all", "Hammasi"], ["kirim", "Kirim"], ["chiqim", "Chiqim"]].map(([v, l]) => (
            <button key={v} type="button" data-type={v} aria-pressed={typeFilter === v} onClick={() => setTypeFilter(v)}
              style={typeFilter === v ? { background: THEME.isDark ? THEME.hover : "#fff", color: THEME.text, boxShadow: "0 1px 3px rgba(0,0,0,.12)" } : { color: THEME.mutedDark }}>{l}</button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          <div className="uvix-mops-sum" style={{ background: THEME.card, border: `1px solid ${THEME.border}` }}><span style={{ color: THEME.muted }}>Kirim</span><b style={{ color: THEME.green }}>+{money(sumIn)}</b></div>
          <div className="uvix-mops-sum" style={{ background: THEME.card, border: `1px solid ${THEME.border}` }}><span style={{ color: THEME.muted }}>Chiqim</span><b style={{ color: THEME.rose }}>−{money(sumOut)}</b></div>
        </div>
        {filtered.length === 0 ? <Card><EmptyState text="Natija topilmadi" /></Card> : groups.map((g) => (
          <div key={g.date} data-opday={g.date}>
            <div className="uvix-mops-gh" style={{ color: THEME.muted }}>{g.date === today ? "Bugun · " : ""}{shortDateUz(g.date)}</div>
            <div className="uvix-mops-group" style={{ background: THEME.card, border: `1px solid ${THEME.border}` }}>
              {g.list.map((t, i) => {
                const inc = t.type === "kirim";
                const title = inc ? (t.customer || "Mijoz") : (t.category || "Rasxod");
                const I = inc ? ArrowDownLeft : ArrowUpRight;
                return (
                  <div key={t.opId} className="uvix-mops-row" data-op={t.opId} style={{ borderTop: i ? `1px solid ${THEME.border}` : 0 }}>
                    <span className="ic" style={{ background: inc ? THEME.greenBg : THEME.roseBg, color: inc ? THEME.green : THEME.rose }}><I size={17} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
                      <div style={{ fontSize: 12, color: THEME.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[paymentTypeLabel(t.paymentType), inc ? t.orderNumber : t.note].filter(Boolean).join(" · ")}</div>
                    </div>
                    <b style={{ fontSize: 14.5, color: inc ? THEME.green : THEME.rose, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{inc ? "+" : "−"}{money(t.amount)}</b>
                    {(isAdmin || t.createdBy === currentUser.name) && (
                      <button type="button" onClick={() => setConfirmDel(t)} aria-label="O'chirish" className="uvix-mops-del" style={{ color: THEME.dim }}><Trash2 size={15} /></button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} totalCount={filtered.length} />
        {filterOpen && (
          <OpsFilterSheet count={filtered.length} onClose={() => setFilterOpen(false)} onClear={clearAll}
            payFilter={payFilter} setPayFilter={setPayFilter} catFilter={catFilter} setCatFilter={setCatFilter} catNames={catNames}
            from={from} to={to} setFrom={setFrom} setTo={setTo} exportMenu={<ExportMenu onExport={exportExcel} disabled={filtered.length === 0} />} />
        )}
        {confirmDel && (
          <ConfirmDialog
            message={`Ushbu operatsiyani (${money(confirmDel.amount)}) o'chirmoqchimisiz?`}
            onCancel={() => setConfirmDel(null)}
            onConfirm={() => {
              if (confirmDel.type === "kirim") onDeletePayment(confirmDel.orderId, confirmDel.paymentId);
              else onDeleteExpense({ id: confirmDel.txId, amount: confirmDel.amount, date: confirmDel.date, type: "chiqim" });
              setConfirmDel(null);
            }}
          />
        )}
        <style>{OPS_PHONE_CSS}</style>
      </div>
    );
  }

  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <Field label="Qidiruv">
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: THEME.muted }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mijoz, buyurtma №, izoh..." style={{ ...getInputStyle(), paddingLeft: 30, width: 200 }} />
            </div>
          </Field>
          <Field label="Turi">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ ...getInputStyle(), width: 130 }}>
              <option value="all">Barchasi</option>
              <option value="kirim">Kirim (to'lov)</option>
              <option value="chiqim">Chiqim</option>
            </select>
          </Field>
          <Field label="To'lov turi">
            <select value={payFilter} onChange={(e) => setPayFilter(e.target.value)} style={{ ...getInputStyle(), width: 120 }}>
              <option value="all">Barchasi</option>
              <option value="karta">Karta</option>
              <option value="naqd">Naqd</option>
            </select>
          </Field>
          <Field label="Kategoriya">
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ ...getInputStyle(), width: 160 }}>
              <option value="all">Barchasi</option>
              {catNames.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Sanadan">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...getInputStyle(), width: 140 }} />
          </Field>
          <Field label="Sanagacha">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...getInputStyle(), width: 140 }} />
          </Field>
          {(search || typeFilter !== "all" || payFilter !== "all" || catFilter !== "all" || from || to) && (
            <Button variant="ghost" onClick={() => { setSearch(""); setTypeFilter("all"); setPayFilter("all"); setCatFilter("all"); setFrom(""); setTo(""); }}>
              Tozalash
            </Button>
          )}
          <ExportMenu onExport={exportExcel} disabled={filtered.length === 0} />
        </div>
      </Card>

      <Card style={{ padding: 0, overflowX: "auto" }} className="uvix-scroll">
        {filtered.length === 0 ? <EmptyState text="Natija topilmadi" /> : isMobile ? (
          <div>
            {pageItems.map((t) => {
              const inc = t.type === "kirim";
              const title = inc ? (t.customer || "Mijoz") : (t.category || "Rasxod");
              return (
                <MobileRow key={t.opId}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
                      <div style={{ fontSize: 12, color: THEME.muted, marginTop: 3 }}>
                        {[shortDateUz(t.date), inc && t.orderNumber, paymentTypeLabel(t.paymentType)].filter(Boolean).join("  ·  ")}
                      </div>
                      {t.note && <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note}</div>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: inc ? THEME.green : THEME.rose, whiteSpace: "nowrap" }}>{inc ? "+" : "−"}{money(t.amount)}</div>
                      {(isAdmin || t.createdBy === currentUser.name) && (
                        <button onClick={() => setConfirmDel(t)} aria-label="O'chirish" className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                      )}
                    </div>
                  </div>
                </MobileRow>
              );
            })}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", background: "transparent", borderBottom: `1.5px solid ${THEME.border}` }}>
                {["Sana", "Turi", "Kategoriya", "Mijoz / Buyurtma", "To'lov turi", "Summa", "Izoh", ""].map((h) => (
                  <th key={h} style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: 0.4 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((t) => (
                <tr key={t.opId} className="uvix-row" style={{ borderBottom: `1px solid ${THEME.border}` }}>
                  <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>{t.date}</td>
                  <td style={{ padding: "13px 16px" }}>
                    <Badge color={t.type === "kirim" ? THEME.greenText : THEME.roseText} bg={t.type === "kirim" ? THEME.greenBg : THEME.roseBg}>
                      {t.type === "kirim" ? "KIRIM" : "CHIQIM"}
                    </Badge>
                  </td>
                  <td style={{ padding: "13px 16px" }}>{t.category || "-"}</td>
                  <td style={{ padding: "13px 16px" }}>
                    {t.type === "kirim" ? `${t.customer || "-"} ${t.orderNumber ? `(${t.orderNumber})` : ""}` : "-"}
                  </td>
                  <td style={{ padding: "13px 16px" }}>{paymentTypeLabel(t.paymentType)}</td>
                  <td style={{ padding: "13px 16px", fontWeight: 700, color: t.type === "kirim" ? THEME.green : THEME.rose, whiteSpace: "nowrap" }}>
                    {t.type === "kirim" ? "+" : "-"}{money(t.amount)}
                  </td>
                  <td style={{ padding: "13px 16px", color: THEME.muted, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note || "-"}</td>
                  <td style={{ padding: "13px 16px" }}>
                    {(isAdmin || t.createdBy === currentUser.name) && (
                      <button onClick={() => setConfirmDel(t)} className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} totalCount={filtered.length} />
      </Card>
      {confirmDel && (
        <ConfirmDialog
          message={`Ushbu operatsiyani (${money(confirmDel.amount)}) o'chirmoqchimisiz?`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => {
            if (confirmDel.type === "kirim") onDeletePayment(confirmDel.orderId, confirmDel.paymentId);
            else onDeleteExpense({ id: confirmDel.txId, amount: confirmDel.amount, date: confirmDel.date, type: "chiqim" });
            setConfirmDel(null);
          }}
        />
      )}
    </div>
  );
}

// Telefon: filtr varag'i — davr tugmalari, to'lov turi, kategoriya; pastda Excel va «N ta natija»
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function periodRange(k) {
  const now = new Date(), t = ymd(now);
  if (k === "today") return [t, t];
  if (k === "week") { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [ymd(d), t]; }
  if (k === "month") return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), t];
  if (k === "lastMonth") return [ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ymd(new Date(now.getFullYear(), now.getMonth(), 0))];
  return ["", ""];
}
function OpsFilterSheet({ count, onClose, onClear, payFilter, setPayFilter, catFilter, setCatFilter, catNames, from, to, setFrom, setTo, exportMenu }) {
  useBackToClose(true, onClose);
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const PER = [["today", "Bugun"], ["week", "Hafta"], ["month", "Shu oy"], ["lastMonth", "O'tgan oy"]];
  const curPer = PER.find(([k]) => { const [a, b] = periodRange(k); return a === from && b === to; })?.[0] || (from || to ? "range" : "");
  const [custom, setCustom] = useState(curPer === "range");
  const chip = (on) => (on ? { background: THEME.text, color: THEME.card, borderColor: THEME.text } : { background: THEME.card, color: THEME.mutedDark, borderColor: THEME.border });
  const rowStyle = { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", fontSize: 14.5 };
  const sel = { ...getInputStyle(), width: "auto", maxWidth: "58%", minHeight: 38, marginLeft: "auto", padding: "6px 10px" };
  return (
    <>
      <div className="uvix-more-backdrop" onClick={onClose} />
      <div className="uvix-more-sheet" role="dialog" aria-modal="true" aria-label="Filtr" data-testid="ops-filter-sheet" style={{ background: THEME.surface, color: THEME.text, borderTop: `1px solid ${THEME.border}` }}>
        <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 3, background: THEME.border2, margin: "8px auto 0" }} />
        <div style={{ display: "flex", alignItems: "center", padding: "10px 16px 4px" }}>
          <button type="button" onClick={() => { onClear(); setCustom(false); }} style={{ border: 0, background: "none", color: THEME.violet, fontSize: 15, fontFamily: "inherit", cursor: "pointer", padding: 0 }}>Tozalash</button>
          <b style={{ flex: 1, textAlign: "center", fontSize: 16 }}>Filtr</b>
          <button type="button" onClick={onClose} aria-label="Yopish" style={{ width: 30, height: 30, borderRadius: "50%", border: 0, background: THEME.chip, color: THEME.text, display: "grid", placeItems: "center", cursor: "pointer" }}><X size={16} /></button>
        </div>
        <div className="uvix-mops-gh" style={{ color: THEME.muted, padding: "10px 30px 6px" }}>Davr</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 16px" }}>
          {PER.map(([k, l]) => (
            <button key={k} type="button" data-per={k} className="uvix-mops-chip" style={chip(curPer === k && !custom)} onClick={() => { const [a, b] = periodRange(k); setFrom(a); setTo(b); setCustom(false); }}>{l}</button>
          ))}
          <button type="button" data-per="range" className="uvix-mops-chip" style={chip(custom || curPer === "range")} onClick={() => setCustom(true)}>Oraliq…</button>
        </div>
        {(custom || curPer === "range") && (
          <div style={{ display: "flex", gap: 8, padding: "10px 16px 0" }}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Sanadan" style={{ ...getInputStyle(), flex: 1 }} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Sanagacha" style={{ ...getInputStyle(), flex: 1 }} />
          </div>
        )}
        <div className="uvix-mops-gh" style={{ color: THEME.muted, padding: "16px 30px 6px" }}>Saralash</div>
        <div className="uvix-mops-group" style={{ background: THEME.card, border: `1px solid ${THEME.border}`, margin: "0 16px" }}>
          <label style={rowStyle}>To'lov turi
            <select value={payFilter} onChange={(e) => setPayFilter(e.target.value)} style={sel}>
              <option value="all">Barchasi</option><option value="karta">Karta</option><option value="naqd">Naqd</option><option value="bank">Bank</option>
            </select>
          </label>
          <label style={{ ...rowStyle, borderTop: `1px solid ${THEME.border}` }}>Kategoriya
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={sel}>
              <option value="all">Barchasi</option>
              {catNames.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, padding: "18px 16px 4px", alignItems: "center" }}>
          {exportMenu}
          <button type="button" onClick={onClose} data-testid="ops-filter-apply" style={{ flex: 1, height: 46, borderRadius: 14, border: 0, background: THEME.violet, color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>{count} ta natijani ko'rsatish</button>
        </div>
      </div>
    </>
  );
}

const OPS_PHONE_CSS = `
  .uvix-mops { display: flex; flex-direction: column; gap: 10px; }
  .uvix-mops-search { flex: 1; min-width: 0; height: 40px; border-radius: 11px; display: flex; align-items: center; gap: 7px; padding: 0 10px; }
  .uvix-mops-search input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font: inherit; }
  .uvix-mops-fbtn { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; position: relative; cursor: pointer; flex-shrink: 0; }
  .uvix-mops-fbtn i { position: absolute; top: 7px; right: 7px; width: 8px; height: 8px; border-radius: 4px; }
  .uvix-mops-seg { display: flex; border-radius: 10px; padding: 2px; }
  .uvix-mops-seg button { flex: 1; height: 32px; border: 0; border-radius: 8px; background: none; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: background .15s ease; }
  .uvix-mops-sum { border-radius: 12px; padding: 9px 12px; display: flex; flex-direction: column; }
  .uvix-mops-sum span { font-size: 11.5px; }
  .uvix-mops-sum b { font-size: 16px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .uvix-mops-gh { font-size: 12px; text-transform: uppercase; letter-spacing: .4px; padding: 6px 14px 6px; font-weight: 500; }
  .uvix-mops-group { border-radius: 14px; overflow: hidden; }
  .uvix-mops-row { display: flex; align-items: center; gap: 11px; padding: 10px 6px 10px 12px; }
  .uvix-mops-row .ic { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0; }
  .uvix-mops-del { width: 32px; height: 32px; border: 0; background: none; border-radius: 8px; display: grid; place-items: center; cursor: pointer; flex-shrink: 0; }
  .uvix-mops-chip { height: 34px; padding: 0 13px; border-radius: 999px; border: 1px solid; font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; }
`;
