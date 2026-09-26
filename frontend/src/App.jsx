import { useEffect, useState } from "react";
import LoginScreen from "./auth/LoginScreen.jsx";
import { WorkerApp } from "./views/tasks/WorkerApp.jsx";
import { TaskAssignModal } from "./views/crm/TaskAssignModal.jsx";
import { authListEmployees, authLogout, confirmPinReset, connectTelegramUser, deletePhoto, disconnectTelegramUser, fetchTelegramChats, fetchTelegramMessages, fetchTelegramUserStatus, markTelegramChatRead, requestPinReset, sendBackupNow, sendTelegramUserMessage, uploadPhotos } from "./storage.js";
import { Sidebar, Topbar } from "./components/Layout.jsx";
import { BottomNav, BOTTOM_NAV_CSS } from "./components/BottomNav.jsx";
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, LEAD_STAGES, NAV, isWorkerRole } from "./constants.js";
import { generateOrderNumber } from "./lib/finance.js";
import { money, paymentTypeLabel, uid } from "./lib/format.js";
import { storageGet, storageSet } from "./lib/kv.js";
import { useBackToClose, useHistoryView } from "./lib/history.js";
import { DEFAULT_APPEARANCE, THEME, setTheme, buildTheme } from "./theme.js";
import { CategoriesView } from "./views/CategoriesView.jsx";
import { Dashboard } from "./views/Dashboard.jsx";
import { EmployeesView } from "./views/EmployeesView.jsx";
import { OperationsView } from "./views/OperationsView.jsx";
import { ReportView } from "./views/ReportView.jsx";
import { CRMView } from "./views/crm/CRMView.jsx";
import { ChatsView } from "./views/crm/ChatsView.jsx";
import { ExpenseView } from "./views/expenses/ExpenseView.jsx";
import { OrdersView } from "./views/orders/OrdersView.jsx";
import { SettingsView } from "./views/settings/SettingsView.jsx";

export default function App() {
  const [ready, setReady] = useState(false);
  const [transactions, setTransactions] = useState([]); // faqat rasxod (chiqim)
  const [orders, setOrders] = useState([]); // buyurtmalar (har birida payments[])
  const [leads, setLeads] = useState([]); // CRM — savdo voronkasi lidlari
  const [pendingLeadForOrder, setPendingLeadForOrder] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);
  const [currentUser, setCurrentUser] = useState(null);
  // Bo'limlar tarixi: ← strelka va telefonning "orqaga" harakati oldingi bo'limga qaytaradi
  const { view, go: setView, back: goBack, canGoBack } = useHistoryView("dashboard", !!currentUser && !isWorkerRole(currentUser.role));
  const [navFilter, setNavFilter] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useBackToClose(sidebarOpen, () => setSidebarOpen(false));
  const [quickAdd, setQuickAdd] = useState(null); // {kind: "order"|"expense", n} — pastki "+" tugmasidan

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
        const appr = await storageGet("uvix:appearance", false, null);
        if (appr) { setTheme(buildTheme(appr)); setAppearance(appr); }
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
      let appr = await storageGet("uvix:appearance", false, null);
      if (!appr) {
        appr = DEFAULT_APPEARANCE;
      }
      setTheme(buildTheme(appr));
      setTransactions(tx);
      setOrders(ords);
      setAuditLog(log);
      setLeads(leadsData);
      setCategories(cats);
      setSettings(sett);
      setAppearance(appr);
    })();
  }, [currentUser]);

  function applyAppearance(next) {
    setTheme(buildTheme(next));
    setAppearance(next);
    storageSet("uvix:appearance", false, next);
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  async function persistSettings(next) {
    setSettings(next);
    await storageSet("uvix:settings", true, next);
  }

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
    showToast(isEdit ? "Yangilandi" : "Saqlandi");
  }
  function deleteTransaction(tx) {
    const next = transactions.map((t) => (t.id === tx.id ? { ...t, deletedAt: new Date().toISOString(), deletedBy: currentUser.name } : t));
    persistTx(next);
    addLog(`Rasxod chiqindi qutisiga o'tkazildi: ${money(tx.amount)} (${tx.date})`);
    showToast("Chiqindi qutisiga o'tkazildi");
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
    showToast(isEdit ? "Yangilandi" : "Saqlandi");
  }
  function deleteOrder(order) {
    const next = orders.map((o) => (o.id === order.id ? { ...o, deletedAt: new Date().toISOString(), deletedBy: currentUser.name } : o));
    persistOrders(next);
    addLog(`Buyurtma chiqindi qutisiga o'tkazildi: ${order.orderNumber}`);
    showToast("Chiqindi qutisiga o'tkazildi");
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
      next = leads.map((l) => (l.id === lead.id ? lead : l));
      addLog(`Lid tahrirlandi: ${lead.customer}`);
    } else {
      lead.createdBy = currentUser.name;
      lead.createdAt = new Date().toISOString();
      next = [lead, ...leads];
      addLog(`Yangi lid qo'shildi: ${lead.customer}`);
    }
    persistLeads(next);
    showToast(isEdit ? "Yangilandi" : "Saqlandi");
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

  // CRM yoki Chatlar ochiq turganda dizayner/pechatchi o'zgarishlarini ko'rib turish uchun
  useEffect(() => {
    if (!currentUser || isWorkerRole(currentUser.role) || (view !== "crm" && view !== "chats")) return;
    const refresh = async () => {
      const fresh = await storageGet("uvix:leads", true, null);
      if (Array.isArray(fresh)) setLeads(fresh);
    };
    const t = setInterval(refresh, 20000);
    return () => clearInterval(t);
  }, [view, currentUser]);

  function moveLead(lead, newStage) {
    if (newStage === "design" && !lead.design?.assigneeId) return setTaskAssign({ lead, kind: "design", targetStage: newStage });
    if (newStage === "printing" && !lead.print?.assigneeId) return setTaskAssign({ lead, kind: "print", targetStage: newStage });
    const next = leads.map((l) => {
      if (l.id !== lead.id) return l;
      const upd = { ...l, stage: newStage };
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
    showToast("Chiqindi qutisiga o'tkazildi");
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

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: THEME.surface, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
        <style>{`@keyframes uvixPulse { 0%,100% { opacity: 0.55; transform: scale(0.94); } 50% { opacity: 1; transform: scale(1); } }`}</style>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: `linear-gradient(135deg, ${THEME.violet}, ${THEME.cyan})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "uvixPulse 1.1s ease-in-out infinite",
          }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>UV</span>
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
    return <WorkerApp currentUser={currentUser} onLogout={() => { authLogout(); setCurrentUser(null); }} />;
  }

  const isAdmin = currentUser.role === "admin";
  const visibleNav = NAV.filter((n) => !n.adminOnly || isAdmin);
  const activeTransactions = transactions.filter((t) => !t.deletedAt);
  const activeOrders = orders.filter((o) => !o.deletedAt);
  const myTx = isAdmin ? activeTransactions : activeTransactions.filter((t) => t.createdBy === currentUser.name);
  const myOrders = isAdmin ? activeOrders : activeOrders.filter((o) => o.createdBy === currentUser.name);

  return (
    <div style={{ fontFamily: THEME.font, color: THEME.text, minHeight: "100vh" }}>
      <style>{`
        html, body { overflow-x: hidden; max-width: 100vw; overscroll-behavior-x: none; }
        * { box-sizing: border-box; }
        .uvix-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
        .uvix-scroll::-webkit-scrollbar-thumb { background: #D8D4E8; border-radius: 4px; }
        .uvix-scroll::-webkit-scrollbar-thumb:hover { background: #C4BEDD; }
        body { background: ${THEME.surface}; }
        button { font-family: inherit; }
        input, select, textarea { font-family: inherit; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: ${THEME.violet} !important; box-shadow: 0 0 0 3px rgba(124,92,252,0.15); }
        button { transition: transform 0.12s ease, box-shadow 0.15s ease, opacity 0.15s ease, background-color 0.15s ease, border-color 0.15s ease; }
        button:active:not(:disabled) { transform: scale(0.97); }
        .uvix-card { transition: box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease; }
        .uvix-card:hover { box-shadow: 0 6px 20px rgba(28,24,48,0.07); border-color: #DCD6EE; }
        .uvix-metric:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(28,24,48,0.09); border-color: #DCD6EE; }
        .uvix-row { transition: background-color 0.12s ease; }
        .uvix-row:hover { background-color: #FAF9FE; }
        .uvix-iconbtn { transition: background-color 0.15s ease, transform 0.15s ease; }
        .uvix-iconbtn:hover { background-color: #ECE7F8; transform: translateY(-1px); }
        .uvix-nav-item { transition: background-color 0.18s ease, color 0.18s ease, border-color 0.18s ease, padding-left 0.18s ease; }
        .uvix-nav-item:hover:not(.uvix-nav-active) { background: rgba(255,255,255,0.06); color: #E5E1F5; padding-left: 15px; }
        .uvix-btn-primary { box-shadow: 0 2px 8px rgba(124,92,252,0.30); }
        .uvix-btn-primary:hover:not(:disabled) { box-shadow: 0 6px 16px rgba(124,92,252,0.40); transform: translateY(-1px); }
        .uvix-btn-ghost:hover:not(:disabled) { background: #FAF9FE; border-color: #CFC7E8 !important; }
        .uvix-btn-danger:hover:not(:disabled) { background: #FBDCE3; }
        .uvix-modal-backdrop { animation: uvixFadeIn 0.15s ease; }
        .uvix-modal-panel { animation: uvixScaleIn 0.18s cubic-bezier(0.16,1,0.3,1); }
        .uvix-modal-shake { animation: uvixShake 0.35s ease !important; }
        @keyframes uvixShake { 10%, 90% { transform: translateX(-1px); } 20%, 80% { transform: translateX(2px); } 30%, 50%, 70% { transform: translateX(-4px); } 40%, 60% { transform: translateX(4px); } }
        @keyframes uvixFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes uvixScaleIn { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes uvixSlideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .uvix-toast { animation: uvixSlideUp 0.22s cubic-bezier(0.16,1,0.3,1); }
        .uvix-view-enter { animation: uvixFadeIn 0.22s ease; }
        .uvix-skeleton { background: linear-gradient(90deg, ${THEME.border} 25%, ${THEME.card} 37%, ${THEME.border} 63%); background-size: 400% 100%; animation: uvixShimmer 1.4s ease infinite; border-radius: 8px; }
        @keyframes uvixShimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
        .uvix-chip { transition: all 0.15s ease; }
        .uvix-chip:hover { border-color: ${THEME.violet} !important; }
        .uvix-login-item { transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease; }
        .uvix-login-item:hover { background: rgba(255,255,255,0.09) !important; border-color: rgba(255,255,255,0.22) !important; transform: translateY(-1px); }
        /* Dashboard — zamonaviy fintech uslubi: katta yumaloq burchaklar, yengil soya */
        .uvix-dash-card { border-radius: 22px !important; box-shadow: ${THEME.shadowSm} !important; }
        .uvix-dash-card:hover { box-shadow: ${THEME.shadowMd} !important; }
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
            box-shadow: 0 0 40px rgba(0,0,0,0.35);
          }
          .uvix-sidebar-open { transform: translateX(0) !important; }
          .uvix-sidebar-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.4);
            z-index: 190;
          }
        }
        /* Dashboard'ning 12-ustunli grid'i tor ekranlarda 2 ustun, keyin 1 ustunga siqiladi */
        @media (max-width: 680px) {
          .uvix-dash-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .uvix-dash-grid > div { grid-column: span 2 !important; }
        }
        @media (max-width: 420px) {
          .uvix-dash-grid { grid-template-columns: 1fr !important; }
          .uvix-dash-grid > div { grid-column: span 1 !important; }
        }
        /* Forma ichidagi 2-ustunli grid'lar (Field'lar) tor ekranda 1 ustunga tushadi */
        @media (max-width: 560px) {
          [style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
          [style*="grid-template-columns: 1.2fr 0.8fr 0.8fr auto"] { grid-template-columns: 1fr !important; }
        }
        /* Pastki menyu — oxirida turishi shart, hamburger qoidasini bekor qiladi */
        ${BOTTOM_NAV_CSS}
      `}</style>
      <div className={`uvix-density-${appearance.density || "comfortable"}`} style={{ display: "flex", minHeight: "100vh", background: THEME.surface, maxWidth: "100vw", overflowX: "hidden" }}>
        <Sidebar nav={visibleNav} view={view} setView={(v) => { setNavFilter(null); setView(v); }} user={currentUser} onLogout={() => { authLogout(); setCurrentUser(null); }} sidebarStyle={appearance.sidebarStyle} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Topbar user={currentUser} view={view} onBack={canGoBack ? goBack : null} onLogout={() => { authLogout(); setCurrentUser(null); }} onMenuClick={() => setSidebarOpen(true)} />
          <div key={view} className="uvix-view-enter uvix-main-pad" style={{ padding: "20px 24px 40px" }}>
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
                onOrderLinkedToLead={linkOrderToLead}
              />
            )}
            {view === "crm" && (
              <CRMView
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
                onFetchMessages={fetchTelegramMessages}
                onSendMessage={sendTelegramUserMessage}
                onMarkRead={markTelegramChatRead}
                onMoveLead={moveLead}
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
          </div>
        </div>
      </div>
      {taskAssign && (
        <TaskAssignModal
          lead={taskAssign.lead}
          kind={taskAssign.kind}
          employees={employees}
          onSave={saveTaskAssignment}
          onCancel={() => setTaskAssign(null)}
        />
      )}
      <BottomNav
        view={view}
        onNavigate={(v) => { setNavFilter(null); setView(v); }}
        onMore={() => setSidebarOpen(true)}
        onQuickAdd={(kind) => { setNavFilter(null); setView(kind === "order" ? "orders" : "expense"); setQuickAdd({ kind, n: Date.now() }); }}
      />
      {toast && (
        <div className="uvix-toast" style={{ position: "fixed", bottom: 20, right: 20, background: THEME.ink, color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", zIndex: 200, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: THEME.cyan, boxShadow: `0 0 8px ${THEME.cyan}` }} />
          {toast}
        </div>
      )}
    </div>
  );
}
