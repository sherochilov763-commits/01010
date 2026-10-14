// TelegramOnboard.jsx — kirgandan keyin «Telegram'ni ulang» oynasi (bir marta, ixtiyoriy).
// 1) taklif → 2) Telegram ochiladi, «Start» kutiladi (ilova o'zi tekshiradi) → 3) «Ulandi!».
// «Keyinroq» — 1 kundan keyin yana so'raydi, 3 martadan keyin faqat Sozlamalarda. Bot sozlanmagan bo'lsa chiqmaydi.
// Admin «Majburiy» qilsa — «Keyinroq» bo'lmaydi (adminning o'ziga hech qachon majburiy emas).
import { useEffect, useRef, useState } from "react";
import { AlarmClock, Check, KeyRound, Loader2, Send, Sparkles } from "lucide-react";
import { fetchMyTelegram, linkMyTelegram, skipMyTelegram } from "../storage.js";
import { TG_BLUE } from "./LeadSource.jsx";
import { THEME } from "../theme.js";

const BENEFITS = [
  [Sparkles, "Yangi buyurtmalar va vazifalar"],
  [AlarmClock, "Ish vaqti eslatmalari"],
  [KeyRound, "PIN unutilsa — tiklash kodi"],
];

export function TelegramOnboard({ user, onLogout, children }) {
  const [st, setSt] = useState(null); // /api/me/telegram javobi
  const [stage, setStage] = useState("offer"); // offer | wait | done | closed
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const urlRef = useRef("");
  const poll = useRef(null);

  useEffect(() => {
    let alive = true;
    setStage("offer");
    if (!user) return undefined;
    fetchMyTelegram().then((d) => { if (alive) setSt(d); }).catch(() => { if (alive) setStage("closed"); });
    return () => { alive = false; clearInterval(poll.current); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { try { window.scrollTo(0, 0); } catch { /* */ } }, [stage, st]);

  // Telegram'dan qaytganda darhol tekshiramiz (kutib o'tirmasin)
  useEffect(() => {
    if (stage !== "wait") return undefined;
    const check = async () => {
      const d = await fetchMyTelegram().catch(() => null);
      if (d?.linked) { clearInterval(poll.current); setSt(d); setStage("done"); }
    };
    poll.current = setInterval(check, 2500);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => { clearInterval(poll.current); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, [stage]);

  // «Ulandi» ekrani server endi «show:false» qaytarsa ham ko'rinib turadi
  const show = !!user && !!st && (stage === "wait" || stage === "done" || (stage === "offer" && st.onboard?.show));
  if (!show) return children;
  const required = !!st.onboard?.required;
  const first = String(user.name || "").split(" ")[0];

  async function open() {
    setErr("");
    // Oynani darhol ochamiz (Safari bosishdan keyin kechikkan window.open'ni to'sadi)
    const w = window.open("about:blank", "_blank");
    try {
      if (!urlRef.current) urlRef.current = (await linkMyTelegram()).url;
      if (w) w.location.href = urlRef.current; else window.location.href = urlRef.current;
      setStage("wait");
    } catch (e) {
      w?.close();
      urlRef.current = "";
      setErr(e.message || "Ulab bo'lmadi");
    }
  }
  async function later() {
    setBusy(true);
    await skipMyTelegram().catch(() => {});
    setBusy(false);
    setStage("closed");
  }

  const S = {
    page: { fontFamily: THEME.font, minHeight: "100dvh", boxSizing: "border-box", background: THEME.surface, color: THEME.text, display: "flex", justifyContent: "center", padding: "max(20px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom))" },
    col: { width: "min(420px, 100%)", display: "flex", flexDirection: "column", flex: "0 1 auto" },
    brand: { display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 17, padding: "8px 0" },
    mark: { width: 34, height: 34, borderRadius: 10, background: THEME.text, color: THEME.surface, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700 },
    body: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 10, padding: "16px 0" },
    icon: (bg) => ({ width: 84, height: 84, borderRadius: 24, background: bg, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }),
    h1: { fontSize: 25, fontWeight: 700, lineHeight: 1.2, margin: 0, letterSpacing: -0.3 },
    sub: { fontSize: 14.5, color: THEME.muted, lineHeight: 1.5, margin: 0, maxWidth: 320 },
    list: { width: "100%", marginTop: 14, background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 16, padding: "4px 16px", textAlign: "left" },
    row: (last) => ({ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: last ? 0 : `1px solid ${THEME.border}`, fontSize: 14.5 }),
    rowIcon: { width: 30, height: 30, borderRadius: 9, background: `${TG_BLUE}18`, color: TG_BLUE, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
    num: { width: 24, height: 24, borderRadius: "50%", background: TG_BLUE, color: "#fff", fontSize: 12.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
    primary: { height: 54, borderRadius: 15, border: 0, background: TG_BLUE, color: "#fff", fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", fontFamily: "inherit", width: "100%" },
    outline: { height: 54, borderRadius: 15, border: `1px solid ${THEME.border}`, background: THEME.card, color: TG_BLUE, fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", fontFamily: "inherit", width: "100%" },
    done: { height: 54, borderRadius: 15, border: 0, background: THEME.blueSolid, color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer", fontFamily: "inherit", width: "100%" },
    link: { border: 0, background: "none", color: THEME.muted, fontSize: 14.5, fontWeight: 600, padding: 14, cursor: "pointer", fontFamily: "inherit" },
  };

  return (
    <div data-testid="tg-onboard" data-stage={stage} style={S.page}>
      <div style={S.col}>
        <div style={S.brand}><span style={S.mark}>UV</span> UVIX</div>

        {stage === "offer" && <>
          <div style={S.body}>
            <div style={S.icon(`${TG_BLUE}1c`)}><Send size={38} color={TG_BLUE} /></div>
            <h1 style={S.h1}>Telegram'ni ulang</h1>
            <p style={S.sub}>{first ? `${first}, muhim` : "Muhim"} xabarlar to'g'ridan-to'g'ri shaxsiy Telegramingizga keladi.</p>
            <div style={S.list}>
              {BENEFITS.map(([I, t], i) => (
                <div key={t} style={S.row(i === BENEFITS.length - 1)}><span style={S.rowIcon}><I size={16} /></span>{t}</div>
              ))}
            </div>
            {required && <p style={{ ...S.sub, fontSize: 13, marginTop: 6 }}>Administrator Telegram'ni ulashni majburiy qilgan.</p>}
          </div>
          {err && <div style={{ color: THEME.rose, fontSize: 13, textAlign: "center", marginBottom: 10 }}>{err}</div>}
          <button type="button" data-testid="tg-onboard-link" style={S.primary} onClick={open}><Send size={19} /> Telegram'ni ulash</button>
          {required
            ? <button type="button" style={S.link} onClick={onLogout}>Chiqish</button>
            : <button type="button" data-testid="tg-onboard-later" style={S.link} onClick={later} disabled={busy}>{st.onboard?.last ? "Keyinroq (Sozlamalardan ulash mumkin)" : "Keyinroq"}</button>}
        </>}

        {stage === "wait" && <>
          <div style={S.body}>
            <div style={S.icon(`${TG_BLUE}1c`)}><Loader2 size={34} color={TG_BLUE} className="uvix-spin" /></div>
            <h1 style={S.h1}>Telegram'da «Start»ni bosing</h1>
            <p style={S.sub}>Ulanishni kutyapmiz…</p>
            <div style={S.list}>
              {[<>Telegram'da {st.bot ? <b>@{st.bot}</b> : "UVIX boti"} ochildi</>, <>Pastdagi <b>«Start»</b> tugmasini bosing</>, <>UVIX'ga qayting — o'zi ulanadi</>].map((t, i) => (
                <div key={i} style={S.row(i === 2)}><span style={S.num}>{i + 1}</span><span>{t}</span></div>
              ))}
            </div>
          </div>
          {err && <div style={{ color: THEME.rose, fontSize: 13, textAlign: "center", marginBottom: 10 }}>{err}</div>}
          <button type="button" style={S.outline} onClick={open}><Send size={19} /> Telegram'ni qayta ochish</button>
          {required
            ? <button type="button" style={S.link} onClick={onLogout}>Chiqish</button>
            : <button type="button" style={S.link} onClick={later} disabled={busy}>Keyinroq</button>}
        </>}

        {stage === "done" && <>
          <div style={S.body}>
            <div style={{ ...S.icon(THEME.greenBg), borderRadius: "50%", width: 96, height: 96 }}><Check size={46} color={THEME.green} strokeWidth={2.6} /></div>
            <h1 style={S.h1}>Ulandi!</h1>
            <p style={S.sub}>{st.username ? <>Telegram: <b style={{ color: THEME.text }}>@{st.username}</b><br /></> : null}Botda sizga birinchi xabar keldi.</p>
          </div>
          <button type="button" data-testid="tg-onboard-done" style={S.done} onClick={() => setStage("closed")}>Davom etish</button>
          <div style={{ height: 20 }} />
        </>}
      </div>
    </div>
  );
}
