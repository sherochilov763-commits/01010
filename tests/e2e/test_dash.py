# Yangi Dashboard (eskiz 51–56), mijozga xabarlar navbati, «Mijoz bo'yicha» jadvali kengligi (haqiqiy backend)
import asyncio, datetime, json
from common import *  # noqa: F401,F403

NOW = lambda: datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")
TODAY = datetime.date.today().isoformat()

def kv(key, tok): return json.loads(api("/api/kv/" + key, token=tok)["value"] or "null")
def put_orders(lst, tok): r = api("/api/kv/uvix:orders", {"value": json.dumps(lst)}, tok, "PUT"); assert "value" in r, r

async def main():
    adm = admin_token()
    errs = []
    # ---------- Mijozga xabar: avtomatik ketmaydi, navbatga tushadi ----------
    lst = orders(adm)
    o2 = [o for o in lst if o["id"] == "o2"][0]
    o2["payments"].append({"id": "pq1", "amount": 50000, "date": TODAY, "paymentType": "karta", "createdAt": NOW()})
    put_orders(lst, adm)
    q = api("/api/customer-msg/queue", token=adm)
    pend = q.get("pending", [])
    ok("to'lov → kvitansiya navbatda (yuborilmagan)", len(pend) == 1 and pend[0]["type"] == "receipt" and "50 000" in pend[0]["text"], q)
    log = api("/api/customer-msg/log", token=adm).get("log", [])
    ok("jurnalda yuborilgan xabar yo'q", not any(l.get("type") == "receipt" and l.get("ok") for l in log), log[:2])
    # to'lov o'chirilsa — navbatdagi xabar bekor bo'ladi
    lst = orders(adm)
    for o in lst:
        if o["id"] == "o2":
            for p in o["payments"]:
                if p["id"] == "pq1": p["deletedAt"] = NOW(); p["deletedBy"] = "Administrator"
    put_orders(lst, adm)
    q = api("/api/customer-msg/queue", token=adm)
    ok("to'lov o'chirildi → xabar avtomatik bekor", not q["pending"] and any(x["status"] == "cancelled" and "o'chirildi" in (x.get("reason") or "") for x in q["recent"]), q)
    # ortiqcha to'lov — shubhali belgisi
    lst = orders(adm)
    o1 = [o for o in lst if o["id"] == "o1"][0]
    o1["payments"].append({"id": "pq2", "amount": 200000, "date": TODAY, "paymentType": "naqd", "createdAt": NOW()})
    put_orders(lst, adm)
    pend = api("/api/customer-msg/queue", token=adm)["pending"]
    ok("ortiqcha to'lov — «tekshiring» belgisi", len(pend) == 1 and any("ortiqcha" in f for f in pend[0]["flags"]), pend)
    # to'xtatish: yuborib bo'lmaydi
    cfg = api("/api/customer-msg/config", token=adm)["config"]
    api("/api/customer-msg/config", {**cfg, "paused": True}, adm, "PUT")
    r = api(f"/api/customer-msg/queue/{pend[0]['id']}/send", {"text": pend[0]["text"]}, adm)
    ok("to'xtatilgan — yuborilmaydi", r.get("_code") == 502 and "to'xtatilgan" in r.get("message", ""), r)
    api("/api/customer-msg/config", {**cfg, "paused": False}, adm, "PUT")

    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1440, "height": 950}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append(str(e)))
        await dlogin(d, "Administrator", "0000")
        await d.wait_for_selector("[data-testid=dash-kpis]", timeout=15000); await d.wait_for_timeout(800)
        ids = await d.evaluate("[...document.querySelectorAll('[data-testid^=dash-]')].map(e=>e.dataset.testid)")
        need = ["dash-kpis", "dash-revenue", "dash-managers", "dash-attention", "dash-recent-pay", "dash-expense", "dash-paytypes", "dash-fixed", "dash-aging", "dash-production", "dash-customers"]
        ok("Dashboard: 11 ta asosiy blok", all(x in ids for x in need), ids)
        ok("eski takror kartalar yo'q (Buyurtmalar summasi, Qo'shilgan qiymat)", await d.locator("text=Qo'shilgan qiymat").count() == 0 and await d.locator(".uvix-hero").count() == 0)
        await d.screenshot(path=OUT + "dash_full.png", full_page=True)
        # Diqqat: navbatdagi xabar
        ok("Diqqat: mijozga xabar navbatda", await d.locator("[data-attn=custmsg]").count() == 1)
        await d.locator("[data-attn=custmsg]").click(); await d.wait_for_timeout(800)
        ok("navbat oynasi: shubhali belgi", await d.locator("[data-testid=queue-flags]").count() == 1)
        await d.screenshot(path=OUT + "dash_queue.png")
        await d.locator("[data-testid=queue-cancel]").first.click(); await d.wait_for_timeout(900)
        ok("bekor qilindi (serverda)", not api("/api/customer-msg/queue", token=adm)["pending"])
        await close_modal(d)
        # Davr
        await d.locator("[data-period=today]").click(); await d.wait_for_timeout(500)
        rng = await d.locator("[data-testid=dash-range]").inner_text()
        ok("davr «Bugun» — sana bitta kun", "–" not in rng.split("·")[0], rng)
        await d.locator("[data-period=mtd]").click(); await d.wait_for_timeout(400)
        # Menejerlar: to'liq jadval va oylik reja
        await d.locator("[data-testid=managers-expand]").click(); await d.wait_for_timeout(500)
        ok("menejerlar jadvali ochildi", await d.locator("[data-testid=managers-table]").count() == 1)
        await d.locator("[data-testid=plans-edit]").click(); await d.wait_for_timeout(300)
        inp = d.locator("[data-plan]").first
        mgr = await inp.get_attribute("data-plan")
        await inp.fill("15000000"); await d.locator("[data-testid=plans-save]").click(); await d.wait_for_timeout(1200)
        st = kv("uvix:settings", adm)
        ok("oylik reja saqlandi", (st.get("salesPlans") or {}).get(mgr) == 15000000, st.get("salesPlans"))
        await close_modal(d)
        # Doimiy xarajatlar
        btn = d.locator("[data-testid=fixed-setup], [data-testid=fixed-edit]").first
        await btn.click(); await d.wait_for_timeout(500)
        rows = d.locator("[data-fixed-row]")
        await rows.nth(0).locator("input").nth(1).fill("1000000")
        await rows.nth(1).locator("input").nth(1).fill("500000")
        await rows.nth(2).locator("input").nth(1).fill("100000")
        await d.locator("[data-testid=fixed-save]").click(); await d.wait_for_timeout(1200)
        fc = kv("uvix:settings", adm).get("fixedCosts") or []
        ok("doimiy xarajatlar saqlandi (Ijara, Ish haqi → Xodimlar, Kommunal)", [x["amount"] for x in fc] == [1000000, 500000, 100000] and fc[1]["category"] == "Xodimlar", fc)
        status = await d.locator("[data-testid=fixed-status]").inner_text()
        ok("«Oylik xarajatlar» holati ko'rinadi", "Qoplandi" in status or "qoldi" in status, status)
        await d.locator("[data-testid=dash-fixed]").screenshot(path=OUT + "dash_fixed.png")
        # Qarz eslatmasi (qo'lda) → navbatga, Telegrami bor mijozga
        await d.locator("[data-remind='Malika Interior']").click(); await d.wait_for_timeout(1200)
        pend = api("/api/customer-msg/queue", token=adm)["pending"]
        ok("«Eslatma» → qarz eslatmasi navbatda (yuborilmadi)", len(pend) == 1 and pend[0]["type"] == "debt", pend)
        if await d.locator(".uvix-modal-panel").count(): await close_modal(d)
        # Mijozlar → Navbat yorlig'i
        await nav(d, "Mijozlar")
        await d.locator("text=Navbat").first.click(); await d.wait_for_timeout(800)
        ok("Mijozlar → «Navbat»: xabar ro'yxatda", await d.locator("[data-queue-item]").count() == 1)
        # «Mijoz bo'yicha» — keng/tor ekran
        await nav(d, "Buyurtmalar")
        await d.locator("[data-view=customers]").click(); await d.wait_for_timeout(800)
        m1 = await d.locator("[data-testid=customer-groups]").get_attribute("data-mode")
        sw = await d.evaluate("(()=>{const c=document.querySelector('[data-testid=customer-groups]').parentElement;return c.scrollWidth-c.clientWidth})()")
        ok("1440px: to'liq rejim, gorizontal surgich yo'q", m1 == "full" and sw <= 1, (m1, sw))
        await d.locator("[data-customer]").first.click(); await d.wait_for_timeout(400)
        await d.locator("[data-order-row]").first.click(); await d.wait_for_timeout(900)
        m2 = await d.locator("[data-testid=customer-groups]").get_attribute("data-mode")
        sw2 = await d.evaluate("(()=>{const c=document.querySelector('[data-testid=customer-groups]').parentElement;return c.scrollWidth-c.clientWidth})()")
        ok("o'ng panel ochiq: ixcham rejim, surgich yo'q", m2 in ("compact", "cards") and sw2 <= 1, (m2, sw2))
        await d.screenshot(path=OUT + "dash_cust_compact.png")
        w = await (await b.new_context(viewport={"width": 2000, "height": 900})).new_page(); w.on("pageerror", lambda e: errs.append("W:" + str(e)))
        await dlogin(w, "Administrator", "0000")
        await nav(w, "Buyurtmalar"); await w.locator("[data-view=customers]").click(); await w.wait_for_timeout(800)
        box = await w.locator("[data-testid=customer-groups] [data-customer]").first.bounding_box()
        btn = await w.locator("[data-testid=batch-open]").first.bounding_box()
        ok("2000px: «To'lov» tugmasi to'liq ko'rinadi", btn and btn["x"] + btn["width"] <= box["x"] + box["width"] + 1 and btn["width"] > 50, (btn, box))
        await w.screenshot(path=OUT + "dash_cust_2000.png")
        await b.close()
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
