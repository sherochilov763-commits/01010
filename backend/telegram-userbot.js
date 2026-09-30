// telegram-userbot.js — shaxsiy Telegram akkauntga ulanib turadigan, xabarlarni
// qabul qiladigan va yuboradigan modul. MTProto (teleproto) orqali ishlaydi —
// bu Bot API emas, balki haqiqiy foydalanuvchi sessiyasi.

const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { TelegramClient, Api } = require("teleproto");
const audio = require("./audio");
const { StringSession } = require("teleproto/sessions");

let client = null;
let connecting = false;
let lastError = null;
let expired = null; // { code, message, at } — Telegram sessiyani bekor qilgan bo'lsa
let me = null; // { id, name, username, phone }
let onSessionDeadCallback = null;
let watchdog = null;

// Telegram'dagi «Qurilmalar» ro'yxatida shu nom bilan ko'rinadi — begona qurilma deb o'chirib yuborilmasin
const CLIENT_OPTS = { connectionRetries: 5, deviceModel: "UVIX CRM (server)", systemVersion: "UVIX", appVersion: "UVIX 2.0", langCode: "en", systemLangCode: "uz" };

// Sessiya butunlay yaroqsiz bo'lib qolganini bildiradigan xatolar — qayta urinishdan foyda yo'q, qayta kirish kerak
const DEAD_ERRORS = {
  AUTH_KEY_UNREGISTERED: "Telegram sessiyani bekor qilgan: telefondagi «Qurilmalar» bo'limidan o'chirilgan yoki muddati tugagan.",
  AUTH_KEY_DUPLICATED: "Bu sessiya bir vaqtda boshqa joyda ham ishlatilgan — Telegram xavfsizlik uchun uni o'chirdi.",
  AUTH_KEY_INVALID: "Sessiya kaliti yaroqsiz.",
  AUTH_KEY_PERM_EMPTY: "Sessiya kaliti yaroqsiz.",
  SESSION_REVOKED: "Sessiya akkaunt egasi tomonidan tugatilgan.",
  SESSION_EXPIRED: "Sessiya muddati tugagan.",
  USER_DEACTIVATED_BAN: "Telegram akkaunt bloklangan.",
  USER_DEACTIVATED: "Telegram akkaunt o'chirilgan.",
};
function authErrorCode(e) {
  const m = String(e?.errorMessage || e?.message || "");
  return Object.keys(DEAD_ERRORS).find((c) => m.includes(c)) || null;
}
// Sessiya o'lgan bo'lsa — ulanishni to'xtatamiz (bekorga urinib, xato ko'paytirmaymiz) va serverga xabar beramiz
function markDead(e) {
  const code = authErrorCode(e);
  if (!code) return false;
  if (!expired) {
    expired = { code, message: DEAD_ERRORS[code], at: new Date().toISOString() };
    lastError = expired.message;
    stopWatchdog();
    const c = client;
    client = null;
    me = null;
    if (c) c.disconnect().catch(() => {});
    console.warn("Telegram sessiyasi yaroqsiz:", code);
    try { onSessionDeadCallback && onSessionDeadCallback(expired); } catch (err) { console.error(err); }
  }
  return true;
}
// Foydalanuvchiga ko'rsatiladigan tushunarli (o'zbekcha) xato matni
function friendlyError(e) {
  const code = authErrorCode(e);
  if (code) return Object.assign(new Error(DEAD_ERRORS[code] + " Sozlamalardan qayta ulang."), { code: "session_expired" });
  const m = String(e?.errorMessage || e?.message || "");
  const flood = m.match(/FLOOD_WAIT_?(\d+)|wait of (\d+) seconds/i);
  if (flood) return Object.assign(new Error(`Telegram cheklovi: ${flood[1] || flood[2]} soniyadan keyin qayta urinib ko'ring.`), { code: "flood" });
  if (m.includes("PEER_ID_INVALID") || m.includes("Could not find the input entity")) return new Error("Bu suhbat Telegram'da topilmadi.");
  if (m.includes("USER_IS_BLOCKED") || m.includes("YOU_BLOCKED_USER")) return new Error("Bu foydalanuvchi bilan yozishma bloklangan.");
  if (m.includes("CHAT_WRITE_FORBIDDEN")) return new Error("Bu suhbatga yozishga ruxsat yo'q.");
  return e instanceof Error ? e : new Error(m || "Telegram xatosi");
}
function stopWatchdog() {
  if (watchdog) clearInterval(watchdog);
  watchdog = null;
}
// Har 4 daqiqada sessiya tirikligini tekshiramiz: o'lgan bo'lsa — darhol bilamiz (hech kim chat ochmasa ham),
// internet uzilgan bo'lsa — qayta ulanamiz.
function startWatchdog() {
  stopWatchdog();
  watchdog = setInterval(async () => {
    if (!client || expired || connecting) return;
    try {
      if (!client.connected) await client.connect();
      await client.invoke(new Api.updates.GetState());
    } catch (e) {
      if (!markDead(e)) console.error("Telegram tekshiruv xatosi:", e.message);
    }
  }, 4 * 60 * 1000);
  if (watchdog.unref) watchdog.unref();
}
let onNewMessageCallback = null;
let mediaDir = null; // rasmlar saqlanadigan papka (server.js tomonidan beriladi)
const MAX_DOWNLOAD = 50 * 1024 * 1024; // mijozdan kelgan video/hujjatni 50 MB gacha saqlaymiz

function setMediaDir(dir) {
  mediaDir = dir;
}

// ==================== Ism aniqlash ====================
// Telegram yangi xabarda ko'pincha faqat foydalanuvchi ID'sini yuboradi. Ism kutubxonaning
// xotirasidan (entity cache) olinadi, u esa server har qayta ishga tushganda bo'shab qoladi —
// shuning uchun oldin "Noma'lum (ID)" chiqardi. Endi xotira bo'sh bo'lsa, so'nggi suhbatlar
// ro'yxatini yuklab (getDialogs) xotirani to'ldiramiz va ismni qayta so'raymiz.
let lastWarmAt = 0;
const failedAt = new Map(); // id -> oxirgi muvaffaqiyatsiz urinish vaqti
async function warmEntityCache(limit = 200) {
  if (!client) return;
  const now = Date.now();
  if (now - lastWarmAt < 3000) return; // bir vaqtda kelgan ko'p xabarda bitta so'rov yetadi
  lastWarmAt = now;
  try {
    // Yangi mijoz yozgan zahoti uning suhbati ro'yxatning eng tepasida bo'ladi
    await client.getDialogs({ limit });
  } catch (e) {
    if (markDead(e)) return;
    console.error("Telegram suhbatlar ro'yxatini yuklab bo'lmadi:", e.message);
  }
}

async function resolveUser(id) {
  if (!client || id == null) return null;
  try {
    return await client.getEntity(id);
  } catch {
    const key = String(id);
    // Bir xil topilmaydigan ID uchun Telegram'ni daqiqasiga bir martadan ortiq bezovta qilmaymiz
    if (Date.now() - (failedAt.get(key) || 0) < 60 * 1000) return null;
    lastWarmAt = 0;
    await warmEntityCache(50);
    try {
      const e = await client.getEntity(id);
      failedAt.delete(key);
      return e;
    } catch {
      failedAt.set(key, Date.now());
      return null;
    }
  }
}

function describeEntity(entity, fallbackId) {
  const fullName = entity ? [entity.firstName, entity.lastName].filter(Boolean).join(" ").trim() : "";
  const title = entity?.title || ""; // guruh/kanal nomi
  const username = entity?.username || "";
  const phone = entity?.phone || "";
  const name = fullName || title || (username ? `@${username}` : "") || (phone ? `+${phone}` : "");
  return { name: name || `Noma'lum (${fallbackId})`, known: !!name, username, phone };
}

// Berilgan chat ID'lar uchun ism/username/telefonni aniqlaydi (eski "Noma'lum" lidlarni tuzatish uchun)
async function resolveChatNames(chatIds) {
  const out = {};
  if (!isConnected() || !chatIds?.length) return out;
  lastWarmAt = 0;
  failedAt.clear();
  await warmEntityCache(200);
  for (const id of chatIds) {
    const entity = await resolveUser(isNaN(Number(id)) ? id : Number(id));
    const info = describeEntity(entity, id);
    if (info.known) out[id] = info;
  }
  return out;
}

function isConnected() {
  return !!client && client.connected;
}

function getStatus() {
  if (expired) return { status: "expired", message: expired.message, code: expired.code, at: expired.at };
  if (connecting) return { status: "connecting" };
  if (isConnected()) return { status: "connected", me };
  if (lastError) return { status: "error", message: lastError };
  return { status: "disconnected" };
}

let selfId = "";
const TELEGRAM_SERVICE_ID = "777000"; // Telegram rasmiy xizmat xabarlari (kodlar va h.k.)

// Faqat haqiqiy odam bilan shaxsiy yozishma bo'lsa — { entity } qaytaradi, aks holda null
async function humanPeer(msg) {
  if (!msg.isPrivate) return null; // guruh va kanallar
  const chatId = String(msg.chatId ?? "");
  if (!chatId || chatId === TELEGRAM_SERVICE_ID || (selfId && chatId === selfId)) return null; // xizmat, "Saqlangan xabarlar"
  let entity = null;
  try { entity = await msg.getChat(); } catch { /* xotirada yo'q */ }
  if (!entity || (!entity.firstName && !entity.lastName && !entity.username && entity.bot === undefined)) {
    entity = (await resolveUser(msg.chatId)) || entity;
  }
  if (entity?.bot) return null; // CardXabar kabi botlar
  return { entity };
}

// Xabar mazmuni: matn, rasm, video, hujjat, ovoz, joylashuv, javob — real vaqt va tarix uchun umumiy
async function parseMessageContent(msg, maxDownload) {
  let text = msg.message || "";
  let mediaUrl = null, mediaUrlAlt = null, mediaType = null, fileName = null, fileSize = null, lat = null, lng = null;
  if (msg.media) {
    const geo = msg.media.geo;
    if (geo && typeof geo.lat === "number") {
      lat = geo.lat;
      lng = geo.long;
      mediaType = "location";
    } else if (msg.photo && mediaDir) {
      try {
        const buffer = await client.downloadMedia(msg, {});
        if (buffer) {
          const filename = `${crypto.randomBytes(12).toString("hex")}.jpg`;
          fs.writeFileSync(path.join(mediaDir, filename), buffer);
          mediaUrl = `/api/photos/${filename}`;
          mediaType = "photo";
        }
      } catch (e) {
        console.error("Rasmni yuklab olishda xato:", e.message);
      }
    } else if ((msg.video || msg.videoNote || msg.gif || (msg.document && !msg.voice && !msg.sticker)) && mediaDir) {
      // Video yoki hujjat — chegaragacha yuklab olamiz, kattasi faqat nomi bilan ko'rsatiladi
      const doc = msg.document || msg.video;
      const size = Number(doc?.size?.toString?.() ?? doc?.size ?? 0);
      const isVideo = !!(msg.video || msg.videoNote || msg.gif);
      const nameAttr = (doc?.attributes || []).find((a) => a.className === "DocumentAttributeFilename");
      fileName = nameAttr?.fileName || (isVideo ? "video.mp4" : "fayl");
      fileSize = size || null;
      mediaType = isVideo ? "video" : "document";
      if (size && size <= maxDownload) {
        try {
          const buffer = await client.downloadMedia(msg, {});
          if (buffer) {
            let ext = (path.extname(fileName) || (isVideo ? ".mp4" : "")).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10);
            if (isVideo && ![".mp4", ".webm", ".mov"].includes(ext)) ext = ".mp4";
            const filename = `${crypto.randomBytes(12).toString("hex")}${ext || ".bin"}`;
            fs.writeFileSync(path.join(mediaDir, filename), buffer);
            mediaUrl = `/api/photos/${filename}`;
          }
        } catch (e) {
          console.error("Faylni yuklab olishda xato:", e.message);
        }
      }
    } else if (msg.voice && mediaDir) {
      try {
        const buffer = await client.downloadMedia(msg, {});
        if (buffer) {
          const id = crypto.randomBytes(12).toString("hex");
          const oggPath = path.join(mediaDir, `${id}.ogg`);
          fs.writeFileSync(oggPath, buffer);
          // Ikki format: M4A (iPhone Safari) va OGG (qolgan brauzerlar) — brauzer o'zi tanlaydi
          mediaUrl = `/api/photos/${id}.ogg`;
          try {
            if (await audio.toPlayableM4a(oggPath, path.join(mediaDir, `${id}.m4a`))) {
              mediaUrlAlt = mediaUrl;
              mediaUrl = `/api/photos/${id}.m4a`;
            }
          } catch (e) {
            console.error("Ovozni o'girishda xato:", e.message);
          }
          mediaType = "voice";
        }
      } catch (e) {
        console.error("Ovozli xabarni yuklab olishda xato:", e.message);
      }
    }
    if (!mediaType) {
      const mediaLabel = msg.photo ? "📷 Rasm" : msg.video ? "🎥 Video" : msg.voice ? "🎤 Ovozli xabar" : msg.sticker ? "🙂 Stiker" : msg.document ? "📎 Fayl" : "📎 Media";
      text = text ? `${mediaLabel}: ${text}` : mediaLabel;
    }
  }
  if (!text && !mediaUrl && !mediaType) text = "[Bo'sh xabar]";
  return {
    text, mediaUrl, mediaUrlAlt, mediaType, fileName, fileSize, lat, lng,
    tgId: msg.id,
    replyToTgId: msg.replyTo?.replyToMsgId || null,
    date: new Date((msg.date || Date.now() / 1000) * 1000).toISOString(),
  };
}

// Suhbat tarixi (o'zingiz va mijoz yozganlari). knownTgIds — allaqachon saqlanganlar (qayta yuklanmaydi)
async function fetchHistory(chatId, { limit = 50, knownTgIds = new Set(), offsetId = 0 } = {}) {
  requireConnected();
  const peer = peerOf(chatId);
  const entity = await resolveUser(peer);
  if (entity?.bot) return { messages: [], isBot: true, hasMore: false };
  // offsetId berilsa — shu xabardan ESKIROQLARI (yuqoriga aylantirganda keyingi sahifa)
  const list = await client.getMessages(peer, offsetId ? { limit, offsetId } : { limit });
  const hasMore = list.length >= limit;
  const out = [];
  for (const m of list) {
    if (!m || m.className === "MessageService" || knownTgIds.has(m.id)) continue;
    // Tarix uchun yengilroq chegara: 10 MB dan katta video/hujjat faqat nomi bilan
    out.push({ out: !!m.out, ...(await parseMessageContent(m, 10 * 1024 * 1024)) });
  }
  return { messages: out.reverse(), isBot: false, hasMore };
}

// Shaxsiy suhbatlar ro'yxati (Telegram ilovasidagidek) — faqat odamlar:
// botlar, kanallar, guruhlar, "Telegram" xizmat chati va "Saqlangan xabarlar" chiqarilmaydi.
function dialogPreview(m) {
  if (!m) return "";
  const media = m.media?.className || "";
  if (media === "MessageMediaPhoto") return m.message ? `📷 ${m.message}` : "📷 Rasm";
  if (media === "MessageMediaGeo" || media === "MessageMediaGeoLive" || media === "MessageMediaVenue") return "📍 Joylashuv";
  if (media === "MessageMediaDocument") {
    const attrs = m.media.document?.attributes || [];
    if (attrs.some((a) => a.className === "DocumentAttributeAudio" && a.voice)) return "🎤 Ovozli xabar";
    if (attrs.some((a) => a.className === "DocumentAttributeSticker")) return "Stiker";
    if (attrs.some((a) => a.className === "DocumentAttributeVideo")) return m.message ? `🎥 ${m.message}` : "🎥 Video";
    const fn = attrs.find((a) => a.className === "DocumentAttributeFilename");
    return `📎 ${fn?.fileName || "Hujjat"}`;
  }
  return m.message || "";
}
async function listPrivateDialogs(limit = 300) {
  requireConnected();
  const dialogs = await client.getDialogs({ limit });
  const out = [];
  for (const d of dialogs) {
    const e = d.entity;
    if (!d.isUser || !e || e.bot || e.deleted) continue;
    const chatId = String(e.id);
    if (chatId === TELEGRAM_SERVICE_ID || (selfId && chatId === selfId) || e.self) continue;
    const info = describeEntity(e, chatId);
    const m = d.message;
    const date = m?.date ? new Date(m.date * 1000).toISOString() : null;
    out.push({ chatId, name: info.name, username: info.username, phone: info.phone, lastText: dialogPreview(m), lastOut: !!m?.out, lastDate: date, unreadCount: d.unreadCount || 0 });
  }
  return out;
}

// Bitta suhbat egasi haqida: ism, username, telefon (CRM'ga qo'lda qo'shish uchun)
async function describeChat(chatId) {
  if (!isConnected()) return null;
  const e = await resolveUser(peerOf(chatId));
  if (!e) return null;
  return { ...describeEntity(e, chatId), bot: !!e.bot, isUser: e.className === "User" };
}

// Chat ID bot/kanal ekanini aniqlaydi (eski yozuvlarni tozalash uchun)
async function isBotChat(chatId) {
  if (!isConnected()) return null;
  if (String(chatId) === TELEGRAM_SERVICE_ID) return true;
  const e = await resolveUser(peerOf(chatId));
  if (!e) return null; // aniqlab bo'lmadi — tegmaymiz
  return !!(e.bot || e.className === "Channel" || e.className === "Chat");
}

// Sozlamalardan (apiId, apiHash, sessionString) o'qib, ulanishni boshlaydi.
// onNewMessage(fromUserId, fromName, text, chatId) — yangi xabar kelganda chaqiriladi.
async function connectFromSettings(settings, onNewMessage, { session: sessionOverride, onSessionDead } = {}) {
  onNewMessageCallback = onNewMessage;
  if (onSessionDead) onSessionDeadCallback = onSessionDead;
  const apiId = parseInt(settings?.telegramUserApiId, 10);
  const apiHash = settings?.telegramUserApiHash;
  const sessionString = sessionOverride || settings?.telegramUserSession;

  if (!apiId || !apiHash || !sessionString) {
    lastError = "Telegram akkaunt ulanmagan";
    return { ok: false, error: lastError };
  }
  if (connecting) return { ok: false, error: "Ulanish davom etmoqda" };

  try {
    connecting = true;
    lastError = null;
    expired = null;
    await disconnect(); // eski ulanish qolgan bo'lsa — bir vaqtda ikkita ulanish bo'lmasin
    const session = new StringSession(sessionString);
    client = new TelegramClient(session, apiId, apiHash, CLIENT_OPTS);
    await client.connect();
    // Kalit tirikligini darhol tekshiramiz — aks holda holat «ulangan» deb ko'rinib, har so'rov xato berardi
    let self;
    try {
      self = await client.getMe();
    } catch (e) {
      connecting = false;
      if (markDead(e)) return { ok: false, expired: true, error: expired.message };
      throw e;
    }
    selfId = String(self?.id ?? "");
    me = { id: selfId, name: [self?.firstName, self?.lastName].filter(Boolean).join(" "), username: self?.username || "", phone: self?.phone || "" };
    // Ulanishi bilan xotirani to'ldiramiz — birinchi xabardanoq ism to'g'ri chiqadi
    warmEntityCache(200);
    startWatchdog();

    client.updates.on("newMessage", async (update) => {
      try {
        const msg = update.message;
        if (!msg) return;
        const peer = await humanPeer(msg);
        if (!peer) return; // bot, kanal, guruh yoki xizmat xabari — CRM'ga tushmaydi
        const chatId = String(msg.chatId);
        const content = await parseMessageContent(msg, MAX_DOWNLOAD);
        // Hech narsa aniqlanmasa ham, kamida chatId'ni ko'rsatamiz — "Noma'lum"lar birlashib ketmasin
        const { name: fromName } = describeEntity(peer.entity, chatId);
        if (onNewMessageCallback) {
          onNewMessageCallback({
            chatId,
            out: !!msg.out, // true — telefondagi Telegram'dan o'zingiz yozgan xabar
            fromName,
            username: peer.entity?.username || "",
            phone: peer.entity?.phone || "",
            ...content,
          });
        }
      } catch (e) {
        console.error("Telegram xabarni qayta ishlashda xato:", e.message);
      }
    });

    connecting = false;
    return { ok: true };
  } catch (e) {
    connecting = false;
    const c = client;
    client = null;
    if (c) c.disconnect().catch(() => {});
    if (markDead(e)) return { ok: false, expired: true, error: expired.message };
    lastError = friendlyError(e).message;
    return { ok: false, error: lastError };
  }
}

async function disconnect() {
  stopWatchdog();
  me = null;
  if (client) {
    try {
      await client.disconnect();
    } catch (e) {
      // e'tiborsiz qoldiramiz
    }
    client = null;
  }
}

function peerOf(chatId) {
  return isNaN(Number(chatId)) ? chatId : Number(chatId);
}
function requireConnected() {
  if (!isConnected()) throw new Error("Telegram akkauntga ulanmagan");
}

// Matnli xabar. Telegram'dagi xabar ID'sini qaytaradi (reaksiya va javob uchun kerak)
async function sendMessage(chatId, text, { replyTo } = {}) {
  requireConnected();
  const sent = await client.sendMessage(peerOf(chatId), { message: text, replyTo: replyTo || undefined });
  return { tgId: sent?.id ?? null };
}

async function sendPhoto(chatId, filePath, { caption, replyTo } = {}) {
  requireConnected();
  const sent = await client.sendFile(peerOf(chatId), { file: filePath, caption: caption || "", forceDocument: false, replyTo: replyTo || undefined });
  return { tgId: sent?.id ?? null };
}

// Ovozli xabar: OGG/Opus bo'lsa — haqiqiy "voice" (to'lqinli), aks holda audio-fayl
async function sendVoice(chatId, filePath, { replyTo, duration } = {}) {
  requireConnected();
  const isOgg = filePath.endsWith(".ogg");
  const sent = await client.sendFile(peerOf(chatId), {
    file: filePath,
    voiceNote: isOgg,
    attributes: isOgg ? [new Api.DocumentAttributeAudio({ voice: true, duration: duration || 0 })] : undefined,
    replyTo: replyTo || undefined,
  });
  return { tgId: sent?.id ?? null };
}

async function sendVideo(chatId, filePath, { caption, replyTo } = {}) {
  requireConnected();
  const sent = await client.sendFile(peerOf(chatId), { file: filePath, caption: caption || "", supportsStreaming: true, replyTo: replyTo || undefined });
  return { tgId: sent?.id ?? null };
}

// Hujjat: asl nomi bilan, siqilmasdan (rasm bo'lsa ham "fayl" sifatida ketadi — Telegram'dagidek)
async function sendDocument(chatId, filePath, { fileName, caption, replyTo } = {}) {
  requireConnected();
  const sent = await client.sendFile(peerOf(chatId), {
    file: filePath,
    caption: caption || "",
    forceDocument: true,
    attributes: fileName ? [new Api.DocumentAttributeFilename({ fileName })] : undefined,
    replyTo: replyTo || undefined,
  });
  return { tgId: sent?.id ?? null };
}

async function sendLocation(chatId, lat, lng, { replyTo } = {}) {
  requireConnected();
  const sent = await client.sendMessage(peerOf(chatId), {
    message: "",
    file: new Api.InputMediaGeoPoint({ geoPoint: new Api.InputGeoPoint({ lat, long: lng }) }),
    replyTo: replyTo || undefined,
  });
  return { tgId: sent?.id ?? null };
}

// Reaksiya qo'yish (emoji) yoki olib tashlash (emoji = null)
async function sendReaction(chatId, tgId, emoji) {
  requireConnected();
  await client.invoke(new Api.messages.SendReaction({
    peer: peerOf(chatId),
    msgId: Number(tgId),
    reaction: emoji ? [new Api.ReactionEmoji({ emoticon: emoji })] : [],
  }));
}

async function getRecentMessages(chatId, limit = 30) {
  if (!isConnected()) throw new Error("Telegram akkauntga ulanmagan");
  const messages = await client.getMessages(chatId, { limit });
  return messages
    .map((m) => ({
      id: String(m.id),
      text: m.message || "",
      out: !!m.out,
      date: new Date((m.date || 0) * 1000).toISOString(),
    }))
    .reverse();
}

// Telegram bilan ishlaydigan har bir funksiya: sessiya o'lgan bo'lsa — aniqlab, tushunarli xato qaytaradi
const guarded = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (e) {
    markDead(e);
    throw friendlyError(e);
  }
};
// Kirish oqimi (telegram-login.js) va boshqa modullar uchun
function clearExpired() { expired = null; lastError = null; }

module.exports = {
  listPrivateDialogs: guarded(listPrivateDialogs), describeChat: guarded(describeChat), fetchHistory: guarded(fetchHistory),
  isBotChat: guarded(isBotChat), sendMessage: guarded(sendMessage), sendPhoto: guarded(sendPhoto), sendVideo: guarded(sendVideo),
  sendDocument: guarded(sendDocument), sendVoice: guarded(sendVoice), sendLocation: guarded(sendLocation), sendReaction: guarded(sendReaction),
  getRecentMessages: guarded(getRecentMessages), resolveChatNames: guarded(resolveChatNames),
  connectFromSettings, disconnect, getStatus, isConnected, setMediaDir, clearExpired, friendlyError, authErrorCode, CLIENT_OPTS,
};
