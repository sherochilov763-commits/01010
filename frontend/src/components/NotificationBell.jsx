// NotificationBell.jsx — qo'ng'iroqcha + bildirishnomalar markazi (kompyuterda ochiladigan oyna, telefonda to'liq ekran)
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, CheckCheck, Clock, Droplets, FileBarChart2, MessageCircle, Package, Settings, ShieldAlert, TrendingDown, Wallet, X } from "lucide-react";
import { THEME } from "../theme.js";
import { useBackToClose } from "../lib/history.js";
import { enablePush, pushSupport } from "../lib/notify.js";

const CAT_ICON = { orders: Package, payments: Wallet, chats: MessageCircle, expenses: TrendingDown, debts: AlertTriangle, paint: Droplets, attendance: Clock, reports: FileBarChart2, system: ShieldAlert };
const CAT_TONE = { orders: "violet", payments: "green", chats: "blue", debts: "amber", paint: "rose", system: "rose" };

function relTime(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "hozir";
  if (diff < 3600) return `${Math.floor(diff / 60)} daq oldin`;
  const today = new Date(); const y = new Date(); y.setDate(y.getDate() - 1);
  const hm = d.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return hm;
  if (d.toDateString() === y.toDateString()) return `kecha, ${hm}`;
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}, ${hm}`;
}
function dayGroup(iso) {
  const d = new Date(iso); const t = new Date(); const y = new Date(); y.setDate(y.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Bugun";
  if (d.toDateString() === y.toDateString()) return "Kecha";
  return "Avvalroq";
}

export function NotificationBell({ n, onNavigate, onOpenSettings }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("all");
  const [pushMsg, setPushMsg] = useState("");
  const wrap = useRef(null);
  useBackToClose(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const list = (n.items || []).filter((x) => tab === "all" || !x.read);
  const groups = [];
  for (const x of list) {
    const g = dayGroup(x.at);
    if (!groups.length || groups[groups.length - 1].g !== g) groups.push({ g, items: [] });
    groups[groups.length - 1].items.push(x);
  }
  const sup = pushSupport();
  const showPushCta = n.push?.available && sup.ok && sup.permission !== "granted" && sup.permission !== "denied";
  const tone = (c) => {
    const k = CAT_TONE[c];
    return k === "green" ? [THEME.green, THEME.greenBg] : k === "rose" ? [THEME.rose, THEME.roseBg] : k === "amber" ? [THEME.amber, THEME.amberBg] : k === "blue" ? [THEME.blue, THEME.blueBg] : k === "violet" ? [THEME.violet, THEME.violetSoft] : [THEME.muted, THEME.chip];
  };

  function openItem(x) {
    if (!x.read) n.markRead([x.id]);
    setOpen(false);
    if (x.view) setTimeout(() => onNavigate(x.view), 0);
  }
  async function turnOnPush() {
    setPushMsg("");
    try { await enablePush(n.push.publicKey); setPushMsg("Yoqildi ✓"); n.refresh(); } catch (e) { setPushMsg(e.message); }
  }

  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={`Bildirishnomalar${n.unread ? `, ${n.unread} ta o'qilmagan` : ""}`} aria-expanded={open} data-testid="bell"
        className="uvix-iconbtn"
        style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, display: "grid", placeItems: "center", cursor: "pointer", position: "relative" }}>
        <Bell size={17} />
        {n.unread > 0 && (
          <span data-testid="bell-badge" style={{ position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: THEME.rose, color: "#fff", fontSize: 10.5, fontWeight: 700, display: "grid", placeItems: "center", border: `2px solid ${THEME.surface}`, lineHeight: 1 }}>
            {n.unread > 99 ? "99+" : n.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="uvix-ncenter" role="dialog" aria-label="Bildirishnomalar" data-testid="ncenter"
          style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 400, maxWidth: "calc(100vw - 24px)", background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 12, boxShadow: THEME.shadowLg, zIndex: 320, display: "flex", flexDirection: "column", maxHeight: "min(640px, calc(100vh - 90px))", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 10px 16px", borderBottom: `1px solid ${THEME.border}` }}>
            <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>Bildirishnomalar</div>
            {n.unread > 0 && (
              <button type="button" onClick={() => n.markRead("all")} title="Hammasini o'qilgan qilish" style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: "0 8px", border: 0, borderRadius: 6, background: "none", color: THEME.muted, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }} className="uvix-iconbtn">
                <CheckCheck size={14} /> Hammasi o'qildi
              </button>
            )}
            <button type="button" onClick={() => { setOpen(false); onOpenSettings(); }} aria-label="Bildirishnoma sozlamalari" title="Sozlamalar" className="uvix-iconbtn" style={{ width: 30, height: 30, border: 0, borderRadius: 6, background: "none", color: THEME.muted, display: "grid", placeItems: "center", cursor: "pointer" }}><Settings size={15} /></button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Yopish" className="uvix-iconbtn uvix-ncenter-close" style={{ width: 30, height: 30, border: 0, borderRadius: 6, background: "none", color: THEME.muted, display: "none", placeItems: "center", cursor: "pointer" }}><X size={16} /></button>
          </div>
          <div style={{ display: "flex", gap: 2, padding: "8px 12px 4px" }} role="tablist">
            {[["all", "Hammasi"], ["unread", `O'qilmagan${n.unread ? ` · ${n.unread}` : ""}`]].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                style={{ height: 28, padding: "0 10px", borderRadius: 6, border: 0, cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: tab === k ? THEME.chip : "transparent", color: tab === k ? THEME.text : THEME.muted }}>{l}</button>
            ))}
          </div>
          {showPushCta && (
            <div style={{ margin: "6px 12px", padding: "10px 12px", border: `1px solid ${THEME.border}`, borderRadius: 8, display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: THEME.mutedDark }}>
              <Bell size={15} color={THEME.violet} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{pushMsg || "Ilova yopiq bo'lsa ham telefon/kompyuter ekranida ko'ring"}</span>
              <button type="button" onClick={turnOnPush} style={{ height: 28, padding: "0 10px", borderRadius: 6, border: 0, background: THEME.violet, color: THEME.onPrimary, fontSize: 12.5, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>Yoqish</button>
            </div>
          )}
          <div className="uvix-scroll" style={{ overflowY: "auto", padding: "2px 6px 8px", flex: 1 }}>
            {list.length === 0 ? (
              <div style={{ padding: "40px 16px", textAlign: "center", color: THEME.muted, fontSize: 13 }}>
                <Bell size={22} color={THEME.border2} style={{ marginBottom: 8 }} />
                <div>{tab === "unread" ? "O'qilmagan bildirishnoma yo'q" : "Hozircha bildirishnoma yo'q"}</div>
              </div>
            ) : groups.map((g) => (
              <div key={g.g}>
                <div style={{ fontSize: 12, color: THEME.dim, padding: "10px 10px 4px", fontWeight: 500 }}>{g.g}</div>
                {g.items.map((x) => {
                  const Icon = CAT_ICON[x.cat] || Bell;
                  const [fg, bg] = x.level === "critical" ? [THEME.rose, THEME.roseBg] : tone(x.cat);
                  return (
                    <button key={x.id} type="button" onClick={() => openItem(x)} data-nid={x.id} className="uvix-nitem"
                      style={{ width: "100%", display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 10px", border: 0, borderRadius: 8, background: x.read ? "transparent" : THEME.isDark ? "rgba(255,255,255,0.03)" : "#FAFAFB", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: THEME.text }}>
                      <span style={{ width: 30, height: 30, borderRadius: 8, background: bg, color: fg, display: "grid", placeItems: "center", flexShrink: 0 }}><Icon size={15} /></span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontSize: 13.5, fontWeight: x.read ? 500 : 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {x.level === "critical" && <span style={{ color: THEME.rose, fontWeight: 700 }}>Muhim · </span>}{x.title}
                          </span>
                          <span style={{ fontSize: 11.5, color: THEME.dim, flexShrink: 0, whiteSpace: "nowrap" }}>{relTime(x.at)}</span>
                        </span>
                        {x.body && <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 12.5, color: THEME.muted, marginTop: 2, lineHeight: 1.4 }}>{x.body}</span>}
                      </span>
                      {!x.read && <span aria-label="o'qilmagan" style={{ width: 7, height: 7, borderRadius: "50%", background: THEME.violet, marginTop: 7, flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const ncenterCss = () => `
  .uvix-nitem:hover { background: ${THEME.hover} !important; }
  @media (max-width: 720px) {
    .uvix-ncenter { position: fixed !important; inset: 0 !important; width: auto !important; max-width: none !important; max-height: none !important; border-radius: 0 !important; z-index: 330 !important; padding-top: env(safe-area-inset-top, 0px); }
    .uvix-ncenter-close { display: grid !important; }
  }
`;
