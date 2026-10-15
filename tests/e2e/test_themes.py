# Mavzular: shaxsiy ko'rinish API, ruxsatlar, galereya, avtomatik tun, rol standarti, shisha regressiyasi (haqiqiy backend)
import asyncio, json, datetime
from zoneinfo import ZoneInfo
from common import *  # noqa: F401,F403

BG = "() => getComputedStyle(document.body).backgroundColor"
H1 = "() => getComputedStyle(document.querySelector('h1') || document.body).color"

async def main():
    r = api("/api/auth/bootstrap", {"name": "Administrator", "pin": "0000"})
    aid = [e for e in api("/api/auth/employees")["employees"] if e["role"] == "admin"][0]["id"]
    tok = api("/api/auth/login", {"employeeId": aid, "pin": "0000"})["token"]
    lst = json.loads(api("/api/kv/uvix:employees", token=tok)["value"]); have = {e["id"] for e in lst}
    for e in [{"id": "aziza", "name": "Aziza Karimova", "role": "operator", "pin": "1234"}, {"id": "kamola", "name": "Kamola Sharipova", "role": "designer", "pin": "1111"}]:
        if e["id"] not in have: lst.append(e)
    api("/api/kv/uvix:employees", {"value": json.dumps(lst)}, tok, "PUT")
    st = json.loads(api("/api/kv/uvix:settings", token=tok).get("value") or "{}"); st["tgOnboardOffer"] = False
    api("/api/kv/uvix:settings", {"value": json.dumps(st)}, tok, "PUT")
    az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
    km = api("/api/auth/login", {"employeeId": "kamola", "pin": "1111"})["token"]

    # ---- API
    ok("bosh holat null", api("/api/me/appearance", token=az).get("appearance") is None)
    r = api("/api/me/appearance", {"appearance": {"mode": "rainbow"}}, az, "PUT"); ok("noto'g'ri → 400", r.get("_code") == 400, r)
    r = api("/api/me/appearance", {"appearance": {"mode": "paper", "colorScheme": "terracotta", "evil": 1, "autoDark": "schedule", "nightFrom": "19:00", "nightTo": "07:00", "nightTheme": "navy"}}, az, "PUT")
    ok("saqlandi + tozalandi", r.get("appearance", {}).get("mode") == "paper" and "evil" not in r["appearance"], r)
    ok("faqat o'ziga", api("/api/me/appearance", token=tok).get("appearance") is None)
    r = api("/api/kv/uvix:apr:aziza", token=tok); ok("ichki kalit yopiq", r.get("_code") == 403, r)
    r = api("/api/kv/uvix:appearance", {"value": json.dumps({"v": 2, "mode": "dark"})}, az, "PUT"); ok("operator kompaniya standartini o'zgartira olmaydi", r.get("_code") == 403, r)
    r = api("/api/kv/uvix:appearance", {"value": json.dumps({"v": 2, "mode": "light", "colorScheme": "blue", "roleDefaults": {"designer": "oled", "hacker": "navy", "printer": "bad"}, "personal": True})}, tok, "PUT")
    stored = json.loads(r["value"]); ok("admin standart + rollar tozalandi", stored.get("roleDefaults") == {"designer": "oled"} and "personal" not in stored, stored)
    r = api("/api/kv/uvix:appearance", token=km); ok("dizayner standartni o'qiy oladi", "value" in r, r)
    ok("dizayner shaxsiy API", api("/api/me/appearance", token=km).get("appearance") is None)
    api("/api/me/appearance", {"appearance": None}, az, "PUT"); ok("null → o'chirildi", api("/api/me/appearance", token=az).get("appearance") is None)

    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---- Admin: galereya
        ca = await b.new_context(viewport={"width": 1440, "height": 900}, timezone_id="Asia/Tashkent")
        a = await ca.new_page(); a.on("pageerror", lambda e: errs.append("A:" + str(e)))
        await dlogin(a, "Administrator", "0000")
        bg0 = await a.evaluate(BG)
        await nav(a, "Sozlamalar"); await a.locator("[data-section=korinish]").click(); await a.wait_for_selector("[data-testid=theme-gallery]")
        ok("9 ta mavzu", await a.locator("[data-testid=theme-gallery] [role=radio]").count() == 9)
        ok("manba: kompaniya", (await a.locator("[data-testid=appearance-source]").inner_text()) == "Kompaniya standarti")
        await a.screenshot(path=S + "r1_gallery_light.png", full_page=False)
        await a.locator("[data-testid=theme-navy]").click(); await a.wait_for_timeout(700)
        ok("Tun ko'k qo'llandi", await a.evaluate(BG) == "rgb(7, 12, 23)", await a.evaluate(BG))
        ok("manba: shaxsiy", (await a.locator("[data-testid=appearance-source]").inner_text()) == "Shaxsiy tanlov")
        await a.screenshot(path=S + "r2_navy.png")
        sv = api("/api/me/appearance", token=tok).get("appearance") or {}
        ok("serverda shaxsiy", sv.get("mode") == "navy" and sv.get("colorScheme") == "sky", sv)
        ok("kompaniya o'zgarmadi", json.loads(api("/api/kv/uvix:appearance", token=tok)["value"]).get("mode") == "light")
        await a.reload(); await a.wait_for_timeout(1000)
        if await a.locator("[data-testid=desktop-login]").count(): await dlogin(a, "Administrator", "0000")
        await nav(a, "Sozlamalar"); await a.locator("[data-section=korinish]").click(); await a.wait_for_selector("[data-testid=theme-gallery]")
        ok("qayta kirishda saqlanadi", await a.evaluate(BG) == "rgb(7, 12, 23)", await a.evaluate(BG))
        # Avtomatik tun: jadval hozirgi vaqtni qamraydi → OLED
        now = datetime.datetime.now(ZoneInfo("Asia/Tashkent")); f = (now - datetime.timedelta(minutes=5)).strftime("%H:%M"); t = (now + datetime.timedelta(minutes=90)).strftime("%H:%M")
        await a.locator("[data-testid=theme-paper]").click(); await a.wait_for_timeout(500)
        ok("Qog'oz", await a.evaluate(BG) == "rgb(245, 242, 236)", await a.evaluate(BG))
        await a.locator("[data-testid=auto-schedule]").click(); await a.wait_for_timeout(300)
        await a.locator("[data-testid=night-theme]").select_option("oled"); await a.wait_for_timeout(300)
        await a.locator("[data-testid=night-from]").fill(f); await a.locator("[data-testid=night-to]").fill(t); await a.wait_for_timeout(900)
        ok("jadval: hozir tun → OLED", await a.evaluate(BG) == "rgb(0, 0, 0)", f"{f}-{t} {await a.evaluate(BG)}")
        await a.screenshot(path=S + "r3_auto_oled.png")
        f2 = (now + datetime.timedelta(minutes=120)).strftime("%H:%M"); t2 = (now + datetime.timedelta(minutes=180)).strftime("%H:%M")
        await a.locator("[data-testid=night-from]").fill(f2); await a.locator("[data-testid=night-to]").fill(t2); await a.wait_for_timeout(900)
        ok("jadval: hozir kunduz → Qog'oz", await a.evaluate(BG) == "rgb(245, 242, 236)", await a.evaluate(BG))
        await a.locator("[data-testid=auto-off]").click(); await a.wait_for_timeout(300)
        # Kompaniya standarti: rol bo'yicha
        ok("kompaniya kartasi (admin)", await a.locator("[data-testid=company-appearance]").count() == 1)
        await a.locator("[data-testid=role-theme-printer]").select_option("contrast"); await a.wait_for_timeout(800)
        rd = json.loads(api("/api/kv/uvix:appearance", token=tok)["value"]).get("roleDefaults")
        ok("rol standarti saqlandi", rd == {"designer": "oled", "printer": "contrast"}, rd)
        await a.locator("[data-testid=company-appearance]").screenshot(path=S + "r4_company.png")
        await a.locator("[data-testid=appearance-reset]").click(); await a.wait_for_timeout(800)
        ok("standartga qaytish", api("/api/me/appearance", token=tok).get("appearance") is None and await a.evaluate(BG) == bg0, await a.evaluate(BG))
        # Shisha regressiyasi: fon + shisha → matn yorug' bo'lishi kerak
        api("/api/me/background", {"bg": {"kind": "preset", "preset": "mesh", "glass": True, "nightDark": True, "dim": 0}}, tok, "PUT")
        await a.reload(); await a.wait_for_timeout(1000)
        if await a.locator("[data-testid=desktop-login]").count(): await dlogin(a, "Administrator", "0000")
        await nav(a, "Buyurtmalar"); await a.wait_for_timeout(800)
        h1 = await a.evaluate(H1)
        ok("shisha: sarlavha yorug'", h1 == "rgb(237, 237, 239)", h1)
        await a.screenshot(path=S + "r5_glass.png")
        api("/api/me/background", {"bg": None}, tok, "PUT")

        # ---- Operator: admin tanlovi ta'sir qilmaydi
        co = await b.new_context(viewport={"width": 1440, "height": 900}, timezone_id="Asia/Tashkent")
        o = await co.new_page(); o.on("pageerror", lambda e: errs.append("O:" + str(e)))
        await dlogin(o, "Aziza Karimova", "1234")
        ok("operator — kompaniya standarti (yorug')", await o.evaluate(BG) == "rgb(247, 247, 248)", await o.evaluate(BG))
        await nav(o, "Sozlamalar"); await o.locator("[data-section=korinish]").click(); await o.wait_for_selector("[data-testid=theme-gallery]")
        ok("operatorda kompaniya kartasi yo'q", await o.locator("[data-testid=company-appearance]").count() == 0)
        await o.locator("[data-testid=theme-warm]").click(); await o.wait_for_timeout(700)
        ok("operator Iliq tun", await o.evaluate(BG) == "rgb(17, 14, 11)", await o.evaluate(BG))
        ok("kompaniya standarti saqlanib qoldi", json.loads(api("/api/kv/uvix:appearance", token=tok)["value"]).get("mode") == "light")

        # ---- Dizayner (telefon): rol standarti → OLED
        cm = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, timezone_id="Asia/Tashkent")
        m = await cm.new_page(); m.on("pageerror", lambda e: errs.append("M:" + str(e)))
        await mob_login(m, "Kamola", "1111"); await m.wait_for_timeout(2500)
        ok("dizayner — rol bo'yicha OLED", await m.evaluate(BG) == "rgb(0, 0, 0)", await m.evaluate(BG))
        await m.screenshot(path=S + "r6_designer_oled.png")
        ok("JS xatolar yo'q", not errs, errs)
        await b.close()

if __name__ == "__main__":
    asyncio.run(main())
    finish()
