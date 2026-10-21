# 재미·리듬 검사 (제작 2단계 "재미 보강"의 게이트, 토큰 없음): 채널 원칙 4·6·8을 숫자로 본다
# python3 scripts/check-pacing.py episodes/mongol-03/ep.json [--json] [--stdin]
# 오류(멈춤): 첫 5초에 화면 변화 없음, 오프닝 로고처럼 앞 10초 안의 제목 카드, 6초 넘게 멈춘 화면(움직임 없는 그림·카드)
# 경고: 75초 넘게 질문·반전이 없음, 전체 길이가 8~12분 밖
# 장면 길이는 편집기와 같은 규칙: 가장 긴 언어(실제 목소리, 없으면 어림) + 숨 고르기, show.seconds 이상, + hold
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from checklib import EST, Ctx, item, report  # noqa: E402

ctx = Ctx()
scenes = ctx.scenes
langs = ["en", *ctx.langs]
real_any = False
secs = []
for i, s in enumerate(scenes):
    per = [ctx.secs(i, l) for l in langs]
    real_any |= any(r for _, r in per)
    longest = max([d for d, _ in per] + [0])
    sh = s.get("show") or {}
    secs.append(max(sh.get("seconds", 0) or 0, longest + EST["gap"] if s.get("text") else 0) + (s.get("hold") or 0))

out = []
starts, at = [], 0.0
for d in secs:
    starts.append(at)
    at += d
total = at


def moving(sh):
    def mv(a, b):
        if not (a and b):
            return False
        return abs(b[2] - a[2]) >= 0.25 or abs(b[0] - a[0]) + abs(b[1] - a[1]) >= 0.12
    if sh.get("type") == "cutout":
        return mv(sh.get("from"), sh.get("to")) or mv(sh.get("mapFrom"), sh.get("mapTo"))
    if "from" in sh and "to" in sh:
        return mv(sh["from"], sh["to"])
    return sh.get("type") in ("lapse", "units")


def P(scene, msg, rule, level="error"):
    out.append(item(scene, msg, source="pacing", rule=rule, group="리듬", level=level, field="show" if scene is not None else None,
                    text=(scenes[scene].get("text") or "") if scene is not None else None))


if scenes:
    first = scenes[0].get("show") or {}
    cuts5 = sum(1 for t in starts[1:] if t < 5)
    a, b = first.get("from") or first.get("mapFrom"), first.get("to") or first.get("mapTo")
    fz = a and b and abs(b[2] - a[2]) >= 0.4
    if not cuts5 and not fz:
        P(0, "첫 5초: 장면 전환도 빠른 줌(확대 차 0.4 이상)도 없음 - 스크롤하는 손을 못 붙잡음 (원칙 6)", "first5")
for i, s in enumerate(scenes):
    sh = s.get("show") or {}
    t = sh.get("type") or "?"
    if t == "title" and starts[i] < 10:
        P(i, "앞 10초 안의 제목 카드 - 오프닝 로고처럼 보임 (원칙 6)", "title10")
    # 멈춘 화면: 움직임 없는 장면이 6초 넘게 (인물·효과음 큐가 있으면 8초까지)
    limit = 8 if (s.get("char") or s.get("cues")) else 6
    if secs[i] > limit and not moving(sh) and t != "endcard":
        P(i, f"{t} {secs[i]:.1f}초 동안 화면이 거의 그대로 - 3~5초마다 변화 (원칙 8)", "still")
    elif secs[i] > 10 and t != "endcard":
        P(i, f"{secs[i]:.1f}초 - 움직여도 길다, 나눌 수 있는지", "long", "warn")
# 질문·반전 간격
hooks = [starts[i] for i, s in enumerate(scenes) if re.search(r"\?|\b(but|then|here's|twist|until|except|instead)\b", s.get("text") or "", re.I)]
prev = 0.0
for t in hooks + [total]:
    if t - prev > 75:
        k = max((i for i, st in enumerate(starts) if st <= prev), default=None)
        P(k, f"{int(prev // 60)}:{int(prev % 60):02d}~{int(t // 60)}:{int(t % 60):02d} {t - prev:.0f}초 동안 질문·반전 없음", "hook-gap", "warn")
    prev = t
if not 480 <= total <= 720:
    P(None, f"전체 {total / 60:.1f}분 - 원칙은 10분 안팎 (원칙 4)", "total", "warn")
report(ctx, out, f"리듬 검사{'' if real_any else ' (어림)'}", f", 전체 {total / 60:.1f}분")
