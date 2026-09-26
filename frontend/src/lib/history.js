// history.js — "Orqaga" navigatsiyasi (ekrandagi ← strelka va telefonning o'z orqaga harakati)
//
// Har bir bo'limga o'tish brauzer tarixiga yoziladi, shuning uchun:
//  • ← strelka va telefonning "orqaga" harakati oldingi bo'limga qaytaradi
//  • ochiq oyna (modal, chat, menyu) bo'lsa — avval o'shani yopadi
//  • asosiy sahifada "orqaga" ilovani yopib yubormaydi (himoya yozuvi)
import { useCallback, useEffect, useRef, useState } from "react";

let overlaySeq = 0;
const H = typeof window !== "undefined" ? window.history : null;

/**
 * Bo'limlar orasida yurish.
 * @returns {{ view, go, back, canGoBack }}
 */
export function useHistoryView(initial, enabled = true) {
  const [view, setView] = useState(initial);
  const [depth, setDepth] = useState(0);
  const viewRef = useRef(initial);

  useEffect(() => {
    if (!enabled || !H) return;
    const base = { uvix: true, view: initial, depth: 0 };
    H.replaceState(base, "");
    viewRef.current = initial;
    setView(initial);
    setDepth(0);

    // Himoya yozuvi foydalanuvchi birinchi marta ekranga tekkanda qo'yiladi —
    // aks holda Chrome "foydalanuvchisiz qo'shilgan" yozuvni o'tkazib yuboradi.
    let armed = false;
    const arm = () => {
      if (armed || !H.state?.uvix) return;
      armed = true;
      const cur = H.state;
      H.replaceState({ uvixGuard: true }, "");
      H.pushState(cur, "");
    };
    const onPop = (e) => {
      const s = e.state;
      if (!s || s.uvixGuard || !s.uvix) {
        // Asosiy sahifadan ham orqaga — ilovadan chiqmaymiz, asosiy sahifada qolamiz
        H.pushState(base, "");
        armed = false;
        viewRef.current = initial;
        setView(initial);
        setDepth(0);
        return;
      }
      if (s.view !== viewRef.current) window.scrollTo(0, 0);
      viewRef.current = s.view;
      setView(s.view);
      setDepth(s.depth || 0);
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("pointerdown", arm, true);
    window.addEventListener("keydown", arm, true);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("pointerdown", arm, true);
      window.removeEventListener("keydown", arm, true);
    };
  }, [enabled, initial]);

  const go = useCallback((next) => {
    if (!H || next === viewRef.current) return;
    const cur = H.state || {};
    const d = (cur.depth || 0) + 1;
    const entry = { uvix: true, view: next, depth: d };
    // Menyu (overlay) ochiq turgan yozuvni almashtiramiz — aks holda "orqaga" ikki marta bosilishi kerak bo'lardi
    if (cur.overlay) H.replaceState(entry, "");
    else H.pushState(entry, "");
    viewRef.current = next;
    setView(next);
    setDepth(d);
    window.scrollTo(0, 0);
  }, []);

  const back = useCallback(() => H && H.back(), []);

  return { view, go, back, canGoBack: depth > 0 };
}

/**
 * Ochiq oynani "orqaga" bilan yopish (modal, chat, yon menyu).
 * Oyna UI orqali yopilsa, tarixdagi qo'shimcha yozuv ham avtomatik olib tashlanadi.
 */
export function useBackToClose(open, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || !H) return;
    const id = `ov${++overlaySeq}`;
    let active = true;
    H.pushState({ ...(H.state || {}), overlay: id }, "");
    const onPop = () => {
      if (!active) return;
      if (H.state?.overlay !== id) {
        active = false;
        closeRef.current?.();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Tugma orqali yopildi va yozuvimiz hali tepada — uni olib tashlaymiz
      if (active && H.state?.overlay === id) H.back();
      active = false;
    };
  }, [open]);
}
