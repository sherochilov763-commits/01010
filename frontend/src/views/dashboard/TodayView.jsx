// TodayView.jsx — telefondagi «Bugun» bosh ekrani (mobil 2-bosqich, 1-band).
// Hisobot o'rniga ish ro'yxati: tepada bugungi asosiy raqamlar, ostida «Diqqat talab qiladi»
// (javobsiz chatlar, tayyor buyurtmalar, uzoq qarzlar, dizaynda qolib ketgan ishlar) — har birida bir bosishli amal.
// Faqat telefonda ko'rinadi; to'liq hisobot (Dashboard) pastdagi «Batafsil hisobot» bilan ochiladi.
import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, ChevronRight, CircleCheck, ClipboardList, MessageCircle, Package, Palette, ScanLine, TrendingDown, Wallet } from "lucide-react";
import { orderDebt } from "../../lib/finance.js";
import { fmt, localDateStr, money, moneyCompact } from "../../lib/format.js";
import { fetchTelegramChats } from "../../storage.js";
import { THEME } from "../../theme.js";

const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const UZ_WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
export const DEBT_DAYS = 7; // shundan uzoq to'lanmagan qarz — «muddati o'tgan»
export const DESIGN_STUCK_H = 3; // dizaynda shundan uzoq turgan ish
const H = 3600000;

export function waitText(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} daq`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} soat` : `${Math.floor(h / 24)} kun`;
}
const first = (s) => String(s || "").trim().split(/\s+/)[0] || "Mijoz";

// Bugungi raqamlar: tushum (to'lovlar), kecha bilan farq, 7 kunlik chiziq, qarzdorlik, bugungi buyurtmalar
export function todayStats(orders, now = new Date()) {
  const today = localDateStr(now);
  const days = Array.from({ length: 7 }, (_, i) => localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i)));
  const byDay = Object.fromEntries(days.map((d) => [d, 0]));
  const yest = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  let debt = 0, newCount = 0, newSum = 0;
  const debtors = new Set();
  for (const o of orders) {
    for (const p of o.payments || []) if (!p.deletedAt && p.date in byDay) byDay[p.date] += p.amount || 0;
    const d = orderDebt(o);
    if (d > 0) { debt += d; debtors.add(String(o.customer || "").trim().toLowerCase()); }
    if (o.date === today) { newCount++; newSum += o.agreementUzs || 0; }
  }
  const income = byDay[today] || 0;
  const prev = byDay[yest] || 0;
  return { income, prev, change: prev > 0 ? Math.round(((income - prev) / prev) * 100) : null, spark: days.map((d) => byDay[d]), debt, debtors: debtors.size, newCount, newSum };
}

// «Diqqat talab qiladi» ro'yxati (chatlardan tashqari) — toza funksiya, testlanadi
export function attentionItems(orders, { now = Date.now(), empById = new Map(), stageOf = (o) => o.prodStage } = {}) {
  const items = [];
  const ready = orders.filter((o) => stageOf(o) === "ready").sort((a, b) => String(a.readyAt || a.prodAt || "").localeCompare(String(b.readyAt || b.prodAt || "")));
  if (ready.length) {
    const o = ready[0];
    const since = o.readyAt || o.prodAt;
    items.push({ key: "ready", tone: "green", count: ready.length, orders: ready,
      title: ready.length === 1 ? "Buyurtma tayyor" : `${ready.length} ta buyurtma tayyor`,
      sub: `${o.customer || o.orderNumber}${since ? ` · ${waitText(now - Date.parse(since))}dan beri kutmoqda` : " · olib ketilmagan"}`,
      action: ready.length === 1 ? "Topshirish" : "Ko'rish" });
  }
  const today = localDateStr(new Date(now));
  const limit = localDateStr(new Date(now - DEBT_DAYS * 24 * H));
  const old = orders.filter((o) => orderDebt(o) > 0 && o.date && o.date <= limit && o.date < today);
  if (old.length) {
    const sum = old.reduce((s, o) => s + orderDebt(o), 0);
    items.push({ key: "debt", tone: "amber", count: old.length, orders: old,
      title: `${old.length} ta qarz ${DEBT_DAYS} kundan oshdi`, sub: `Jami ${money(sum)}`, action: "Ko'rish" });
  }
  const stuck = orders.filter((o) => stageOf(o) === "design" && o.prodAt && now - Date.parse(o.prodAt) >= DESIGN_STUCK_H * H)
    .sort((a, b) => String(a.prodAt).localeCompare(String(b.prodAt)));
  if (stuck.length) {
    const o = stuck[0];
    const who = o.design?.assigneeId ? empById.get(o.design.assigneeId)?.name?.split(" ")[0] : "";
    items.push({ key: "design", tone: "violet", count: stuck.length, orders: stuck,
      title: `Dizaynda ${waitText(now - Date.parse(o.prodAt))}dan beri`,
      sub: [o.title || o.orderNumber, who || "dizayner tayinlanmagan", stuck.length > 1 ? `yana ${stuck.length - 1} ta` : ""].filter(Boolean).join(" · ") });
  }
  const queued = orders.filter((o) => stageOf(o) === "new" && !o.design?.assigneeId && !o.print?.assigneeId);
  if (queued.length) {
    items.push({ key: "queue", tone: "blue", count: queued.length, orders: queued,
      title: `${queued.length} ta buyurtmaga vazifa berilmagan`, sub: queued.slice(0, 2).map((o) => o.title || o.orderNumber).join(", "), action: "Berish" });
  }
  return items;
}

// Javobsiz chatlar: oxirgi xabar mijozdan, 3 kundan yangi; eng uzoq kutgani birinchi
export function waitingChats(chats, now = Date.now()) {
  return (chats || []).filter((c) => !c.lastOut && !c.noReply && c.lastDate && now - Date.parse(c.lastDate) < 72 * H)
    .sort((a, b) => Date.parse(a.lastDate) - Date.parse(b.lastDate));
}

function Spark({ values, color }) {
  const max = Math.max(1, ...values);
  const w = 220, h = 46;
  const pts = values.map((v, i) => [Math.round((i / (values.length - 1)) * w), Math.round(h - 4 - (v / max) * (h - 10))]);
  const line = pts.map((p) => p.join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden="true" style={{ display: "block", marginTop: 10 }}>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={color} opacity="0.18" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function TodayView({ user, orders, employees, stageOf, chatsEnabled, canExpense, onOpenChat, onOpenOrder, onNavigate, onQuickAdd, onScan }) {
  const now = new Date();
  const [chats, setChats] = useState(null); // null — yuklanmoqda, false — o'chiq/xato
  useEffect(() => {
    if (!chatsEnabled) { setChats(false); return undefined; }
    let alive = true;
    const load = () => fetchTelegramChats().then((c) => alive && setChats(c)).catch(() => alive && setChats((v) => v || false));
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [chatsEnabled]);

  const empById = useMemo(() => new Map((employees || []).map((e) => [e.id, e])), [employees]);
  const stats = useMemo(() => todayStats(orders, now), [orders]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(() => attentionItems(orders, { now: Date.now(), empById, stageOf }), [orders, empById, stageOf]);
  const waiting = useMemo(() => (chats ? waitingChats(chats) : []), [chats]);

  const hour = now.getHours();
  const greet = hour < 5 ? "Xayrli tun" : hour < 11 ? "Xayrli tong" : hour < 17 ? "Xayrli kun" : "Xayrli kech";
  const all = [
    ...(waiting.length ? [{ key: "chats", tone: "blue", count: waiting.length,
      title: waiting.length === 1 ? "1 ta chat javobsiz" : `${waiting.length} ta chat javobsiz`,
      sub: waiting.slice(0, 2).map((c) => `${first(c.name)} · ${waitText(Date.now() - Date.parse(c.lastDate))}`).join(", "), action: "Javob", primary: true }] : []),
    ...items,
  ];
  const run = (it) => {
    if (it.key === "chats") return onOpenChat(waiting.length === 1 ? waiting[0].chatId : null);
    if (it.key === "ready") return it.orders.length === 1 ? onOpenOrder(it.orders[0]) : onNavigate("orders", { stage: "ready" });
    if (it.key === "debt") return onNavigate("orders", { onlyDebt: true });
    if (it.key === "design") return onOpenOrder(it.orders[0]);
    if (it.key === "queue") return it.orders.length === 1 ? onOpenOrder(it.orders[0]) : onNavigate("orders", { stage: "new" });
    return undefined;
  };
  const TONES = {
    blue: { c: THEME.violet, bg: THEME.violetSoft, icon: MessageCircle },
    green: { c: THEME.green, bg: THEME.greenBg, icon: CircleCheck },
    amber: { c: THEME.amber || "#B45309", bg: THEME.amberBg || "#FDF3E3", icon: Wallet },
    violet: { c: THEME.isDark ? "#B79CF5" : "#6D28D9", bg: THEME.isDark ? "rgba(139,92,246,.16)" : "#F1EBFC", icon: Palette },
  };
  const iconFor = { chats: MessageCircle, ready: CircleCheck, debt: Wallet, design: Palette, queue: ClipboardList };

  // Raqamli kartalar — gorizontal surish, nuqtalar bilan
  const scroller = useRef(null);
  const [card, setCard] = useState(0);
  const cards = [
    { key: "income", label: "Bugungi tushum", value: stats.income, hero: true,
      note: stats.change === null ? `Kecha: ${money(stats.prev)}` : `${stats.change >= 0 ? "↑" : "↓"} ${Math.abs(stats.change)}% · kechagiga nisbatan` },
    { key: "debt", label: "Qarzdorlik", value: stats.debt, tone: THEME.rose, note: `${stats.debtors} ta mijoz`, go: () => onNavigate("orders", { onlyDebt: true }) },
    { key: "new", label: "Bugungi buyurtmalar", value: stats.newSum, note: `${stats.newCount} ta yangi buyurtma`, go: () => onNavigate("orders", {}) },
  ];
  const quick = [
    { key: "order", label: "Buyurtma", icon: Package, color: THEME.violet, on: () => onQuickAdd("order") },
    { key: "pay", label: "To'lov", icon: Banknote, color: THEME.green, on: () => onNavigate("orders", { onlyDebt: true }) },
    canExpense ? { key: "expense", label: "Rasxod", icon: TrendingDown, color: THEME.amber || "#B45309", on: () => onQuickAdd("expense") } : null,
    { key: "scan", label: "Skaner", icon: ScanLine, color: THEME.text, on: onScan },
  ].filter(Boolean);

  return (
    <section data-testid="today" aria-label="Bugun" className="uvix-today" style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 22 }}>
      <style>{TODAY_CSS}</style>
      <header>
        <div style={{ fontSize: 14, color: THEME.muted }}>{UZ_WEEKDAYS[now.getDay()]}, {now.getDate()}-{UZ_MONTHS[now.getMonth()]}</div>
        <h1 data-testid="today-greet" style={{ margin: "2px 0 0", fontSize: 27, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.15 }}>{greet}, {first(user?.name)}</h1>
      </header>

      <div>
        <div ref={scroller} className="uvix-today-cards uvix-noscrollbar" data-testid="today-cards"
          onScroll={(e) => { const el = e.currentTarget; const w = el.firstChild?.offsetWidth || 1; setCard(Math.round(el.scrollLeft / (w + 12))); }}>
          {cards.map((c) => (
            <div key={c.key} data-card={c.key} role={c.go ? "button" : undefined} tabIndex={c.go ? 0 : undefined} onClick={c.go} onKeyDown={(e) => c.go && e.key === "Enter" && c.go()}
              className="uvix-today-card"
              style={c.hero
                ? { background: THEME.primarySolid, color: "#fff", border: 0 }
                : { background: THEME.card, color: THEME.text, border: `1px solid ${THEME.border}`, cursor: "pointer" }}>
              <div style={{ fontSize: 14.5, opacity: c.hero ? 0.88 : 1, color: c.hero ? "#fff" : THEME.muted }}>{c.label}</div>
              <div style={{ marginTop: 6, fontSize: 30, fontWeight: 700, letterSpacing: -0.8, fontFamily: THEME.fontNum, fontVariantNumeric: "tabular-nums", color: c.hero ? "#fff" : c.tone || THEME.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.value >= 1e9 ? moneyCompact(c.value).replace(" so'm", "") : fmt(c.value)} <span style={{ fontSize: 16, fontWeight: 600 }}>so'm</span>
              </div>
              <div style={{ marginTop: 8, display: "inline-block", fontSize: 13, fontWeight: 600, padding: c.hero ? "4px 10px" : 0, borderRadius: 999, background: c.hero ? "rgba(255,255,255,.16)" : "transparent", color: c.hero ? "#fff" : THEME.muted }}>{c.note}</div>
              {c.hero && <Spark values={stats.spark} color="#fff" />}
            </div>
          ))}
        </div>
        <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
          {cards.map((c, i) => <span key={c.key} style={{ width: i === card ? 18 : 6, height: 6, borderRadius: 3, background: i === card ? THEME.violet : THEME.border2, transition: "width .2s" }} />)}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>Diqqat talab qiladi</h2>
          {all.length > 0 && <span data-testid="attn-count" style={{ minWidth: 24, height: 24, padding: "0 7px", borderRadius: 12, background: THEME.roseBg, color: THEME.rose, fontSize: 13, fontWeight: 700, display: "grid", placeItems: "center" }}>{all.length}</span>}
        </div>
        <div data-testid="attention" style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 18, overflow: "hidden" }}>
          {all.length === 0 && (
            <div data-testid="attn-empty" style={{ padding: "22px 18px", display: "flex", alignItems: "center", gap: 12, color: THEME.muted, fontSize: 14.5 }}>
              <CircleCheck size={22} color={THEME.green} />
              {chats === null && chatsEnabled ? "Tekshirilmoqda…" : "Hammasi joyida — shoshilinch ish yo'q"}
            </div>
          )}
          {all.map((it, i) => {
            const t = TONES[it.tone] || TONES.blue;
            const I = iconFor[it.key] || t.icon;
            return (
              <div key={it.key} data-attn={it.key} role="button" tabIndex={0} onClick={() => run(it)} onKeyDown={(e) => e.key === "Enter" && run(it)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderTop: i ? `1px solid ${THEME.border}` : 0, cursor: "pointer", minHeight: 68 }}>
                <span style={{ width: 44, height: 44, borderRadius: 13, background: t.bg, color: t.c, display: "grid", placeItems: "center", flexShrink: 0 }}><I size={21} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.25 }}>{it.title}</div>
                  <div style={{ fontSize: 13.5, color: THEME.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.sub}</div>
                </div>
                {it.action
                  ? <span data-testid={`attn-go-${it.key}`} style={{ flexShrink: 0, height: 36, padding: "0 14px", borderRadius: 999, display: "inline-flex", alignItems: "center", fontSize: 14, fontWeight: 700, background: it.primary ? THEME.primarySolid : t.bg, color: it.primary ? "#fff" : t.c }}>{it.action}</span>
                  : <ChevronRight size={20} color={THEME.dim} style={{ flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="uvix-today-quick" style={{ gridTemplateColumns: `repeat(${quick.length}, minmax(0, 1fr))` }}>
        {quick.map((q) => {
          const I = q.icon;
          return (
            <button key={q.key} type="button" data-quick={q.key} onClick={q.on} style={{ color: THEME.text }}>
              <span style={{ background: THEME.card, border: `1px solid ${THEME.border}`, color: q.color }}><I size={22} /></span>
              {q.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

const TODAY_CSS = `
  .uvix-today-cards { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; margin: 0 -16px; padding: 0 16px; scroll-padding: 0 16px; }
  .uvix-today-card { flex: 0 0 82%; scroll-snap-align: start; border-radius: 22px; padding: 18px 18px 14px; min-height: 150px; box-sizing: border-box; min-width: 0; }
  .uvix-today-quick { display: grid; gap: 10px; }
  .uvix-today-quick button { border: 0; background: none; padding: 0; display: flex; flex-direction: column; align-items: center; gap: 7px; font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .uvix-today-quick button > span { width: 100%; height: 58px; border-radius: 18px; display: grid; place-items: center; }
  .uvix-today-quick button:active > span { transform: scale(.96); }
  .uvix-noscrollbar { scrollbar-width: none; } .uvix-noscrollbar::-webkit-scrollbar { display: none; }
`;
