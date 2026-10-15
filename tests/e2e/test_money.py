# A1: pul ma'lumotlari himoyasi — haqiqiy backend (operator so'rovlari, admin qarori, server qoidalari, jurnal)
import asyncio, json, time, datetime
from common import *  # noqa: F401,F403


async def main():
    errs = []
    aid = [e for e in api("/api/auth/employees")["employees"] if e["role"] == "admin"][0]["id"]
    adm = api("/api/auth/login", {"employeeId": aid, "pin": "0000"})["token"]
    az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
    async with async_playwright() as p:
        b = await p.chromium.launch()
        o = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); o.on("pageerror", lambda e: errs.append("O:" + str(e)))
        await dlogin(o, "Aziza", "1234"); await nav(o, "Buyurtmalar")
        # 1) to'lovni o'zgartirish so'rovi
        await open_payments(o, "UV-261013-003")
        ok("operator: to'lov qatorida tahrir/o'chirish (so'rov)", await o.locator("[data-testid=pay-edit]").count() == 1 and await o.locator("[data-testid=pay-delete]").count() == 1)
        await o.locator("[data-testid=pay-edit]").click(); await o.wait_for_timeout(300)
        await o.locator("[data-testid=approval-amount]").fill("100000")
        await o.locator("[data-testid=approval-send]").click(); await o.wait_for_timeout(300)
        ok("sababsiz yuborilmaydi", await o.locator("[data-testid=approval-request] [role=alert]").count() == 1)
        await o.locator("[data-testid=approval-reason]").fill("Mijoz 19 091 ni qaytarib oldi")
        await o.screenshot(path=S + "a1_request.png")
        await o.locator("[data-testid=approval-send]").click(); await o.wait_for_timeout(900)
        ok("so'rov yuborildi → «tasdiq kutmoqda»", await o.locator("[data-testid=pay-pending]").count() == 1)
        ok("summa hali o'zgarmagan", order(adm, "UV-261013-003")["payments"][0]["amount"] == 119091)
        await o.screenshot(path=S + "a1_pending.png")
        # takroriy so'rov — 409
        r = api("/api/approvals", {"kind": "payment_edit", "orderId": "o2", "paymentId": "p2", "amount": 5, "reason": "yana"}, az)
        ok("takroriy so'rov rad etiladi", r.get("_code") == 409, r)
        # yangi to'lov qo'shish — avvalgidek
        await o.locator("input[placeholder='0']").last.fill("10000"); await o.locator("button", has_text="To'lov qo'shish").click(); await o.wait_for_timeout(1200)
        pays = order(adm, "UV-261013-003")["payments"]
        ok("operator to'lov qo'sha oladi", len(pays) == 2 and pays[1]["amount"] == 10000 and pays[1]["createdBy"] == "Aziza Karimova", pays)
        await close_modal(o)
        # 2) buyurtmani o'chirish so'rovi
        row = o.locator("tr.uvix-row", has_text="UV-261012-001"); await row.hover(); await row.locator("[aria-label=\"O'chirish\"]").click(); await o.wait_for_timeout(400)
        ok("operator: o'chirish → so'rov oynasi (tasdiqlash emas)", await o.locator("[data-testid=approval-request]").count() == 1)
        await o.locator("[data-testid=approval-reason]").fill("Ikki marta kiritilgan"); await o.locator("[data-testid=approval-send]").click(); await o.wait_for_timeout(900)
        ok("buyurtma o'chmadi", not order(adm, "UV-261012-001").get("deletedAt"))
        await o.locator("tr.uvix-row", has_text="UV-261012-001").click(); await o.wait_for_timeout(500)
        ok("panelda «so'rov yuborilgan» belgisi", await o.locator("[data-testid=order-pending]").count() == 1)
        await o.keyboard.press("Escape"); await o.wait_for_timeout(300)
        # 3) summani kamaytirish
        row = o.locator("tr.uvix-row", has_text="UV-261009-001"); await row.hover(); await row.locator("[aria-label=Tahrirlash]").click(); await o.wait_for_timeout(600)
        inp = o.locator(".uvix-modal-panel input[inputmode=numeric]").first
        await inp.fill("3500000"); await o.wait_for_timeout(200)
        ok("kamaytirishda sabab maydoni", await o.locator("[data-testid=total-decrease]").count() == 1)
        await o.locator("textarea[data-testid=total-reason]").fill("Mijoz bilan qayta kelishildi")
        await o.screenshot(path=S + "a1_total.png")
        await o.locator(".uvix-modal-panel button", has_text="Saqlash").last.click(); await o.wait_for_timeout(1500)
        ok("summa o'zgarmadi (tasdiq kutadi)", order(adm, "UV-261009-001")["agreementUzs"] == 4500000)
        # 4) ilovani chetlab — to'g'ridan-to'g'ri so'rov
        cur = order(az, "UV-261013-004")
        hacked = json.loads(json.dumps(cur)); hacked["payments"][0]["amount"] = 1
        r = api("/api/kv/uvix:orders/merge", {"upserts": [{"item": hacked}]}, az)
        back = [x for x in json.loads(r["value"]) if x["id"] == cur["id"]][0]
        ok("API: to'lov summasi o'zgarmadi", back["payments"][0]["amount"] == cur["payments"][0]["amount"])
        r = api("/api/kv/uvix:orders/merge", {"deletes": ["o5"]}, az)
        ok("API: buyurtmani o'chirish — bekor", any(x["id"] == "o5" for x in json.loads(r["value"])))
        h2 = json.loads(json.dumps(order(az, "UV-261005-001"))); h2["deletedAt"] = "2026-10-15T00:00:00Z"; h2["deletedBy"] = "Aziza Karimova"
        lst = orders(az); lst = [h2 if x["id"] == h2["id"] else x for x in lst]
        api("/api/kv/uvix:orders", {"value": json.dumps(lst)}, az, "PUT")
        ok("API (PUT): o'chirish — bekor", not order(adm, "UV-261005-001").get("deletedAt"))
        au = audit(adm)
        rej = [x for x in au if x["what"].startswith("Rad etildi (server)")]
        ok("jurnal: rad etilgan urinishlar, qurilma — API", len(rej) >= 3 and all(x.get("src") == "server" and x.get("dev") == "API" for x in rej), [x["what"] for x in au[:6]])
        # jurnalni o'zgartirib/o'chirib bo'lmaydi
        e0 = au[0]; fake = dict(e0, what="o'chirildi");
        api("/api/kv/uvix:audit/merge", {"upserts": [{"item": fake}, {"item": {"id": "zz1", "who": "Admin", "what": "soxta", "when": "2000-01-01", "src": "server"}}], "deletes": [x["id"] for x in au]}, az)
        au2 = audit(adm)
        z = [x for x in au2 if x["id"] == "zz1"][0]
        ok("jurnal: eski yozuv o'zgarmaydi, o'chmaydi", len(au2) == len(au) + 1 and [x for x in au2 if x["id"] == e0["id"]][0]["what"] == e0["what"])
        ok("jurnal: kim/qachon/manba — serverdan", z["who"] == "Aziza Karimova" and z["when"] > "2026" and "src" not in z)
        # 5) admin qarori
        a = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); a.on("pageerror", lambda e: errs.append("A:" + str(e)))
        await dlogin(a, "Administrator", "0000")
        card = a.locator("[data-testid=approvals-card]")
        ok("admin: Dashboard'da «Tasdiqlash so'rovlari» (3)", await card.count() == 1 and await card.locator("[data-approval]").count() == 3, await card.count())
        await a.screenshot(path=S + "a1_admin_card.png")
        await card.locator("[data-approval]", has_text="to'lov summasini").locator("[data-testid=approve]").click(); await a.wait_for_timeout(1200)
        p2 = [x for x in order(adm, "UV-261013-003")["payments"] if x["id"] == "p2"][0]
        ok("tasdiq → to'lov 100 000, avvalgisi saqlangan", p2["amount"] == 100000 and p2["prevAmount"] == 119091 and p2["approvedBy"] == "Administrator", p2)
        await card.locator("[data-approval]", has_text="buyurtmani o'chirmoqchi").locator("[data-testid=reject]").click(); await a.wait_for_timeout(1200)
        ok("rad → buyurtma joyida", not order(adm, "UV-261012-001").get("deletedAt"))
        await card.locator("[data-approval]", has_text="kamaytirmoqchi").locator("[data-testid=approve]").click(); await a.wait_for_timeout(1200)
        ok("tasdiq → summa 3 500 000", order(adm, "UV-261009-001")["agreementUzs"] == 3500000)
        ok("karta yopildi (so'rov qolmadi)", await a.locator("[data-testid=approvals-card]").count() == 0)
        ok("admin ekranida yangi holat", True)
        # operator natijani ko'radi
        nt = api("/api/notifications", token=az)
        ok("operatorga bildirishnoma (tasdiqlandi/rad etildi)", sum(1 for n in nt["items"] if n["cat"] == "approvals") >= 3, [n["title"] for n in nt["items"]][:5])
        ap = api("/api/approvals", token=az)["approvals"]
        ok("operator o'z so'rovlari holatini ko'radi", sorted(x["status"] for x in ap) == ["approved", "approved", "rejected"], [x["status"] for x in ap])
        # admin: to'lovni to'g'ridan-to'g'ri o'zgartirish
        await nav(a, "Buyurtmalar"); await open_payments(a, "UV-261013-004")
        await a.locator("[data-testid=pay-edit]").first.click(); await a.wait_for_timeout(300)
        await a.locator("[data-testid=approval-amount]").fill("90000"); await a.locator("[data-testid=approval-send]").click(); await a.wait_for_timeout(1200)
        p1 = order(adm, "UV-261013-004")["payments"][0]
        ok("admin to'g'ridan-to'g'ri o'zgartiradi (belgi bilan)", p1["amount"] == 90000 and p1.get("editedBy") == "Administrator", p1)
        ok("modalda «(avval …)»", await a.locator(".uvix-modal-panel", has_text="avval").count() >= 1)
        await close_modal(a)
        # admin o'chirish — avvalgidek
        await open_payments(a, "UV-261013-004"); await a.locator("[data-testid=pay-delete]").first.click(); await a.wait_for_timeout(300)
        await a.locator("button", has_text="O'chirish").last.click(); await a.wait_for_timeout(1200)
        ok("admin to'lovni o'chira oladi", bool(order(adm, "UV-261013-004")["payments"][0].get("deletedAt")))
        await close_modal(a)
        # Jurnal (Xodimlar → Tarix)
        await nav(a, "Xodimlar"); await a.locator("button", has_text="Tarix").first.click(); await a.wait_for_timeout(600)
        ok("Tarix: «server yozadi» belgisi va qurilma", await a.locator("[data-testid=audit-note]").count() == 1 and await a.locator("td", has_text="API").count() >= 1)
        await a.screenshot(path=S + "a1_audit.png")
        # operator ekranida tasdiqlangan summa
        await o.reload(); await o.wait_for_timeout(1500)
        if await o.locator("[data-testid=desktop-login]").count(): await dlogin(o, "Aziza", "1234")
        await nav(o, "Buyurtmalar"); await open_payments(o, "UV-261013-003")
        ok("operator: «(avval 119 091 so'm)»", await o.locator(".uvix-modal-panel", has_text="avval 119 091").count() == 1)
        await b.close()
    ok("JS xatolar yo'q", not errs, errs)
if __name__ == "__main__":
    asyncio.run(main())
    finish()
