// perms.jsx — brauzerda huquqlar: usePerms().can("kassa.view"), can("orders.view", "all").
// Server /api/me/perms dan oladi (rahbar sozlamasi + xodimga istisno); yuklanguncha — andoza (rol bo'yicha).
// Eslatma: bu faqat ko'rinish uchun — haqiqiy tekshiruv serverda.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BY_KEY, can as canFn, resolve } from "./permissions.js";
import { fetchMyPerms } from "../storage.js";

const Ctx = createContext({ perms: null, can: () => true, viewAs: null, reload: () => {} });
export const usePerms = () => useContext(Ctx);

export const PermsContext = Ctx;
// App ichida: const permsCtx = usePermsState(currentUser, meEmp) → <PermsContext.Provider value={permsCtx}>
export function usePermsState(user, employee) {
  const [state, setState] = useState({ perms: null, viewAs: null });
  const reload = useCallback(() => {
    if (!user?.id) return;
    fetchMyPerms().then((r) => setState({ perms: r.perms || null, viewAs: r.viewAs || null })).catch(() => {});
  }, [user?.id]);
  useEffect(() => {
    setState({ perms: null, viewAs: null });
    if (!user?.id) return undefined;
    reload();
    const t = setInterval(reload, 60000);
    const vis = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("uvix:perms-changed", reload);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); window.removeEventListener("uvix:perms-changed", reload); };
  }, [user?.id, reload]);
  const perms = useMemo(() => state.perms || (user ? resolve({ ...(employee || {}), role: user.role }, {}) : null), [state.perms, user, employee]);
  const value = useMemo(() => ({
    perms, viewAs: state.viewAs, reload,
    can: (k, need) => (BY_KEY.has(k) ? canFn(perms, k, need) : true),
    scope: (k) => perms?.[k] ?? null,
  }), [perms, state.viewAs, reload]);
  return value;
}

// Menyu bo'limi → kerakli huquq (bittasi bo'lsa yetarli)
export const NAV_PERM = {
  orders: ["orders.view"], crm: ["crm.view"], chats: ["chats.view"], customers: ["customers.view"],
  expense: ["expense.add", "expense.edit"], operations: ["ops.view"], kassa: ["kassa.view"], report: ["report.view"],
  jobs: ["jobs.view"], categories: ["categories.manage"], employees: ["staff.view"], paint: ["paint.view"],
};
export const navAllowed = (key, can) => !NAV_PERM[key] || NAV_PERM[key].some((k) => can(k));
