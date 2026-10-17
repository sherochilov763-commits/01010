# 11-etap: Vazifalar — holat kartalari, tezkor qo'shish, tafsilot paneli (tekshiruv ro'yxati, izoh, rasm, tarix), bo'sh holat, ishchi «Mening kunim»
import asyncio, base64, datetime, json, os
from common import *  # noqa: F401,F403

IPH = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
D = datetime.date.today()
TODAY, YEST, TOM = D.isoformat(), (D - datetime.timedelta(days=1)).isoformat(), (D + datetime.timedelta(days=1)).isoformat()
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAGklEQVR42mP8z8DwnwEJMDIyMjIyMDIyMgAAj/QB/1ky0AEAAAAASUVORK5CYII=")

def jobs(tok): return api("/api/jobs", token=tok).get("jobs", [])
def job(tok, i): return [x for x in jobs(tok) if x["id"] == i][0]

async def main():
    adm = admin_token()
    el = json.loads(api("/api/kv/uvix:employees", token=adm)["value"])
    el += [{"id": "bekzod", "name": "Bekzod Tursunov", "role": "installer", "pin": "5555", "line": "UVONYX"},
           {"id": "sardor", "name": "Sardor Qodirov", "role": "installer", "pin": "6666", "line": "UVONYX"}]
    api("/api/kv/uvix:employees", {"value": json.dumps(el)}, adm, method="PUT")
    mk = lambda **b: api("/api/jobs", b, adm)["job"]
    late = mk(kind="deliver", title="ON-261014-002 · Panno", line="UVONYX", date=YEST, time="16:00", address="Sergeli 7", assigneeIds=["sardor"])
    meas = mk(kind="measure", title="Yangi oniks murojaat", line="UVONYX", date=TODAY, time="00:01" if False else "23:58", address="Yunusobod 4-kv", assigneeIds=["bekzod"])
    inst = mk(kind="install", title="Oniks stol", line="UVONYX", date=TODAY, time="23:50", address="Chilonzor 9, 12-uy", phone="+998 90 123 45 67", assigneeIds=["bekzod", "sardor"])
    mk(kind="other", title="Ombordan material olib kelish", line="UVIXPRINT")
    ok("yangi vazifa: tur bo'yicha tekshiruv ro'yxati va tarix", len(inst.get("checklist", [])) == 4 and inst["checklist"][0]["text"] == "Material yuklandi" and len(inst.get("log", [])) == 1 and inst.get("duration") == 120, inst)
    logo = os.path.join(OUT, "job_photo.png"); open(logo, "wb").write(PNG)
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1440, "height": 950}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append("D:" + str(e)))
        await dlogin(d, "Administrator", "0000")
        await nav(d, "Vazifalar"); await d.wait_for_timeout(1200)
        st = lambda k: d.locator(f"[data-stat={k}] div").nth(1).inner_text()
        ok("holat kartalari: Kechikkan 1", await st("late") == "1", await st("late"))
        ok("Sanasiz kartasi ≥ 1", int(await st("nodate")) >= 1)
        ok("kechikkan qator qizil, «Kechikdi»", await d.locator(f"[data-job='{late['id']}'] [data-status-pill=late]").count() == 1)
        ok("«Bajarilgan» guruhi yig'ilgan (bo'sh bo'lsa ko'rinmaydi)", await d.locator("[data-job-group=done] [data-job]").count() == 0)
        await d.screenshot(path=OUT + "jobs2_list.png")
        # Kartani bosish → faqat shu guruh
        await d.locator("[data-stat=late]").click(); await d.wait_for_timeout(300)
        ok("«Kechikkan» kartasi → faqat kechikkanlar", await d.locator("[data-job-group]").count() == 1 and await d.locator("[data-job-group=late]").count() == 1)
        await d.locator("[data-stat=late]").click(); await d.wait_for_timeout(300)

        # ---------- Tezkor qo'shish ----------
        await d.locator("[data-testid=quick-input]").fill("Montaj ertaga 10:00 @Bekzod Shisha fartuk")
        await d.wait_for_timeout(200)
        tk = await d.locator("[data-testid=quick-tokens] [data-qt]").evaluate_all("(a) => a.map(e => e.dataset.qt).join(',')")
        ok("tezkor satr: tur, sana, vaqt, xodim taniladi", tk == "kind,date,time,person", tk)
        await d.locator("[data-testid=quick-add]").screenshot(path=OUT + "jobs2_quick.png")
        await d.locator("[data-testid=quick-input]").press("Enter"); await d.wait_for_timeout(1200)
        q = [x for x in jobs(adm) if x["title"] == "Shisha fartuk"]
        ok("tezkor qo'shish: Montaj, ertaga 10:00, Bekzod", len(q) == 1 and q[0]["kind"] == "install" and q[0]["date"] == TOM and q[0]["time"] == "10:00" and q[0]["assigneeIds"] == ["bekzod"], q)

        # ---------- Qatordagi ▶ → Jarayonda ----------
        await d.locator(f"[data-job-start='{inst['id']}']").click(); await d.wait_for_timeout(1000)
        ok("▶ Boshlash → «Jarayonda»", job(adm, inst["id"])["status"] == "doing")

        # ---------- Tafsilot paneli ----------
        await d.locator(f"[data-job='{inst['id']}']").click(); await d.wait_for_timeout(500)
        dr = d.locator("[data-testid=job-drawer]")
        ok("panel ochildi: Qachon, Manzil, Brigada", await dr.count() == 1 and "Chilonzor 9" in await dr.inner_text() and "Bekzod Tursunov" in await dr.inner_text())
        c0 = inst["checklist"][0]["id"]
        await dr.locator(f"[data-check='{c0}']").click(); await d.wait_for_timeout(800)
        await dr.locator("[data-testid=check-new]").fill("Silikon olindi"); await dr.locator("[data-testid=check-new]").press("Enter"); await d.wait_for_timeout(800)
        jj = job(adm, inst["id"])
        ok("tekshiruv: band belgilandi + yangi band qo'shildi", jj["checklist"][0]["done"] and jj["checklist"][0]["doneBy"] == "Administrator" and jj["checklist"][-1]["text"] == "Silikon olindi" and len(jj["checklist"]) == 5, jj["checklist"])
        await dr.locator("[data-testid=drawer-comment]").click()
        await dr.locator("[data-testid=job-comment]").fill("Mijoz 14:30 dan keyin uyda"); await dr.locator("[data-testid=job-comment]").press("Enter"); await d.wait_for_timeout(900)
        await dr.locator("[data-testid=job-photo-input]").set_input_files(logo); await d.wait_for_timeout(1500)
        jj = job(adm, inst["id"])
        ok("izoh tarixda, rasm yuklandi", any("Mijoz 14:30" in l["text"] for l in jj["log"]) and len(jj.get("photos", [])) == 1, (jj.get("log"), jj.get("photos")))
        ok("tarix panelda ko'rinadi", "Mijoz 14:30" in await dr.locator("[data-testid=job-log]").inner_text())
        await d.screenshot(path=OUT + "jobs2_drawer.png")
        await dr.locator("[data-testid=drawer-edit]").click(); await d.wait_for_timeout(400)
        ok("«Tahrirlash» → forma (davomiyligi bilan)", await d.locator("[data-testid=job-form] [data-testid=job-duration]").count() == 1)
        await close_modal(d)
        await d.locator("[data-testid=drawer-close]").click(); await d.wait_for_timeout(300)

        # ---------- Bo'sh holat ----------
        await d.locator("[data-kind-filter=measure]").click(); await d.locator("[data-testid=jobs-person]").select_option("none"); await d.wait_for_timeout(300)
        em = d.locator("[data-testid=jobs-empty]")
        ok("bo'sh holat: o'lchov qanday paydo bo'lishini tushuntiradi", await em.count() == 1 and "CRM" in await em.inner_text() and await em.locator("[data-testid=empty-add]").count() == 1)
        await em.screenshot(path=OUT + "jobs2_empty.png")
        await d.locator("[data-testid=jobs-person]").select_option(""); await d.locator("[data-kind-filter=measure]").click()

        # ---------- Ishchi telefoni: «Mening kunim» ----------
        w = await (await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent=IPH, device_scale_factor=2, timezone_id="Asia/Tashkent")).new_page(); w.on("pageerror", lambda e: errs.append("W:" + str(e)))
        await mob_login(w, "Bekzod", "5555"); await w.wait_for_selector(".uvix-worker-nav", timeout=15000); await w.wait_for_timeout(2000)
        mj = w.locator("[data-testid=my-jobs]")
        ok("«Mening kunim» sarlavhasi", "Mening kunim" in await mj.inner_text())
        nx = mj.locator("[data-myjob-next]")
        ok("«Hozir»: jarayondagi montaj tepada, «Bajarildi» tugmasi", await nx.count() == 1 and await nx.get_attribute("data-myjob") == inst["id"] and await nx.locator(f"[data-testid=slide-done][data-slide-job='{inst['id']}']").count() == 1 and await nx.locator("[data-myjob-done]").count() == 0)
        ok("pastki menyu: Ishlarim", "Ishlarim" in await w.locator(".uvix-worker-nav").inner_text())
        await w.screenshot(path=OUT + "jobs2_myday.png")
        # Kartani o'ngga surish → «Bajarildi» + 5 soniya «Bekor qilish»
        card = mj.locator(f"[data-myjob='{meas['id']}']")
        await swipe_card(w, card, commit=False)
        ok("o'ngga surish → «Bekor qilish» chiqadi, serverga hali yozilmagan", await w.locator("[data-testid=undo-toast]").count() == 1 and job(adm, meas["id"])["status"] != "done" and await mj.locator(f"[data-myjob='{meas['id']}']").count() == 0)
        await w.screenshot(path=OUT + "jobs2_undo.png")
        await w.locator("[data-testid=undo-btn]").click(); await w.wait_for_timeout(5800)
        ok("«Bekor qilish» → ish qaytdi, serverda o'zgarmadi", await mj.locator(f"[data-myjob='{meas['id']}']").count() == 1 and job(adm, meas["id"])["status"] != "done")
        # Tasodifiy bosish — hech narsa qilmaydi; yarim surish — orqaga qaytadi
        sl = nx.locator("[data-testid=slide-done]")
        await sl.locator("[role=slider]").click(); await w.wait_for_timeout(400)
        kb = await sl.locator("[role=slider]").bounding_box()
        await w.mouse.move(kb["x"] + 20, kb["y"] + 20); await w.mouse.down(); await w.mouse.move(kb["x"] + 110, kb["y"] + 20, steps=5); await w.mouse.up(); await w.wait_for_timeout(500)
        ok("«Surib yakunlang»: bosish va yarim surish — yakunlamaydi", await w.locator("[data-testid=undo-toast]").count() == 0 and job(adm, inst["id"])["status"] == "doing")
        await swipe_card(w, mj.locator(f"[data-myjob='{meas['id']}']"))
        ok("o'lchov bajarildi (ishchi, 5 soniyadan keyin)", job(adm, meas["id"])["status"] == "done")
        # Varaq: ishchi tekshiruvni belgilaydi va rasm yuklaydi
        await nx.click(); await w.wait_for_timeout(500)
        sh = w.locator("[data-testid=job-drawer]")
        c1 = inst["checklist"][1]["id"]
        await sh.locator(f"[data-check='{c1}']").click(); await w.wait_for_timeout(800)
        await sh.locator("[data-testid=job-photo-input]").set_input_files(logo); await w.wait_for_timeout(1500)
        jj = job(adm, inst["id"])
        ok("ishchi: tekshiruv bandi va rasm", jj["checklist"][1]["done"] and jj["checklist"][1]["doneBy"] == "Bekzod Tursunov" and len(jj["photos"]) == 2, jj)
        ok("ishchi varag'ida «Tahrirlash» yo'q", await sh.locator("[data-testid=drawer-edit]").count() == 0)
        await w.screenshot(path=OUT + "jobs2_sheet.png")
        await b.close()
    # Server: ishchi tekshiruv ro'yxatini o'zgartira olmaydi (faqat belgilaydi), boshqa vazifaga rasm yuklay olmaydi
    bt = api("/api/auth/login", {"employeeId": "bekzod", "pin": "5555"})["token"]
    api(f"/api/jobs/{inst['id']}", {"checklist": []}, bt, method="PATCH")
    ok("server: ishchi bandlarni o'chira olmaydi", len(job(adm, inst["id"])["checklist"]) == 5)
    r = api(f"/api/jobs/{late['id']}", {"check": {"id": "x", "done": True}}, bt, method="PATCH")
    ok("server: begona vazifa — 404", r.get("_code") == 404, r)
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
