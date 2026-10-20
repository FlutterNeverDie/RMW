# 화면 재료·연출 검사 (제작 3·4단계 게이트, 토큰 없음): 그림 파일이 있는지, 확대가 선명한 한도 안인지
# python3 scripts/check-screen.py episodes/mongol-03/ep.json
# 확대 한도 = 그림 폭 ÷ (화면에 보이는 폭 × 1440p 배율 4/3). 지도는 z=1에서 1920 폭을 채우고, 그림은 화면에 맞춤 (02 지도 선명도 규칙)
import json
import struct
import sys
from pathlib import Path

CODE = Path(__file__).resolve().parent.parent
ep = json.loads(Path(sys.argv[1]).read_text())


def size(p):
    b = p.read_bytes()
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", b[16:24])
    i = 2  # JPEG: SOF 마커에서 크기
    while i < len(b):
        if b[i] != 0xFF:
            i += 1
            continue
        m = b[i + 1]
        if m in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack(">HH", b[i + 5 : i + 9])
            return w, h
        i += 2 + struct.unpack(">H", b[i + 2 : i + 4])[0]
    return None


errors, cache = [], {}
for i, s in enumerate(ep["scenes"]):
    sh = s["show"]
    img = sh.get("img")
    if not img:
        continue
    f = CODE / "public" / img
    if not f.exists():
        errors.append(f"#{i} 그림 없음: public/{img}")
        continue
    if "from" not in sh:
        continue
    w, h = cache.setdefault(img, size(f) or (0, 0))
    if not w:
        continue
    shown = 1920 if sh["type"] == "map" else min(1920, 1080 * w / h)
    limit = w / (shown * 4 / 3)
    z = max(sh["from"][2], sh["to"][2])
    if z > limit + 0.001:
        errors.append(f"#{i} 확대 {z:.2f}배 > 한도 {limit:.2f}배 ({img} {w}×{h}) - 흐려짐. 확대 세트를 따로 캡처하거나 z를 낮춤")
print("\n".join("  " + e for e in errors))
print(f"화면 검사: {'통과' if not errors else f'{len(errors)}곳'}")
sys.exit(1 if errors else 0)
