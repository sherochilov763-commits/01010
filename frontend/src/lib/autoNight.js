// autoNight.js — avtomatik tungi mavzu: qurilmaga mos (prefers-color-scheme) yoki soat bo'yicha jadval.
import { useEffect, useState } from "react";
import { isNightNow } from "../theme.js";

const DARK_Q = "(prefers-color-scheme: dark)";
const systemDark = () => typeof window !== "undefined" && !!window.matchMedia?.(DARK_Q).matches;

export function useAutoNight(appr) {
  const mode = appr?.autoDark || "off";
  const [, tick] = useState(0);
  useEffect(() => {
    if (mode === "system") {
      const mq = window.matchMedia?.(DARK_Q);
      if (!mq) return undefined;
      const on = () => tick((x) => x + 1);
      mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
      return () => (mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on));
    }
    if (mode === "schedule") {
      // daqiqa chegarasida tekshiramiz; ilovaga qaytganda ham darhol yangilanadi
      const t = setInterval(() => tick((x) => x + 1), 30000);
      const vis = () => document.visibilityState === "visible" && tick((x) => x + 1);
      document.addEventListener("visibilitychange", vis);
      return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
    }
    return undefined;
  }, [mode]);
  return isNightNow(appr, new Date(), mode === "system" && systemDark());
}
