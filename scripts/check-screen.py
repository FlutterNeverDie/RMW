# 화면 재료·연출 검사 (제작 3·4단계 게이트, 토큰 없음): 그림 파일이 있는지, 확대가 선명한 한도 안인지
# python3 scripts/check-screen.py episodes/mongol-03/ep.json [--json] [--stdin]
# 확대 한도 = 그림 폭 ÷ (화면에 보이는 폭 × 1440p 배율 4/3). 지도는 z=1에서 1920 폭을 채우고, 그림은 화면에 맞춤, 오린 그림(cutout)은 상자를 채움 (02 지도 선명도 규칙)
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from checklib import CODE, Ctx, item, report  # noqa: E402

ctx = Ctx()


def size(p):
    b = p.read_bytes()
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", b[16:24])
    i = 2  # JPEG: SOF 마커에서 크기
    while i + 9 < len(b):
        if b[i] != 0xFF:
            i += 1
            continue
        m = b[i + 1]
        if m in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack(">HH", b[i + 5 : i + 9])
            return w, h
        i += 2 + struct.unpack(">H", b[i + 2 : i + 4])[0]
    return None


out, cache = [], {}


def look(i, img, frm, to, shown_of, what):
    f = CODE / "public" / img
    if not f.exists():
        out.append(item(i, f"그림 없음: public/{img}", source="zoom", rule="img-missing", group="화면 재료", field="show"))
        return
    if not (frm and to):
        return
    w, h = cache.setdefault(img, size(f) or (0, 0))
    if not w:
        return
    limit = w / (shown_of(w, h) * 4 / 3)
    z = max(frm[2], to[2])
    if z > limit + 0.001:
        out.append(item(i, f"{what}확대 {z:.2f}배 > 한도 {limit:.2f}배 ({img} {w}×{h}) - 흐려짐. 확대 세트를 따로 캡처하거나 z를 낮춤", source="zoom", rule="zoom", group="확대", field="show"))


for i, s in enumerate(ctx.scenes):
    sh = s.get("show") or {}
    t = sh.get("type")
    if t == "cutout":
        bw, bh = (sh.get("box") or [0, 0, 1, 1])[2:4]
        look(i, sh["map"], sh.get("mapFrom"), sh.get("mapTo"), lambda w, h: 1920, "지도 ") if sh.get("map") else None
        if sh.get("img"):  # 상자를 덮음(cover)
            look(i, sh["img"], sh.get("from"), sh.get("to"), lambda w, h: w * max(bw * 1920 / w, bh * 1080 / h), "오린 그림 ")
    elif sh.get("img"):
        look(i, sh["img"], sh.get("from"), sh.get("to"), lambda w, h: 1920 if t == "map" else min(1920, 1080 * w / h), "")
report(ctx, out, "화면 검사")
