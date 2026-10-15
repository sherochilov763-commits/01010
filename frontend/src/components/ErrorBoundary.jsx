// ErrorBoundary.jsx — oq ekran o'rniga tushunarli oyna (A3): «Qayta yuklash», «Bosh sahifaga», xato kodi.
// Saqlangan ma'lumotlar xavfsiz: qayta yuklashdan oldin saqlanmagan o'zgarishlar yuborilishi kutiladi.
import { Component } from "react";
import { reportError } from "../lib/errors.js";
import { hasUnsaved } from "../lib/kv.js";
import { THEME } from "../theme.js";

function reloadSafely() {
  if (!hasUnsaved()) return window.location.reload();
  const t = setInterval(() => { if (!hasUnsaved()) { clearInterval(t); window.location.reload(); } }, 400);
  setTimeout(() => { clearInterval(t); window.location.reload(); }, 8000);
}

export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null, code: "" }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    const code = reportError(error, { componentStack: info?.componentStack, kind: "react" });
    this.setState({ code: code || "" });
  }
  render() {
    if (!this.state.error) return this.props.children;
    const full = !this.props.inline;
    const T = THEME;
    const btn = (primary) => ({ height: 44, padding: "0 18px", borderRadius: 12, border: primary ? 0 : `1px solid ${T.border2}`, background: primary ? T.primarySolid : T.card, color: primary ? "#fff" : T.text, fontSize: 14.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
    return (
      <div role="alert" data-testid="error-screen" style={{ minHeight: full ? "100vh" : 320, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: full ? T.surface : "transparent", color: T.text, fontFamily: T.font }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, margin: "0 auto", background: T.amberBg, color: T.amberText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700 }}>!</div>
          <div style={{ fontSize: 21, fontWeight: 700, marginTop: 16 }}>Nimadir xato ketdi</div>
          <div style={{ fontSize: 14.5, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
            Saqlangan ma'lumotlaringiz joyida. Sahifani qayta yuklang — muammo takrorlansa, administratorga xato kodini ayting. Administrator xabardor qilindi.
          </div>
          {this.state.code && <div data-testid="error-code" style={{ display: "inline-block", marginTop: 14, padding: "6px 12px", borderRadius: 8, background: T.chip, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>Xato kodi: {this.state.code}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
            <button type="button" style={btn(true)} onClick={reloadSafely} data-testid="error-reload">Qayta yuklash</button>
            {this.props.onHome && <button type="button" style={btn(false)} onClick={() => { this.setState({ error: null, code: "" }); this.props.onHome(); }} data-testid="error-home">Bosh sahifaga</button>}
          </div>
        </div>
      </div>
    );
  }
}
