# Chat tarixi (118-eskiz): 50 tadan yuklash, 30 kun + buyurtmali chat to'liq, Sozlamalar → «Chat tarixi»,
# uzilgan akkaunt (UVONYX) ma'lumotlarini tozalash, ro'yxatda yo'nalish/kanal filtrlari.
# Telegram ulanmagan: «Eskisini ko'rish» (Telegram'dan) mantig'i — tests/unit/chat-store.test.mjs.
import asyncio, datetime, json, os, time
from common import *  # noqa: F401,F403

UP = os.path.join(os.path.dirname(DB), "uploads")
PHONE = dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, timezone_id="Asia/Tashkent")


def put(name, size=3000):
    os.makedirs(UP, exist_ok=True)
    with open(os.path.join(UP, name), "wb") as f: f.write(b"x" * size)


def seed():
    now = datetime.datetime.now(datetime.timezone.utc)
    iso = lambda **kw: (now - datetime.timedelta(**kw)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    # Malika: 50 ta eski (40 kun) + 70 ta yangi (oxirgi 3 kun) — buyurtma bog'lanmagan
    malika = [{"id": f"o{i}", "tgId": 100 + i, "text": f"eski xabar {i}", "out": i % 2 == 1, "date": iso(days=40, minutes=-i)} for i in range(50)]
    malika[0].update({"mediaType": "photo", "mediaUrl": "/api/photos/tgchold1.jpg"})
    malika += [{"id": f"n{i}", "tgId": 200 + i, "text": f"yangi xabar {i}", "out": i % 2 == 1, "date": iso(days=3, minutes=-i * 30)} for i in range(70)]
    # Jahongir: buyurtma bog'langan — eski xabarlari ham qoladi
    jah = [{"id": f"j{i}", "tgId": 300 + i, "text": f"buyurtma haqida {i}", "out": False, "date": iso(days=60, minutes=-i)} for i in range(5)]
    jah += [{"id": "j9", "tgId": 399, "text": "Qachon tayyor bo'ladi?", "out": False, "date": iso(hours=5)}]
    onyx = [{"id": "x1", "tgId": 1, "text": "Oniks panel narxi?", "out": False, "date": iso(days=2), "mediaType": "photo", "mediaUrl": "/api/photos/tgchonyx1.jpg"},
            {"id": "x2", "tgId": 2, "text": "chizma", "out": True, "date": iso(days=2, minutes=-5), "mediaType": "photo", "mediaUrl": "/api/photos/chorder1.jpg"}]
    for n in ["tgchold1.jpg", "tgchonyx1.jpg", "chorder1.jpg"]: put(n)
    dbset("uvix:telegramMessages", {"777001": malika, "777002": jah, "on:888": onyx})
    dbset("uvix:telegramContacts", {"777001": {"name": "Malika Interior", "username": "malika_int"}, "777002": {"name": "Jahongir Tursunov", "username": "jahongir"}, "on:888": {"name": "Onyx Mijoz", "username": "onyx_m"}})
    leads = json.loads(api("/api/kv/uvix:leads", token=admin_token())["value"])
    leads.append({"id": "l2", "customer": "Jahongir Tursunov", "telegramChatId": "777002", "orderId": "o4", "stage": "won", "createdAt": iso(days=60), "createdBy": "Aziza Karimova"})
    dbset("uvix:leads", leads)
    orders = json.loads(api("/api/kv/uvix:orders", token=admin_token())["value"])
    orders[0]["photos"] = (orders[0].get("photos") or []) + [{"filename": "chorder1.jpg", "url": "/api/photos/chorder1.jpg"}]
    dbset("uvix:orders", orders)


async def main():
    seed()
    tok = admin_token()
    errs = []
    ex = lambda n: os.path.exists(os.path.join(UP, n))
    # ---------- server ----------
    t = api("/api/telegram-user/messages/777001", token=tok)
    ok("chat ochilganda — faqat so'nggi 50 ta, eskisi bor", len(t["messages"]) == 50 and t["hasOlder"] is True and t["messages"][-1]["text"] == "yangi xabar 69", (len(t["messages"]), t.get("hasOlder")))
    ok("buyurtmasiz chat: to'liq saqlanmaydi, 30 kun", t["keep"]["linked"] is False and t["keep"]["keepDays"] == 30, t.get("keep"))
    f = t["messages"][0]
    o = api(f"/api/telegram-user/messages/777001/older?beforeDate={f['date']}&beforeId={f['id']}", token=tok)
    ok("eskiroq sahifa — faqat yangi bo'lak (40 ta)", len(o["messages"]) == 40 and o["messages"][-1]["id"] == "n19" and o["hasMore"] is True, (len(o["messages"]), o["messages"][-1]["id"] if o["messages"] else None))
    j = api("/api/telegram-user/messages/777002", token=tok)
    ok("buyurtmali chat: «Buyurtma #UV-261012-001», to'liq saqlanadi", j["keep"]["linked"] is True and j["keep"]["reason"] == "Buyurtma #UV-261012-001", j.get("keep"))
    ok("eski KV kaliti jadvalga ko'chdi, KV orqali ochiq emas", api("/api/kv/uvix:telegramMessages", token=tok).get("_code") in (403, 404) and api("/api/kv/uvix:telegramMessagesBak", token=tok).get("_code") in (403, 404))
    h = api("/api/system/chat-history", token=tok)
    ok("holat: jami 128, 30 kundan eski 55, buyurtmali 5, o'chadi 50", (h["total"], h["old"], h["oldLinked"], h["willDelete"]) == (128, 55, 5, 50), {k: h.get(k) for k in ("total", "old", "oldLinked", "willDelete")})
    az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
    ok("operator: chat tarixi sozlamasi va tozalash — yo'q", api("/api/system/chat-history", token=az).get("_code") == 403 and api("/api/system/chat-history/prune", {}, az).get("_code") == 403 and api("/api/telegram-user/line-data/purge?line=UVONYX", {"confirm": True}, az).get("_code") == 403)
    ok("tasdiqsiz tozalash — rad", api("/api/telegram-user/line-data/purge?line=UVONYX", {}, tok).get("_code") == 400)

    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={"width": 1440, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        await dlogin(pg, "Administrator", "0000")
        # ---------- Chatlar: filtrlar ----------
        await nav(pg, "Chatlar"); await pg.wait_for_timeout(1500)
        rows = lambda: pg.evaluate("[...document.querySelectorAll('[data-chat]')].map(e=>e.dataset.chat)")
        ok("ro'yxat: Telegram belgisi avatarda", await pg.locator("[data-chat='777001'] [data-chan=telegram]").count() == 1)
        await pg.locator("[data-testid=chan-seg] [data-v=instagram]").click(); await pg.wait_for_timeout(300)
        ok("kanal filtri Instagram — «hali ulanmagan»", len(await rows()) == 0 and await pg.locator("text=Instagram hali ulanmagan").count() == 1)
        await pg.screenshot(path=S + "ch_filters.png")
        await pg.locator("[data-testid=chan-seg] [data-v=all]").click(); await pg.wait_for_timeout(300)
        # ---------- chat: 50 tadan, yuqoriga — eskisi ----------
        await pg.locator("[data-chat='777001']").click(); await pg.wait_for_timeout(1800)
        n0 = await pg.locator(".uc-row").count()
        ok("chat: dastlab 50 ta xabar", n0 == 50, n0)
        await pg.locator("[data-testid=older-bar] button").first.click(); await pg.wait_for_timeout(1200)
        n1 = await pg.locator(".uc-row").count()
        ok("«Eski xabarlarni yuklash» — yana 40 ta tepaga qo'shildi", n1 == 90, n1)
        await pg.wait_for_timeout(5500)
        ok("5 soniyalik yangilanish yuklangan eskilarini o'chirmaydi", await pg.locator(".uc-row").count() == 90)
        await pg.screenshot(path=S + "ch_chat.png")
        await pg.locator("[data-chat='777002']").click(); await pg.wait_for_timeout(1500)
        kb = pg.locator("[data-testid=keep-banner]")
        ok("buyurtmali chatda «📌 Buyurtma #… bog'langan — tarixi to'liq saqlanadi»", await kb.count() == 1 and "UV-261012-001" in await kb.inner_text())
        await pg.screenshot(path=S + "ch_keep.png")
        # ---------- Sozlamalar → Ma'lumotlar → Chat tarixi ----------
        await nav(pg, "Sozlamalar"); await pg.locator("[data-section=malumotlar]").click(); await pg.wait_for_timeout(1300)
        card = pg.locator("[data-testid=chat-history]")
        await card.scroll_into_view_if_needed()
        ok("«Chat tarixi»: 30 kun tanlangan, o'chadi — 50", await card.locator("[data-hkeep='30'][aria-pressed=true]").count() == 1 and "50" in await card.locator("[data-testid=ch-will]").inner_text())
        await card.locator("[data-hkeep='60']").click(); await pg.wait_for_timeout(700)
        ok("60 kun — serverda; o'chadigan yo'q (40 kunlik qoladi)", api("/api/system/chat-history", token=tok)["willDelete"] == 0 and await card.locator("[data-testid=ch-prune-open]").is_disabled())
        await card.locator("[data-hkeep='30']").click(); await pg.wait_for_timeout(700)
        await pg.screenshot(path=S + "ch_settings.png")
        await card.locator("[data-testid=ch-prune-open]").click(); await pg.wait_for_timeout(400)
        sh = pg.locator("[data-testid=ch-sheet]")
        ok("tasdiq oynasi: nima o'chadi, buyurtmali qoladi, «qaytarib bo'lmaydi»", await sh.count() == 1 and "qaytarib bo'lmaydi" in await sh.inner_text() and "qoladi" in await sh.inner_text())
        await pg.screenshot(path=S + "ch_sheet.png")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(300)
        ok("Esc — bekor, hech narsa o'chmadi", await sh.count() == 0 and len(dbmsgs()["777001"]) == 120)
        await card.locator("[data-testid=ch-prune-open]").click(); await pg.wait_for_timeout(300)
        await sh.locator("[data-testid=ch-sheet-confirm]").click(); await pg.wait_for_timeout(1500)
        ok("natija: «50 ta xabar o'chirildi»", "50 ta xabar" in await sh.locator("[data-testid=ch-sheet-done]").inner_text())
        m = dbmsgs()
        ok("bazada: Malika — 70 ta (eskilari o'chdi), Jahongir — 6 ta (buyurtmali, to'liq)", len(m["777001"]) == 70 and len(m["777002"]) == 6, (len(m["777001"]), len(m["777002"])))
        ok("eski xabarning fayli ham o'chdi", not ex("tgchold1.jpg"))
        await sh.locator("text=Yopish").last.click(); await pg.wait_for_timeout(300)
        # ---------- chat: «↑ Eskisini ko'rish» (Telegram ulanmagan — javob soxtalashtiriladi; server mantig'i unit testda) ----------
        async def thread(route):
            r = await route.fetch(); d = await r.json(); d["peek"] = True; d["hasOlder"] = False
            await route.fulfill(response=r, json=d)
        old_iso = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=45)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        async def older(route):
            assert "src=tg" in route.request.url
            await route.fulfill(json={"messages": [{"id": f"peek-{i}", "tgId": 50 + i, "peek": True, "out": i == 1, "text": t, "date": old_iso} for i, t in enumerate(["Assalomu alaykum, 3 ta peshlavha kerak", "O'lchamlarini yuboring 🙂", "120×40 sm, oniks fonda"])] + [{"id": "peek-9", "tgId": 59, "peek": True, "out": False, "text": "", "mediaType": "photo", "lazy": True, "date": old_iso}], "hasMore": False, "peek": True})
        await pg.route("**/api/telegram-user/messages/777001", thread)
        await pg.route("**/api/telegram-user/messages/777001/older*", older)
        await nav(pg, "Chatlar"); await pg.wait_for_timeout(1200)
        await pg.locator("[data-chat='777001']").click(); await pg.wait_for_timeout(1500)
        ob = pg.locator("[data-testid=older-bar]")
        await ob.scroll_into_view_if_needed()
        ok("serverdagisi tugadi: «30 kundan eskisi — Telegram'da» + «↑ Eskisini ko'rish»", "30 kundan eskisi" in await ob.inner_text() and await pg.locator("[data-testid=peek-btn]").count() == 1)
        await pg.screenshot(path=S + "ch_peek0.png")
        await pg.locator("[data-testid=peek-btn]").click(); await pg.wait_for_timeout(1000)
        ok("Telegram'dan ko'rsatildi: 4 ta (saqlanmaydi), chegara chizig'i, rasm — bosilganda", await pg.locator(".uc-row[data-peek='1']").count() == 4 and await pg.locator("[data-testid=peek-divider]").count() == 1 and await pg.locator(".uc-row[data-peek='1'] [data-testid=fetch-media]").count() == 1)
        ok("bazaga yozilmadi", len(dbmsgs()["777001"]) == 70)
        await pg.locator("[data-testid=older-bar]").scroll_into_view_if_needed()
        await pg.screenshot(path=S + "ch_peek.png")
        await pg.unroute("**/api/telegram-user/messages/777001"); await pg.unroute("**/api/telegram-user/messages/777001/older*")
        await nav(pg, "Sozlamalar"); await pg.wait_for_timeout(800)
        # ---------- Telegram akkaunt: uzilgan UVONYX ----------
        await pg.locator("[data-section=integratsiya]").click(); await pg.wait_for_timeout(1500)
        box = pg.locator("[data-testid=line-data][data-line=UVONYX]")
        await box.scroll_into_view_if_needed()
        bt = await box.inner_text()
        ok("UVONYX (ulanmagan): uzilgan akkaunt ma'lumotlari — 1 chat, 2 xabar, 7 kundan keyin", "Uzilgan akkaunt" in bt and "7 kundan keyin" in bt and "Hozir tozalash" in bt, bt)
        ok("ulanmagan UVIXPRINT kartasida ham ko'rinadi", await pg.locator("[data-testid=line-data][data-line=UVIXPRINT]").count() == 1)
        await pg.screenshot(path=S + "ch_line.png")
        await box.locator("[data-testid=line-purge-open]").click(); await pg.wait_for_timeout(400)
        ls = pg.locator("[data-testid=line-sheet]")
        await ls.locator("[data-testid=line-sheet-confirm]").click(); await pg.wait_for_timeout(1500)
        ok("tozalandi: «1 chat, 2 xabar tozalandi»", "1 chat, 2 xabar" in await ls.locator("[data-testid=line-sheet-done]").inner_text())
        ok("bazada: ONYX chati yo'q; buyurtma rasmi qoldi, chat rasmi o'chdi", "on:888" not in dbmsgs() and ex("chorder1.jpg") and not ex("tgchonyx1.jpg"))
        await ls.locator("text=Yopish").last.click(); await pg.wait_for_timeout(500)
        ok("tozalangandan keyin — quti yo'qoladi", await pg.locator("[data-testid=line-data][data-line=UVONYX]").count() == 0)
        # ---------- telefon: buyurtmali chatda sariq banner ----------
        mctx = await b.new_context(**PHONE)
        mp = await mctx.new_page(); mp.on("pageerror", lambda e: errs.append("M:" + str(e)))
        await mob_login(mp, "Administrator", "0000"); await mp.wait_for_selector(".uvix-bottomnav", timeout=15000); await mp.wait_for_timeout(1200)
        await mp.locator("[data-testid=attn-toggle]").click(); await mp.wait_for_timeout(400)
        await mp.locator("[data-attn=chats]").click(); await mp.wait_for_timeout(1500)
        if not await mp.locator("[data-testid=keep-banner]").is_visible():  # «Diqqat» boshqa javobsiz chatni ochgan bo'lishi mumkin
            if await mp.locator("[data-testid=composer-input]").is_visible():
                await mp.go_back(); await mp.wait_for_timeout(800)
            await mp.screenshot(path=S + "ch_mobile_list.png")
            await mp.locator("[data-chat='777002']").click(); await mp.wait_for_timeout(1500)
        ok("telefon: «📌 Buyurtma … — tarixi to'liq saqlanadi» banneri", await mp.locator("[data-testid=keep-banner]").is_visible())
        await mp.screenshot(path=S + "ch_mobile.png")
        ok("JS xatolari yo'q", not errs, errs)
        await b.close()
    finish()

asyncio.run(main())
