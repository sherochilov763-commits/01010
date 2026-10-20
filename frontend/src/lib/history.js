// history.js — "Orqaga" navigatsiyasi (ekrandagi ← strelka va telefonning o'z orqaga harakati)
//
// Har bir bo'limga o'tish brauzer tarixiga yoziladi, shuning uchun:
//  • ← strelka va telefonning "orqaga" harakati oldingi bo'limga qaytaradi
//  • ochiq oyna (modal, chat, menyu) bo'lsa — avval o'shani yopadi
//  • asosiy sahifada "orqaga" ilovani yopib yubormaydi (himoya yozuvi)
import { useCallback, useEffect, useRef, useState } from "react";

let overlaySeq = 0;
let reloadUsed = false;
const H = typeof window !== "undefined" ? window.history : null;

/**
 * Bo'limlar orasida yurish.
 * @returns {{ view, go, back, canGoBack }}
 */
export function useHistoryView(initial, enabled = true) {
  const [view, setView] = useState(initial);
  const [depth, setDepth] = useState(0);
  const [from, setFrom] = useState(null); // qaysi bo'limdan kelingan (pastki menyu / «Yana»dan — null)
  const viewRef = useRef(initial);

  useEffect(() => {
    if (!enabled || !H) return;
    // Sahifa yangilansa (F5) — xodim qaysi bo'limda bo'lsa, o'sha yerda qoladi (faqat birinchi marta)
    let start = initial;
    if (!reloadUsed) {
      reloadUsed = true;
      try {
        const nav = performance.getEntriesByType?.("navigation")?.[0];
        if (nav?.type === "reload" && H.state?.uvix && typeof H.state.view === "string") start = H.state.view;
      } catch { /* eski brauzer */ }
    }
    const base = { uvix: true, view: start, depth: 0 };
    H.replaceState(base, "");
    viewRef.current = start;
    setView(start);
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
        viewRef.current = base.view;
        setView(base.view);
        setDepth(0);
        setFrom(null);
        return;
      }
      if (s.view !== viewRef.current) window.scrollTo(0, 0);
      viewRef.current = s.view;
      setView(s.view);
      setDepth(s.depth || 0);
      setFrom(s.from || null);
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

  // opts.root — pastki menyu yoki «Yana»dan o'tish: «‹ Orqaga» tugmasi chiqmaydi (telefon «orqaga»si baribir ishlaydi)
  const go = useCallback((next, opts = {}) => {
    if (!H || next === viewRef.current) return;
    const cur = H.state || {};
    const d = (cur.depth || 0) + 1;
    const fromView = opts.root ? null : viewRef.current;
    const entry = { uvix: true, view: next, depth: d, from: fromView };
    // Menyu (overlay) ochiq turgan yozuvni almashtiramiz — aks holda "orqaga" ikki marta bosilishi kerak bo'lardi
    if (cur.overlay) H.replaceState(entry, "");
    else H.pushState(entry, "");
    viewRef.current = next;
    setView(next);
    setDepth(d);
    setFrom(fromView);
    window.scrollTo(0, 0);
  }, []);

  const back = useCallback(() => H && H.back(), []);

  return { view, go, back, canGoBack: depth > 0, from };
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
