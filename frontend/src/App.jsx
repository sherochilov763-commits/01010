import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import LoginScreen from "./auth/LoginScreen.jsx";
import { openSettingsSection, setOpenTab } from "./lib/deeplink.js";
import { ORDER_SCAN_EVT, QrApproveHost, QrScanButton, openScanner, takePendingOrder } from "./components/PhoneToDesktop.jsx";
import { TodayView } from "./views/dashboard/TodayView.jsx";
import { legacyLeadIndex, orderStage } from "./lib/production.js";
import { authBootstrap, authListEmployees, authLogout, authMe, getToken, connectTelegramUser, deletePhoto, disconnectTelegramUser, fetchMyAppearance, saveMyAppearance, fetchTelegramChats, fetchTelegramMessages, fetchTelegramUserStatus, markTelegramChatRead, sendBackupNow, sendTelegramUserMessage, uploadPhotos } from "./storage.js";
import { Sidebar, Topbar } from "./components/Layout.jsx";
import { BottomNav, BOTTOM_NAV_CSS } from "./components/BottomNav.jsx";
import { MORE_SHEET_CSS } from "./components/MoreSheet.jsx";
import { ApprovalsProvider, useApprovalsState } from "./lib/approvals.jsx";
import { ApprovalsCard, APPROVALS_CSS } from "./components/ApprovalsCard.jsx";
import { LockScreen, LOCK_CSS } from "./components/LockScreen.jsx";
import { clearLockState, shouldLockOnStart, useIdleLock } from "./lib/lock.js";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { installErrorReporting, setErrorView } from "./lib/errors.js";

installErrorReporting();
// Xato oynasini sinash uchun (faqat shu brauzerda): localStorage.uvix_crash_test = "<bo'lim>"
function CrashProbe({ view }) {
  let v = null;
  try { v = localStorage.getItem("uvix_crash_test"); } catch { /* */ }
  if (v && v === view) throw new Error("Sinov xatosi (uvix_crash_test)");
  return null;
}
import { navCss, RailNav, TopNav, useNavPrefs } from "./components/Nav.jsx";
import { CommandPalette, SearchTrigger, useCommandHotkey } from "./components/CommandPalette.jsx";
import { buildCustomers } from "./lib/customers.js";
import { useNotifications } from "./lib/notify.js";
import { useBackground, useBgSuppressed, BG_OFF_QUERY } from "./lib/background.js";
import { NotificationBell, ncenterCss } from "./components/NotificationBell.jsx";
import { CheckInButton } from "./components/CheckInButton.jsx";
import { AttendanceGate } from "./components/AttendanceGate.jsx";
import { TelegramOnboard } from "./components/TelegramOnboard.jsx";
import { resetAttendance } from "./lib/attendanceStore.js";
import { StorageWarning } from "./components/StorageWarning.jsx";
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, LEAD_STAGES, NAV, isWorkerRole } from "./constants.js";
import { generateOrderNumber, orderDebt } from "./lib/finance.js";
import { money, paymentTypeLabel, uid } from "./lib/format.js";
import { resumePending, storageGet, storageRefresh, storageSet, subscribeRemote } from "./lib/kv.js";
import { SaveStatus } from "./components/SaveStatus.jsx";
import { useBackToClose, useHistoryView } from "./lib/history.js";
import { DEFAULT_APPEARANCE, THEME, setTheme, buildTheme, migrateAppearance, withAlpha, resolveAppearance, effectiveAppearance as effectiveOf, personalPart } from "./theme.js";
import { useAutoNight } from "./lib/autoNight.js";
import { applyChatPalette } from "./views/crm/chatPalette.js";
import { useIsMobile } from "./components/ui.jsx";
import { Dashboard } from "./views/Dashboard.jsx";

// Sahifalar alohida bo'laklarda: faqat ochilganda yuklanadi (birinchi ochilish tezroq).
// Dashboard darhol kerak bo'lgani uchun asosiy faylda qoladi.
const WorkerApp = lazy(() => import("./views/tasks/WorkerApp.jsx").then((m) => ({ default: m.WorkerApp })));
const TaskAssignModal = lazy(() => import("./views/crm/TaskAssignModal.jsx").then((m) => ({ default: m.TaskAssignModal })));
const CategoriesView = lazy(() => import("./views/CategoriesView.jsx").then((m) => ({ default: m.CategoriesView })));
const EmployeesView = lazy(() => import("./views/EmployeesView.jsx").then((m) => ({ default: m.EmployeesView })));
const OperationsView = lazy(() => import("./views/OperationsView.jsx").then((m) => ({ default: m.OperationsView })));
const ReportView = lazy(() => import("./views/ReportView.jsx").then((m) => ({ default: m.ReportView })));
const CRMView = lazy(() => import("./views/crm/CRMView.jsx").then((m) => ({ default: m.CRMView })));
const ChatsView = lazy(() => import("./views/crm/ChatsView.jsx").then((m) => ({ default: m.ChatsView })));
const ExpenseView = lazy(() => import("./views/expenses/ExpenseView.jsx").then((m) => ({ default: m.ExpenseView })));
const OrdersView = lazy(() => import("./views/orders/OrdersView.jsx").then((m) => ({ default: m.OrdersView })));
const SettingsView = lazy(() => import("./views/settings/SettingsView.jsx").then((m) => ({ default: m.SettingsView })));
const AttendanceView = lazy(() => import("./views/attendance/AttendanceView.jsx").then((m) => ({ default: m.AttendanceView })));
const CustomersView = lazy(() => import("./views/customers/CustomersView.jsx").then((m) => ({ default: m.CustomersView })));
const PaintView = lazy(() => import("./views/paint/PaintView.jsx").then((m) => ({ default: m.PaintView })));
const VIEW_PRELOADERS = [() => import("./views/customers/CustomersView.jsx"), () => import("./views/attendance/AttendanceView.jsx"), () => import("./views/paint/PaintView.jsx"), () => import("./views/CategoriesView.jsx"), () => import("./views/EmployeesView.jsx"), () => import("./views/OperationsView.jsx"), () => import("./views/ReportView.jsx"), () => import("./views/crm/CRMView.jsx"), () => import("./views/crm/ChatsView.jsx"), () => import("./views/expenses/ExpenseView.jsx"), () => import("./views/orders/OrdersView.jsx"), () => import("./views/settings/SettingsView.jsx")];
function ViewFallback() {
  // Bo'lim yuklanayotganda — sahifa skeleti (asboblar qatori + jadval qatorlari)
  const sk = (st) => <div className="uvix-skeleton" style={st} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-busy="true" aria-label="Yuklanmoqda">
      <div style={{ display: "flex", gap: 8 }}>
        {sk({ height: 32, width: 110, borderRadius: 16 })}{sk({ height: 32, width: 96, borderRadius: 16 })}{sk({ height: 32, width: 90, borderRadius: 16 })}
        <div style={{ flex: 1 }} />{sk({ height: 36, width: 150, borderRadius: 8 })}
      </div>
      <div style={{ border: `1px solid ${THEME.border}`, borderRadius: THEME.radius + 2, background: THEME.card, overflow: "hidden" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 16px", borderTop: i ? `1px solid ${THEME.border}` : "none" }}>
            {sk({ height: 28, width: 28, borderRadius: "50%" })}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>{sk({ height: 10, width: `${40 + ((i * 17) % 35)}%` })}{sk({ height: 8, width: "22%" })}</div>
            {sk({ height: 10, width: 90 })}{sk({ height: 10, width: 70 })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>;
}

function AppInner() {
  const [ready, setReady] = useState(false);
  const [dataFor, setDataFor] = useState(null); // ma'lumotlari yuklangan xodim id'si (QR havolani shundan keyin ochamiz)
  const [transactions, setTransactions] = useState([]); // faqat rasxod (chiqim)
  const [orders, setOrders] = useState([]); // buyurtmalar (har birida payments[])
  const [leads, setLeads] = useState([]); // CRM — savdo voronkasi lidlari
  const [customers, setCustomers] = useState([]); // Mijozlar bazasi — qo'lda kiritilgan ma'lumotlar (telefon, izoh, birlashtirish)
  const [pendingLeadForOrder, setPendingLeadForOrder] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  // Ko'rinish: kompaniya standarti (admin) + xodimning shaxsiy tanlovi (null — standartga ergashadi)
  const [companyAppearance, setCompanyAppearance] = useState(DEFAULT_APPEARANCE);
  const [myAppearance, setMyAppearance] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  // Ekran qulfi: harakatsizlikda (standart 15 daqiqa) — PIN yoki Face ID bilan ochiladi
  const idle = useIdleLock(!!currentUser);
  const shellRef = useRef(null);
  // Qulf paytida ilova klaviatura/ekran o'quvchi uchun ham yopiq (inert)
  useEffect(() => { if (shellRef.current) shellRef.current.inert = !!idle.locked; });
  useEffect(() => {
    const on = () => idle.lock();
    window.addEventListener("uvix:lock-now", on);
    return () => window.removeEventListener("uvix:lock-now", on);
  }, [idle.lock]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const lost = () => { clearLockState(); idle.unlock(); setCurrentUser(null); };
    window.addEventListener("uvix:auth-lost", lost);
    return () => window.removeEventListener("uvix:auth-lost", lost);
  }, [idle.unlock]); // eslint-disable-line react-hooks/exhaustive-deps
  // Kirgandan so'ng, brauzer bo'sh turganda qolgan sahifalarni oldindan yuklab qo'yamiz —
  // birinchi ochilish yengil, keyin menyudan o'tish esa kutishsiz bo'ladi.
  useEffect(() => {
    if (!currentUser || isWorkerRole(currentUser.role)) return;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const h = idle(() => VIEW_PRELOADERS.forEach((load) => load().catch(() => {})), { timeout: 4000 });
    return () => cancel(h);
  }, [currentUser?.id]);
  // Bo'limlar tarixi: ← strelka va telefonning "orqaga" harakati oldingi bo'limga qaytaradi
  const { view, go: setView, back: goBack, canGoBack } = useHistoryView("dashboard", !!currentUser && !isWorkerRole(currentUser.role));
  setErrorView(view); // xato hisobotida qaysi bo'lim — render paytida (xato aynan shu yerda chiqishi mumkin)
  const [navFilter, setNavFilter] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useBackToClose(sidebarOpen, () => setSidebarOpen(false));
  const [openChatId, setOpenChatId] = useState(null); // CRM → Chatlar: ochiladigan suhbat
  const [quickAdd, setQuickAdd] = useState(null); // {kind: "order"|"expense", n} — pastki "+" tugmasidan
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const openCmdk = useCallback(() => setCmdkOpen(true), []);
  useCommandHotkey(openCmdk, !!currentUser && !isWorkerRole(currentUser.role));
  // Bildirishnomalar markazi (qo'ng'iroqcha, ovoz, push)
  const notif = useNotifications({
    enabled: !!currentUser && !isWorkerRole(currentUser.role),
    onNavigate: (v) => { setNavFilter(null); setView(v); },
  });
  // Tasdiqlash so'rovlari (pul ma'lumotlari himoyasi): admin qaror qilgach — buyurtmalar va jurnal yangilanadi
  const approvalsState = useApprovalsState({
    enabled: !!currentUser && !isWorkerRole(currentUser.role),
    isAdmin: currentUser?.role === "admin",
    onDecided: async () => {
      for (const [key, setter] of [["uvix:orders", setOrders], ["uvix:audit", setAuditLog]]) {
        const fresh = await storageRefresh(key);
        if (Array.isArray(fresh)) setter(fresh);
      }
    },
  });
  const editPaymentRef = useRef(null);
  const approvalsCtx = useMemo(() => ({
    ...approvalsState,
    editPayment: currentUser?.role === "admin" ? (...a) => editPaymentRef.current?.(...a) : null,
  }), [approvalsState, currentUser?.role]);
  // Shaxsiy fon va shisha rejimi (faqat kompyuterda — telefonda tezlik uchun o'chiq)
  const bgState = useBackground(!!currentUser && !isWorkerRole(currentUser.role));
  const narrow = useBgSuppressed();
  const bgOn = !!bgState.resolved && !narrow;
  const glassOn = bgOn && bgState.bg.glass;
  const nightDark = bgOn && bgState.bg.kind === "dynamic" && bgState.bg.nightDark && bgState.resolved.dark;
  const appearance = useMemo(() => resolveAppearance(companyAppearance, myAppearance, currentUser?.role), [companyAppearance, myAppearance, currentUser?.role]);
  const autoNight = useAutoNight(appearance);
  // Mavzu har doim shu yakuniy holatdan hisoblanadi (shisha fon, tungi fon, avtomatik tun) — boshqa joyda setTheme chaqirilmaydi
  const effectiveAppearance = effectiveOf(appearance, { glass: glassOn, night: nightDark || autoNight });
  const themeKeyRef = useRef("");
  const themeKey = JSON.stringify(effectiveAppearance);
  if (themeKeyRef.current !== themeKey) { setTheme(buildTheme(effectiveAppearance)); applyChatPalette(THEME); themeKeyRef.current = themeKey; }
  const openNotifySettings = () => {
    setNavFilter(null); setView("settings");
    openSettingsSection("bildirish", "notify-settings");
  };
  // Sozlamalardagi «Sozlamani qidirish» tugmasi umumiy Ctrl K oynasini ochadi
  useEffect(() => {
    const on = () => setCmdkOpen(true);
    window.addEventListener("uvix:open-cmdk", on);
    return () => window.removeEventListener("uvix:open-cmdk", on);
  }, []);

  function navigateWithFilter(targetView, filter) {
    setNavFilter(filter || {});
    setView(targetView);
  }
  const [toast, setToast] = useState(null);
  const [needsSetup, setNeedsSetup] = useState(false); // tizimda hali birorta xodim yo'q

  useEffect(() => {
    if (currentUser) return; // tizimdan chiqilganda ro'yxat (va Face ID holati) yangilanadi
    (async () => {
      // Sahifa yangilandi (F5) yoki ilova qayta ochildi: saqlangan kirish hali amal qilsa — PIN so'ramaymiz.
      // Uzoq harakatsizlikdan keyin — qulf ekrani.
      if (getToken()) {
        try {
          const me = await authMe();
          if (me?.employee && !me.mustChangePin) {
            if (shouldLockOnStart()) idle.lock();
            setCurrentUser(me.employee);
            setReady(true);
            return;
          }
        } catch { /* server javob bermadi — oddiy kirish ekrani */ }
      }
      let emp = [];
      let loaded = false;
      try {
        emp = await authListEmployees();
        loaded = true;
      } catch (e) {
        emp = [];
      }
      setEmployees(emp);
      setNeedsSetup(loaded && emp.length === 0);
      setReady(true);
    })();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    if (isWorkerRole(currentUser.role)) {
      // Dizayner/Pechatchi: moliyaviy ma'lumotlar umuman yuklanmaydi (server ham bermaydi) — faqat ko'rinish
      (async () => {
        const [company, mine] = await Promise.all([storageGet("uvix:appearance", false, null), fetchMyAppearance().catch(() => null)]);
        setCompanyAppearance(migrateAppearance(company)); setMyAppearance(mine);
      })();
      return;
    }
    (async () => {
      let tx = await storageGet("uvix:transactions", true, []);
      let ords = await storageGet("uvix:orders", true, null);

      // --- Eski (kirim+chiqim aralash) formatdan migratsiya ---
      if (ords === null) {
        const legacyKirim = tx.filter((t) => t.type === "kirim");
        const migrated = [];
        legacyKirim.forEach((t) => {
          const order = {
            id: t.id || uid(),
            orderNumber: generateOrderNumber(migrated, t.date),
            date: t.date,
            customer: t.customer || "",
            subcategory: t.subcategory || "",
            materialType: t.materialType || "",
            materialLines: t.materialLines || [],
            manager: t.manager || "",
            area: t.area || 0,
            exchangeRate: t.exchangeRate || DEFAULT_SETTINGS.usdRate,
            agreementUsd: t.agreementUsd || 0,
            agreementUzs: t.agreementUzs || 0,
            kraskaLines: t.kraskaLines || [],
            kraskaSum: t.kraskaSum || 0,
            materialSum: t.materialSum || 0,
            payments: t.amount
              ? [{ id: uid(), amount: t.amount, date: t.date, paymentType: t.paymentType || "naqd", comment: "", createdBy: t.createdBy || "Noma'lum", createdAt: t.createdAt || new Date().toISOString() }]
              : [],
            note: t.note || "",
            createdBy: t.createdBy || "Noma'lum",
            createdAt: t.createdAt || new Date().toISOString(),
          };
          migrated.push(order);
        });
        ords = migrated;
        tx = tx.filter((t) => t.type !== "kirim");
        await storageSet("uvix:orders", true, ords);
        await storageSet("uvix:transactions", true, tx);
      }

      // To'liq xodimlar ro'yxati (email bilan) — kirish ekranidagi qisqa ro'yxat o'rniga
      const fullEmployees = await storageGet("uvix:employees", true, null);
      if (Array.isArray(fullEmployees) && fullEmployees.length) setEmployees(fullEmployees);
      const log = await storageGet("uvix:audit", true, []);
      const leadsData = await storageGet("uvix:leads", true, []);
      const custData = await storageGet("uvix:customers", true, []);
      let cats = await storageGet("uvix:categories", true, null);
      if (!cats || Object.keys(cats).length === 0) {
        cats = DEFAULT_CATEGORIES;
        await storageSet("uvix:categories", true, cats);
      } else if (!cats["Brak"]) {
        cats = { ...cats, Brak: DEFAULT_CATEGORIES["Brak"] };
        await storageSet("uvix:categories", true, cats);
      }
      let sett = await storageGet("uvix:settings", true, null);
      if (!sett) {
        sett = DEFAULT_SETTINGS;
        await storageSet("uvix:settings", true, sett);
      }
      const [company, mine] = await Promise.all([storageGet("uvix:appearance", false, null), fetchMyAppearance().catch(() => null)]);
      setTransactions(tx);
      setOrders(ords);
      setDataFor(currentUser.id);
      setAuditLog(log);
      setLeads(leadsData);
      setCustomers(Array.isArray(custData) ? custData : []);
      setCategories(cats);
      setSettings(sett);
      setCompanyAppearance(migrateAppearance(company)); setMyAppearance(mine);
      // Oldingi safar internet uzilib saqlanmay qolgan o'zgarishlar bo'lsa — endi yuboramiz
      resumePending().then((keys) => keys.length && showToast("Saqlanmay qolgan o'zgarishlar serverga yuborildi"));
    })();
  }, [currentUser]);

  // Server birlashtirgan natija (boshqa xodimning o'zgarishlari bilan) — ekranga qo'llaymiz
  useEffect(() => {
    const setters = { "uvix:orders": setOrders, "uvix:transactions": setTransactions, "uvix:leads": setLeads, "uvix:audit": setAuditLog, "uvix:customers": setCustomers };
    return subscribeRemote((key, value) => setters[key]?.(value));
  }, []);

  // Boshqa xodimlar kiritgan o'zgarishlarni vaqti-vaqti bilan tortib olamiz (faqat o'zgargan bo'lsa yuklanadi)
  useEffect(() => {
    if (!currentUser || isWorkerRole(currentUser.role)) return;
    const setters = { "uvix:orders": setOrders, "uvix:transactions": setTransactions, "uvix:leads": setLeads, "uvix:audit": setAuditLog, "uvix:customers": setCustomers };
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      for (const key of Object.keys(setters)) {
        const fresh = await storageRefresh(key);
        if (Array.isArray(fresh)) setters[key](fresh);
      }
    };
    const t = setInterval(tick, 20000);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [currentUser]);

  // Brauzer/telefon yuqori panel rangi joriy mavzuga mos bo'lsin
  useEffect(() => {
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", THEME.navBg);
    document.documentElement.style.colorScheme = THEME.isDark ? "dark" : "light";
  }, [themeKey]);

  // Shaxsiy ko'rinish (faqat shu xodim uchun). null — kompaniya / rol standartiga qaytish
  function applyAppearance(next) {
    const mine = next ? { ...personalPart(next), v: 2 } : null;
    setMyAppearance(mine);
    saveMyAppearance(mine).catch((e) => showToast(e.message || "Ko'rinishni saqlab bo'lmadi"));
  }
  // Kompaniya standarti va rollar bo'yicha mavzu (faqat admin)
  function applyCompanyAppearance(next) {
    setCompanyAppearance(next);
    storageSet("uvix:appearance", false, next);
  }

  // Toast: oddiy xabar yoki "Bekor qilish" tugmali (o'chirishdan keyin 6 soniya)
  const toastTimer = useRef(null);
  function showToast(msg, undo) {
    clearTimeout(toastTimer.current);
    setToast({ msg, undo: undo || null, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 6000 : 2600);
  }
  // Bekor qilish har doim eng so'nggi holat bilan ishlashi uchun (eski closure emas)
  const latest = useRef({});

  async function persistSettings(next) {
    setSettings(next);
    await storageSet("uvix:settings", true, next);
  }
  // Menyu: joylashuv, tartib, yashirilganlar, telefon paneli (xodimning o'zi yoki admin standarti)
  const navCfg = useNavPrefs({ currentUser, settings, onSaveSettings: persistSettings, isAdmin: currentUser?.role === "admin" });

  async function persistTx(next) {
    setTransactions(next);
    await storageSet("uvix:transactions", true, next);
  }
  async function persistOrders(next) {
    setOrders(next);
    await storageSet("uvix:orders", true, next);
  }
  async function persistLeads(next) {
    setLeads(next);
    await storageSet("uvix:leads", true, next);
  }
  async function persistCustomers(next) {
    setCustomers(next);
    await storageSet("uvix:customers", true, next);
  }
  // Mijoz ma'lumotini saqlash (yangi profil yoki tahrir); birlashtirilgan profillar o'chiriladi
  function saveCustomer(profile, mergedIds = []) {
    const now = new Date().toISOString();
    const exists = customers.some((c) => c.id === profile.id);
    let next = exists ? customers.map((c) => (c.id === profile.id ? { ...c, ...profile, updatedAt: now } : c)) : [{ ...profile, createdAt: now, updatedAt: now, createdBy: currentUser.name }, ...customers];
    if (mergedIds.length) next = next.filter((c) => !mergedIds.includes(c.id));
    persistCustomers(next);
    addLog(`Mijoz ma'lumoti ${exists ? "tahrirlandi" : "qo'shildi"}: ${profile.name}`);
    showToast("Saqlandi");
  }
  async function persistEmployees(next) {
    setEmployees(next);
    await storageSet("uvix:employees", true, next);
  }
  async function persistLog(next) {
    setAuditLog(next);
    await storageSet("uvix:audit", true, next);
  }
  async function persistCategories(next) {
    setCategories(next);
    await storageSet("uvix:categories", true, next);
  }
  function addCategory(name) {
    const clean = (name || "").trim();
    if (!clean || categories[clean]) return false;
    const next = { ...categories, [clean]: ["Umumiy"] };
    persistCategories(next);
    addLog(`Yangi rasxod kategoriyasi qo'shildi: "${clean}"`);
    return true;
  }
  function addSubcategory(cat, sub) {
    const clean = (sub || "").trim();
    if (!cat || !clean) return false;
    const list = categories[cat] || [];
    if (list.includes(clean)) return false;
    const next = { ...categories, [cat]: [...list, clean] };
    persistCategories(next);
    addLog(`"${cat}" kategoriyasiga subkategoriya qo'shildi: "${clean}"`);
    return true;
  }
  function renameCategory(oldName, newName) {
    const clean = (newName || "").trim();
    if (!clean || oldName === clean || categories[clean]) return false;
    const next = { ...categories };
    next[clean] = next[oldName];
    delete next[oldName];
    persistCategories(next);
    const txNext = transactions.map((t) => (t.category === oldName ? { ...t, category: clean } : t));
    persistTx(txNext);
    addLog(`Kategoriya nomi o'zgartirildi: "${oldName}" -> "${clean}"`);
    return true;
  }
  function deleteCategory(cat) {
    const next = { ...categories };
    delete next[cat];
    persistCategories(next);
    addLog(`Rasxod kategoriyasi o'chirildi: "${cat}"`);
  }
  function deleteSubcategory(cat, sub) {
    const next = { ...categories, [cat]: (categories[cat] || []).filter((s) => s !== sub) };
    persistCategories(next);
    addLog(`"${cat}" kategoriyasidan subkategoriya o'chirildi: "${sub}"`);
  }

  function addLog(what) {
    const entry = {
      id: uid(),
      who: currentUser ? currentUser.name : "Noma'lum",
      what,
      when: new Date().toISOString(),
    };
    const next = [entry, ...auditLog].slice(0, 500);
    persistLog(next);
  }

  // ---- Rasxod (chiqim) CRUD ----
  function saveTransaction(tx, isEdit) {
    let next;
    if (isEdit) {
      next = transactions.map((t) => (t.id === tx.id ? tx : t));
      addLog(`Rasxod tahrirlandi: ${money(tx.amount)} (${tx.date})`);
    } else {
      next = [tx, ...transactions];
      addLog(`Rasxod qo'shildi: ${money(tx.amount)} (${tx.date})`);
    }
    persistTx(next);
    showToast(isEdit ? "O‘zgartirildi" : "Qo‘shildi");
  }
  function deleteTransaction(tx) {
    const next = transactions.map((t) => (t.id === tx.id ? { ...t, deletedAt: new Date().toISOString(), deletedBy: currentUser.name } : t));
    persistTx(next);
    addLog(`Rasxod chiqindi qutisiga o'tkazildi: ${money(tx.amount)} (${tx.date})`);
    showToast("Rasxod chiqindi qutisiga o'tkazildi", () => latest.current.restoreTransaction(tx));
  }
  function restoreTransaction(tx) {
    const next = transactions.map((t) => (t.id === tx.id ? { ...t, deletedAt: null, deletedBy: null } : t));
    persistTx(next);
    addLog(`Rasxod tiklandi: ${money(tx.amount)} (${tx.date})`);
    showToast("Tiklandi");
  }
  function permanentlyDeleteTransaction(tx) {
    const next = transactions.filter((t) => t.id !== tx.id);
    persistTx(next);
    addLog(`Rasxod butunlay o'chirildi: ${money(tx.amount)} (${tx.date})`);
    showToast("Butunlay o'chirildi");
  }

  // ---- Buyurtma (order) CRUD ----
  function addOrdersBulk(newOrders) {
    if (!newOrders || newOrders.length === 0) return;
    const next = [...newOrders, ...orders];
    persistOrders(next);
    addLog(`Excel orqali ${newOrders.length} ta buyurtma import qilindi`);
    showToast(`${newOrders.length} ta buyurtma qo'shildi`);
  }
  function saveOrder(order, isEdit, linkedExpenseTx, extra) {
    let next;
    // Operator summani kamaytirgan bo'lsa: boshqa o'zgarishlar saqlanadi, yangi summa — admin tasdig'iga
    let totalRequest = null;
    if (isEdit && currentUser?.role !== "admin") {
      const prev = orders.find((o) => o.id === order.id);
      if (prev && (Number(order.agreementUzs) || 0) < (Number(prev.agreementUzs) || 0)) {
        totalRequest = { kind: "order_total", orderId: order.id, agreementUzs: order.agreementUzs, reason: extra?.totalReason || "Sabab ko'rsatilmagan" };
        order = { ...order, agreementUzs: prev.agreementUzs, agreementUsd: prev.agreementUsd };
      }
    }
    if (totalRequest) {
      // Avval tahrir saqlanadi, so'ng so'rov yuboriladi (server buyurtmaning joriy summasini tekshiradi)
      Promise.resolve().then(() => approvalsState.request(totalRequest))
        .then(() => showToast("Summani kamaytirish so'rovi adminga yuborildi"))
        .catch((e) => showToast(e.message));
    }
    if (isEdit) {
      next = orders.map((o) => (o.id === order.id ? order : o));
      addLog(`Buyurtma tahrirlandi: ${order.orderNumber} (${money(order.agreementUzs)})`);
    } else {
      next = [order, ...orders];
      addLog(`Yangi buyurtma qo'shildi: ${order.orderNumber} (${money(order.agreementUzs)})`);
    }
    persistOrders(next);
    if (linkedExpenseTx) {
      const exists = transactions.some((t) => t.id === linkedExpenseTx.id);
      const txNext = exists
        ? transactions.map((t) => (t.id === linkedExpenseTx.id ? linkedExpenseTx : t))
        : [linkedExpenseTx, ...transactions];
      persistTx(txNext);
      addLog(exists
        ? `Buyurtmaga bog'liq material xarajati yangilandi: ${money(linkedExpenseTx.amount)} (${linkedExpenseTx.date})`
        : `Buyurtmaga bog'liq material xarajati qo'shildi: ${money(linkedExpenseTx.amount)} (${linkedExpenseTx.date})`);
    }
    showToast(isEdit ? "O‘zgartirildi" : "Qo‘shildi");
  }
  function deleteOrder(order) {
    const next = orders.map((o) => (o.id === order.id ? { ...o, deletedAt: new Date().toISOString(), deletedBy: currentUser.name } : o));
    persistOrders(next);
    addLog(`Buyurtma chiqindi qutisiga o'tkazildi: ${order.orderNumber}`);
    showToast(`${order.orderNumber} chiqindi qutisiga o'tkazildi`, () => latest.current.restoreOrder(order));
  }
  function restoreOrder(order) {
    const next = orders.map((o) => (o.id === order.id ? { ...o, deletedAt: null, deletedBy: null } : o));
    persistOrders(next);
    addLog(`Buyurtma tiklandi: ${order.orderNumber}`);
    showToast("Tiklandi");
  }
  // ==================== CRM (savdo voronkasi) ====================
  function saveLead(lead, isEdit) {
    let next;
    if (isEdit) {
      // Formadagi maydonlargina yangilanadi — Telegram bog'lanishi, dizayn/pechat vazifalari va sanalar saqlanib qoladi
      next = leads.map((l) => (l.id === lead.id ? { ...l, ...lead, createdBy: l.createdBy, createdAt: l.createdAt, updatedAt: new Date().toISOString() } : l));
      addLog(`Lid tahrirlandi: ${lead.customer}`);
    } else {
      lead.createdBy = currentUser.name;
      lead.createdAt = new Date().toISOString();
      lead.stageAt = lead.createdAt;
      next = [lead, ...leads];
      addLog(`Yangi lid qo'shildi: ${lead.customer}`);
    }
    persistLeads(next);
    showToast(isEdit ? "O‘zgartirildi" : "Qo‘shildi");
  }
  function deleteLead(lead) {
    const next = leads.filter((l) => l.id !== lead.id);
    persistLeads(next);
    addLog(`Lid o'chirildi: ${lead.customer}`);
    showToast("O'chirildi");
  }
  // Dizayn / Pechat bosqichiga o'tkazishda mas'ul tayinlanmagan bo'lsa — avval tayinlash oynasi
  const [taskAssign, setTaskAssign] = useState(null); // { lead, kind, targetStage }
  function saveTaskAssignment({ jobTitle, task, preassignPrinter }) {
    const { lead, kind, targetStage } = taskAssign;
    const now = new Date().toISOString();
    const next = leads.map((l) => {
      if (l.id !== lead.id) return l;
      const prev = l[kind] || {};
      const reassigned = prev.assigneeId && prev.assigneeId !== task.assigneeId;
      // Pechat vazifasi faqat dizayn tugagach (yoki lid shu bosqichda bo'lsa) faol bo'ladi
      const activate = kind === "design" || targetStage === "printing" || l.stage === "printing" || prev.status === "unassigned" || l.design?.status === "done";
      const status = !activate ? undefined : (prev.status && prev.status !== "unassigned" && !reassigned ? prev.status : "new");
      const upd = {
        ...l,
        jobTitle,
        stage: targetStage || l.stage,
        ...(targetStage && targetStage !== l.stage ? { stageAt: now } : {}),
        [kind]: { ...prev, ...task, status, statusAt: now, assignedAt: reassigned || !prev.assignedAt ? now : prev.assignedAt, autoCreated: undefined },
      };
      if (kind === "design" && preassignPrinter && !(l.print?.status && l.print.status !== "unassigned")) {
        // Standart pechat sozlamalari — menejer CRM kartochkasidagi pechatchi qatorini bosib o'zgartira oladi
        upd.print = { quality: "1440 dpi", colorProfile: "CMYK", ...(l.print || {}), assigneeId: preassignPrinter, status: undefined };
      }
      return upd;
    });
    persistLeads(next);
    const who = employees.find((e) => e.id === task.assigneeId)?.name || "";
    addLog(`${kind === "design" ? "Dizayn" : "Pechat"} vazifasi: ${lead.customer} → ${who}`);
    setTaskAssign(null);
  }


  function moveLead(lead, newStage) {
    // Smetadan buyurtmaga aylangan bitimda vazifalar har bir buyurtmaning o'zida — lid uchun alohida tayinlash so'ralmaydi
    const viaOrders = lead.quote?.status === "converted";
    if (!viaOrders && newStage === "design" && !lead.design?.assigneeId) return setTaskAssign({ lead, kind: "design", targetStage: newStage });
    if (!viaOrders && newStage === "printing" && !lead.print?.assigneeId) return setTaskAssign({ lead, kind: "print", targetStage: newStage });
    const next = leads.map((l) => {
      if (l.id !== lead.id) return l;
      const nowIso = new Date().toISOString();
      const upd = { ...l, stage: newStage, stageAt: nowIso };
      // Yopilish sanasi — arxiv va oylik statistika shu bo'yicha ishlaydi
      if (newStage === "won" || newStage === "lost") upd.closedAt = nowIso;
      else delete upd.closedAt;
      // Pechatga oldindan tayinlangan (navbatdagi) ish qo'lda shu bosqichga o'tkazilsa — faollashtiramiz
      if (newStage === "printing" && l.print?.assigneeId && (!l.print.status || l.print.status === "unassigned")) {
        upd.print = { ...l.print, status: "new", statusAt: new Date().toISOString(), assignedAt: new Date().toISOString() };
      }
      return upd;
    });
    persistLeads(next);
    addLog(`Lid bosqichi o'zgardi: ${lead.customer} -> ${LEAD_STAGES.find((s) => s.key === newStage)?.label}`);
  }
  // Server bajargan amal (smeta → buyurtmalar, umumiy to'lov, holat) — natijani darhol ko'rsatamiz,
  // so'ng serverdagi aniq holatni tortib olamiz (keyingi saqlashlar to'g'ri asosdan hisoblansin)
  async function onServerChange({ lead, orders: changed } = {}) {
    if (lead) setLeads((prev) => (prev.some((l) => l.id === lead.id) ? prev.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...prev]));
    if (changed?.length) {
      setOrders((prev) => {
        const byId = new Map(changed.map((o) => [o.id, o]));
        const known = new Set(prev.map((o) => o.id));
        return [...changed.filter((o) => !known.has(o.id)), ...prev.map((o) => byId.get(o.id) || o)];
      });
    }
    for (const [key, setter] of [["uvix:orders", setOrders], ["uvix:leads", setLeads], ["uvix:audit", setAuditLog]]) {
      const fresh = await storageRefresh(key);
      if (Array.isArray(fresh)) setter(fresh);
    }
  }
  function createOrderFromLead(lead) {
    setPendingLeadForOrder(lead);
    setView("orders");
  }
  function permanentlyDeleteOrder(order) {
    const next = orders.filter((o) => o.id !== order.id);
    persistOrders(next);
    addLog(`Buyurtma butunlay o'chirildi: ${order.orderNumber}`);
    showToast("Butunlay o'chirildi");
  }
  function addPayment(orderId, paymentsArr) {
    const list = Array.isArray(paymentsArr) ? paymentsArr : [paymentsArr];
    const order = orders.find((o) => o.id === orderId);
    const next = orders.map((o) => (o.id === orderId ? { ...o, payments: [...(o.payments || []), ...list] } : o));
    persistOrders(next);
    const total = list.reduce((s, p) => s + p.amount, 0);
    const methods = [...new Set(list.map((p) => paymentTypeLabel(p.paymentType)))].join(" + ");
    addLog(`To'lov qo'shildi: ${order?.orderNumber || ""} — ${money(total)} (${methods})`);
    showToast(list.length > 1 ? "To'lovlar qo'shildi" : "To'lov qo'shildi");
  }
  function deletePayment(orderId, paymentId) {
    const order = orders.find((o) => o.id === orderId);
    const next = orders.map((o) => (o.id === orderId ? { ...o, payments: (o.payments || []).map((p) => (p.id === paymentId ? { ...p, deletedAt: new Date().toISOString(), deletedBy: currentUser.name } : p)) } : o));
    persistOrders(next);
    addLog(`To'lov chiqindi qutisiga o'tkazildi: ${order?.orderNumber || ""}`);
    showToast("To'lov chiqindi qutisiga o'tkazildi", () => latest.current.restorePayment(orderId, paymentId));
  }
  function restorePayment(orderId, paymentId) {
    const order = orders.find((o) => o.id === orderId);
    const next = orders.map((o) => (o.id === orderId ? { ...o, payments: (o.payments || []).map((p) => (p.id === paymentId ? { ...p, deletedAt: null, deletedBy: null } : p)) } : o));
    persistOrders(next);
    addLog(`To'lov tiklandi: ${order?.orderNumber || ""}`);
    showToast("Tiklandi");
  }
  function permanentlyDeletePayment(orderId, paymentId) {
    const order = orders.find((o) => o.id === orderId);
    const next = orders.map((o) => (o.id === orderId ? { ...o, payments: (o.payments || []).filter((p) => p.id !== paymentId), purgedPaymentIds: [...(o.purgedPaymentIds || []), paymentId].slice(-50) } : o));
    persistOrders(next);
    addLog(`To'lov butunlay o'chirildi: ${order?.orderNumber || ""}`);
    showToast("Butunlay o'chirildi");
  }

  // Admin: to'lov summasini to'g'ridan-to'g'ri o'zgartirish (operator — tasdiq so'rovi orqali)
  function editPayment(orderId, paymentId, amount, note) {
    const order = orders.find((o) => o.id === orderId);
    const p = order?.payments?.find((x) => x.id === paymentId);
    if (!order || !p || !amount || amount === p.amount) return;
    const at = new Date().toISOString();
    const next = orders.map((o) => (o.id === orderId ? { ...o, payments: o.payments.map((x) => (x.id === paymentId ? { ...x, amount, prevAmount: x.amount, editedAt: at, editedBy: currentUser.name } : x)) } : o));
    persistOrders(next);
    addLog(`To'lov o'zgartirildi: ${order.orderNumber} — ${money(p.amount)} → ${money(amount)}${note ? ` · «${note}»` : ""}`);
    showToast("To'lov o'zgartirildi");
  }
  editPaymentRef.current = editPayment;

  latest.current = { restoreOrder, restoreTransaction, restorePayment };

  // Sidebar'dagi «Mijozlar» yonidagi raqam — qarzdor mijozlar soni
  const navBadges = useMemo(() => {
    if (!currentUser || isWorkerRole(currentUser.role)) return {};
    const set = new Set();
    for (const o of orders || []) {
      if (o.deletedAt || (currentUser.role !== "admin" && o.createdBy !== currentUser.name)) continue;
      if (orderDebt(o) > 0) set.add(String(o.customer || "").trim().toLowerCase());
    }
    return { customers: set.size };
  }, [orders, currentUser]);

  // Telefon pastki menyusi: «Chatlar» ustidagi raqam — oxirgi marta Chatlar ochilgandan keyin kelgan Telegram xabarlari
  const [chatsSeen, setChatsSeen] = useState(0);
  useEffect(() => {
    try { setChatsSeen(Number(localStorage.getItem(`uvix_chats_seen:${currentUser?.id}`)) || 0); } catch { setChatsSeen(0); }
  }, [currentUser?.id]);
  useEffect(() => {
    if (view !== "chats" || !currentUser?.id) return;
    const mark = () => { const t = Date.now(); setChatsSeen(t); try { localStorage.setItem(`uvix_chats_seen:${currentUser.id}`, String(t)); } catch { /* */ } };
    mark();
    return mark;
  }, [view, currentUser?.id]);
  // Telefon: «Bugun» bosh ekrani (to'liq hisobot — so'rov bilan) va QR yorliqdan buyurtmani ochish
  const phoneUi = useIsMobile();
  const [fullReport, setFullReport] = useState(() => { try { return localStorage.getItem("uvix_today_report") === "1"; } catch { return false; } });
  const toggleReport = () => setFullReport((v) => { try { localStorage.setItem("uvix_today_report", v ? "0" : "1"); } catch { /* */ } return !v; });
  const legacyIdx = useMemo(() => legacyLeadIndex(leads), [leads]);
  const stageOfOrder = useCallback((o) => orderStage(o, legacyIdx), [legacyIdx]);
  useEffect(() => {
    if (!currentUser || isWorkerRole(currentUser.role)) return undefined;
    if (dataFor !== currentUser.id) return undefined;
    const open = (id) => { if (id) { setNavFilter({ openId: id, n: Date.now() }); setView("orders"); } };
    open(takePendingOrder());
    const on = (e) => open(e.detail?.id);
    window.addEventListener(ORDER_SCAN_EVT, on);
    return () => window.removeEventListener(ORDER_SCAN_EVT, on);
  }, [currentUser?.id, dataFor]); // eslint-disable-line react-hooks/exhaustive-deps
  const mobileBadges = useMemo(() => {
    const chats = view === "chats" ? 0 : (notif.items || []).filter((n) => n.cat === "chats" && !n.read && Date.parse(n.at) > chatsSeen).length;
    return { ...navBadges, chats };
  }, [navBadges, notif.items, chatsSeen, view]);

  // Ctrl+K oynasi uchun mijozlar ro'yxati — faqat oyna ochiqligida hisoblanadi
  const cmdkCustomers = useMemo(() => {
    if (!cmdkOpen || !currentUser) return [];
    const mine = (orders || []).filter((o) => !o.deletedAt && (currentUser.role === "admin" || o.createdBy === currentUser.name));
    return buildCustomers(mine, leads, customers);
  }, [cmdkOpen, orders, leads, customers, currentUser]);

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: THEME.surface, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
        <style>{`@keyframes uvixPulse { 0%,100% { opacity: 0.55; transform: scale(0.94); } 50% { opacity: 1; transform: scale(1); } }`}</style>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: THEME.text,
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "uvixPulse 1.1s ease-in-out infinite",
          }}>
            <span style={{ color: THEME.card, fontWeight: 700, fontSize: 15 }}>UV</span>
          </div>
          <div style={{ color: THEME.muted, fontSize: 13, fontWeight: 500 }}>Yuklanmoqda...</div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginScreen
        employees={employees}
        needsSetup={needsSetup}
        onCreateFirstAdmin={async (name, pin) => {
          const user = await authBootstrap(name, pin);
          setNeedsSetup(false);
          setCurrentUser(user);
        }}
        onAuthenticated={(user) => setCurrentUser(user)}
      />
    );
  }

  if (isWorkerRole(currentUser.role)) {
    const workerLogout = () => { authLogout(); resetAttendance(); clearLockState(); idle.unlock(); setCurrentUser(null); };
    return (
      <>
      <div ref={shellRef}>
      <TelegramOnboard user={currentUser} onLogout={workerLogout}>
      <AttendanceGate user={currentUser} onLogout={workerLogout}>
        <Suspense fallback={<div style={{ padding: 24 }}><ViewFallback /></div>}><WorkerApp currentUser={currentUser} onLogout={workerLogout} /></Suspense>
      </AttendanceGate>
      </TelegramOnboard>
      </div>
      {idle.locked && <><style>{LOCK_CSS}</style><LockScreen user={currentUser} onUnlock={idle.unlock} onLogout={workerLogout} /></>}
      </>
    );
  }

  const isAdmin = currentUser.role === "admin";
  const visibleNav = navCfg.items;
  const goView = (v) => { setNavFilter(null); setView(v); };
  const logout = () => { authLogout(); resetAttendance(); clearLockState(); idle.unlock(); setCurrentUser(null); };
  const activeTransactions = transactions.filter((t) => !t.deletedAt);
  const activeOrders = orders.filter((o) => !o.deletedAt);
  const myTx = isAdmin ? activeTransactions : activeTransactions.filter((t) => t.createdBy === currentUser.name);
  const myOrders = isAdmin ? activeOrders : activeOrders.filter((o) => o.createdBy === currentUser.name);

  return (
    <TelegramOnboard user={currentUser} onLogout={logout}>
    <AttendanceGate user={currentUser} onLogout={logout}>
    <ApprovalsProvider value={approvalsCtx}>
    {idle.locked && <LockScreen user={currentUser} onUnlock={idle.unlock} onLogout={logout} />}
    <div ref={shellRef} style={{ fontFamily: THEME.font, color: THEME.text, minHeight: "100vh" }}>
      <style>{`
        html, body { overflow-x: hidden; max-width: 100vw; overscroll-behavior-x: none; }
        /* clip — gorizontal aylanishni to'sadi, lekin (hidden'dan farqli) tepa panelning "yopishqoq"ligini buzmaydi */
        @supports (overflow-x: clip) { html, body { overflow-x: clip; } }
        * { box-sizing: border-box; }
        .uvix-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
        .uvix-scroll::-webkit-scrollbar-thumb { background: ${THEME.isDark ? "rgba(255,255,255,0.14)" : "#D4D4D8"}; border-radius: 4px; }
        .uvix-scroll::-webkit-scrollbar-thumb:hover { background: ${THEME.isDark ? "rgba(255,255,255,0.25)" : "#A1A1AA"}; }
        body { background: ${THEME.surface}; }
        /* Fon (oboi) — sahifa ortida qotib turadi; ustida yumshoq parda, yozuvlar o'qilsin */
        .uvix-bg { position: fixed; inset: 0; z-index: -1; background-size: cover; background-position: center; pointer-events: none; }
        .uvix-bg::after { content: ""; position: absolute; inset: 0; background: ${glassOn ? `rgba(0,0,0,${Math.min(0.85, (bgState.resolved?.dark ? 0.22 : 0.64) + (bgState.bg.dim || 0))})` : withAlpha(THEME.surface, Math.min(0.85, 0.35 + (bgState.bg.dim || 0)))}; }
        @media ${BG_OFF_QUERY} { .uvix-bg { display: none; } }
        /* Shisha rejimi (Bitrix24 kabi): panellar shaffof, fon ko'rinadi, matn oq */
        .uvix-glass .uvix-glass-side { background: rgba(14,14,16,0.42) !important; -webkit-backdrop-filter: blur(22px) saturate(1.3); backdrop-filter: blur(22px) saturate(1.3); border-color: rgba(255,255,255,0.08) !important; }
        .uvix-glass .uvix-card, .uvix-glass .uvix-order-panel { background: rgba(20,20,23,0.5) !important; border-color: rgba(255,255,255,0.09) !important; -webkit-backdrop-filter: blur(16px) saturate(1.2); backdrop-filter: blur(16px) saturate(1.2); }
        .uvix-glass .uvix-lead-card { background: rgba(20,20,23,0.62) !important; border-color: rgba(255,255,255,0.09) !important; }
        .uvix-glass thead tr { background: rgba(255,255,255,0.04) !important; }
        .uvix-glass .uvix-row:hover { background-color: rgba(255,255,255,0.05) !important; }
        .uvix-glass .uvix-topbar h1, .uvix-glass .uvix-topbar { text-shadow: 0 1px 2px rgba(0,0,0,0.25); }
        @media (prefers-reduced-transparency: reduce) { .uvix-glass .uvix-card, .uvix-glass .uvix-glass-side, .uvix-glass .uvix-order-panel { -webkit-backdrop-filter: none; backdrop-filter: none; background: ${THEME.card} !important; } }
        button { font-family: inherit; }
        input, select, textarea { font-family: inherit; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: ${THEME.violet} !important; box-shadow: 0 0 0 3px ${withAlpha(THEME.violet, 0.16)}; }
        :focus-visible { outline: 2px solid ${withAlpha(THEME.violet, 0.55)}; outline-offset: 1px; }
        ${THEME.contrast ? `/* Yuqori kontrast: aniq fokus va chegaralar */
        :focus-visible { outline: 3px solid ${THEME.violet}; outline-offset: 2px; }
        .uvix-card { box-shadow: none !important; }
        .uvix-table th, .uvix-table td { border-color: ${THEME.border} !important; }` : ""}
        body, input, select, textarea, button { -webkit-font-smoothing: antialiased; }
        .uvix-num, td, th { font-variant-numeric: tabular-nums; }
        button { transition: transform 0.12s ease, box-shadow 0.15s ease, opacity 0.15s ease, background-color 0.15s ease, border-color 0.15s ease; }
        button:active:not(:disabled) { transform: scale(0.985); }
        .uvix-card { transition: box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease; }
        .uvix-card:hover { border-color: ${THEME.border2}; }
        .uvix-metric:hover { border-color: ${THEME.border2}; box-shadow: ${THEME.shadowSm}; }
        .uvix-row { transition: background-color 0.12s ease; }
        .uvix-row:hover { background-color: ${THEME.hover}; }
        .uvix-iconbtn { transition: background-color 0.15s ease, transform 0.15s ease; }
        .uvix-iconbtn:hover { background-color: ${THEME.hover}; }
        .uvix-nav-item { transition: background-color 0.15s ease, color 0.15s ease; }
        .uvix-nav-item:hover:not(.uvix-nav-active) { background: ${THEME.navHover}; color: ${THEME.navActiveText}; }
        .uvix-btn-primary:hover:not(:disabled) { background: ${THEME.violetDark} !important; }
        .uvix-btn-ghost:hover:not(:disabled) { background: ${THEME.hover}; border-color: ${THEME.border2} !important; }
        .uvix-btn-danger:hover:not(:disabled) { background: ${withAlpha(THEME.rose, 0.16)}; }
        .uvix-modal-backdrop { animation: uvixFadeIn 0.15s ease; }
        .uvix-modal-panel { animation: uvixScaleIn 0.18s cubic-bezier(0.16,1,0.3,1); }
        .uvix-modal-shake { animation: uvixShake 0.35s ease !important; }
        @keyframes uvixShake { 10%, 90% { transform: translateX(-1px); } 20%, 80% { transform: translateX(2px); } 30%, 50%, 70% { transform: translateX(-4px); } 40%, 60% { transform: translateX(4px); } }
        @keyframes uvixFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes uvixScaleIn { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes uvixSlideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .uvix-toast { animation: uvixSlideUp 0.22s cubic-bezier(0.16,1,0.3,1); }
        .uvix-toast { overflow: hidden; }
        .uvix-toast-bar { position: absolute; left: 0; bottom: 0; height: 2px; width: 100%; background: rgba(255,255,255,0.35); transform-origin: left; animation: uvixToastBar 6s linear forwards; }
        @keyframes uvixToastBar { from { transform: scaleX(1); } to { transform: scaleX(0); } }
        @media (max-width: 860px) { .uvix-toast { left: 16px; right: 16px !important; bottom: calc(88px + env(safe-area-inset-bottom, 0px)) !important; justify-content: space-between; } }
        .uvix-view-enter { animation: uvixFadeIn 0.22s ease; }
        .uvix-skeleton { background: linear-gradient(90deg, ${THEME.chip} 25%, ${THEME.hover} 37%, ${THEME.chip} 63%); background-size: 400% 100%; animation: uvixShimmer 1.4s ease infinite; border-radius: 6px; }
        @keyframes uvixShimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
        .uvix-chip { transition: all 0.15s ease; }
        .uvix-chip:hover { border-color: ${THEME.violet} !important; }
        .uvix-login-item { transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease; }
        .uvix-login-item:hover { background: rgba(255,255,255,0.09) !important; border-color: rgba(255,255,255,0.22) !important; transform: translateY(-1px); }
        .uvix-dash-card { border-radius: ${THEME.radius + 2}px !important; box-shadow: none !important; }
        @media print {
          .no-print { display: none !important; }
          .print-area { display: block !important; }
        }
        .print-area { display: none; }

        /* Zichlik (density) — Card va jadval qatorlarining ichki bo'shlig'iga ta'sir qiladi */
        .uvix-density-compact .uvix-card { padding: 12px !important; }
        .uvix-density-compact td, .uvix-density-compact th { padding: 8px 11px !important; }
        .uvix-density-spacious .uvix-card { padding: 24px !important; }
        .uvix-density-spacious td, .uvix-density-spacious th { padding: 17px 20px !important; }

        /* ---- Mobil (telefon) moslashuvi ---- */
        .uvix-hamburger { display: none; }
        @media (max-width: 860px) {
          .uvix-hamburger { display: flex !important; }
          .uvix-sidebar {
            position: fixed !important;
            top: 0;
            left: 0;
            height: 100vh;
            z-index: 200;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
            box-shadow: ${THEME.shadowLg};
          }
          .uvix-sidebar-open { transform: translateX(0) !important; }
          .uvix-sidebar-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(9,9,11,0.4);
            z-index: 190;
          }
        }
        @media (max-width: 900px) { .uvix-hero-grid { grid-template-columns: 1fr !important; gap: 18px !important; } }
        @media (max-width: 720px) {
          /* «clip» — gorizontal siljishni to'sadi, lekin aylantirish konteyneri yaratmaydi: telefonda yopishqoq filtrlar ishlaydi */
          @supports (overflow: clip) { .uvix-shell { overflow-x: clip !important; } }
          .uvix-hide-mobile { display: none !important; }
          .uvix-hero { padding: 16px !important; }
          .uvix-topbar { padding: 14px 16px 0 !important; }
          .uvix-main-pad { padding-left: 16px !important; padding-right: 16px !important; }
        }
        /* Jadval + o'ng panel (Buyurtmalar va boshqalar) */
        .uvix-split { display: block; }
        .uvix-split-open { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 14px; align-items: start; }
        .uvix-split-open > .uvix-order-panel, .uvix-split-open > .uvix-side-panel { position: sticky; top: 12px; max-height: calc(100vh - 24px); }
        .uvix-split-backdrop { display: none; }
        @media (max-width: 1180px) {
          .uvix-split-open { display: block; }
          .uvix-split-open > .uvix-order-panel, .uvix-split-open > .uvix-side-panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100vw); max-height: none; z-index: 210; border-radius: 0 !important; box-shadow: ${THEME.shadowLg}; animation: uvixPanelIn .2s cubic-bezier(.16,1,.3,1); }
          .uvix-split-backdrop { display: block; position: fixed; inset: 0; z-index: 205; background: rgba(9,9,11,0.25); }
        }
        @keyframes uvixPanelIn { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
        .uvix-table tbody tr.uvix-row-selected:hover { background: ${THEME.navActiveBg} !important; }
        @media (hover: hover) {
          .uvix-row-actions { opacity: 0; transition: opacity .12s ease; }
          tr:hover .uvix-row-actions, tr:focus-within .uvix-row-actions, tr.uvix-row-selected .uvix-row-actions { opacity: 1; }
        }
        /* Barcha jadvallar sarlavhasi bir xil: kichik harf, sokin rang */
        .uvix-shell th { text-transform: none !important; letter-spacing: 0 !important; font-size: 12.5px !important; font-weight: 500 !important; color: ${THEME.muted} !important; }
        .uvix-shell thead tr { background: ${THEME.isDark ? THEME.hover : "#FAFAFA"}; }
        .uvix-mobile-only { display: none; }
        @media (max-width: 860px) { .uvix-mobile-only { display: inline-flex; } }
        .uvix-search-trigger:hover { border-color: ${THEME.border2} !important; color: ${THEME.muted} !important; }
        .uvix-noscrollbar { scrollbar-width: none; } .uvix-noscrollbar::-webkit-scrollbar { display: none; }
        .uvix-fchip:hover { border-color: ${THEME.mutedDark} !important; }
        /* Dashboard'ning 12-ustunli grid'i tor ekranlarda 2 ustun, keyin 1 ustunga siqiladi */
        @media (max-width: 680px) {
          .uvix-dash-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .uvix-dash-grid > div { grid-column: span 2 !important; }
        }
        /* telefonda kichik/o'rta ko'rsatkichlar 2 tadan yonma-yon (raqam ixchamroq) */
        @media (max-width: 680px) {
          .uvix-dash-grid { gap: 10px !important; }
          .uvix-dash-grid > div[data-size="sm"], .uvix-dash-grid > div[data-size="md"] { grid-column: span 1 !important; }
          .uvix-dash-grid > div[data-size="sm"] .uvix-metric, .uvix-dash-grid > div[data-size="md"] .uvix-metric { padding: 12px !important; gap: 8px !important; }
          .uvix-dash-grid > div[data-size="sm"] .uvix-metric > div:nth-child(2) span, .uvix-dash-grid > div[data-size="md"] .uvix-metric > div:nth-child(2) span { font-size: 16px !important; letter-spacing: -0.2px !important; }
          .uvix-hero-bal { grid-template-columns: 1fr !important; gap: 8px !important; }
          .uvix-hero-bal > div { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
          .uvix-hero-bal > div > div:last-child { margin-top: 0 !important; font-size: 15px !important; }
        }
        @media (max-width: 340px) {
          .uvix-dash-grid > div[data-size] { grid-column: span 2 !important; }
        }
        /* Forma ichidagi 2-ustunli grid'lar (Field'lar) tor ekranda 1 ustunga tushadi */
        @media (max-width: 560px) {
          [style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
          [style*="grid-template-columns: 1.2fr 0.8fr 0.8fr auto"] { grid-template-columns: 1fr !important; }
        }
        /* Pastki menyu — oxirida turishi shart, hamburger qoidasini bekor qiladi */
        ${navCss()}
        ${ncenterCss()}
        ${BOTTOM_NAV_CSS}
        ${MORE_SHEET_CSS}
        ${APPROVALS_CSS}
        ${LOCK_CSS}
      `}</style>
      {bgOn && <div className="uvix-bg no-print" aria-hidden="true" data-testid="app-bg" data-phase={bgState.resolved.phase || ""} style={{ backgroundImage: `url("${bgState.resolved.url}")` }} />}
      <div className={`uvix-shell uvix-layout-${navCfg.layout} uvix-density-${appearance.density || "comfortable"}${bgOn ? " uvix-has-bg" : ""}${glassOn ? " uvix-glass" : ""}`} style={{ display: "flex", minHeight: "100vh", background: bgOn ? "transparent" : THEME.surface, maxWidth: "100vw", overflowX: navCfg.layout === "top" ? "visible" : "hidden" }}>
        <Sidebar nav={visibleNav} navCfg={navCfg} view={view} setView={goView} user={currentUser} onLogout={logout} sidebarStyle={appearance.sidebarStyle} isOpen={sidebarOpen} onClose={() => { setSidebarOpen(false); navCfg.setEditing(false); }} badges={navBadges}
          top={<><SearchTrigger onClick={() => { setSidebarOpen(false); openCmdk(); }} /><QrScanButton full onClick={() => setSidebarOpen(false)} /></>} />
        {navCfg.layout === "rail" && <RailNav nav={navCfg} view={view} setView={goView} user={currentUser} onLogout={logout} onSearch={openCmdk} />}
        {navCfg.layout === "top" && <TopNav nav={navCfg} view={view} setView={goView} user={currentUser} onLogout={logout} onSearch={openCmdk} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Topbar user={currentUser} view={view} bare={phoneUi && view === "dashboard"} onBack={canGoBack ? goBack : null} onLogout={logout} onMenuClick={() => setSidebarOpen(true)} right={<><span className="uvix-mobile-only"><SearchTrigger compact onClick={openCmdk} /></span><NotificationBell n={notif} onNavigate={goView} onOpenSettings={openNotifySettings} /><CheckInButton compact={typeof window !== "undefined" && window.innerWidth < 600} /></>} />
          {isAdmin && <StorageWarning onOpenSettings={view === "settings" ? null : () => setView("settings")} />}
          <div key={view} className="uvix-view-enter uvix-main-pad" style={{ padding: "20px 28px 40px" }}>
            <ErrorBoundary inline onHome={() => goView("dashboard")}>
            <CrashProbe view={view} />
            <Suspense fallback={<ViewFallback />}>
            {view === "dashboard" && phoneUi && (
              <TodayView user={currentUser} orders={myOrders} employees={employees} stageOf={stageOfOrder}
                chatsEnabled={visibleNav.some((n) => n.key === "chats")} canExpense={visibleNav.some((n) => n.key === "expense")}
                onOpenChat={(id) => { if (id) setOpenChatId(id); goView("chats"); }}
                onOpenOrder={(o) => navigateWithFilter("orders", { openId: o.id, n: Date.now() })}
                onNavigate={(v, f) => navigateWithFilter(v, { ...f, n: Date.now() })}
                onQuickAdd={(kind) => { setNavFilter(null); setView(kind === "order" ? "orders" : "expense"); setQuickAdd({ kind, n: Date.now() }); }}
                onScan={() => openScanner("order")} />
            )}
            {isAdmin && (view === "dashboard" || view === "orders") && <ApprovalsCard approvals={approvalsCtx} onDecide={approvalsCtx.decide} showToast={showToast} />}
            {view === "dashboard" && phoneUi && (
              <button type="button" onClick={toggleReport} data-testid="today-report" aria-expanded={fullReport}
                style={{ width: "100%", height: 48, borderRadius: 14, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.text, fontFamily: "inherit", fontSize: 14.5, fontWeight: 600, cursor: "pointer", marginBottom: fullReport ? 18 : 0 }}>
                {fullReport ? "Batafsil hisobotni yopish" : "Batafsil hisobot"}
              </button>
            )}
            {view === "dashboard" && (!phoneUi || fullReport) && <Dashboard orders={myOrders} expenses={myTx} isAdmin={isAdmin} onNavigate={navigateWithFilter} settings={settings} onSaveSettings={persistSettings} />}
            {view === "orders" && (
              <OrdersView
                quickAddNonce={quickAdd?.kind === "order" ? quickAdd.n : 0}
                onQuickAddHandled={() => setQuickAdd(null)}
                orders={myOrders}
                allOrders={orders}
                transactions={myTx}
                currentUser={currentUser}
                isAdmin={isAdmin}
                categories={categories}
                employees={employees}
                settings={settings}
                initialFilter={navFilter}
                onAddSubcategory={addSubcategory}
                onSaveOrder={saveOrder}
                onImportOrders={addOrdersBulk}
                onDeleteOrder={deleteOrder}
                onAddPayment={addPayment}
                onDeletePayment={deletePayment}
                onUploadPhotos={uploadPhotos}
                onDeletePhoto={deletePhoto}
                pendingLead={pendingLeadForOrder}
                leads={leads}
                customerProfiles={customers}
                onOpenChat={(lead) => { setOpenChatId(lead.telegramChatId); setView("chats"); }}
                onPendingLeadHandled={() => setPendingLeadForOrder(null)}
                onServerChange={onServerChange}
                showToast={showToast}
              />
            )}
            {view === "crm" && (
              <CRMView
                quickAddNonce={quickAdd?.kind === "lead" ? quickAdd.n : 0}
                onQuickAddHandled={() => setQuickAdd(null)}
                onOpenChat={(lead) => { setOpenChatId(lead.telegramChatId); setView("chats"); }}
                onAssignTask={(lead, kind) => setTaskAssign({ lead, kind })}
                leads={leads}
                orders={orders}
                employees={employees}
                currentUser={currentUser}
                isAdmin={isAdmin}
                onSaveLead={saveLead}
                onDeleteLead={deleteLead}
                onMoveLead={moveLead}
                onCreateOrderFromLead={createOrderFromLead}
                onFetchTelegramMessages={fetchTelegramMessages}
                onSendTelegramMessage={sendTelegramUserMessage}
              />
            )}
            {view === "chats" && (
              <ChatsView
                leads={leads}
                onFetchChats={fetchTelegramChats}
                onSendMessage={sendTelegramUserMessage}
                onMarkRead={markTelegramChatRead}
                onMoveLead={moveLead}
                onLeadCreated={(lead) => {
                  setLeads((prev) => (prev.some((l) => l.id === lead.id) ? prev : [lead, ...prev]));
                  addLog(`Telegram suhbati CRM'ga qo'shildi: ${lead.customer}`);
                }}
                initialChatId={openChatId}
                onInitialChatHandled={() => setOpenChatId(null)}
                isAdmin={isAdmin}
                onOpenSettings={() => { setNavFilter(null); setView("settings"); }}
                currentUser={currentUser}
                employees={employees}
                orders={myOrders}
                allOrders={orders}
                transactions={myTx}
                customerProfiles={customers}
                onCreateOrderFromLead={createOrderFromLead}
                onAssignTask={(lead, kind, attachment) => setTaskAssign({ lead, kind, attachment })}
                onServerChange={onServerChange}
                onAddPayment={addPayment}
                onDeletePayment={deletePayment}
              />
            )}
            {view === "expense" && (
              <ExpenseView
                quickAddNonce={quickAdd?.kind === "expense" ? quickAdd.n : 0}
                onQuickAddHandled={() => setQuickAdd(null)}
                transactions={myTx}
                orders={myOrders}
                currentUser={currentUser}
                categories={categories}
                onAddCategory={addCategory}
                onAddSubcategory={addSubcategory}
                onSave={saveTransaction}
                onDelete={deleteTransaction}
              />
            )}
            {view === "operations" && (
              <OperationsView
                orders={myOrders}
                transactions={myTx}
                isAdmin={isAdmin}
                onDeletePayment={deletePayment}
                onDeleteExpense={deleteTransaction}
                currentUser={currentUser}
                categories={categories}
                initialFilter={navFilter}
              />
            )}
            {view === "attendance" && <AttendanceView currentUser={currentUser} isAdmin={isAdmin} />}
            {view === "customers" && (
              <CustomersView currentUser={currentUser} isAdmin={isAdmin} orders={myOrders} leads={leads} profiles={customers} transactions={myTx}
                onSaveCustomer={saveCustomer} onAddPayment={addPayment} onDeletePayment={deletePayment}
                onOpenChat={(lead) => { setOpenChatId(lead.telegramChatId); setView("chats"); }}
                onOpenOrders={(name) => { setNavFilter({ search: name }); setView("orders"); }} />
            )}
            {view === "paint" && (
              <PaintView currentUser={currentUser} isAdmin={isAdmin} orders={myOrders} categories={categories}
                onAddCategory={addCategory} onAddSubcategory={addSubcategory} onSaveTx={saveTransaction} />
            )}
            {view === "report" && isAdmin && <ReportView orders={activeOrders} transactions={activeTransactions} categories={categories} />}
            {view === "categories" && (
              <CategoriesView
                transactions={activeTransactions}
                categories={categories}
                isAdmin={isAdmin}
                onAddCategory={addCategory}
                onAddSubcategory={addSubcategory}
                onRenameCategory={renameCategory}
                onDeleteCategory={deleteCategory}
                onDeleteSubcategory={deleteSubcategory}
              />
            )}
            {view === "employees" && isAdmin && (
              <EmployeesView
                employees={employees}
                onSave={persistEmployees}
                auditLog={auditLog}
                currentUser={currentUser}
              />
            )}
            {view === "settings" && (
              <SettingsView
                onOpenView={goView}
                categories={categories}
                notif={notif}
                bgState={bgState}
                currentUser={currentUser}
                employees={employees}
                onSave={persistEmployees}
                onLogout={logout}
                isAdmin={isAdmin}
                settings={settings}
                onSaveSettings={persistSettings}
                appearance={appearance}
                onApplyAppearance={applyAppearance}
                companyAppearance={companyAppearance}
                onApplyCompanyAppearance={applyCompanyAppearance}
                orders={orders}
                transactions={transactions}
                onRestoreOrder={restoreOrder}
                onPermanentDeleteOrder={permanentlyDeleteOrder}
                onRestoreTransaction={restoreTransaction}
                onPermanentDeleteTransaction={permanentlyDeleteTransaction}
                onRestorePayment={restorePayment}
                onPermanentDeletePayment={permanentlyDeletePayment}
                onResetAll={async () => {
                  await persistTx([]);
                  await persistOrders([]);
                  addLog("Barcha buyurtma va operatsiyalar tozalandi");
                }}
                onSendBackupNow={sendBackupNow}
                onConnectTelegramUser={connectTelegramUser}
                onDisconnectTelegramUser={disconnectTelegramUser}
                onFetchTelegramUserStatus={fetchTelegramUserStatus}
              />
            )}
            </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      </div>
      {taskAssign && (
        <Suspense fallback={null}>
        <TaskAssignModal
          lead={leads.find((l) => l.id === taskAssign.lead.id) || taskAssign.lead}
          kind={taskAssign.kind}
          attachment={taskAssign.attachment || null}
          employees={employees}
          onSave={saveTaskAssignment}
          onCancel={() => setTaskAssign(null)}
        />
        </Suspense>
      )}
      <CommandPalette
        open={cmdkOpen}
        onClose={() => setCmdkOpen(false)}
        nav={visibleNav}
        orders={myOrders}
        leads={leads}
        customers={cmdkCustomers}
        onNavigate={goView}
        isAdmin={isAdmin}
        onOpenSetting={(it) => {
          setNavFilter(null);
          if (it.view) { if (it.view[1]) setOpenTab(it.view[0], it.view[1]); setView(it.view[0]); }
          else { setView("settings"); openSettingsSection(it.section, it.anchor); }
        }}
        onSearchOrders={(q) => navigateWithFilter("orders", { search: q })}
        onQuickAdd={(kind) => { setNavFilter(null); setView(kind === "order" ? "orders" : "expense"); setQuickAdd({ kind, n: Date.now() }); }}
        onNewLead={visibleNav.some((n) => n.key === "crm") ? () => { setNavFilter(null); setView("crm"); setQuickAdd({ kind: "lead", n: Date.now() }); } : null}
      />
      <SaveStatus />
      <QrApproveHost />
      <BottomNav
        view={view}
        tabs={navCfg.mobileBar}
        onNavigate={(v) => { setNavFilter(null); setView(v); }}
        onMore={() => setSidebarOpen(true)}
        onQuickAdd={(kind) => { setNavFilter(null); setView(kind === "order" ? "orders" : "expense"); setQuickAdd({ kind, n: Date.now() }); }}
        badges={mobileBadges}
        more={{
          items: visibleNav, badges: mobileBadges, user: currentUser, onToggleBar: navCfg.toggleBar, onLogout: logout,
          onEditMenu: () => { navCfg.setScope("mine"); navCfg.setEditing(true); setSidebarOpen(true); },
        }}
      />
      {toast && (
        <div key={toast.id} className="uvix-toast" role="status" aria-live="polite" style={{ position: "fixed", bottom: 20, right: 20, background: THEME.isDark ? "#2A2A2E" : "#18181B", color: "#FAFAFA", padding: toast.undo ? "8px 8px 8px 14px" : "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, boxShadow: THEME.shadowLg, zIndex: 400, display: "flex", alignItems: "center", gap: 10, maxWidth: "calc(100vw - 32px)" }}>
          {!toast.undo && <div style={{ width: 6, height: 6, borderRadius: "50%", background: THEME.isDark ? "#3FB97A" : "#4ADE80", flexShrink: 0 }} />}
          <span style={{ minWidth: 0 }}>{toast.msg}</span>
          {toast.undo && (
            <button type="button" data-testid="toast-undo" onClick={() => { const u = toast.undo; setToast(null); clearTimeout(toastTimer.current); u(); }}
              style={{ height: 28, padding: "0 10px", borderRadius: 6, border: 0, background: "rgba(255,255,255,0.12)", color: "#FFFFFF", fontSize: 12.5, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
              Bekor qilish
            </button>
          )}
          {toast.undo && <span key={toast.id} className="uvix-toast-bar" aria-hidden="true" />}
        </div>
      )}
    </div>
    </ApprovalsProvider>
    </AttendanceGate>
    </TelegramOnboard>
  );
}
