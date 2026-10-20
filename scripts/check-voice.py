# 목소리 검사 하네스: 만든 목소리(timeline.json의 모든 언어 wav)에서 끝 지지직·뚝 끊김·소리 깨짐을 찾는다 - 걸리면 멈춤
# .venv/bin/python -I scripts/check-voice.py episodes/mongol-03/ep.json
# (2026-10-20 사용자: 음성 끝에 지지직거리는 경우가 있다)
import json
import sys
from pathlib import Path

import numpy as np

CODE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CODE / "audio"))
import cast as C  # noqa: E402

ep = Path(sys.argv[1])
tl = json.loads((CODE / "public/ep" / ep.parent.name / ep.stem / "timeline.json").read_text())
bad = []
for i, sc in enumerate(tl["scenes"]):
    for lang, path in [("en", sc.get("vo")), *(sc.get("vo_i18n") or {}).items()]:
        if not path:
            continue
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
            bad.append(f"  #{i} {lang} {path}: {', '.join(probs)}")
print("\n".join(bad))
print(f"목소리 검사: {'통과' if not bad else f'{len(bad)}개 문제 - 그 줄 목소리를 다시 만들거나 audio/cast.py tail 확인'}")
sys.exit(1 if bad else 0)
