# 8-etap: kategoriyaning standart yo'nalishi va yirik rasxodlar (chegara, «Yirik» belgisi, rahbar kartasi, filtr, xabar)
import asyncio, json
from common import *  # noqa: F401,F403

def kv(key, tok): return json.loads(api("/api/kv/" + key, token=tok)["value"])

async def main():
    adm = admin_token()
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append("D:" + str(e)))
        await dlogin(d, "Administrator", "0000")
        await nav(d, "Kategoriyalar"); await d.wait_for_timeout(600)
        await d.locator("[data-testid=big-limit]").fill("1000000")
        await d.locator("[data-testid=big-limit-save]").click(); await d.wait_for_timeout(1000)
        await d.locator("[data-cat-line='Kraska']").select_option("UVIXPRINT"); await d.wait_for_timeout(1000)
        st = kv("uvix:settings", adm)
        ok("sozlamalar: chegara 1 000 000, Kraska → UVIXPRINT", st.get("bigExpenseLimit") == 1000000 and st.get("categoryLines", {}).get("Kraska") == "UVIXPRINT", {k: st.get(k) for k in ("bigExpenseLimit", "categoryLines")})
        await d.screenshot(path=OUT + "big_categories.png")
        # Rahbar: yangi rasxodda «Kraska» tanlansa yo'nalish o'zi UVIXPRINT
        await nav(d, "Rasxod")
        await d.locator("button", has_text="Yangi rasxod").click(); await d.wait_for_timeout(500)
        await d.locator(".uvix-modal-panel select").first.select_option("Kraska"); await d.wait_for_timeout(200)
        ok("kategoriya → yo'nalish o'zi qo'yildi", await d.locator("[data-testid=tx-line] [data-line=UVIXPRINT][aria-pressed=true]").count() == 1)
        await d.keyboard.press("Escape"); await d.wait_for_timeout(300)
        if await d.locator(".uvix-modal-panel").count():
            await d.locator(".uvix-modal-panel button", has_text="Bekor").first.click(); await d.wait_for_timeout(300)

        # Operator yirik rasxod kiritadi
        a = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); a.on("pageerror", lambda e: errs.append("A:" + str(e)))
        await dlogin(a, "Aziza", "1234")
        await nav(a, "Rasxod")
        await a.locator("button", has_text="Yangi rasxod").click(); await a.wait_for_timeout(500)
        await a.locator(".uvix-modal-panel input[inputmode=numeric], .uvix-modal-panel input[placeholder='0']").first.fill("1500000")
        await a.locator(".uvix-modal-panel button", has_text="Saqlash").last.click(); await a.wait_for_timeout(1200)
        await a.locator("button", has_text="Yangi rasxod").click(); await a.wait_for_timeout(500)
        await a.locator(".uvix-modal-panel input[inputmode=numeric], .uvix-modal-panel input[placeholder='0']").first.fill("40000")
        await a.locator(".uvix-modal-panel button", has_text="Saqlash").last.click(); await a.wait_for_timeout(1500)
        ok("ro'yxatda «Yirik» belgisi (faqat kattasida)", await a.locator("[data-big-tag]").count() == 1)
        await a.locator("[data-testid=only-big]").click(); await a.wait_for_timeout(400)
        t = await a.locator("table").first.inner_text()
        ok("«Faqat yiriklar» filtri", "1 500 000" in t and "40 000" not in t, t)
        n = api("/api/notifications", token=adm)
        items = n.get("items") or n.get("notifications") or []
        ok("rahbarga bildirishnoma: «Yirik rasxod»", any("Yirik rasxod" in (x.get("title") or "") for x in items), [x.get("title") for x in items][:8])
        az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
        na = api("/api/notifications", token=az)
        ok("operatorga yirik rasxod bildirishnomasi bormaydi", not any("Yirik rasxod" in (x.get("title") or "") for x in (na.get("items") or na.get("notifications") or [])))

        # Rahbar Dashboard'i: karta, «Ko'rildi»
        await nav(d, "Dashboard"); await d.reload(); await d.wait_for_timeout(2500)
        card = d.locator("[data-testid=big-expenses]")
        ok("Dashboard: «Yirik rasxodlar» kartasi (1 ta)", await card.count() == 1 and await card.locator("[data-big]").count() == 1)
        await card.screenshot(path=OUT + "big_card.png")
        bid = await card.locator("[data-big]").first.get_attribute("data-big")
        await card.locator(f"[data-big-seen='{bid}']").click(); await d.wait_for_timeout(1500)
        tx = [x for x in kv("uvix:transactions", adm) if x["id"] == bid][0]
        ok("«Ko'rildi» → saqlandi, karta yo'qoldi", tx.get("bigSeenAt") and tx.get("bigSeenBy") == "Administrator" and await d.locator("[data-testid=big-expenses]").count() == 0, tx)
        await b.close()
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
