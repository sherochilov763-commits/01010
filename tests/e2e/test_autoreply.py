# Chatlar: avtojavoblar (114/115-eskizlar) — Sozlamalar kartasi, ro'yxat tepasidagi belgi, «AI» vositasi, xabardagi 🤖 belgi.
# Telegram ulanmagan: yuborish mantig'i unit testda (tests/unit/auto-reply.test.mjs); bu yerda — UI, saqlash va huquqlar.
import asyncio, datetime, json
from common import *  # noqa: F401,F403

PHONE = dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, timezone_id="Asia/Tashkent")


def extra_state():
    now = datetime.datetime.now(datetime.timezone.utc)
    iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    ago = lambda **kw: iso(now - datetime.timedelta(**kw))
    dbset("uvix:telegramMessages", {
        "777001": [{"id": "m1", "tgId": 1, "text": "Assalomu alaykum, narxi qancha?", "out": False, "date": ago(hours=3)},
                   {"id": "m2", "tgId": 2, "text": "O'lchamlarini yuboring.", "out": True, "date": ago(hours=2)}],
        # Dilshod: mijoz yozgan, avtojavob ketgan — chat baribir «Javob kutmoqda»
        "777002": [{"id": "m4", "tgId": 4, "text": "Salom, peshlavha qilasizlarmi?", "out": False, "date": ago(minutes=40)},
                   {"id": "m5", "tgId": 5, "text": "Rahmat, xabaringiz qabul qilindi! Ertalab 09:00 da menejerimiz javob beradi.", "out": True, "auto": "away", "date": ago(minutes=40)}],
    })
    dbset("uvix:telegramContacts", {"777001": {"name": "Malika Interior", "username": "malika_int"}, "777002": {"name": "Dilshod Karimov", "username": "dilshod"}})


async def main():
    extra_state()
    errs = []
    tok = admin_token()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---------- server: standart holat va himoya ----------
        st = api("/api/auto-reply", token=tok)
        ok("standart: avtojavob o'chiq, «javob kechiksa» o'chiq", st["config"]["on"] is False and st["config"]["rules"]["late"]["on"] is False and st["canEdit"] is True, st.get("config"))
        ok("ONYX uchun alohida matn", "ONYX" in st["config"]["rules"]["greet"]["texts"]["UVONYX"] and "UVIX" in st["config"]["rules"]["greet"]["texts"]["UVIXPRINT"])
        az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
        ok("operator: ko'radi, lekin o'zgartira olmaydi", api("/api/auto-reply", token=az).get("canEdit") is False and api("/api/auto-reply", {"config": {"on": True}}, az, method="PUT").get("_code") == 403)
        kv = api("/api/kv/uvix:autoReply", token=tok)
        ok("ichki kalit — KV orqali ochiq emas", kv.get("_code") in (403, 404), kv)

        # ---------- kompyuter: ro'yxat tepasidagi belgi ----------
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}, timezone_id="Asia/Tashkent")
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        await dlogin(pg, "Administrator", "0000")
        await nav(pg, "Chatlar"); await pg.wait_for_timeout(1500)
        chip = pg.locator("[data-testid=ar-chip]")
        ok("ro'yxat tepasida belgi: «Avtojavob: o'chiq»", "o'chiq" in await chip.inner_text())
        row = pg.locator("[data-chat='777002']")
        ok("avtojavob ketgan chat: «🤖 …» va baribir «Javob kutmoqda»", "🤖" in await row.inner_text() and await row.get_attribute("data-waiting") == "1", await row.inner_text())
        await chip.click(); await pg.wait_for_timeout(300)
        ok("bosilsa — oyna: asosiy o'chirgich + 3 qoida", await pg.locator("[data-testid=ar-pop] [role=switch]").count() == 4)
        await pg.locator("[data-testid=ar-pop-on]").click(); await pg.wait_for_timeout(500)
        await pg.locator("[data-testid=ar-pop-away]").click(); await pg.wait_for_timeout(700)
        cfg = api("/api/auto-reply", token=tok)["config"]
        ok("oynadan yoqildi — serverda saqlandi", cfg["on"] is True and cfg["rules"]["away"]["on"] is True and cfg["rules"]["greet"]["on"] is False, cfg)
        ok("belgi: «yoqilgan»", "yoqilgan" in await chip.inner_text())
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)

        # ---------- xabardagi 🤖 belgi va «AI» vositasi ----------
        await row.click(); await pg.wait_for_timeout(1500)
        badge = pg.locator("[data-testid=auto-badge]")
        ok("xabarda «🤖 Avtojavob · ish vaqtidan tashqari»", await badge.count() == 1 and "ish vaqtidan tashqari" in await badge.inner_text())
        await pg.locator("[data-testid=tool-rail] [data-tool=ai]").click(); await pg.wait_for_timeout(800)
        ca = pg.locator("[data-testid=chat-auto]")
        ok("AI vositasi: shu mijozga yuborilgan avtojavob", "Ish vaqtidan tashqari" in await ca.inner_text())
        await pg.screenshot(path=S + "ar_chat.png")
        await pg.locator("[data-testid=chat-auto-toggle]").click(); await pg.wait_for_timeout(700)
        ok("«Bu chatda avtojavob» o'chirildi — serverda", api("/api/auto-reply/chat/777002", token=tok).get("off") is True)
        ok("operator ham ko'radi (o'z yo'nalishi)", api("/api/auto-reply/chat/777002", token=az).get("off") is True)

        # ---------- Sozlamalar kartasi ----------
        await chip.click(); await pg.wait_for_timeout(300)
        await pg.locator("[data-testid=ar-open-settings]").click(); await pg.wait_for_timeout(1500)
        card = pg.locator("[data-testid=auto-replies]")
        ok("«Matnlarni o'zgartirish →» — Sozlamalardagi kartaga olib boradi", await card.is_visible())
        ok("ish vaqti mavjud sozlamadan: Du–Sh 09:00–19:00", "Du–Sh 09:00–19:00" in await card.inner_text(), (await card.inner_text())[:400])
        grule = card.locator("[data-rule=greet]")
        await grule.locator("[data-line=UVONYX]").click()
        await grule.locator("[data-testid=ar-text-greet]").fill("Assalomu alaykum! ONYX — oniks panellar. Rasm yuboring.")
        await card.locator("[data-testid=ar-rule-greet]").click()
        await card.locator("[data-testid=ar-save]").click(); await pg.wait_for_timeout(900)
        cfg = api("/api/auto-reply", token=tok)["config"]
        ok("matn (ONYX) va qoida saqlandi, UVIX matni o'zgarmadi", cfg["rules"]["greet"]["on"] is True and cfg["rules"]["greet"]["texts"]["UVONYX"].startswith("Assalomu alaykum! ONYX —") and "UVIX'ga" in cfg["rules"]["greet"]["texts"]["UVIXPRINT"], cfg["rules"]["greet"])
        await card.locator("[data-testid=ar-test-greet]").click(); await pg.wait_for_timeout(1200)
        ok("«Sinab ko'rish»: Telegram ulanmagan — tushunarli xato", "ulanmagan" in (await card.inner_text()).lower())
        await card.scroll_into_view_if_needed(); await pg.screenshot(path=S + "ar_settings.png")

        # ---------- operator: oynada o'chirgichlar faol emas ----------
        c2 = await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")
        op = await c2.new_page(); op.on("pageerror", lambda e: errs.append(str(e)))
        await dlogin(op, "Aziza", "1234")
        await nav(op, "Chatlar"); await op.wait_for_timeout(1500)
        await op.locator("[data-testid=ar-chip]").click(); await op.wait_for_timeout(300)
        ok("operator: oynada o'chirgichlar faol emas, havola yo'q", await op.locator("[data-testid=ar-pop-on]").is_disabled() and await op.locator("[data-testid=ar-open-settings]").count() == 0)

        # ---------- telefon ----------
        m = await b.new_context(**PHONE)
        mp = await m.new_page(); mp.on("pageerror", lambda e: errs.append(str(e)))
        await mob_login(mp, "Administrator", "0000"); await mp.wait_for_selector(".uvix-bottomnav", timeout=15000); await mp.wait_for_timeout(1500)
        await mp.locator("[data-testid=attn-toggle]").click(); await mp.wait_for_timeout(400)
        await mp.locator("[data-attn=chats]").click(); await mp.wait_for_timeout(1500)
        ok("telefon: ro'yxat tepasida belgi", await mp.locator("[data-testid=ar-chip]").is_visible())
        if not await mp.locator("[data-testid=composer-input]").is_visible():  # «Diqqat» javobsiz chatni o'zi ochishi mumkin
            await mp.locator("[data-chat='777002']").click(); await mp.wait_for_timeout(1200)
        await mp.locator("[data-testid=chat-quote-btn]").click(); await mp.wait_for_timeout(600)
        await mp.locator("[data-testid=tool-tabs] [data-tool=ai]").click(); await mp.wait_for_timeout(600)
        ok("telefon: varaqdagi «AI» — «Bu chatda avtojavob»", await mp.locator("[data-testid=quote-sheet] [data-testid=chat-auto]").is_visible())
        await mp.screenshot(path=S + "ar_mobile.png")

        ok("JS xatolari yo'q", not errs, errs)
        await b.close()
    finish()

asyncio.run(main())
