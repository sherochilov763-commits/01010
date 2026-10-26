#!/usr/bin/env bash
# E2E testlar: har bir to'plam toza bazada, haqiqiy backend + build qilingan frontend bilan.
# Ishlatish:  npm run build && npm run test:e2e            (hammasi)
#             bash tests/e2e/run.sh test_money test_mobile (tanlanganlari)
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${E2E_OUT:-$ROOT/tests/e2e/out}"
PORT="${E2E_PORT:-4990}"
mkdir -p "$OUT"
export E2E_BASE="http://localhost:$PORT" E2E_OUT="$OUT"
[ -f "$ROOT/frontend/dist/index.html" ] || { echo "frontend/dist yo'q — avval: npm run build"; exit 1; }
# Soxta vaqt: testlar «bugun»ga, ish vaqtiga va «bu hafta»ga tayanadi (masalan, ish 23:30 da «Bugun» guruhida bo'lishi kerak).
# Kechasi (23:00 dan keyin, yarim tun, dushanba 00:xx) ular yolg'on yiqilardi. Shuning uchun server, testlar va brauzer
# BIR XIL siljish bilan «bugun soat 20:00» da ishlaydi (vaqt oqib boradi; ish vaqtidan keyin, lekin 23:00 dan oldin — testlar shunga yozilgan). libfaketime: pip install libfaketime.
# O'chirish: E2E_FAKE_TIME=off. Boshqa soat: E2E_FAKE_TIME=10:30.
FAKE_AT="${E2E_FAKE_TIME:-20:00}"
if [ "$FAKE_AT" != "off" ]; then
  FT_LIB="$(python3 -c 'import libfaketime, os; print(os.path.join(os.path.dirname(libfaketime.__file__), "vendor/libfaketime/src/libfaketime.so.1"))' 2>/dev/null || true)"
  if [ -n "$FT_LIB" ] && [ -f "$FT_LIB" ]; then
    TARGET=$(TZ=Asia/Tashkent date -d "$(TZ=Asia/Tashkent date +%Y-%m-%d) $FAKE_AT" +%s)
    OFFSET=$((TARGET - $(date +%s)))
    export LD_PRELOAD="$FT_LIB${LD_PRELOAD:+:$LD_PRELOAD}" FAKETIME="$( [ $OFFSET -ge 0 ] && echo "+$OFFSET" || echo "$OFFSET" )" DONT_FAKE_MONOTONIC=1 FAKETIME_DONT_FAKE_MONOTONIC=1
    echo "Soxta vaqt: $(TZ=Asia/Tashkent date '+%Y-%m-%d %H:%M') (Toshkent) — haqiqiy vaqtdan ${OFFSET} s"
  else
    echo "Diqqat: libfaketime topilmadi (pip install libfaketime) — testlar haqiqiy vaqtda, kechasi yolg'on yiqilishi mumkin"
  fi
fi
SUITES="${*:-test_money test_session test_errors test_mobile test_mobile2 test_lines test_jobs test_jobs2 test_jobs3 test_jobs4 test_geo test_tg_lines test_stages test_roles test_perms test_bigexp test_kassa test_lineprof test_themes test_dash test_visual test_crmcard test_voice test_autoreply test_card test_chatfiles}"
fail=0
# GitHub Actions'da yiqilgan tekshiruvlar izoh (annotation) sifatida chiqadi — logni ochmasdan ko'rinadi
gh_err() { [ -n "${GITHUB_ACTIONS:-}" ] && printf '::error title=%s::%s\n' "$1" "$(printf '%s' "$2" | tr '\n' ' ' | cut -c1-900)"; return 0; }
for s in $SUITES; do
  TMP="$(mktemp -d)"; export E2E_DB="$TMP/uvix.db"
  (cd "$ROOT/backend" && exec env DB_PATH="$E2E_DB" PORT="$PORT" JWT_SECRET="e2e-test-secret" UVIX_JOBS_MS=1500 node server.js) > "$OUT/$s.server.log" 2>&1 &
  PID=$!
  up=0; for _ in $(seq 1 100); do curl -sf "$E2E_BASE/api/health" > /dev/null && { up=1; break; }; sleep 0.2; done
  if [ $up = 0 ]; then echo "Server ishga tushmadi ($s)"; cat "$OUT/$s.server.log"; gh_err "$s: server ishga tushmadi" "$(tail -c 800 "$OUT/$s.server.log")"; kill $PID 2>/dev/null; exit 1; fi
  (cd "$ROOT/tests/e2e" && python3 seed.py > "$OUT/$s.seed.log" 2>&1) || { echo "Ma'lumot kiritib bo'lmadi ($s)"; cat "$OUT/$s.seed.log"; gh_err "$s: seed" "$(tail -c 600 "$OUT/$s.seed.log")"; fail=1; }
  echo "=============== $s"
  (cd "$ROOT/tests/e2e" && python3 "$s.py") > "$OUT/$s.log" 2>&1; rc=$?
  cat "$OUT/$s.log"
  if [ $rc != 0 ]; then
    fail=1
    grep -a "^FAIL" "$OUT/$s.log" | head -8 | while IFS= read -r l; do gh_err "$s" "$l"; done
    grep -aq "^Traceback" "$OUT/$s.log" && gh_err "$s: Python xatosi" "$(grep -a -A40 '^Traceback' "$OUT/$s.log" | grep -av '^  ' | tail -4)"
  fi
  kill $PID 2>/dev/null; wait $PID 2>/dev/null
  rm -rf "$TMP"
done
[ $fail = 0 ] && echo "E2E: hammasi o'tdi" || echo "E2E: XATO bor — yuqoriga qarang (rasmlar: $OUT)"
exit $fail
