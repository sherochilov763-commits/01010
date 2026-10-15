// approvals.jsx — tasdiqlash so'rovlari (pul ma'lumotlari himoyasi) uchun umumiy holat.
// App bir marta yuklaydi va 20 soniyada yangilaydi; To'lovlar oynasi, Buyurtmalar va admin kartasi shu yerdan oladi.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { cancelApproval, createApproval, decideApproval, fetchApprovals } from "../storage.js";

const Ctx = createContext(null);
export const useApprovals = () => useContext(Ctx);
export const ApprovalsProvider = Ctx.Provider;

export function useApprovalsState({ enabled, isAdmin, onDecided }) {
  const [list, setList] = useState([]);
  const onDecidedRef = useRef(onDecided);
  onDecidedRef.current = onDecided;
  const refresh = useCallback(async () => {
    if (!enabled) return;
    try { const r = await fetchApprovals(); setList(r.approvals || []); } catch { /* tarmoq — keyingi safar */ }
  }, [enabled]);
  useEffect(() => {
    if (!enabled) { setList([]); return undefined; }
    refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 20000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [enabled, refresh]);

  const pending = useMemo(() => list.filter((r) => r.status === "pending"), [list]);
  const request = useCallback(async (body) => { const r = await createApproval(body); await refresh(); return r.approval; }, [refresh]);
  const cancel = useCallback(async (id) => { await cancelApproval(id); await refresh(); }, [refresh]);
  const decide = useCallback(async (id, action, note) => {
    const r = await decideApproval(id, action, note);
    await refresh();
    await onDecidedRef.current?.(r);
    return r;
  }, [refresh]);
  const forOrder = useCallback((orderId) => pending.filter((r) => r.orderId === orderId), [pending]);
  const forPayment = useCallback((paymentId) => pending.find((r) => r.paymentId === paymentId) || null, [pending]);
  return useMemo(() => ({ list, pending, isAdmin, refresh, request, cancel, decide, forOrder, forPayment }), [list, pending, isAdmin, refresh, request, cancel, decide, forOrder, forPayment]);
}

export const APPROVAL_TITLE = {
  payment_edit: "to'lov summasini o'zgartirmoqchi",
  payment_delete: "to'lovni o'chirmoqchi",
  order_delete: "buyurtmani o'chirmoqchi",
  order_total: "buyurtma summasini kamaytirmoqchi",
};
export const PENDING_LABEL = {
  payment_edit: "O'zgartirish tasdiq kutmoqda",
  payment_delete: "O'chirish tasdiq kutmoqda",
  order_delete: "O'chirish so'rovi yuborilgan — admin javobini kutmoqda",
  order_total: "Summani kamaytirish tasdiq kutmoqda",
};
