// ChatToolRail.jsx — chat yon paneli (E varianti, 108-eskiz): o'ng chekkada ikonalar qatori,
// bir vaqtda bitta vosita ochiladi, qayta bosilsa yopiladi. Telefonda — pastdan varaqning yorliqlari.
// Belgi (nuqta) — e'tibor kerak: CRM'da yo'q, smeta to'lov kutmoqda, qarz bor.
import { Calculator, FileText, Package, Sparkles, UserRound } from "lucide-react";
import { C } from "./chatPalette.js";
import { orderDebt } from "../../lib/finance.js";
import { fmt, shortDateUz } from "../../lib/format.js";
import { PROD_LABEL, prodColors } from "../../lib/production.js";

export const CHAT_TOOLS = [
  { key: "client", label: "Mijoz", Icon: UserRound },
  { key: "quote", label: "Smeta", Icon: FileText },
  { key: "calc", label: "Kalkulyator", short: "Hisob", Icon: Calculator },
  { key: "orders", label: "Buyurtmalar", short: "Buyurtma", Icon: Package },
  { key: "ai", label: "AI yordamchi", short: "AI", Icon: Sparkles },
];
export const RAIL_W = 52;

const Dot = ({ title, mobile }) => (
  <span data-dot="1" title={title} style={{ position: "absolute", top: mobile ? 2 : 5, right: mobile ? "calc(50% - 16px)" : 5, width: 8, height: 8, borderRadius: "50%", background: "#EA580C", border: `2px solid ${C.panel}` }} />
);

/** Kompyuter: o'ng chekkadagi ingichka ustun */
export function ToolRail({ active, dots = {}, onPick }) {
  return (
    <div role="toolbar" aria-label="Chat vositalari" aria-orientation="vertical" data-testid="tool-rail"
      style={{ width: RAIL_W, flexShrink: 0, background: C.panel, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 0" }}>
      {CHAT_TOOLS.map(({ key, label, Icon }) => {
        const on = active === key;
        return (
          <button key={key} type="button" onClick={() => onPick(key)} aria-pressed={on} aria-label={on ? `${label} — yopish` : label} title={on ? `${label} · qayta bosing — yopiladi` : label} data-tool={key}
            className="uc-railbtn"
            style={{ position: "relative", width: 40, height: 40, borderRadius: 11, border: 0, cursor: "pointer", display: "grid", placeItems: "center",
              background: on ? C.selected : "transparent", color: on ? C.link : C.muted }}>
            <Icon size={19} />
            {dots[key] && <Dot title={dots[key]} />}
          </button>
        );
      })}
    </div>
  );
}

/** Telefon: pastdan varaq tepasidagi yorliqlar (ikona + qisqa nom) */
export function ToolTabs({ active, dots = {}, onPick }) {
  return (
    <div role="tablist" aria-label="Chat vositalari" data-testid="tool-tabs" style={{ display: "flex", gap: 2, padding: "0 8px 6px", borderBottom: `1px solid ${C.border}` }}>
      {CHAT_TOOLS.map(({ key, label, short, Icon }) => {
        const on = active === key;
        return (
          <button key={key} type="button" role="tab" aria-selected={on} aria-label={label} onClick={() => onPick(key)} data-tool={key}
            style={{ position: "relative", flex: 1, minWidth: 0, height: 52, border: 0, borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
              background: on ? C.selected : "transparent", color: on ? C.link : C.muted }}>
            <Icon size={20} />
            <span style={{ fontSize: 11, fontWeight: on ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{short || label}</span>
            {dots[key] && <Dot title={dots[key]} mobile />}
          </button>
        );
      })}
    </div>
  );
}

const Head = ({ children }) => <div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: ".02em", marginBottom: 6 }}>{children}</div>;

/** «Buyurtmalar» vositasi: shu bitim + mijozning barcha buyurtmalari (ichki — mijozga hech narsa ketmaydi) */
export function OrdersTool({ dealOrders = [], customer, onPayment }) {
  const all = customer?.orders || [];
  const dealIds = new Set(dealOrders.map((o) => o.id));
  const rest = all.filter((o) => !dealIds.has(o.id));
  const row = (o) => {
    const d = orderDebt(o);
    const c = prodColors(o.prodStage);
    return (
      <div key={o.id} data-order={o.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12.5 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.title || o.materialType || o.orderNumber}</div>
          <div style={{ color: C.muted, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[o.orderNumber, o.area ? `${String(o.area).replace(".", ",")} m²` : null, shortDateUz(o.date)].filter(Boolean).join(" · ")}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
          {o.prodStage && <span style={{ fontSize: 10.5, fontWeight: 600, color: c.color, background: c.bg, padding: "1px 7px", borderRadius: 8, whiteSpace: "nowrap" }}>{PROD_LABEL[o.prodStage] || "—"}</span>}
          {d > 0
            ? <button type="button" onClick={() => onPayment?.(o)} title="To'lov qabul qilish (ichki amal)" style={{ border: 0, background: "none", padding: 0, color: C.red, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontVariantNumeric: "tabular-nums" }}>qarz {fmt(d)}</button>
            : <span style={{ color: C.green, fontSize: 11.5 }}>to'langan</span>}
        </div>
      </div>
    );
  };
  return (
    <div data-testid="orders-tool" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Head>Shu bitim</Head>
        {dealOrders.length ? <div data-testid="chat-deal-orders">{dealOrders.map(row)}</div> : <div style={{ fontSize: 12.5, color: C.muted }}>Hali bitim yo'q — smetadan «To'lov va buyurtma» bilan yaratiladi.</div>}
      </div>
      <div>
        <Head>Mijozning buyurtmalari{all.length ? ` · ${all.length}` : ""}</Head>
        {rest.length ? rest.slice(0, 20).map(row) : <div style={{ fontSize: 12.5, color: C.muted }}>{all.length ? "Boshqa buyurtma yo'q." : "Bu mijozning buyurtmalari topilmadi."}</div>}
        {customer?.debt > 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: C.muted }}>Jami qarz: <b style={{ color: C.red }}>{fmt(customer.debt)}</b></div>}
      </div>
    </div>
  );
}

/** «AI» vositasi — 2-bosqichda (Yordamchi rejimi). Hozircha faqat nima bo'lishini ko'rsatadi. */
export function AiTool() {
  return (
    <div data-testid="ai-tool" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Sparkles size={18} color={C.link} />
        <b style={{ fontSize: 14, color: C.text }}>AI yordamchi</b>
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: C.link, background: `${C.link}18`, borderRadius: 8, padding: "2px 8px" }}>Tez orada</span>
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>
        Keyingi bosqichda: AI suhbat xulosasini va javob qoralamasini tayyorlaydi — <b style={{ color: C.text }}>siz tasdiqlaganingizdan keyingina</b> yuboriladi.
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55, background: C.hover, borderRadius: 9, padding: "10px 12px" }}>
        Narx, chegirma, to'lov, smeta, shikoyat va buyurtma holati — AI javob bermaydi, darhol mas'ul menejerga o'tkazadi.
      </div>
    </div>
  );
}

export const railCss = () => `
  .uc-railbtn:hover { background: ${C.hover} !important; color: ${C.text} !important; }
  .uc-railbtn[aria-pressed="true"]:hover { background: ${C.selected} !important; color: ${C.link} !important; }
  .uc-railbtn:focus-visible { outline: 2px solid ${C.blue}; outline-offset: 1px; }
`;
