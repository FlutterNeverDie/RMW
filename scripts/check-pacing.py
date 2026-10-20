# 재미·리듬 검사 (제작 2단계 "재미 보강"의 게이트, 토큰 없음): 채널 원칙 4·6·8을 숫자로 본다
# python3 scripts/check-pacing.py episodes/mongol-03/ep.json
# 오류(멈춤): 첫 5초에 화면 변화 없음, 오프닝 로고처럼 앞 10초 안의 제목 카드, 6초 넘게 멈춘 화면(움직임 없는 그림·카드)
# 경고: 75초 넘게 질문·반전이 없음, 전체 길이가 8~12분 밖
import json
import re
import sys
from pathlib import Path

CODE = Path(__file__).resolve().parent.parent
ep_path = Path(sys.argv[1])
ep = json.loads(ep_path.read_text())
tl_path = CODE / "public/ep" / ep_path.parent.name / ep_path.stem / "timeline.json"
tl = json.loads(tl_path.read_text()) if tl_path.exists() else None


def est(text):  # 편집기와 같은 어림 (내레이터 1.07배)
    t = text or ""
    return len(t.split()) / 2.7 + 0.18 * len(re.findall(r"[.,!?…]", t))


secs = []
for i, s in enumerate(ep["scenes"]):
    real = tl["scenes"][i]["frames"] / tl["fps"] if tl and i < len(tl["scenes"]) and tl["scenes"][i].get("text") == s.get("text") else None
    secs.append(real or max(est(s.get("text")) + 0.18, s["show"].get("seconds", 0)) + s.get("hold", 0))

errors, warns = [], []
at = 0.0
starts = []
for s, d in zip(ep["scenes"], secs):
    starts.append(at)
    at += d
total = at


def moving(s):
    sh = s["show"]
    if "from" in sh and "to" in sh:
        dz = abs(sh["to"][2] - sh["from"][2])
        dxy = abs(sh["to"][0] - sh["from"][0]) + abs(sh["to"][1] - sh["from"][1])
        return dz >= 0.25 or dxy >= 0.12
    return sh["type"] in ("lapse", "units")


# 첫 5초: 장면이 바뀌거나 빠른 줌(확대 차 0.4 이상)이 있어야 함
first = ep["scenes"][0]
cuts5 = sum(1 for t in starts[1:] if t < 5)
fz = first["show"].get("from") and abs(first["show"]["to"][2] - first["show"]["from"][2]) >= 0.4
if not cuts5 and not fz:
    errors.append("첫 5초: 장면 전환도 빠른 줌(확대 차 0.4 이상)도 없음 - 스크롤하는 손을 못 붙잡음 (원칙 6)")
for i, s in enumerate(ep["scenes"]):
    if s["show"]["type"] == "title" and starts[i] < 10:
        errors.append(f"#{i} 앞 10초 안의 제목 카드 - 오프닝 로고처럼 보임 (원칙 6)")
    # 멈춘 화면: 움직임 없는 장면이 6초 넘게 (인물·효과음 큐가 있으면 8초까지)
    limit = 8 if (s.get("char") or s.get("cues")) else 6
    if secs[i] > limit and not moving(s) and s["show"]["type"] not in ("endcard",):
        errors.append(f"#{i} {s['show']['type']} {secs[i]:.1f}초 동안 화면이 거의 그대로 - 3~5초마다 변화 (원칙 8): {(s.get('text') or '')[:50]}")
    elif secs[i] > 10 and s["show"]["type"] not in ("endcard",):
        warns.append(f"#{i} {secs[i]:.1f}초 - 움직여도 길다, 나눌 수 있는지")
# 질문·반전 간격
hooks = [starts[i] for i, s in enumerate(ep["scenes"]) if re.search(r"\?|\b(but|then|here's|twist|until|except|instead)\b", s.get("text") or "", re.I)]
prev = 0.0
for t in hooks + [total]:
    if t - prev > 75:
        warns.append(f"{int(prev // 60)}:{int(prev % 60):02d}~{int(t // 60)}:{int(t % 60):02d} {t - prev:.0f}초 동안 질문·반전 없음")
    prev = t
if not 480 <= total <= 720:
    warns.append(f"전체 {total / 60:.1f}분 - 원칙은 10분 안팎 (원칙 4)")

for title, items in (("오류", errors), ("경고", warns)):
    if items:
        print(f"[{title} {len(items)}]")
        for e in items:
            print("  " + e)
print(f"리듬 검사{' (어림)' if not tl else ''}: 오류 {len(errors)}, 경고 {len(warns)}, 전체 {total / 60:.1f}분")
sys.exit(1 if errors else 0)
