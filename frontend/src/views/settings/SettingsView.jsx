// SettingsView.jsx — Sozlamalar: guruhlarga bo'lingan (kompyuterda chap menyu, telefonda ro'yxat → ichiga kirish).
// Admin uchun tepada «Tizim holati»; matnli o'zgarishlar pastdagi bitta «Saqlash» paneli orqali saqlanadi.
import { Avatar as UiAvatar } from "../../components/ui.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, Eye, EyeOff, Loader2, ChevronLeft, ChevronRight, Database, History, LayoutGrid, Lock, LogOut, Palette, Plug, Search, ShieldCheck, Tag, UsersRound, Trash2, UserRound } from "lucide-react";
import PasskeySection from "../../auth/PasskeySection.jsx";
import { authLogin, checkBotToken, fetchMyTelegram, fetchSettingsHealth } from "../../storage.js";
import { Badge, Button, Card, Field, Modal, getInputStyle } from "../../components/ui.jsx";
import { money } from "../../lib/format.js";
import { roleLabel } from "../../constants.js";
import { THEME } from "../../theme.js";
import { SecuritySection } from "./SecuritySection.jsx";
import { ErrorsSection } from "./ErrorsSection.jsx";
import { AppearancePreviewCard, AppearanceSection, CompanyAppearanceCard } from "./AppearanceSection.jsx";
import { TrashSection } from "./TrashSection.jsx";
import { BackupRestoreSection } from "./BackupRestoreSection.jsx";
import { TelegramAccountSection } from "./TelegramAccountSection.jsx";
import { TelegramRoutesSection } from "./TelegramRoutesSection.jsx";
import { NotificationsSection } from "./NotificationsSection.jsx";
import { BackgroundSection } from "./BackgroundSection.jsx";
import { QuickRepliesSection } from "./QuickRepliesSection.jsx";
import { PriceListSection } from "./PriceListSection.jsx";
import { loadSales, useSales } from "../quotes/useSales.js";
import { rateText } from "../../lib/production.js";
import { SaveBarProvider, useDirty, useSaveBar } from "./saveBar.jsx";
import { LineProfilesSection } from "./LineProfilesSection.jsx";
import { buildStatusItems, ModulesSection, SettingsJournal, SystemStatus, SETTINGS_SECTIONS } from "./settingsParts.jsx";
import { SETTINGS_EVENT } from "../../lib/deeplink.js";
import { TgPrefsCard } from "../../components/TgPrefsCard.jsx";
import { RolesSection } from "./RolesSection.jsx";
import { usePerms } from "../../lib/perms.jsx";

const SEC_KEY = "uvix:settingsSection";
const ICONS = { profil: UserRound, korinish: Palette, bildirish: Bell, savdo: Tag, integratsiya: Plug, bolimlar: LayoutGrid, malumotlar: Database, huquqlar: UsersRound, jurnal: History };
const useNarrow = () => {
  const q = "(max-width: 760px)";
  const [n, setN] = useState(() => typeof window !== "undefined" && window.matchMedia?.(q).matches);
  useEffect(() => { const m = window.matchMedia?.(q); if (!m) return undefined; const f = () => setN(m.matches); m.addEventListener?.("change", f); return () => m.removeEventListener?.("change", f); }, []);
  return n;
};

export function SettingsView(props) {
  return <SaveBarProvider><SettingsLayout {...props} /></SaveBarProvider>;
}

function SettingsLayout(props) {
  const { isAdmin, notif } = props;
  const narrow = useNarrow();
  const bar = useSaveBar();
  const { can } = usePerms();
  const sections = SETTINGS_SECTIONS.filter((s) => (!s.admin || isAdmin || (s.perm && can(s.perm))) && (s.id !== "bildirish" || notif));
  const valid = (id) => sections.some((s) => s.id === id);
  const [sec, setSec] = useState(() => { try { const v = sessionStorage.getItem(SEC_KEY); return v && valid(v) ? v : null; } catch { return null; } });
  const current = sec && valid(sec) ? sec : narrow ? null : sections[0].id;
  const go = (id) => {
    if (id === current) return;
    if (!bar.confirmLeave()) return;
    bar.resetAll();
    setSec(id);
    try { id ? sessionStorage.setItem(SEC_KEY, id) : sessionStorage.removeItem(SEC_KEY); } catch { /* shart emas */ }
    window.scrollTo?.({ top: 0 });
  };
  useEffect(() => {
    const on = (e) => { const id = e.detail?.section; if (id && valid(id)) setSec(id); };
    window.addEventListener(SETTINGS_EVENT, on);
    return () => window.removeEventListener(SETTINGS_EVENT, on);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const [status, setStatus] = useState(null);
  const reloadStatus = () => {
    if (!isAdmin) return;
    fetchSettingsHealth().then((st) => {
      const items = buildStatusItems(st);
      setStatus({ ...st, items, warnings: items.filter((x) => !x.ok).map((x) => ({ section: x.section || "bolimlar" })) });
    }).catch(() => {});
  };
  // sozlamalar saqlanganda (masalan bot ulandi) «Tizim holati» ham yangilanadi
  useEffect(() => { const t = setTimeout(reloadStatus, 300); return () => clearTimeout(t); }, [isAdmin, props.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const { S, modal } = useSettingsBody(props);
  const meta = sections.find((s) => s.id === current);
  const warnFor = (id) => (status ? (status.warnings || []).filter((w) => w.section === id).length : 0);

  // ---- Telefon: ro'yxat ----
  if (narrow && !current) {
    return (
      <div data-testid="settings-list" style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 640, margin: "0 auto" }}>
        {isAdmin && status && (status.warnings || []).length > 0 && <SystemStatus status={status} compact onGo={go} onOpenView={props.onOpenView} />}
        {[false, true].map((adm) => {
          const list = sections.filter((s) => !!s.admin === adm);
          if (!list.length) return null;
          return (
            <div key={String(adm)}>
              {adm && <div style={{ fontSize: 12, color: THEME.dim, textTransform: "uppercase", letterSpacing: 0.4, margin: "4px 14px 6px" }}>Admin</div>}
              <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 14, overflow: "hidden" }}>
                {list.map((s, i) => {
                  const Ic = ICONS[s.id];
                  const w = warnFor(s.id);
                  return (
                    <button key={s.id} type="button" onClick={() => go(s.id)} data-section={s.id}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "0 14px", height: 54, border: 0, borderTop: i ? `1px solid ${THEME.border}` : 0, background: "none", color: THEME.text, fontFamily: "inherit", fontSize: 15, fontWeight: 500, cursor: "pointer", textAlign: "left" }}>
                      <span style={{ width: 30, height: 30, borderRadius: 8, background: s.color, color: "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}><Ic size={17} /></span>
                      <span style={{ flex: 1 }}>{s.label}</span>
                      {w > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: THEME.amber, background: THEME.amberBg, borderRadius: 999, padding: "1px 8px" }}>{w}</span>}
                      <ChevronRight size={17} color={THEME.dim} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {modal}
      </div>
    );
  }

  const content = (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }} data-testid={`settings-section-${current}`}>
      {narrow && (
        <button type="button" onClick={() => go(null)} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 4, border: 0, background: "none", color: THEME.violet, fontWeight: 600, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit", padding: "2px 0" }}><ChevronLeft size={18} /> Sozlamalar</button>
      )}
      {narrow && <div style={{ fontSize: 22, fontWeight: 700 }}>{meta?.label}</div>}
      {isAdmin && status && !narrow && meta?.admin && <SystemStatus status={status} onGo={go} onOpenView={props.onOpenView} />}
      {S[current]}
    </div>
  );
  if (narrow) return <div style={{ maxWidth: 640, margin: "0 auto", paddingBottom: 70 }}>{content}{modal}</div>;

  return (
    <div style={{ display: "flex", gap: 22, alignItems: "flex-start", maxWidth: 1240, margin: "0 auto", paddingBottom: 70 }}>
      <nav aria-label="Sozlamalar bo'limlari" data-testid="settings-nav" style={{ width: 228, flexShrink: 0, position: "sticky", top: 12, display: "flex", flexDirection: "column", gap: 2 }}>
        <SettingsSearchButton />
        {sections.map((s, i) => {
          const Ic = ICONS[s.id];
          const on = s.id === current;
          const w = warnFor(s.id);
          return [
            s.admin && !sections[i - 1]?.admin ? <div key={`h-${s.id}`} style={{ fontSize: 12, color: THEME.dim, padding: "12px 10px 4px" }}>Admin</div> : null,
            <button key={s.id} type="button" onClick={() => go(s.id)} data-section={s.id} aria-current={on ? "page" : undefined}
              style={{ display: "flex", alignItems: "center", gap: 10, height: 40, padding: "0 10px", borderRadius: 9, border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 14, textAlign: "left",
                background: on ? THEME.card : "transparent", boxShadow: on ? `0 1px 2px rgba(0,0,0,.06), 0 0 0 1px ${THEME.border}` : "none", color: on ? THEME.text : THEME.mutedDark || THEME.text, fontWeight: on ? 600 : 500 }}>
              <Ic size={17} /><span style={{ flex: 1 }}>{s.label}</span>
              {w > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: THEME.amber, background: THEME.amberBg, borderRadius: 999, padding: "1px 7px" }}>{w}</span>}
            </button>,
          ];
        })}
      </nav>
      {content}
      {modal}
    </div>
  );
}

// Ctrl K — sozlamani nomidan topish (umumiy qidiruv oynasi ochiladi)
function SettingsSearchButton() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("uvix:open-cmdk", { detail: { q: "" } }))}
      style={{ display: "flex", alignItems: "center", gap: 8, height: 38, border: `1px solid ${THEME.border}`, background: THEME.card, borderRadius: 10, padding: "0 10px", color: THEME.dim, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>
      <Search size={15} /> Sozlamani qidirish <kbd style={{ marginLeft: "auto", fontFamily: "inherit", fontSize: 11, border: `1px solid ${THEME.border2}`, borderRadius: 5, padding: "0 5px", color: THEME.muted }}>Ctrl K</kbd>
    </button>
  );
}

function useSettingsBody({ onOpenView, categories, notif, bgState, currentUser, employees, onSave, onLogout, isAdmin, settings, onSaveSettings: rawSaveSettings, appearance, onApplyAppearance, companyAppearance, onApplyCompanyAppearance, orders, transactions, onRestoreOrder, onPermanentDeleteOrder, onRestoreTransaction, onPermanentDeleteTransaction, onRestorePayment, onPermanentDeletePayment, onResetAll, onSendBackupNow, onConnectTelegramUser, onDisconnectTelegramUser, onFetchTelegramUserStatus }) {
  // Bir nechta bo'lim ketma-ket saqlansa ham bir-birini bosib ketmasin — eng so'nggi holatga qo'shib boramiz
  const latest = useRef(settings || {});
  useEffect(() => { latest.current = settings || {}; }, [settings]);
  const onSaveSettings = async (next) => { latest.current = next; await rawSaveSettings(next); };
  const patchSettings = (patch) => onSaveSettings({ ...latest.current, ...patch });
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetPin, setResetPin] = useState("");
  const [resetPinError, setResetPinError] = useState("");
  const [rateStr, setRateStr] = useState(settings?.usdRate ? String(settings.usdRate) : "");
  useEffect(() => { if (settings?.usdRate) setRateStr((v) => v || String(settings.usdRate)); }, [settings?.usdRate]);
  const [rateMsg, setRateMsg] = useState("");
  const sales = useSales();
  const fx = sales.fx;
  const permsCtx = usePerms();
  const canSales = isAdmin || permsCtx.can("sys.sales");
  const rateAuto = settings?.usdRateAuto !== false;
  const [tgToken, setTgToken] = useState(settings?.telegramBotToken || "");
  const [tgChatId, setTgChatId] = useState(settings?.telegramChatId || "");
  const [tgMsg, setTgMsg] = useState("");
  const [tgShow, setTgShow] = useState(false);
  const [tgChecking, setTgChecking] = useState(false);
  const [tgCheck, setTgCheck] = useState(null);
  const [tgBotName, setTgBotName] = useState("");
  useEffect(() => {
    if (!isAdmin || !settings?.telegramBotToken) { setTgBotName(""); return; }
    fetchMyTelegram().then((d) => setTgBotName(d?.bot || "")).catch(() => {});
  }, [isAdmin, settings?.telegramBotToken]);
  const [backupTime, setBackupTime] = useState(settings?.backupTime || "21:00");
  const [backupMsg, setBackupMsg] = useState("");
  const [sendingNow, setSendingNow] = useState(false);
  const [tgUnlocked, setTgUnlocked] = useState(false);
  const [tgUnlockPin, setTgUnlockPin] = useState("");
  const [tgUnlockError, setTgUnlockError] = useState("");
  const [tgUnlocking, setTgUnlocking] = useState(false);

  async function unlockTelegram() {
    setTgUnlocking(true);
    setTgUnlockError("");
    try {
      const ok = await verifyPin(tgUnlockPin);
      if (!ok) {
        setTgUnlockError("PIN noto'g'ri");
        return;
      }
      setTgUnlocked(true);
      setTgUnlockPin("");
    } finally {
      setTgUnlocking(false);
    }
  }

  async function saveTelegram() {
    // Saqlash paneli orqali ham — avval Telegram'da tekshiriladi
    const ok = await connectBot();
    if (!ok) throw new Error("Bot tokeni tekshiruvdan o'tmadi");
  }
  // Tokenni Telegram'da tekshirib (getMe), to'g'ri bo'lsa saqlaymiz
  async function connectBot() {
    const tk = tgToken.trim();
    if (!tk) return false;
    setTgChecking(true); setTgCheck(null); setTgMsg("");
    try {
      const r = await checkBotToken(tk);
      await patchSettings({ telegramBotToken: tk, telegramChatId: "" });
      setTgBotName(r.username || "");
      setTgShow(false);
      setTgMsg(`@${r.username} boti ulandi. Endi har bir xodim «Telegram'ni ulash»ni bossin (birinchi kirishda o'zi taklif qilinadi).`);
      return true;
    } catch (e) {
      setTgCheck({ error: e.message });
      return false;
    } finally { setTgChecking(false); }
  }
  async function saveBackupTime() { await patchSettings({ backupTime }); }
  function disableTelegram() {
    setTgToken("");
    setTgChatId("");
    patchSettings({ telegramBotToken: "", telegramChatId: "" });
    void setTgChatId;
    setTgMsg("Xabarnomalar o'chirildi");
  }
  async function sendBackupNow() {
    setSendingNow(true);
    setBackupMsg("");
    try {
      await onSendBackupNow();
      setBackupMsg("Yuborildi — Telegram'ni tekshiring");
    } catch (e) {
      setBackupMsg(e?.message || "Yuborishda xato yuz berdi");
    } finally {
      setSendingNow(false);
    }
  }

  async function changePin() {
    if (!/^\d{4,6}$/.test(pin)) throw new Error("PIN 4-6 xonali raqam bo'lishi kerak");
    const next = employees.map((e) => (e.id === currentUser.id ? { ...e, pin } : e));
    await onSave(next);
    setMsg("PIN yangilandi");
    setPin("");
  }
  async function saveRate() {
    const rate = parseFloat(rateStr.replace(/\s/g, "").replace(",", "."));
    if (!rate || rate <= 0) throw new Error("Kursni to'g'ri kiriting");
    await patchSettings({ usdRate: rate });
    loadSales(true).catch(() => {});
  }
  async function setRateAuto(on) {
    await patchSettings({ usdRateAuto: on });
    setRateMsg("");
    loadSales(true).catch(() => {});
  }
  async function verifyPin(pinToCheck) {
    try {
      await authLogin(currentUser.id, pinToCheck);
      return true;
    } catch (e) {
      return false;
    }
  }
  // ---- Saqlash paneli: o'zgargan maydonlar ----
  const rateNum = parseFloat(String(rateStr || "").replace(/\s/g, "").replace(",", "."));
  const rateDirty = canSales && Number.isFinite(rateNum) && rateNum > 0 && rateNum !== Number(settings?.usdRate || 0);
  useDirty("rate", { dirty: rateDirty, label: "Dollar kursi", save: saveRate, reset: () => setRateStr(settings?.usdRate ? String(settings.usdRate) : "") });
  useDirty("pin", { dirty: pin.length > 0, label: "PIN", save: changePin, reset: () => setPin("") });
  const tgDirtyToken = tgToken.trim() !== (settings?.telegramBotToken || "");
  const tgDirty = isAdmin && tgUnlocked && tgDirtyToken;
  useDirty("telegram", { dirty: tgDirty, label: "Telegram bot", save: saveTelegram, reset: () => setTgToken(settings?.telegramBotToken || "") });
  useDirty("backup", { dirty: isAdmin && backupTime !== (settings?.backupTime || "21:00"), label: "Zaxira vaqti", save: saveBackupTime, reset: () => setBackupTime(settings?.backupTime || "21:00") });

  async function confirmResetWithPin() {
    const ok = await verifyPin(resetPin);
    if (!ok) {
      setResetPinError("PIN noto'g'ri");
      return;
    }
    onResetAll();
    setConfirmReset(false);
    setResetPin("");
    setResetPinError("");
  }


  const S = {
    profil: <>
              <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <UiAvatar name={currentUser.name} size={44} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{currentUser.name}</div>
              <div style={{ fontSize: 12, color: THEME.muted, display: "flex", alignItems: "center", gap: 4 }}>
                <ShieldCheck size={13} /> {roleLabel(currentUser.role)}
              </div>
            </div>
          </div>
          <Field label="Yangi PIN kod">
            <input value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setMsg(""); }} style={getInputStyle()} placeholder="4–6 raqam" inputMode="numeric" maxLength={6} type="password" data-testid="profile-pin" />
          </Field>
          {msg && <div style={{ fontSize: 12, color: THEME.green, marginTop: 8 }}>{msg}</div>}
          <Button variant="ghost" onClick={onLogout} style={{ marginTop: 14 }}><LogOut size={14} /> Chiqish</Button>
        </Card>


      <PasskeySection currentUser={currentUser} theme={THEME} Card={Card} />
      <SecuritySection isAdmin={isAdmin} />
    </>,
    korinish: <>
      <AppearanceSection appearance={appearance} onApply={onApplyAppearance} />
      {isAdmin && companyAppearance && <CompanyAppearanceCard appearance={appearance} company={companyAppearance} onApply={onApplyCompanyAppearance} />}
      <AppearancePreviewCard appearance={appearance} />
      {bgState && <BackgroundSection bgState={bgState} />}
    </>,
    bildirish: <>
      {notif?.prefs ? <NotificationsSection n={notif} /> : <Card><div style={{ fontSize: 13, color: THEME.muted }}>Bildirishnomalar yuklanmoqda…</div></Card>}
      <TgPrefsCard Card={Card} />
    </>,
    savdo: canSales && <>
      <LineProfilesSection settings={settings} onSaveSettings={onSaveSettings} />
      <PriceListSection categories={categories} />
        {canSales && (
          <Card data-testid="rate-card">
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Dollar kursi (USD → so'm)</div>
            <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 10, lineHeight: 1.45 }}>
              Kalkulyatorda narx dollarda kiritilsa, shu kurs bo'yicha so'mga o'giriladi (menejer har bir smetada kursni qo'lda o'zgartira oladi).
              Kurs pozitsiyada saqlanadi — keyin kurs o'zgarsa ham eski smeta va buyurtmalar summasi o'zgarmaydi. Mijozga summa faqat so'mda yuboriladi.
            </div>
            <div role="radiogroup" aria-label="Kurs manbai" style={{ display: "grid", gap: 8, marginBottom: 12 }}>
              {[[true, "Markaziy bank kursi (avtomatik)", fx?.cbu ? `bugun: 1 $ = ${rateText(fx.cbu.rate)} so'm${fx.cbu.date ? ` · ${fx.cbu.date.split("-").reverse().join(".")}` : ""}` : "cbu.uz dan kuniga bir necha marta olinadi; olib bo'lmasa — qo'lda kiritilgan kurs"],
                [false, "Qo'lda kiritilgan kurs", "pastdagi qiymat ishlatiladi"]].map(([v, t, sub]) => (
                <label key={String(v)} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", padding: "8px 10px", borderRadius: 10, border: `1px solid ${rateAuto === v ? THEME.violet : THEME.border}` }}>
                  <input type="radio" name="usd-rate-src" checked={rateAuto === v} onChange={() => setRateAuto(v)} data-testid={v ? "rate-auto" : "rate-manual"} style={{ marginTop: 3 }} />
                  <span><span style={{ fontSize: 13, fontWeight: 600 }}>{t}</span><br /><span style={{ fontSize: 12, color: THEME.muted }}>{sub}</span></span>
                </label>
              ))}
            </div>
            <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 6 }}>Qo'lda kurs{rateAuto ? " (Markaziy bank kursi olinmasa ishlatiladi)" : ""}. Tushum bo'limidagi dollar narxlar ham shu kursdan foydalanadi.</div>
            <input value={rateStr} onChange={(e) => setRateStr(e.target.value.replace(/[^0-9.,]/g, ""))} style={getInputStyle()} placeholder="12700" inputMode="decimal" aria-label="Qo'lda kurs" data-testid="rate-manual-input" />
            {rateMsg && <div style={{ fontSize: 12, color: THEME.green, marginTop: 8 }}>{rateMsg}</div>}
            <div style={{ fontSize: 12, color: THEME.muted, marginTop: 10 }} data-testid="rate-effective">
              Kalkulyatordagi kurs: <b style={{ color: THEME.text }}>1 $ = {fx ? `${rateText(fx.rate)} so'm` : money(settings?.usdRate || 0)}</b>{fx ? ` · ${fx.source === "cbu" ? "Markaziy bank" : "qo'lda"}` : ""}
            </div>
          </Card>
        )}


      <div data-testid="quick-replies-anchor"><QuickRepliesSection /></div>
    </>,
    integratsiya: isAdmin && <>
        {isAdmin && (
          <Card>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <Lock size={14} color={THEME.muted} /> Telegram bot va xabarnomalar
            </div>
            {!tgUnlocked ? (
              <div>
                <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 12 }}>
                  Xavfsizlik uchun bu bo'lim qulflangan — ko'rish/o'zgartirish uchun PIN kodingizni kiriting.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={tgUnlockPin}
                    onChange={(e) => setTgUnlockPin(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && unlockTelegram()}
                    style={getInputStyle()}
                    placeholder="PIN kod"
                  />
                  <Button onClick={unlockTelegram} disabled={tgUnlocking} style={{ flexShrink: 0 }}>
                    {tgUnlocking ? "Tekshirilmoqda..." : "Ochish"}
                  </Button>
                </div>
                {tgUnlockError && <div style={{ fontSize: 12, color: THEME.rose, marginTop: 8 }}>{tgUnlockError}</div>}
              </div>
            ) : (
              <>
            <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 12, lineHeight: 1.5 }}>
              UVIX boti yangi buyurtma, to'lov, hisobot, zaxira va ogohlantirishlarni <b style={{ color: THEME.text }}>har bir xodimga shaxsan</b> yuboradi — guruh kerak emas.
              Sozlash: 1) <b style={{ color: THEME.text }}>@BotFather</b>'da bot yarating va tokenni shu yerga kiriting; 2) har bir xodim UVIX'da bir marta «Telegram'ni ulash»ni bosadi (Sozlamalar → Bildirishnomalar).
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Field label="Bot token">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ position: "relative", flex: "1 1 260px", minWidth: 0 }}>
                    <input value={tgToken} onChange={(e) => { setTgToken(e.target.value); setTgCheck(null); }} onKeyDown={(e) => e.key === "Enter" && connectBot()}
                      type={tgShow ? "text" : "password"} autoComplete="off" spellCheck={false}
                      style={{ ...getInputStyle(), paddingRight: 40 }} placeholder="123456789:AAExampleTokenHere" data-testid="tg-token" />
                    <button type="button" onClick={() => setTgShow((v) => !v)} aria-label={tgShow ? "Yashirish" : "Ko'rsatish"}
                      style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", border: 0, background: "none", color: THEME.muted, cursor: "pointer", padding: 6, display: "inline-flex" }}>
                      {tgShow ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {tgDirtyToken && (
                    <Button onClick={connectBot} disabled={tgChecking || !tgToken.trim()} data-testid="tg-connect" style={{ flexShrink: 0 }}>
                      {tgChecking ? <><Loader2 size={15} className="uvix-spin" /> Tekshirilmoqda…</> : settings?.telegramBotToken ? "Tekshirish va saqlash" : "Ulash"}
                    </Button>
                  )}
                </div>
              </Field>
              {tgCheck?.error && <div data-testid="tg-token-error" style={{ fontSize: 12.5, color: THEME.rose, display: "flex", gap: 6, lineHeight: 1.45 }}><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />{tgCheck.error}</div>}
              {settings?.telegramBotToken && <div><Button variant="ghost" onClick={disableTelegram}>Botni o'chirish</Button></div>}
              {tgMsg && <div style={{ fontSize: 12, color: THEME.green }}>{tgMsg}</div>}
              <div style={{ fontSize: 11.5, color: THEME.muted, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                Holat:
                {settings?.telegramBotToken
                  ? <Badge color={THEME.green} bg={THEME.greenBg}><CheckCircle2 size={12} style={{ verticalAlign: -2 }} /> Bot ulangan{tgBotName ? ` · @${tgBotName}` : ""}</Badge>
                  : <Badge color={THEME.muted} bg={THEME.surface}>O'chirilgan</Badge>}
                {settings?.telegramBotToken && tgBotName && <a href={`https://t.me/${tgBotName}`} target="_blank" rel="noreferrer" style={{ color: THEME.blue, fontWeight: 600 }}>Botni ochish</a>}
              </div>
            </div>
            {settings?.telegramBotToken && <TelegramRoutesSection settings={settings} onSaveSettings={onSaveSettings} />}
              </>
            )}
          </Card>
        )}


      {onConnectTelegramUser && <TelegramAccountSection settings={settings} onSaveSettings={onSaveSettings} line="UVIXPRINT" />}
      {onConnectTelegramUser && isAdmin && <div data-testid="tg-onyx"><TelegramAccountSection settings={settings} onSaveSettings={onSaveSettings} line="UVONYX" /></div>}
    </>,
    bolimlar: isAdmin && <ModulesSection onOpenView={onOpenView} />,
    malumotlar: isAdmin && <>
        <ErrorsSection />
        {isAdmin && (
          <Card data-testid="backup-time-card">
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Kunlik hisobot va zaxira nusxa</div>
            <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 10, lineHeight: 1.45 }}>
              Har kuni belgilangan vaqtda Excel hisobot (Buyurtmalar + Rasxodlar) va butun bazaning zaxira nusxasi Telegram'ga avtomatik yuboriladi
              (qayerga — Integratsiyalar → Telegram yo'nalishlari, «Fayllar» qatori).
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <Field label="Yuborish vaqti">
                <input type="time" value={backupTime} onChange={(e) => setBackupTime(e.target.value)} style={{ ...getInputStyle(), width: "auto" }} />
              </Field>
              <Button variant="ghost" onClick={sendBackupNow} disabled={sendingNow || !settings?.telegramBotToken}>
                {sendingNow ? "Yuborilmoqda..." : "Hoziroq yubor"}
              </Button>
            </div>
            {!settings?.telegramBotToken && <div style={{ fontSize: 12, color: THEME.muted, marginTop: 8 }}>Avval Integratsiyalar bo'limida Telegram botni ulang.</div>}
            {backupMsg && <div style={{ fontSize: 12, color: backupMsg.includes("xato") ? THEME.rose : THEME.green, marginTop: 8 }}>{backupMsg}</div>}
          </Card>
        )}

        <Card><BackupRestoreSection /></Card>
        {isAdmin && (
          <TrashSection
            orders={orders}
            transactions={transactions}
            onRestoreOrder={onRestoreOrder}
            onPermanentDeleteOrder={onPermanentDeleteOrder}
            onRestoreTransaction={onRestoreTransaction}
            onPermanentDeleteTransaction={onPermanentDeleteTransaction}
            onRestorePayment={onRestorePayment}
            onPermanentDeletePayment={onPermanentDeletePayment}
          />
        )}

        {isAdmin && (
          <Card style={{ borderColor: THEME.roseBorder }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6, color: THEME.rose }}>Xavfli hudud</div>
            <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 10 }}>Barcha tushum va rasxod ma'lumotlarini butunlay o'chirish. Bu amalni bekor qilib bo'lmaydi.</div>
            <Button variant="danger" onClick={() => setConfirmReset(true)}><Trash2 size={14} /> Barcha ma'lumotlarni tozalash</Button>
          </Card>
        )}

    </>,
    huquqlar: isAdmin && <RolesSection employees={employees} />,
    jurnal: isAdmin && <SettingsJournal />,
  };
  return { S, modal: <>
      {confirmReset && (
        <Modal title="Xavfsizlik tasdiqlash" onClose={() => { setConfirmReset(false); setResetPin(""); setResetPinError(""); }} width={380}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13.5, color: THEME.text, display: "flex", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: THEME.roseBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle size={16} color={THEME.rose} />
              </div>
              <span style={{ paddingTop: 6 }}>Barcha tushum va rasxod ma'lumotlari <b>butunlay</b> o'chiriladi. Bu amalni bekor qilib bo'lmaydi. Davom etish uchun PIN kodingizni kiriting.</span>
            </div>
            <Field label="PIN kod">
              <input
                type="password"
                autoFocus
                value={resetPin}
                onChange={(e) => { setResetPin(e.target.value.replace(/\D/g, "")); setResetPinError(""); }}
                onKeyDown={(e) => e.key === "Enter" && confirmResetWithPin()}
                placeholder="****"
                inputMode="numeric"
                maxLength={6}
                style={getInputStyle()}
              />
            </Field>
            {resetPinError && <div style={{ color: THEME.rose, fontSize: 12.5 }}>{resetPinError}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => { setConfirmReset(false); setResetPin(""); setResetPinError(""); }}>Bekor qilish</Button>
              <Button variant="danger" onClick={confirmResetWithPin} disabled={resetPin.length < 4}>Tasdiqlash va o'chirish</Button>
            </div>
          </div>
        </Modal>
      )}

  </> };
}
