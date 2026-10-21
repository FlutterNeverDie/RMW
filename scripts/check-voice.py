# 목소리 검사 하네스: 만든 목소리(timeline.json의 모든 언어 wav)에서 끝 지지직·뚝 끊김·소리 깨짐을 찾는다 - 걸리면 멈춤
# .venv/bin/python -I scripts/check-voice.py episodes/mongol-03/ep.json [--json] [--stdin]
# (2026-10-20 사용자: 음성 끝에 지지직거리는 경우가 있다)
# 줄마다 만든 엔진(timeline engine, 예전 timeline은 "?")을 같이 보여 주고 엔진별로 검사 줄·문제 수를 센다 - 어느 Gemini 모델이 끝 잡음을 내는지
# 장면 번호는 지금 장면표 기준 (같은 영어 대사로 짝지음 - 편집기가 순서를 바꿔도 맞게). 지금 장면표에 없는 대사의 목소리는 수만 셈
import sys
from pathlib import Path

import numpy as np

CODE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CODE / "audio"))
sys.path.insert(0, str(CODE / "scripts"))
import cast as C  # noqa: E402
from checklib import Ctx, item, report  # noqa: E402

ctx = Ctx()
if not ctx.tl:
    if ctx.json:
        report(ctx, [], "목소리 검사")
    sys.exit("목소리 검사: timeline.json 없음 - 목소리를 먼저 만들어야 함")
# timeline 장면 → 지금 장면 번호
back = {}
for i, j in enumerate(ctx.match()):
    if j is not None and ctx.tl["scenes"][j].get("text") == ctx.scenes[i].get("text"):
        back.setdefault(j, i)
out, per, orphan = [], {}, 0
for j, sc in enumerate(ctx.tl["scenes"]):
    for lang, path in [("en", sc.get("vo")), *(sc.get("vo_i18n") or {}).items()]:
        if not path:
            continue
        eng = (sc.get("engine") or {}).get(lang) or "?"
        st = per.setdefault(eng, [0, 0])
        st[0] += 1
        x, sr = C.read(CODE / "public" / path)
        x = x.mean(axis=1) if x.ndim > 1 else x
        peak = np.abs(x).max() or 1
        probs = []
        # 끝 정리를 한 번 더 했을 때 0.1초 넘게 잘려 나가면 = 말 끝 뒤에 잡음이 남아 있음
        cut = (len(x) - len(C.tail(x, sr))) / sr
        if cut > 0.1:
            probs.append(f"끝 잡음 {cut:.2f}초")
        # 마지막 5ms가 크면 = 뚝 끊김(딸깍)
        if np.abs(x[-int(sr * 0.005):]).max() > peak * 10 ** (-30 / 20):
            probs.append("끝이 뚝 끊김")
        # 소리 깨짐 (꼭대기에 붙은 샘플)
        clip = int((np.abs(x) > 0.995).sum())
        if clip > 3:
            probs.append(f"소리 깨짐 {clip}곳")
        if probs:
            st[1] += 1
            i = back.get(j)
            if i is None:
                orphan += 1  # 지금 장면표에 같은 대사가 없음 → 어차피 다시 만들 목소리
                continue
            out.append(item(i, f"{lang} [{eng}] {path}: {', '.join(probs)}", source="voice", rule="voice", group="목소리", lang=lang,
                            field="text" if lang == "en" else f"i18n.{lang}", engine=eng))
if not ctx.json:
    print("엔진별: " + " · ".join(f"{e} {n}줄 중 {b}개 문제" for e, (n, b) in sorted(per.items())))
    if orphan:
        print(f"(지금 장면표에 없는 대사의 목소리 문제 {orphan}개는 뺌 - 목소리를 다시 만들면 사라짐)")
report(ctx, out, "목소리 검사", "" if not out else " - 그 줄 목소리를 다시 만들거나 audio/cast.py tail 확인")
