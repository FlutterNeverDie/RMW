# 렌더 전 화면 검사: 지도 위 표지·핀 글자가 화면(1920×1080) 밖으로 잘리는 장면을 찾는다
# python3 scripts/check-layout.py episodes/mongol-01/ep.json   (문제가 없으면 "잘림 없음")
# 계산은 src/episode/Episode.tsx의 MapShot과 같은 식: 화면 X = W·(0.5 + z·(x − fx))
import json, sys

W, H, MARGIN = 1920, 1080, 24
CH = 0.62  # 글자당 폭(em) - 굵은 산세리프 어림


def width(text, size):
    return len(text) * size * CH + 40  # 안쪽 여백 포함


def at(show, k):
    f, t = show["from"], show["to"]
    return [f[i] + (t[i] - f[i]) * k for i in range(3)]


bad = 0
ep = json.load(open(sys.argv[1]))
for i, sc in enumerate(ep["scenes"]):
    s = sc["show"]
    if s["type"] != "map":
        continue
    for kind, items in (("label", s.get("labels", [])), ("pin", s.get("pins", []))):
        for l in items:
            if l.get("big"):
                continue  # 큰 글자는 화면 고정 + 자동 크기
            # 나타난 뒤부터 끝까지 몇 지점을 본다
            for k in [l.get("at", 0.05) + (1 - l.get("at", 0.05)) * j / 4 for j in range(5)]:
                fx, fy, z = at(s, k)
                X = W * (0.5 + z * (l["x"] - fx))
                Y = H * (0.5 + z * (l["y"] - fy))
                w = width(l["text"], 34 if kind == "label" else 32)
                left, right = (X - w / 2, X + w / 2) if kind == "label" else (X - 14, X + 26 + w)
                if left < MARGIN or right > W - MARGIN or Y < 40 or Y > H - 40:
                    bad += 1
                    print(f"장면 {i:02d} {kind} '{l['text']}' 진행 {k:.2f}: x {left:.0f}~{right:.0f}, y {Y:.0f} - 화면 밖")
                    break
print("잘림 없음" if not bad else f"잘림 {bad}곳")
sys.exit(1 if bad else 0)
