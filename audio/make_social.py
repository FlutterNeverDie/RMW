"""레딧·쓰레드용 영상 3편(src/social)의 배경음악·효과음. 곡·효과음 합성은 make_audio.py 것을 그대로 쓴다.

영상 길이와 소리 위치는 social.json과 녹화 기록(public/desk/manifest.json)에서 계산한다 (src/social/*.tsx와 같은 식).
실행: .venv/bin/python -I audio/make_social.py   → public/sfx/social-{scrub,borders,bordersAsia,quiz}.wav
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_audio as A  # noqa: E402

import numpy as np  # noqa: E402

ROOT = A.ROOT
CFG = json.loads((ROOT / "social.json").read_text())
FPS = CFG["fps"]


def scrub():
    s = CFG["scrub"]
    desk = json.loads((ROOT / "public" / "desk" / "manifest.json").read_text())
    cur = desk["cursor"]
    i = next(k for k, c in enumerate(cur) if c["down"])
    drag_from = cur[i]["t"]
    drag_to = next(c["t"] for c in cur[i:] if not c["down"])
    seg1 = drag_from - s["start"]
    seg2 = (drag_to - drag_from) / s["dragSpeed"]
    seg3 = s["cut"] - drag_to
    rec = round((seg1 + seg2 + seg3) * FPS)

    def video(r):
        if r < drag_from:
            return r - s["start"]
        if r < drag_to:
            return seg1 + (r - drag_from) / s["dragSpeed"]
        return seg1 + seg2 + (r - drag_to)

    events = [{"frame": round(video(c["t"]) * FPS), "type": "click"} for c in desk["clicks"]]
    events += [{"frame": rec - 6, "type": "whoosh"}, {"frame": rec + 12, "type": "ding"}]
    return rec + s["endFrames"], events, 0.42


def borders(key):
    # src/social/Borders.tsx bordersTimeline과 같은 계산
    b = CFG[key]
    at = b["introFrames"]
    events = [{"frame": 2, "type": "thud"}]
    for y in b["years"]:
        if str(y) in b["notes"]:
            events.append({"frame": at + 2, "type": "pop"})
            at += b["hold"]
        else:
            at += b["step"]
    map_end = at + 20
    events += [{"frame": map_end - 6, "type": "whoosh"}, {"frame": map_end + 10, "type": "ding"}]
    return map_end + b["endFrames"], events, 0.55


def quiz():
    q = CFG["quiz"]
    rnd = q["askFrames"] + q["revealFrames"]
    events = [{"frame": 2, "type": "thud"}]
    for i in range(len(q["rounds"])):
        start = q["introFrames"] + i * rnd
        # src/social/Quiz.tsx COUNT_FROM = 15: 3 → 2 → 1 → 정답
        events += [{"frame": start + 15 + 30 * k, "type": "tick"} for k in range(3)]
        events.append({"frame": start + q["askFrames"], "type": "ding"})
    end = q["introFrames"] + len(q["rounds"]) * rnd
    events.append({"frame": end, "type": "whoosh"})
    return end + q["endFrames"], events, 0.5


def render(name, frames, events, music_gain):
    length = frames / FPS
    A.LENGTH = length
    n = int(length * A.SR)
    n_bars = max(2, round(length / A.BAR))
    mus = A.music(n_bars)[:n]
    if len(mus) < n:
        mus = np.pad(mus, (0, n - len(mus)))
    mus *= music_gain
    fade = int(0.6 * A.SR)
    mus[-fade:] *= np.linspace(1, 0, fade)
    fx = np.zeros(n)
    kept = A.thin(events)
    for e in kept:
        A.place(fx, A.SFX[e["type"]]() * A.SFX_GAIN, e["frame"] / FPS)
    mix = mus + fx
    mix = mix * (10 ** (-15 / 20) / np.sqrt(np.mean(mix**2)))
    ceil = 10 ** (-1 / 20)
    mix = np.tanh(mix / ceil) * ceil
    A.write_wav(A.OUT / f"social-{name}.wav", mix)
    print(f"{name}: {length:.2f}s · {frames}프레임 · 마디 {n_bars} · 효과음 {len(kept)}/{len(events)}개")


JOBS = {
    "scrub": scrub,
    "borders": lambda: borders("borders"),
    "bordersAsia": lambda: borders("bordersAsia"),
    "quiz": quiz,
}
# 인자로 이름을 주면 그것만 (예: make_social.py bordersAsia)
for name in sys.argv[1:] or JOBS:
    render(name, *JOBS[name]())
