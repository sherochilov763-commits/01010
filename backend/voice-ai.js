// voice-ai.js — Ovozli ish jurnali uchun AI qatlami: ovoz → matn (STT) va matn → tartibli ma'lumot (LLM).
//
// Xizmat Railway → Variables orqali tanlanadi (kalitlar hech qachon brauzerga yuborilmaydi):
//   GEMINI_API_KEY      — Google Gemini (ovozni ham, ma'noni ham bitta xizmat qiladi)
//   OPENAI_API_KEY      — ChatGPT (ovoz: Whisper / gpt-4o-transcribe, ma'no: GPT)
//   ANTHROPIC_API_KEY   — Claude (faqat ma'no; ovoz uchun Gemini yoki OpenAI kaliti ham kerak)
//   VOICE_AI_PROVIDER   — ma'no uchun: gemini | openai | claude (bo'sh — qaysi kalit bor bo'lsa)
//   VOICE_STT_PROVIDER  — ovoz uchun: gemini | openai (bo'sh — VOICE_AI_PROVIDER yoki bor kalit)
//   VOICE_AI_MODEL, VOICE_STT_MODEL — model nomini almashtirish (ixtiyoriy)
//
// Hammasi oddiy fetch bilan — qo'shimcha kutubxona yo'q.

const DEFAULT_MODEL = { gemini: "gemini-2.5-flash", openai: "gpt-4.1-mini", claude: "claude-haiku-5-5" };
const DEFAULT_STT_MODEL = { gemini: "gemini-2.5-flash", openai: "whisper-1" };

function resolveConfig(env = process.env) {
  const keys = { gemini: env.GEMINI_API_KEY || "", openai: env.OPENAI_API_KEY || "", claude: env.ANTHROPIC_API_KEY || "" };
  const pick = (want, allowed) => {
    const w = String(want || "").trim().toLowerCase();
    if (w && allowed.includes(w) && keys[w]) return w;
    return allowed.find((p) => keys[p]) || null;
  };
  const llm = pick(env.VOICE_AI_PROVIDER, ["gemini", "openai", "claude"]);
  const stt = pick(env.VOICE_STT_PROVIDER || (llm !== "claude" ? llm : ""), ["gemini", "openai"]);
  return {
    keys,
    llm,
    stt,
    llmModel: llm ? env.VOICE_AI_MODEL || DEFAULT_MODEL[llm] : null,
    sttModel: stt ? env.VOICE_STT_MODEL || DEFAULT_STT_MODEL[stt] : null,
  };
}

async function postJson(F, url, body, headers = {}, timeoutMs = 60000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await F(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: ac.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
    return j;
  } finally { clearTimeout(t); }
}

// Javob ichidan birinchi JSON obyektni topadi (```json ... ``` yoki matn ichida bo'lsa ham)
function parseJson(text) {
  const s = String(text || "").trim();
  try { return JSON.parse(s); } catch { /* quyida */ }
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* quyida */ } }
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* bo'sh */ } }
  return null;
}

const STT_PROMPT = "Bu ovozli xabarni so'zma-so'z matnga aylantir. Til odatda o'zbekcha (lotin yozuvida yoz), ba'zan ruscha so'zlar aralashadi — ularni ham eshitilganidek yoz. Raqam va summalarni raqam bilan yoz (masalan 450 ming → 450 000). Faqat matnni qaytar, izohsiz.";

function createAi({ env = process.env, fetchImpl } = {}) {
  const F = fetchImpl || ((...a) => fetch(...a)); // testlarda soxta fetch beriladi
  const cfg = () => resolveConfig(env);

  async function transcribe(buffer, mime = "audio/ogg") {
    const c = cfg();
    if (!c.stt) throw Object.assign(new Error("Ovozni matnga o'girish xizmati sozlanmagan"), { code: "no_stt" });
    if (c.stt === "gemini") {
      const j = await postJson(F, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.sttModel)}:generateContent`, {
        contents: [{ parts: [{ inline_data: { mime_type: mime, data: Buffer.from(buffer).toString("base64") } }, { text: STT_PROMPT }] }],
        generationConfig: { temperature: 0 },
      }, { "x-goog-api-key": c.keys.gemini }, 90000);
      return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    }
    // OpenAI
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mime }), mime.includes("ogg") ? "voice.ogg" : "voice.m4a");
    form.append("model", c.sttModel);
    form.append("prompt", "UVIX ish jurnali. O'zbekcha: buyurtma, mijoz, dona, so'm, ming, million, montaj, pechat, lazer, viveska.");
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 90000);
    try {
      const r = await F("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${c.keys.openai}` }, body: form, signal: ac.signal });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
      return String(j.text || "").trim();
    } finally { clearTimeout(t); }
  }

  async function complete(system, user) {
    const c = cfg();
    if (!c.llm) throw Object.assign(new Error("AI xizmati sozlanmagan"), { code: "no_llm" });
    if (c.llm === "gemini") {
      const j = await postJson(F, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.llmModel)}:generateContent`, {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }, { "x-goog-api-key": c.keys.gemini });
      return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    }
    if (c.llm === "openai") {
      const j = await postJson(F, "https://api.openai.com/v1/chat/completions", {
        model: c.llmModel, temperature: 0.1, response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }, { Authorization: `Bearer ${c.keys.openai}` });
      return j.choices?.[0]?.message?.content || "";
    }
    const j = await postJson(F, "https://api.anthropic.com/v1/messages", {
      model: c.llmModel, max_tokens: 2000, temperature: 0.1, system,
      messages: [{ role: "user", content: user }],
    }, { "x-api-key": c.keys.claude, "anthropic-version": "2023-06-01" });
    return (j.content || []).map((p) => p.text || "").join("");
  }

  async function extract(system, user) {
    const raw = await complete(system, user);
    const json = parseJson(raw);
    if (!json) throw Object.assign(new Error("AI javobini o'qib bo'lmadi"), { code: "bad_json", raw });
    return json;
  }

  return {
    transcribe,
    extract,
    status: () => { const c = cfg(); return { llm: c.llm, stt: c.stt, llmModel: c.llmModel, sttModel: c.sttModel, ready: !!c.llm, voice: !!c.stt }; },
  };
}

// Ovozli yordamchidan kim foydalanadi: VOICE_LOG_OWNERS=<id,id> yoki barcha rahbarlar (role = admin)
function voiceOwners(employees = [], env = process.env) {
  const only = String(env.VOICE_LOG_OWNERS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return (employees || []).filter((e) => e && !e.deletedAt && !e.archived && (only.length ? only.includes(e.id) : e.role === "admin"));
}

module.exports = { createAi, resolveConfig, parseJson, voiceOwners };
