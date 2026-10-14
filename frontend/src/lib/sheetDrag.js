// sheetDrag.js — pastki varaqni (bottom sheet) tutqichidan pastga tortib yopish.
// Tugma/havola ustida bosilganda ishlamaydi (ular odatdagidek bosiladi); siljish 6 px dan oshgandagina ushlab olinadi.
import { useRef } from "react";

export function useSheetDrag(onClose, sheetRef) {
  const st = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const el = () => sheetRef.current;

  function onPointerDown(e) {
    if (e.button > 0 || e.target.closest?.("button, a, input, select, textarea")) return;
    st.current = { y: e.clientY, t: Date.now(), dy: 0, id: e.pointerId, captured: false, target: e.currentTarget };
  }
  function onPointerMove(e) {
    const s = st.current;
    if (!s || e.pointerId !== s.id) return;
    const dy = Math.max(0, e.clientY - s.y);
    if (!s.captured) {
      if (dy < 6) return;
      s.captured = true;
      s.target.setPointerCapture?.(e.pointerId);
    }
    s.dy = dy;
    const node = el();
    if (node) { node.style.transition = "none"; node.style.transform = `translateY(${dy}px)`; }
  }
  function end() {
    const s = st.current;
    st.current = null;
    const node = el();
    if (!s || !s.captured || !node) return;
    const v = s.dy / Math.max(1, Date.now() - s.t);
    if (s.dy > 110 || (s.dy > 40 && v > 0.6)) {
      node.style.transition = "transform .18s ease-in";
      node.style.transform = "translateY(100%)";
      setTimeout(() => closeRef.current?.(), 170);
    } else {
      node.style.transition = "transform .22s cubic-bezier(.16,1,.3,1)";
      node.style.transform = "";
    }
  }
  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end };
}
