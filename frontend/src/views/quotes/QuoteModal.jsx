// QuoteModal.jsx — «Yangi buyurtma»: buyurtma yaratishning yagona yo'li.
// 1-qadam: mijoz + smeta (bir nechta pozitsiya); 2-qadam: to'lov va buyurtmaga aylantirish.
// Mijoz «o'ylab ko'raman» desa — smeta saqlanadi (CRM'da lid bo'lib turadi, buyurtmalar ro'yxatiga tushmaydi).
import { useMemo, useRef, useState } from "react";
import { Button, Field, Modal, getInputStyle } from "../../components/ui.jsx";
import { THEME } from "../../theme.js";
import { money } from "../../lib/format.js";
import { custKey } from "../../lib/customers.js";
import { createQuote, saveQuote } from "../../storage.js";
import { isWorkerRole } from "../../constants.js";
import { QuoteBuilder } from "./QuoteBuilder.jsx";
import { ConvertPanel } from "./ConvertPanel.jsx";
import { useSales } from "./useSales.js";

export const themePalette = () => ({
  text: THEME.text, muted: THEME.muted, border: THEME.border2, inputBg: THEME.surface, panel: THEME.card,
  primary: THEME.violet, onPrimary: THEME.onPrimary, green: THEME.green, red: THEME.rose, hover: THEME.chip, link: THEME.violet, shadow: THEME.shadowLg,
});

export function QuoteModal({ lead, customers, employees, allOrders, currentUser, isAdmin, onClose, onSaved, onConverted }) {
  const sales = useSales();
  const openQuote = lead?.quote?.status === "open" ? lead.quote : null;
  const [items, setItems] = useState(openQuote?.items || []);
  const [customer, setCustomer] = useState(lead?.customer || "");
  const [phone, setPhone] = useState(lead?.phone || "");
  const managers = (employees || []).filter((e) => !isWorkerRole(e.role)).map((e) => e.name);
  const [manager, setManager] = useState(lead?.manager || currentUser?.name || managers[0] || "");
  const [step, setStep] = useState("quote");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const titleRef = useRef(null);
  const P = themePalette();
  const known = useMemo(() => { const k = custKey(customer); return k ? (customers || []).find((c) => c.keys.includes(k)) : null; }, [customer, customers]);
  const total = items.reduce((s, i) => s + i.total, 0);

  async function saveDraft() {
    setErr("");
    if (!lead && !customer.trim()) return setErr("Mijoz nomini kiriting");
    if (!items.length) return setErr("Smetaga kamida bitta pozitsiya qo'shing");
    setBusy(true);
    try {
      const r = lead ? await saveQuote(lead.id, { items }) : await createQuote({ customer: customer.trim(), phone: phone.trim() || known?.phone || "", manager, items });
      onSaved(r.lead);
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  function next() {
    setErr("");
    if (!lead && !customer.trim()) return setErr("Mijoz nomini kiriting");
    if (!items.length) return setErr("Smetaga kamida bitta pozitsiya qo'shing");
    setStep("pay");
  }

  const title = step === "pay" ? `To'lov va buyurtma${openQuote?.no ? ` · ${openQuote.no}` : ""}` : lead ? `Smeta — ${lead.customer}` : "Yangi buyurtma";
  return (
    <Modal title={title} onClose={onClose} width={step === "pay" ? 720 : 560}>
      {step === "pay" ? (
        <ConvertPanel lead={lead} draft={{ customer: customer.trim(), phone: phone.trim() || known?.phone || "", manager, source: "Ustaxona" }} items={items} salesCfg={sales}
          employees={employees} allOrders={allOrders} currentUser={currentUser} isAdmin={isAdmin}
          onCancel={Object.assign(() => setStep("quote"), { label: "← Smetaga qaytish" })} onDone={onConverted} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {!lead && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              <Field label="Mijoz">
                <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Mijoz ismi" list="uvix-quote-customers" autoComplete="off" style={getInputStyle()} data-testid="quote-customer" autoFocus />
                <datalist id="uvix-quote-customers">
                  {(customers || []).slice().sort((a, b) => (b.lastDate || "").localeCompare(a.lastDate || "")).slice(0, 300).map((c) => <option key={c.id} value={c.name}>{[c.phone, c.count ? `${c.count} ta buyurtma` : null].filter(Boolean).join(" · ")}</option>)}
                </datalist>
                {known && (known.count > 0 || known.phone) && (
                  <div data-testid="quote-customer-hint" style={{ fontSize: 11.5, color: known.debt > 0 ? THEME.rose : THEME.muted, lineHeight: 1.4 }}>
                    {known.count ? `Doimiy mijoz: ${known.count} ta buyurtma` : "Bazada bor"}{known.phone ? ` · ${known.phone}` : ""}{known.debt > 0 ? ` · qarzi ${money(known.debt)}` : ""}
                  </div>
                )}
              </Field>
              <Field label="Telefon (ixtiyoriy)"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={known?.phone || "+998"} inputMode="tel" style={getInputStyle()} /></Field>
              <Field label="Menejer">
                <select value={manager} onChange={(e) => setManager(e.target.value)} style={getInputStyle()}>{[...new Set([manager, ...managers].filter(Boolean))].map((m) => <option key={m} value={m}>{m}</option>)}</select>
              </Field>
            </div>
          )}
          <QuoteBuilder items={items} onChange={setItems} prices={sales.prices || []} fx={sales.fx} P={P} advancePct={sales.advancePct} titleRef={titleRef} />
          {!sales.loading && !(sales.prices || []).length && isAdmin && (
            <div style={{ fontSize: 12.5, color: THEME.muted }}>Maslahat: Sozlamalar → «Narxlar va smeta»da materiallar narxini kiriting — kalkulyator narxni o'zi qo'yadi.</div>
          )}
          {err && <div role="alert" style={{ color: THEME.rose, fontSize: 13 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", alignItems: "center" }}>
            {total > 0 && <span style={{ fontSize: 13, color: THEME.muted, marginRight: "auto" }}>Jami: <b style={{ color: THEME.text }}>{money(total)}</b></span>}
            <Button variant="ghost" onClick={saveDraft} disabled={busy || !items.length} data-testid="quote-save" title="Mijoz o'ylab ko'rsa — smeta CRM'da saqlanadi">Smetani saqlash</Button>
            <Button onClick={next} disabled={busy || !items.length} data-testid="quote-next">To'lov va buyurtma →</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
