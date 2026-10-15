# QR kodli soxta kamera videosi (Y4M) — Chromium --use-file-for-fake-video-capture uchun
import json, subprocess, sys
import os
BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "backend")
def qr_y4m(text, path, backend=BACKEND, W=640, H=480):
    js = "const Q=require('qrcode');const m=Q.create(process.argv[1],{errorCorrectionLevel:'M'}).modules;console.log(JSON.stringify({n:m.size,d:Array.from(m.data)}))"
    q = json.loads(subprocess.check_output(["node", "-e", js, text], cwd=backend))
    n, d = q["n"], q["d"]
    sc = min(W, H) * 0.8 // (n + 8); size = sc * (n + 8)
    x0, y0 = (W - size) // 2 + 4 * sc, (H - size) // 2 + 4 * sc
    Y = bytearray([235]) * (W * H)
    for r in range(n):
        for c in range(n):
            if d[r * n + c]:
                for yy in range(int(y0 + r * sc), int(y0 + (r + 1) * sc)):
                    s = yy * W + int(x0 + c * sc); Y[s:s + int(sc)] = bytes([16]) * int(sc)
    UV = bytes([128]) * (W * H // 4)
    with open(path, "wb") as f:
        f.write(f"YUV4MPEG2 W{W} H{H} F10:1 Ip A1:1 C420jpeg\n".encode())
        for _ in range(10): f.write(b"FRAME\n" + bytes(Y) + UV + UV)
if __name__ == "__main__": qr_y4m(sys.argv[1], sys.argv[2])
