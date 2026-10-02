import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import LoginScreen from "./auth/LoginScreen.jsx";
import { authListEmployees, authLogout, confirmPinReset, connectTelegramUser, deletePhoto, disconnectTelegramUser, fetchTelegramChats, fetchTelegramMessages, fetchTelegramUserStatus, markTelegramChatRead, requestPinReset, sendBackupNow, sendTelegramUserMessage, uploadPhotos } from "./storage.js";
import { Sidebar, Topbar } from "./components/Layout.jsx";
import { BottomNav, BOTTOM_NAV_CSS } from "./components/BottomNav.jsx";
import { navCss, RailNav, TopNav, useNavPrefs } from "./components/Nav.jsx";
import { CommandPalette, SearchTrigger, useCommandHotkey } from "./components/CommandPalette.jsx";
import { buildCustomers } from "./lib/customers.js";
import { useNotifications } from "./lib/notify.js";
import { useBackground } from "./lib/background.js";
import { NotificationBell, ncenterCss } from "./components/NotificationBell.jsx";
import { CheckInButton } from "./components/CheckInButton.jsx";
import { AttendanceGate } from "./components/AttendanceGate.jsx";
import { resetAttendance } from "./lib/attendanceStore.js";
import { StorageWarning } from "./components/StorageWarning.jsx";
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, LEAD_STAGES, NAV, isWorkerRole } from "./constants.js";
import { generateOrderNumber } from "./lib/finance.js";
import { money, paymentTypeLabel, uid } from "./lib/format.js";
import { resumePending, storageGet, storageRefresh, storageSet, subscribeRemote } from "./lib/kv.js";
import { SaveStatus } from "./components/SaveStatus.jsx";
import { useBackToClose, useHistoryView } from "./lib/history.js";
import { DEFAULT_APPEARANCE, THEME, setTheme, buildTheme, migrateAppearance, withAlpha } from "./theme.js";
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
  const [ready, setReady] = useState(false);
  const [transactions, setTransactions] = useState([]); // faqat rasxod (chiqim)
  const [orders, setOrders] = useState([]); // buyurtmalar (har birida payments[])
  const [leads, setLeads] = useState([]); // CRM — savdo voronkasi lidlari
  const [customers, setCustomers] = useState([]); // Mijozlar bazasi — qo'lda kiritilgan ma'lumotlar (telefon, izoh, birlashtirish)
  const [pendingLeadForOrder, setPendingLeadForOrder] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);
  const [currentUser, setCurrentUser] = useState(null);
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
  // Shaxsiy fon va shisha rejimi (faqat kompyuterda — telefonda tezlik uchun o'chiq)
  const bgState = useBackground(!!currentUser && !isWorkerRole(currentUser.role));
  const narrow = useIsMobile(860);
  const bgOn = !!bgState.resolved && !narrow;
  const glassOn = bgOn && bgState.bg.glass;
  const nightDark = bgOn && bgState.bg.kind === "dynamic" && bgState.bg.nightDark && bgState.resolved.dark;
  const effectiveAppearance = glassOn ? { ...appearance, mode: "dark", glass: true } : nightDark ? { ...appearance, mode: "dark" } : appearance;
  const themeKeyRef = useRef("");
  const themeKey = JSON.stringify(effectiveAppearance);
  if (themeKeyRef.current !== themeKey) { setTheme(buildTheme(effectiveAppearance)); themeKeyRef.current = themeKey; }
  const openNotifySettings = () => {
    setNavFilter(null); setView("settings");
    setTimeout(() => document.querySelector("[data-testid=notify-settings]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 450);
  };

  function navigateWithFilter(targetView, filter) {
    setNavFilter(filter || {});
    setView(targetView);
  }
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (currentUser) return; // tizimdan chiqilganda ro'yxat (va Face ID holati) yangilanadi
    (async () => {
      let emp = [];
      try {
        emp = await authListEmployees();
      } catch (e) {
        emp = [];
      }
      setEmployees(emp);
      setReady(true);
    })();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    if (isWorkerRole(currentUser.role)) {
      // Dizayner/Pechatchi: moliyaviy ma'lumotlar umuman yuklanmaydi (server ham bermaydi) — faqat ko'rinish
      (async () => {
        const appr = migrateAppearance(await storageGet("uvix:appearance", false, null));
        setTheme(buildTheme(appr)); setAppearance(appr);
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
      const appr = migrateAppearance(await storageGet("uvix:appearance", false, null));
      setTheme(buildTheme(appr));
      setTransactions(tx);
      setOrders(ords);
      setAuditLog(log);
      setLeads(leadsData);
      setCustomers(Array.isArray(custData) ? custData : []);
      setCategories(cats);
      setSettings(sett);
      setAppearance(appr);
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

  function applyAppearance(next) {
    setTheme(buildTheme(next));
    setAppearance(next);
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
  function saveOrder(order, isEdit, linkedExpenseTx) {
    let next;
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
    if (newStage === "design" && !lead.design?.assigneeId) return setTaskAssign({ lead, kind: "design", targetStage: newStage });
    if (newStage === "printing" && !lead.print?.assigneeId) return setTaskAssign({ lead, kind: "print", targetStage: newStage });
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
  function createOrderFromLead(lead) {
    setPendingLeadForOrder(lead);
    setView("orders");
  }
  function linkOrderToLead(lead, order) {
    const next = leads.map((l) => (l.id === lead.id ? { ...l, orderId: order.id } : l));
    persistLeads(next);
    setPendingLeadForOrder(null);
    addLog(`Lid buyurtmaga bog'landi: ${lead.customer} -> ${order.orderNumber}`);
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
    const next = orders.map((o) => (o.id === orderId ? { ...o, payments: (o.payments || []).filter((p) => p.id !== paymentId) } : o));
    persistOrders(next);
    addLog(`To'lov butunlay o'chirildi: ${order?.orderNumber || ""}`);
    showToast("Butunlay o'chirildi");
  }

  latest.current = { restoreOrder, restoreTransaction, restorePayment };

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
        onAuthenticated={(user) => setCurrentUser(user)}
        onRequestPinReset={requestPinReset}
        onConfirmPinReset={confirmPinReset}
      />
    );
  }

  if (isWorkerRole(currentUser.role)) {
    const workerLogout = () => { authLogout(); resetAttendance(); setCurrentUser(null); };
    return (
      <AttendanceGate user={currentUser} onLogout={workerLogout}>
        <Suspense fallback={<div style={{ padding: 24 }}><ViewFallback /></div>}><WorkerApp currentUser={currentUser} onLogout={workerLogout} /></Suspense>
      </AttendanceGate>
    );
  }

  const isAdmin = currentUser.role === "admin";
  const visibleNav = navCfg.items;
  const goView = (v) => { setNavFilter(null); setView(v); };
  const logout = () => { authLogout(); resetAttendance(); setCurrentUser(null); };
  const activeTransactions = transactions.filter((t) => !t.deletedAt);
  const activeOrders = orders.filter((o) => !o.deletedAt);
  const myTx = isAdmin ? activeTransactions : activeTransactions.filter((t) => t.createdBy === currentUser.name);
  const myOrders = isAdmin ? activeOrders : activeOrders.filter((o) => o.createdBy === currentUser.name);

  return (
    <AttendanceGate user={currentUser} onLogout={logout}>
    <div style={{ fontFamily: THEME.font, color: THEME.text, minHeight: "100vh" }}>
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
        .uvix-bg { position: fixed; inset: 0; z-index: 0; background-size: cover; background-position: center; pointer-events: none; }
        .uvix-bg::after { content: ""; position: absolute; inset: 0; background: ${glassOn ? `rgba(0,0,0,${0.22 + (bgState.bg.dim || 0)})` : withAlpha(THEME.surface, Math.min(0.85, 0.5 + (bgState.bg.dim || 0)))}; }
        @media (max-width: 860px) { .uvix-bg { display: none; } }
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
      `}</style>
      {bgOn && <div className="uvix-bg no-print" aria-hidden="true" data-testid="app-bg" data-phase={bgState.resolved.phase || ""} style={{ backgroundImage: `url("${bgState.resolved.url}")` }} />}
      <div className={`uvix-shell uvix-layout-${navCfg.layout} uvix-density-${appearance.density || "comfortable"}${bgOn ? " uvix-has-bg" : ""}${glassOn ? " uvix-glass" : ""}`} style={{ display: "flex", minHeight: "100vh", background: bgOn ? "transparent" : THEME.surface, maxWidth: "100vw", overflowX: navCfg.layout === "top" ? "visible" : "hidden", position: "relative", zIndex: 1 }}>
        <Sidebar nav={visibleNav} navCfg={navCfg} view={view} setView={goView} user={currentUser} onLogout={logout} sidebarStyle={appearance.sidebarStyle} isOpen={sidebarOpen} onClose={() => { setSidebarOpen(false); navCfg.setEditing(false); }}
          top={<SearchTrigger onClick={() => { setSidebarOpen(false); openCmdk(); }} />} />
        {navCfg.layout === "rail" && <RailNav nav={navCfg} view={view} setView={goView} user={currentUser} onLogout={logout} onSearch={openCmdk} />}
        {navCfg.layout === "top" && <TopNav nav={navCfg} view={view} setView={goView} user={currentUser} onLogout={logout} onSearch={openCmdk} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Topbar user={currentUser} view={view} onBack={canGoBack ? goBack : null} onLogout={() => { authLogout(); setCurrentUser(null); }} onMenuClick={() => setSidebarOpen(true)} right={<><span className="uvix-mobile-only"><SearchTrigger compact onClick={openCmdk} /></span><NotificationBell n={notif} onNavigate={goView} onOpenSettings={openNotifySettings} /><CheckInButton compact={false} /></>} />
          {isAdmin && <StorageWarning onOpenSettings={view === "settings" ? null : () => setView("settings")} />}
          <div key={view} className="uvix-view-enter uvix-main-pad" style={{ padding: "20px 28px 40px" }}>
            <Suspense fallback={<ViewFallback />}>
            {view === "dashboard" && <Dashboard orders={myOrders} expenses={myTx} isAdmin={isAdmin} onNavigate={navigateWithFilter} settings={settings} onSaveSettings={persistSettings} />}
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
                onOrderLinkedToLead={linkOrderToLead}
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
                notif={notif}
                bgState={bgState}
                currentUser={currentUser}
                employees={employees}
                onSave={persistEmployees}
                onLogout={() => { authLogout(); setCurrentUser(null); }}
                isAdmin={isAdmin}
                settings={settings}
                onSaveSettings={persistSettings}
                appearance={appearance}
                onApplyAppearance={applyAppearance}
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
          </div>
        </div>
      </div>
      {taskAssign && (
        <Suspense fallback={null}>
        <TaskAssignModal
          lead={taskAssign.lead}
          kind={taskAssign.kind}
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
        onSearchOrders={(q) => navigateWithFilter("orders", { search: q })}
        onQuickAdd={(kind) => { setNavFilter(null); setView(kind === "order" ? "orders" : "expense"); setQuickAdd({ kind, n: Date.now() }); }}
        onNewLead={visibleNav.some((n) => n.key === "crm") ? () => { setNavFilter(null); setView("crm"); setQuickAdd({ kind: "lead", n: Date.now() }); } : null}
      />
      <SaveStatus />
      <BottomNav
        view={view}
        tabs={navCfg.mobileBar}
        onNavigate={(v) => { setNavFilter(null); setView(v); }}
        onMore={() => setSidebarOpen(true)}
        onQuickAdd={(kind) => { setNavFilter(null); setView(kind === "order" ? "orders" : "expense"); setQuickAdd({ kind, n: Date.now() }); }}
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
    </AttendanceGate>
  );
}
