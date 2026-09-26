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
  if (connecting) return { status: "connecting" };
  if (isConnected()) return { status: "connected" };
  if (lastError) return { status: "error", message: lastError };
  return { status: "disconnected" };
}

// Sozlamalardan (apiId, apiHash, sessionString) o'qib, ulanishni boshlaydi.
// onNewMessage(fromUserId, fromName, text, chatId) — yangi xabar kelganda chaqiriladi.
async function connectFromSettings(settings, onNewMessage) {
  onNewMessageCallback = onNewMessage;
  const apiId = parseInt(settings?.telegramUserApiId, 10);
  const apiHash = settings?.telegramUserApiHash;
  const sessionString = settings?.telegramUserSession;

  if (!apiId || !apiHash || !sessionString) {
    lastError = "Sozlamalar to'liq emas (API ID / API Hash / Session)";
    return { ok: false, error: lastError };
  }

  try {
    connecting = true;
    lastError = null;
    const session = new StringSession(sessionString);
    client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
    await client.connect();
    // Ulanishi bilan xotirani to'ldiramiz — birinchi xabardanoq ism to'g'ri chiqadi
    warmEntityCache(200);

    client.updates.on("newMessage", async (update) => {
      try {
        const msg = update.message;
        if (!msg || msg.out) return; // ozimiz yuborgan xabarni ozimiz qayta ishlamaymiz
        let sender = null;
        try { sender = await msg.getSender(); } catch { /* xotirada yo'q */ }
        if (!sender || (!sender.firstName && !sender.lastName && !sender.title && !sender.username)) {
          sender = (await resolveUser(msg.senderId ?? msg.chatId)) || sender;
        }
        const chatId = String(msg.chatId || sender?.id || "");
        // Hech narsa aniqlanmasa ham, kamida chatId'ni ko'rsatamiz — shunda bir nechta
        // "Noma'lum" birlashib ketmaydi, har biri o'zining ID'si bilan ajralib turadi.
        const { name: fromName } = describeEntity(sender, chatId);

        // Xabar matnini aniqlaymiz — rasm, ovoz va lokatsiya CRM'ning o'zida ko'rinadi/eshitiladi
        let text = msg.message || "";
        let mediaUrl = null;
        let mediaUrlAlt = null;
        let mediaType = null;
        let fileName = null;
        let fileSize = null;
        let lat = null;
        let lng = null;
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
            // Video yoki hujjat — 50 MB gacha yuklab olamiz, kattasi faqat nomi bilan ko'rsatiladi
            const doc = msg.document || msg.video;
            const size = Number(doc?.size?.toString?.() ?? doc?.size ?? 0);
            const isVideo = !!(msg.video || msg.videoNote || msg.gif);
            const nameAttr = (doc?.attributes || []).find((a) => a.className === "DocumentAttributeFilename");
            fileName = nameAttr?.fileName || (isVideo ? "video.mp4" : "fayl");
            fileSize = size || null;
            mediaType = isVideo ? "video" : "document";
            if (size && size <= MAX_DOWNLOAD) {
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
            const mediaLabel = msg.photo ? "📷 Rasm" : msg.video ? "🎥 Video" : msg.voice ? "🎤 Ovozli xabar" : msg.document ? "📎 Fayl" : "📎 Media";
            text = text ? `${mediaLabel}: ${text}` : mediaLabel;
          }
        }
        if (!text && !mediaUrl && !mediaType) text = "[Bo'sh xabar]";

        if (onNewMessageCallback) {
          onNewMessageCallback({
            chatId,
            fromName,
            username: sender?.username || "",
            phone: sender?.phone || "",
            text,
            mediaUrl,
            mediaUrlAlt,
            mediaType,
            fileName,
            fileSize,
            lat,
            lng,
            tgId: msg.id,
            replyToTgId: msg.replyTo?.replyToMsgId || null,
            date: new Date((msg.date || Date.now() / 1000) * 1000).toISOString(),
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
    lastError = e.message;
    client = null;
    return { ok: false, error: e.message };
  }
}

async function disconnect() {
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

module.exports = { connectFromSettings, disconnect, sendMessage, sendPhoto, sendVideo, sendDocument, sendVoice, sendLocation, sendReaction, getRecentMessages, getStatus, isConnected, setMediaDir, resolveChatNames };
