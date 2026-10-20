"""세로 쇼츠(src/shorts)의 장면 시각표와 배경음악·효과음. 곡·효과음 합성은 make_audio.py 것을 그대로 쓴다.

시각표(언제 어떤 연도를 보여 주고 어디서 설명을 띄우는지)를 여기서 한 번만 계산해 src/shorts/schedule.json에 쓰고,
영상(Remotion)도 그 파일을 읽는다 - 소리와 화면이 같은 표를 써서 어긋나지 않는다.
실행: .venv/bin/python -I audio/make_shorts.py   → src/shorts/schedule.json, public/sfx/shorts-<id>.wav
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_audio as A  # noqa: E402

import numpy as np  # noqa: E402

ROOT = A.ROOT
CFG = json.loads((ROOT / "shorts.json").read_text())
FPS = CFG["fps"]


def timelapse(v):
    t = CFG["timelapse"]
    notes = v["notes"]
    n, k = len(v["years"]), sum(1 for y in v["years"] if str(y) in notes)
    room = t["targetFrames"] - t["introFrames"] - t["endFrames"] - 20 - k * t["holdFrames"]
    step = max(t["minStep"], min(t["maxStep"], round(room / max(1, n - k))))
    at = t["introFrames"]
    shots = []
    events = [{"frame": 2, "type": "thud"}]
    accents = []
    for y in v["years"]:
        note = notes.get(str(y))
        dur = t["holdFrames"] if note else step
        shots.append({"year": y, "from": at, "dur": dur, "note": note})
        if note:
            events.append({"frame": at + 2, "type": "pop"})
        else:
            accents.append(at)
        at += dur
    map_end = at + 20
    events += [{"frame": map_end - 6, "type": "whoosh"}, {"frame": map_end + 10, "type": "ding"}]
    total = map_end + t["endFrames"]
    return {"shots": shots, "mapEnd": map_end, "total": total}, events, accents


def render(name, frames, events, accents, music_gain=0.5):
    length = frames / FPS
    A.LENGTH = length
    n = int(length * A.SR)
    n_bars = max(2, round(length / A.BAR))
    mus = A.music(n_bars)[:n]
    if len(mus) < n:
        mus = np.pad(mus, (0, n - len(mus)))
    mus *= music_gain
    acc = A.accents(accents)[:n] * 0.18 if accents else np.zeros(n)
    if len(acc) < n:
        acc = np.pad(acc, (0, n - len(acc)))
    fade = int(0.6 * A.SR)
    mus[-fade:] *= np.linspace(1, 0, fade)
    fx = np.zeros(n)
    kept = A.thin(events)
    for e in kept:
        A.place(fx, A.SFX[e["type"]]() * A.SFX_GAIN, e["frame"] / FPS)
    mix = mus + acc + fx
    mix = mix * (10 ** (-15 / 20) / np.sqrt(np.mean(mix**2)))
    ceil = 10 ** (-1 / 20)
    mix = np.tanh(mix / ceil) * ceil
    A.write_wav(A.OUT / f"shorts-{name}.wav", mix)
    print(f"{name}: {length:.2f}s · {frames}프레임 · 효과음 {len(kept)}/{len(events)}개")


def quiz():
    q = CFG["quiz"]
    rnd = q["askFrames"] + q["revealFrames"]
    events = [{"frame": 2, "type": "thud"}]
    for i in range(len(q["rounds"])):
        start = q["introFrames"] + i * rnd
        # src/shorts/QuizV.tsx COUNT_FROM = 15: 3 → 2 → 1 → 정답
        events += [{"frame": start + 15 + 30 * k, "type": "tick"} for k in range(3)]
        events.append({"frame": start + q["askFrames"], "type": "ding"})
    end = q["introFrames"] + len(q["rounds"]) * rnd
    events.append({"frame": end, "type": "whoosh"})
    return end + q["endFrames"], events


def sameyear():
    s = CFG["sameyear"]
    events = [{"frame": 2, "type": "thud"}]
    for i in range(len(s["scenes"])):
        at = s["introFrames"] + i * s["sceneFrames"]
        events += [{"frame": at, "type": "whoosh"}, {"frame": at + 10, "type": "pop"}]
    end = s["introFrames"] + len(s["scenes"]) * s["sceneFrames"]
    events += [{"frame": end, "type": "whoosh"}, {"frame": end + 12, "type": "ding"}]
    return end + s["endFrames"], events


schedule = {}
for v in CFG["timelapse"]["videos"]:
    sch, events, accents = timelapse(v)
    schedule[v["id"]] = sch
    render(v["id"], sch["total"], events, accents)

render("quiz", *quiz(), [])
render("sameyear", *sameyear(), [])

(ROOT / "src" / "shorts").mkdir(exist_ok=True)
(ROOT / "src" / "shorts" / "schedule.json").write_text(json.dumps(schedule, ensure_ascii=False, indent=1))
