# 소리 섞임 검사: 효과음·브금이 목소리(내레이션·대사)를 덮어 말이 안 들리는 곳을 언어마다 찾는다
# .venv/bin/python -I scripts/check-mix.py episodes/mongol-03/ep.json [--json] [--stdin]
# (2026-10-21 사용자: 1편 0:50 "독살이었죠"가 효과음에 묻혀 안 들림)
# 렌더(src/episode/Episode.tsx)와 같은 규칙으로 소리를 다시 놓는다: 장면 기본 효과음(sceneSfx), 장면 cues, 브금(0.32배, 목소리 동안 0.3배)
# 0.3초 평균 크기로 말하는 동안 "목소리 - (효과음+브금)" 여유를 잰다 (1편 보정: 보통 장면 약 20dB, 사용자가 안 들린다고 한 0:50 장면 -4dB)
#   오류: 여유 중앙값 < 6dB, 또는 목소리보다 큰 소리가 0.3초 넘게 · 경고: 중앙값 < 10dB, 또는 3dB 안쪽이 0.15초 넘게
import sys
from pathlib import Path

import numpy as np

CODE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CODE / "audio"))
sys.path.insert(0, str(CODE / "scripts"))
import cast as C  # noqa: E402
from checklib import Ctx, item, report  # noqa: E402

ERR_MED, WARN_MED = 6.0, 10.0  # dB - 말하는 동안 여유 중앙값
HOP = 0.05
SMOOTH = 6  # 칸 (0.3초) - 귀가 크기를 느끼는 시간
# Episode.tsx SFX·MOVE·sceneSfx와 같은 규칙 (바꾸면 같이)
SFX = {"map": ("swish", 0.1), "cutout": ("swish", 0.1), "mapscene": ("swish", 0.1), "cinematic": ("swish", 0.1), "art": ("swish", 0.1), "lapse": ("swish", 0.12),
       "title": ("boom", 0.55), "stamp": ("impact", 0.6), "line": ("hit", 0.4), "units": ("drum", 0.45)}
MOVE = {"map", "art", "lapse", "cutout", "mapscene", "cinematic"}
BGM_VOL, DUCK = 0.32, 0.3


def scene_sfx(scenes):
    chapter, met, out = False, set(), []
    for sc in scenes:
        t = (sc.get("show") or {}).get("type")
        first = t == "line" and sc.get("speaker", "") not in met
        if t == "line":
            met.add(sc.get("speaker", ""))
        if t == "title":
            chapter = True
        if "sfx" in sc and sc["sfx"] is None:
            out.append(None)
            continue
        if sc.get("sfx"):
            out.append((sc["sfx"], 0.5))
            continue
        d = SFX.get(t)
        if not d or (t in MOVE and not chapter) or (t == "line" and not first):
            out.append(None)
            continue
        if t in MOVE:
            chapter = False
        out.append(d)
    return out


_cache = {}


def env(path):
    """wav → 50ms마다 크기(RMS, 선형)"""
    if path not in _cache:
        x, sr = C.read(path)
        x = x.mean(axis=1) if x.ndim > 1 else x
        hop = int(sr * HOP)
        n = len(x) // hop
        _cache[path] = np.sqrt((x[: n * hop].reshape(n, hop) ** 2).mean(axis=1) + 1e-12) if n else np.zeros(0)
    return _cache[path]


def db(v):
    return 20 * np.log10(np.maximum(v, 1e-6))


ctx = Ctx()
if not ctx.tl:
    if ctx.json:
        report(ctx, [], "소리 섞임")
    sys.exit("소리 섞임 검사: timeline.json 없음 - 목소리를 먼저 만들어야 함")
tl = ctx.tl
fps = tl["fps"]
match = ctx.match()  # 지금 장면 i → timeline 장면 j
back = {j: i for i, j in enumerate(match) if j is not None}
# 소리 설정(효과음·cues·브금)은 지금 장면표(편집 중 상태), 시간은 timeline(실제 목소리 길이)
cur = [ctx.scenes[back[j]] if j in back else sc for j, sc in enumerate(tl["scenes"])]
sfx = scene_sfx(cur)
starts, at = [], 0
for sc in tl["scenes"]:
    starts.append(at)
    at += sc["frames"]
total = at
# 브금 구간 (Episode.tsx musicSegments: 장면 music이 바뀌는 곳마다)
segs = []
for j, sc in enumerate(cur):
    m = sc.get("music")
    if m and (not segs or segs[-1][0] != m):
        if segs:
            segs[-1][2] = starts[j]
        segs.append([m, starts[j], total])
if not segs and tl.get("bgm"):
    segs.append([Path(tl["bgm"]).stem, 0, total])

items = []
for j, sc in enumerate(tl["scenes"]):
    i = back.get(j)
    for lang, rel in [("en", sc.get("vo")), *(sc.get("vo_i18n") or {}).items()]:
        if not rel or not (CODE / "public" / rel).exists():
            continue
        v = env(CODE / "public" / rel)
        if not len(v):
            continue
        t0 = starts[j] / fps
        others = np.zeros(len(v))
        names = {}
        # 이 장면 기본 효과음 (장면 시작) + 앞 장면 효과음이 이어지는 부분 + 이 장면 cues
        events = []
        for k in (j - 1, j):
            if 0 <= k < len(sfx) and sfx[k]:
                events.append((starts[k] / fps, CODE / "public/sfx/ep" / f"{sfx[k][0]}.wav", sfx[k][1], sfx[k][0]))
        # 넣은 효과음은 장면이 끝나도 끝까지 울리므로 앞 장면들 것도 본다 (Episode.tsx와 같게)
        for k in range(max(0, j - 4), j + 1):
            for c in cur[k].get("cues") or []:
                events.append((starts[k] / fps + c.get("at", 0), CODE / "public" / c["src"], c.get("vol", 0.6), Path(c["src"]).stem))
        for at_s, f, vol, name in events:
            if not f.exists():
                continue
            e = env(f) * vol
            off = int(round((at_s - t0) / HOP))
            a, b = max(0, off), min(len(v), off + len(e))
            if a < b:
                others[a:b] += e[a - off : b - off] ** 2
                names[name] = max(names.get(name, 0), float(db(e).max()))
        # 브금 (목소리 동안 0.32 × 0.3배)
        for track, fa, fb in segs:
            if fa <= starts[j] < fb:
                f = CODE / "public/bgm" / f"{track}.wav"
                if f.exists():
                    m = env(f)
                    if len(m):
                        k0 = int(round((starts[j] - max(0, fa - 15)) / fps / HOP))
                        idx = (k0 + np.arange(len(v))) % len(m)
                        others += (m[idx] * BGM_VOL * DUCK) ** 2
                        names[f"브금 {track}"] = 0
        k = np.ones(SMOOTH) / SMOOTH
        vs = np.sqrt(np.convolve(v**2, k, "same"))
        os_ = np.sqrt(np.convolve(others, k, "same"))
        loud = db(vs)
        speak = loud > np.median(loud[loud > loud.max() - 30]) - 6  # 실제로 말하는 칸 (끝 숨·쉼 빼고)
        if not speak.any():
            continue
        margin = loud[speak] - db(os_[speak])
        med = float(np.median(margin))
        over = (margin < 0).sum() * HOP  # 목소리보다 큰 소리
        near = (margin < 3).sum() * HOP
        if med < ERR_MED or over >= 0.3:
            lvl = "error"
        elif med < WARN_MED or near >= 0.15:
            lvl = "warn"
        else:
            continue
        first = float(np.argmax(speak & (loud - db(os_) < 3))) * HOP
        top = ", ".join(sorted(names, key=lambda n: -names[n])[:2]) or "?"
        scene = i if i is not None else j
        items.append(item(scene, f"{lang} 목소리가 묻힘 - 여유 {med:.0f}dB, 더 큰 소리 {over:.1f}초 ({first:.1f}초쯤, {top}) → 효과음 크기를 줄이거나(cue vol·장면 sfx) 대사 사이로 옮기기",
                          source="mix", rule="mix-mask", level=lvl, lang=lang, group="소리 섞임"))
report(ctx, items, "소리 섞임", f" (말하는 동안 목소리 여유 중앙값 {ERR_MED:.0f}dB 미만 = 오류)")
