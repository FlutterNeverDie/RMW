# 언어별 유튜브 자막(.srt): 장면 목소리에서 실제 쉼(무음)을 찾아 문장 경계를 맞추고, 긴 문장은 두 줄로 나눈다
# .venv/bin/python -I scripts/subtitles.py episodes/mongol-01/ep.json   → out/<편>.<언어>.srt + 편 폴더(meta.json folder)에 "<이름>_<언어> 자막.srt"
# 글자 수 비율로만 나누면 말이 빠르거나 쉼이 긴 줄에서 자막이 앞서거나 늦는다 (2026-10-21, 최고 품질)
import json, re, shutil, sys, wave
from pathlib import Path

import numpy as np

CODE = Path(__file__).resolve().parent.parent
HOME = Path.home() / "hwm"
LANG_NAME = {"en": "영어", "ko": "한국어", "es": "스페인어"}
# 한 줄 최대 글자 (유튜브·넷플릭스 권장 근처): 한·중·일은 좁게
LINE = {"ko": 18, "ja": 18, "zh": 16}
SENT = re.compile(r"(?<=[.!?…。？！])\s+")


def pauses(path):
    """목소리 wav에서 0.12초 넘는 쉼의 가운데 시각들 (초)"""
    with wave.open(str(path)) as w:
        sr, ch = w.getframerate(), w.getnchannels()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
    x = x.reshape(-1, ch).mean(axis=1) if ch > 1 else x
    hop = sr // 100  # 10ms
    rms = np.array([np.sqrt(np.mean(x[i : i + hop] ** 2)) for i in range(0, len(x) - hop, hop)])
    quiet = rms < max(1e-6, np.percentile(rms, 90)) * 0.06
    out, start = [], None
    for i, q in enumerate(quiet):
        if q and start is None:
            start = i
        if not q and start is not None:
            if i - start >= 12:
                out.append((start + i) / 2 / 100)
            start = None
    return out, len(x) / sr


def wrap(line, lang):
    """긴 문장은 가운데에 가까운 띄어쓰기·쉼표에서 두 줄로"""
    limit = LINE.get(lang, 42)
    if len(line) <= limit:
        return line
    mid = len(line) / 2
    cuts = [m.end() for m in re.finditer(r"[,，、]\s*|\s+", line)]
    if not cuts:
        return line
    c = min(cuts, key=lambda k: abs(k - mid))
    return line[:c].rstrip() + "\n" + line[c:].lstrip()


def ts(sec):
    ms = max(0, round(sec * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def main():
    ep_path = Path(sys.argv[1])
    ep = json.loads(ep_path.read_text())
    name = ep_path.parent.name
    tl = json.loads((CODE / "public/ep" / name / ep_path.stem / "timeline.json").read_text())
    meta = json.loads((ep_path.parent / "meta.json").read_text()) if (ep_path.parent / "meta.json").exists() else {}
    fps = tl["fps"]
    stale = []
    (CODE / "out").mkdir(exist_ok=True)
    for lang in tl.get("langs", ["en"]):
        rows, at = [], 0.0
        for i, t in enumerate(tl["scenes"]):
            secs = t["frames"] / fps
            text = t.get("text") if lang == "en" else (t.get("i18n") or {}).get(lang)
            vo = t.get("vo") if lang == "en" else (t.get("vo_i18n") or {}).get(lang)
            now = ep["scenes"][i].get("text") if lang == "en" else (ep["scenes"][i].get("i18n") or {}).get(lang)
            if now != text:
                stale.append(f"{i} {lang}")  # 목소리 만든 뒤 대사가 바뀜 - 목소리를 다시 만들어야 맞음
            if text and vo and (CODE / "public" / vo).exists():
                gaps, dur = pauses(CODE / "public" / vo)
                sents = [s.strip() for s in SENT.split(text) if s.strip()]
                w = np.array([len(re.sub(r"\s", "", s)) or 1 for s in sents], float)
                # 글자 비율로 어림한 경계를 가장 가까운 실제 쉼으로 옮긴다 (0.6초 안에 있을 때만)
                bounds = [0.0]
                step = min(0.3, dur / len(sents))  # 한 문장이 차지할 최소 시간 (짧은 문장이 몰려도 0초 줄이 안 생기게)
                for k in range(1, len(sents)):
                    guess = dur * w[:k].sum() / w.sum()
                    near = min(gaps, key=lambda g: abs(g - guess), default=None)
                    b = near if near is not None and abs(near - guess) < 0.6 and near > bounds[-1] + 0.4 else guess
                    # 앞 경계가 쉼에 맞춰 뒤로 밀렸어도 시간이 거꾸로 가지 않게, 남은 문장 몫(step씩)은 남겨 둔다
                    bounds.append(min(max(b, bounds[-1] + step), dur - step * (len(sents) - k)))
                bounds.append(dur)
                for k, s in enumerate(sents):
                    a, b = at + bounds[k], at + bounds[k + 1]
                    if k == len(sents) - 1:
                        b = min(at + secs - 0.05, max(b + 0.3, a + 1.0))  # 마지막 문장은 장면 끝 가까이까지 남김
                    rows.append((a, b, wrap(s, lang)))
            at += secs
        srt = "\n".join(f"{n}\n{ts(a)} --> {ts(b)}\n{line}\n" for n, (a, b, line) in enumerate(rows, 1))
        out = CODE / "out" / f"{name}.{lang}.srt"
        out.write_text(srt)
        if meta.get("folder"):
            dest = HOME / meta["folder"] / f"{meta.get('name', name)}_{LANG_NAME.get(lang, lang)} 자막.srt"
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(out, dest)
        print(f"{lang}: 자막 {len(rows)}줄 → {out.relative_to(CODE)}")
    if stale:
        print(f"주의: 목소리 만든 뒤 바뀐 대사 {len(stale)}곳 - 목소리를 다시 만들어야 자막 시간이 맞음 ({', '.join(stale[:6])}{'…' if len(stale) > 6 else ''})")
        print("STALE " + ",".join(s.replace(" ", ":") for s in stale))  # 편집기가 읽는 줄 (전부)


if __name__ == "__main__":
    main()
