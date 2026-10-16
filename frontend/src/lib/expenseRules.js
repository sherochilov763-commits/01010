// expenseRules.js — rasxod qoidalari (rahbar sozlaydi, uvix:settings ichida):
//   bigExpenseLimit — «yirik rasxod» chegarasi (so'm; 0 — o'chiq). Yirik rasxod belgilanadi, rahbarga xabar boradi.
//   categoryLines — kategoriya → standart yo'nalish ({ "Kraska": "UVIXPRINT", "Ijara": "common" }). Hech narsani cheklamaydi:
//   rahbar yangi rasxodda kategoriyani tanlaganda yo'nalish o'zi qo'yiladi (o'zgartirish mumkin).
import { createContext, useContext } from "react";

export const ExpenseRulesContext = createContext({ limit: 0, categoryLines: {} });
export const useExpenseRules = () => useContext(ExpenseRulesContext);
export const rulesFrom = (settings) => ({ limit: Math.max(0, Number(settings?.bigExpenseLimit) || 0), categoryLines: settings?.categoryLines && typeof settings.categoryLines === "object" ? settings.categoryLines : {} });
export const isBigExpense = (t, limit) => limit > 0 && !t?.deletedAt && t?.type === "chiqim" && (Number(t.amount) || 0) >= limit;
