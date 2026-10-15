// settingsParts.jsx — Sozlamalar: bo'limlar ro'yxati, «Tizim holati», «Bo'limlar» yorliqlari, o'zgarishlar jurnali.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Droplet, MessageCircle, Send, UsersRound } from "lucide-react";
import { Card } from "../../components/ui.jsx";
import { THEME } from "../../theme.js";
import { fetchSettingsLog } from "../../storage.js";
import { openSettingsSection, setOpenTab } from "../../lib/deeplink.js";

export const SETTINGS_SECTIONS = [
  { id: "profil", label: "Profil", color: "#1F5FD6" },
  { id: "korinish", label: "Ko'rinish", color: "#8B5CF6" },
  { id: "bildirish", label: "Bildirishnomalar", color: "#EF4444" },
  { id: "savdo", label: "Savdo", color: "#0B7A54", admin: true },
  { id: "integratsiya", label: "Integratsiyalar", color: "#0EA5E9", admin: true },
  { id: "bolimlar", label: "Bo'limlar", color: "#D97706", admin: true },
  { id: "malumotlar", label: "Ma'lumotlar", color: "#64748B", admin: true },
  { id: "jurnal", label: "O'zgarishlar jurnali", color: "#18181B", admin: true },
];

// Ctrl K uchun sozlamalar indeksi: nom + kalit so'zlar → bo'lim (+ ixtiyoriy joy)
export const SETTINGS_INDEX = [
  { label: "PIN kodni o'zgartirish", section: "profil", keys: "pin parol kod profil chiqish" },
  { label: "Face ID / barmoq izi", section: "profil", keys: "face id barmoq biometrik passkey" },
  { label: "Mavzu va ranglar", section: "korinish", keys: "mavzu rang tun kun dark qorong'i ko'rinish" },
  { label: "Fon rasmi", section: "korinish", keys: "fon rasm wallpaper" },
  { label: "Bildirishnomalar", section: "bildirish", keys: "bildirishnoma ovoz xabar push", anchor: "notify-settings" },
  { label: "Narxlar ro'yxati", section: "savdo", keys: "narx material m2 smeta kalkulyator dollar", anchor: "price-list", admin: true },
  { label: "Avans foizi", section: "savdo", keys: "avans foiz oldindan to'lov", anchor: "price-list", admin: true },
  { label: "Dollar kursi", section: "savdo", keys: "kurs dollar usd markaziy bank cbu valyuta", anchor: "rate-card", admin: true },
  { label: "Tezkor javoblar (chat)", section: "savdo", keys: "tezkor javob shablon chat", anchor: "quick-replies-anchor", admin: true },
  { label: "Telegram bot va xabarlar yo'nalishi", section: "integratsiya", keys: "telegram bot token xabar yo'nalish kimga", admin: true },
  { label: "Telegram akkaunt (chatlar)", section: "integratsiya", keys: "telegram akkaunt shaxsiy chatlar", admin: true },
  { label: "Zaxira nusxa va kunlik hisobot", section: "malumotlar", keys: "zaxira backup hisobot excel tiklash", admin: true },
  { label: "Savat (o'chirilganlar)", section: "malumotlar", keys: "savat o'chirilgan tiklash korzina", admin: true },
  { label: "Barcha ma'lumotlarni tozalash", section: "malumotlar", keys: "tozalash o'chirish xavfli", admin: true },
  { label: "O'zgarishlar jurnali", section: "jurnal", keys: "jurnal tarix kim o'zgartirdi log", admin: true },
  { label: "Davomat sozlamalari", view: ["attendance", "settings"], keys: "davomat keldim ketdim jadval sex joylashuv selfi face", admin: true },
  { label: "Bo'yoq ombori sozlamalari", view: ["paint", "settings"], keys: "bo'yoq kraska ombor", admin: true },
  { label: "Mijozlarga xabarlar", view: ["customers", "msg"], keys: "mijoz kvitansiya tayyor qarz eslatma", admin: true },
  { label: "Xodimlar va rollar", view: ["employees"], keys: "xodim rol vaqtinchalik pin telegram", admin: true },
];

// «Tizim holati» elementlari
export function buildStatusItems(st) {
  if (!st) return [];
  const items = [];
  const TG_PROBLEM = {
    webhook: "Botda boshqa webhook o'rnatilgan edi — o'chirildi, bir daqiqadan so'ng /start ishlaydi",
    conflict: "Shu bot tokeni boshqa serverda ham ishlayapti — /start javobsiz qoladi. Eski serverni o'chiring yoki yangi bot oching",
    token: "Bot tokeni noto'g'ri yoki bekor qilingan — @BotFather'dan yangisini kiriting",
    network: "Telegram serveriga ulanib bo'lmayapti — internetni tekshiring",
  };
  items.push(st.telegram.bot && st.telegram.problem
    ? { ok: false, title: "Telegram bot", text: TG_PROBLEM[st.telegram.problem] || "Bot xabarlarni qabul qilmayapti", section: "integratsiya", act: "Ko'rish" }
    : st.telegram.bot
    ? { ok: true, title: "Telegram bot", text: st.telegram.adminLinked ? "Ulangan · xabarlar shaxsan boradi" : "Ulangan · sizning Telegramingiz ulanmagan", section: "integratsiya" }
    : { ok: false, title: "Telegram bot", text: "Ulanmagan — xabarnoma va zaxira ketmaydi", section: "integratsiya", act: "Ulash" });
  items.push(st.backup.configured
    ? { ok: !!st.backup.lastDate, title: "Zaxira nusxa", text: st.backup.lastDate ? `Oxirgisi: ${String(st.backup.lastDate).split("-").reverse().join(".")} · har kuni ${st.backup.time}` : `Hali yuborilmagan · har kuni ${st.backup.time}`, section: "malumotlar", act: st.backup.lastDate ? null : "Ko'rish" }
    : { ok: false, title: "Zaxira nusxa", text: "Telegram bot ulanmagan", section: "integratsiya", act: "Ulash" });
  if (st.attendance.enabled) items.push(st.attendance.officeSet
    ? { ok: true, title: "Sex joylashuvi", text: "Belgilangan — «Keldim» ishlaydi", view: ["attendance", "settings"] }
    : { ok: false, title: "Sex joylashuvi", text: "Belgilanmagan — «Keldim» tugmasi chiqmaydi", view: ["attendance", "settings"], act: "Sozlash" });
  const miss = st.staffTg.missing.length;
  items.push(miss
    ? { ok: false, title: "Xodimlar Telegrami", text: `${miss} xodim ulanmagan: ${st.staffTg.missing.slice(0, 3).join(", ")}${miss > 3 ? "…" : ""}`, view: ["employees"], act: "Ko'rish" }
    : { ok: true, title: "Xodimlar Telegrami", text: "Hammasi ulangan", view: ["employees"] });
  if (st.pinHelp?.length) items.push({ ok: false, title: "PIN so'ralmoqda", text: `${st.pinHelp.join(", ")} — vaqtinchalik PIN bering`, view: ["employees"], act: "Berish" });
  if (st.fx) items.push({ ok: true, title: "Dollar kursi", text: `${st.fx.source === "cbu" ? "Markaziy bank" : "Qo'lda"} · 1 $ = ${(() => { const [a, b] = String(Math.round(st.fx.rate * 100) / 100).split("."); return a.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (b ? "," + b : ""); })()} so'm`, section: "savdo" });
  if (st.errors) items.push(st.errors.count
    ? { ok: false, title: "Xatolar (24 soat)", text: `${st.errors.count} ta · ${String(st.errors.last || "").slice(0, 60)}`, section: "malumotlar", act: "Ko'rish" }
    : { ok: true, title: "Xatolar (24 soat)", text: "Qayd etilmagan", section: "malumotlar" });
  if (st.storage && st.storage.persistent === false) items.push({ ok: false, title: "Ma'lumotlar diski", text: "Doimiy disk ulanmagan — qayta joylashda ma'lumot o'chadi", section: "malumotlar", act: "Ko'rish" });
  return items;
}

export function SystemStatus({ status, compact, onGo, onOpenView }) {
  const items = status.items || [];
  const warn = items.filter((x) => !x.ok);
  const open = (x) => { if (x.view) { if (x.view[1]) setOpenTab(x.view[0], x.view[1]); onOpenView?.(x.view[0]); } else if (x.section) onGo(x.section); };
  if (compact) {
    return (
      <button type="button" onClick={() => open(warn[0])} data-testid="status-compact"
        style={{ display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left", padding: "12px 14px", borderRadius: 14, border: `1px solid ${THEME.amber}55`, background: THEME.amberBg, color: THEME.text, fontFamily: "inherit", cursor: "pointer" }}>
        <AlertTriangle size={18} color={THEME.amber} style={{ marginTop: 1, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13.5, lineHeight: 1.4 }}><b>{warn.length} ta sozlama kerak</b><br /><span style={{ color: THEME.muted }}>{warn.map((w) => w.title).join(" · ")}</span></span>
        <ChevronRight size={17} color={THEME.dim} />
      </button>
    );
  }
  return (
    <Card data-testid="system-status">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Tizim holati</div>
        {warn.length > 0
          ? <span style={{ fontSize: 12, fontWeight: 600, color: THEME.amber, background: THEME.amberBg, borderRadius: 999, padding: "2px 9px" }}>{warn.length} ta e'tibor talab qiladi</span>
          : <span style={{ fontSize: 12, fontWeight: 600, color: THEME.green, background: THEME.greenBg, borderRadius: 999, padding: "2px 9px" }}>Hammasi joyida</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10, marginTop: 12 }}>
        {items.map((x) => (
          <div key={x.title} data-status={x.ok ? "ok" : "warn"} style={{ border: `1px solid ${x.ok ? THEME.border : `${THEME.amber}55`}`, background: x.ok ? "transparent" : THEME.amberBg, borderRadius: 11, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, color: x.ok ? THEME.green : THEME.amber, marginBottom: 2 }}>
              {x.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{x.title}
            </div>
            <span style={{ color: THEME.mutedDark || THEME.text }}>{x.text}</span>
            {x.act && <> · <button type="button" onClick={() => open(x)} style={{ border: 0, background: "none", padding: 0, color: THEME.violet, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}>{x.act}</button></>}
          </div>
        ))}
      </div>
    </Card>
  );
}

// «Bo'limlar» — har bo'limning sozlamasi o'z joyida, bu yerda — bitta joydan kirish
export function ModulesSection({ onOpenView }) {
  const go = (view, tab) => { if (tab) setOpenTab(view, tab); onOpenView?.(view); };
  const rows = [
    { icon: Clock, color: "#1F5FD6", title: "Davomat", sub: "Ish jadvali, sex joylashuvi, selfi, «Ketdim», Telegram eslatmalari", run: () => go("attendance", "settings") },
    { icon: Droplet, color: "#DB2777", title: "Bo'yoq ombori", sub: "Bo'yoqlar, minimal qoldiq, ogohlantirish", run: () => go("paint", "settings") },
    { icon: Send, color: "#0F8A5F", title: "Mijozlarga xabarlar", sub: "Kvitansiya, «buyurtma tayyor», qarz eslatmasi", run: () => go("customers", "msg") },
    { icon: MessageCircle, color: "#0EA5E9", title: "Chatlar", sub: "Tezkor javob shablonlari", run: () => openSettingsSection("savdo", "quick-replies-anchor") },
    { icon: UsersRound, color: "#8B5CF6", title: "Xodimlar va rollar", sub: "Rollar, vaqtinchalik PIN, kimning Telegrami ulanmagan", run: () => go("employees") },
  ];
  return (
    <Card style={{ padding: 0 }} data-testid="modules-section">
      <div style={{ padding: "14px 16px 6px", fontSize: 12.5, color: THEME.muted, lineHeight: 1.45 }}>Har bo'limning sozlamasi o'z joyida qoladi — bu yerdan hammasiga bitta joydan kirasiz.</div>
      {rows.map((r, i) => (
        <button key={r.title} type="button" onClick={r.run} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", border: 0, borderTop: `1px solid ${THEME.border}`, background: "none", color: THEME.text, fontFamily: "inherit", cursor: "pointer", textAlign: "left" }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: r.color, color: "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}><r.icon size={17} /></span>
          <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontWeight: 600, fontSize: 14 }}>{r.title}</span><span style={{ display: "block", fontSize: 12.5, color: THEME.muted, marginTop: 1 }}>{r.sub}</span></span>
          <ChevronRight size={17} color={THEME.dim} />
        </button>
      ))}
    </Card>
  );
}

const SECTION_COLORS = { Savdo: ["#0F8A5F", "#E6F5EE"], Davomat: ["#1F5FD6", "#EAF0FC"], Xodimlar: ["#71717A", "#F2F2F4"], Integratsiya: ["#0369A1", "#E0F2FE"], "Ma'lumotlar": ["#475569", "#EEF0F3"] };
export function SettingsJournal() {
  const [log, setLog] = useState(null);
  const [filter, setFilter] = useState("all");
  useEffect(() => { fetchSettingsLog().then(setLog).catch(() => setLog([])); }, []);
  const sections = useMemo(() => [...new Set((log || []).map((x) => x.section))], [log]);
  const rows = (log || []).filter((x) => filter === "all" || x.section === filter);
  const fmt = (iso) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} · ${d.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", hour12: false })}`; };
  return (
    <Card style={{ padding: 0 }} data-testid="settings-journal">
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderBottom: `1px solid ${THEME.border}` }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>O'zgarishlar jurnali</div>
        <span style={{ fontSize: 12.5, color: THEME.muted }}>Pulga va ishga ta'sir qiladigan sozlamalar — kim, qachon, nima</span>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Bo'lim" style={{ marginLeft: "auto", height: 32, borderRadius: 8, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, padding: "0 8px", fontFamily: "inherit" }}>
          <option value="all">Barchasi</option>
          {sections.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {log === null ? <div style={{ padding: 16, color: THEME.muted, fontSize: 13 }}>Yuklanmoqda…</div>
        : rows.length === 0 ? <div style={{ padding: 16, color: THEME.muted, fontSize: 13 }}>Hozircha o'zgarish yozilmagan. Narx, kurs, avans, davomat qoidalari yoki Telegram sozlamasi o'zgartirilsa — shu yerda ko'rinadi.</div>
          : (
            <div className="uvix-scroll" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 560 }}>
                <thead><tr style={{ color: THEME.muted, fontSize: 12, textAlign: "left" }}><th style={{ padding: "10px 16px", fontWeight: 500 }}>Vaqt</th><th style={{ fontWeight: 500 }}>Kim</th><th style={{ fontWeight: 500 }}>Bo'lim</th><th style={{ fontWeight: 500, paddingRight: 16 }}>O'zgarish</th></tr></thead>
                <tbody>
                  {rows.map((x) => {
                    const [c, bg] = SECTION_COLORS[x.section] || [THEME.muted, THEME.chip];
                    return (
                      <tr key={x.id} style={{ borderTop: `1px solid ${THEME.border}` }} data-log-row>
                        <td style={{ padding: "11px 16px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmt(x.at)}</td>
                        <td style={{ whiteSpace: "nowrap", paddingRight: 10 }}>{x.who}</td>
                        <td><span style={{ fontSize: 12, fontWeight: 600, color: c, background: bg, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" }}>{x.section}</span></td>
                        <td style={{ padding: "11px 16px 11px 10px" }}>{x.text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
    </Card>
  );
}
