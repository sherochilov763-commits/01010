// ErrorsSection.jsx — Sozlamalar → Ma'lumotlar: so'nggi xatolar (ilova va server), A3.
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { Button, Card } from "../../components/ui.jsx";
import { clearSystemErrors, fetchSystemErrors } from "../../storage.js";
import { THEME } from "../../theme.js";

const MON = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
const when = (t) => { const d = new Date(t); return `${d.getDate()}-${MON[d.getMonth()]}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export function ErrorsSection() {
  const [data, setData] = useState(null);
  const load = () => fetchSystemErrors().then(setData).catch(() => setData({ errors: [], last24h: 0 }));
  useEffect(() => { load(); }, []);
  const list = data?.errors || [];
  return (
    <Card data-testid="errors-section">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, flex: 1 }}>So'nggi xatolar</div>
        {list.length > 0 && <Button variant="ghost" onClick={() => clearSystemErrors().then(load)} data-testid="errors-clear"><Trash2 size={13} /> Tozalash</Button>}
      </div>
      <div style={{ fontSize: 12, color: THEME.muted, marginTop: 4, lineHeight: 1.45 }}>
        Ilovada yoki serverda kutilmagan xato bo'lsa, shu yerda paydo bo'ladi va sizga Telegram'da xabar keladi (bir xil xato takrorlansa — bitta xabar). Xodim aytgan xato kodini shu yerdan topasiz.
      </div>
      {data && !list.length && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: THEME.greenText }}><CheckCircle2 size={15} /> Xato qayd etilmagan</div>
      )}
      {list.length > 0 && (
        <div style={{ marginTop: 12, border: `1px solid ${THEME.border}`, borderRadius: 10, overflow: "hidden" }}>
          {list.map((e, i) => (
            <details key={e.fp} data-error={e.fp} style={{ borderTop: i ? `1px solid ${THEME.border}` : "none", padding: "10px 12px" }}>
              <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", gap: 10, alignItems: "flex-start" }}>
                <AlertTriangle size={15} color={THEME.amber} style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }}>{e.message}</span>
                  <span style={{ display: "block", fontSize: 12, color: THEME.dim, marginTop: 2 }}>
                    {[e.src === "server" ? `Server · ${e.url || ""}` : e.view || "ilova", e.user, e.dev, `${e.count} marta`, `oxirgi: ${when(e.lastAt)}`].filter(Boolean).join(" · ")}
                  </span>
                  {e.codes?.length > 0 && <span style={{ display: "inline-block", marginTop: 4, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5, fontWeight: 700, background: THEME.chip, borderRadius: 6, padding: "1px 6px" }}>{e.codes.join(" · ")}</span>}
                </span>
              </summary>
              {e.stack && <pre style={{ margin: "8px 0 0", padding: 10, borderRadius: 8, background: THEME.chip, fontSize: 11, lineHeight: 1.45, overflowX: "auto", whiteSpace: "pre-wrap", color: THEME.mutedDark }}>{e.stack}</pre>}
            </details>
          ))}
        </div>
      )}
    </Card>
  );
}
