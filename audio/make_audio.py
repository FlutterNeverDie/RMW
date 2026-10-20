"""배경음악·효과음을 numpy로 직접 합성한다 (받아 온 음원 0개).

timeline.json의 박자·효과음·강조음 위치와, 언어별 시연 녹화(public/demo/<언어>/manifest.json)의 탭 시각을 읽어
public/sfx/mix-<언어>.wav를 만든다 (시연 탭 시각이 언어마다 달라 소리도 따로).
실행: .venv/bin/python -I audio/make_audio.py en ko ja zh
"""

import json
import sys
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
TL = json.loads((ROOT / "timeline.json").read_text())
OUT = ROOT / "public" / "sfx"

SR = 44100
FPS = TL["fps"]
BEAT = 60 / TL["bpm"]
BAR = BEAT * 4
LENGTH = TL["durationInFrames"] / FPS

# 들어 보고 한 곳에서 조절하는 음량
MUSIC_GAIN = 0.55
ACCENT_GAIN = 0.32
SFX_GAIN = 0.6
# 어느 3초 구간에도 효과음 3개 이하
SFX_WINDOW = 3.0
SFX_MAX_IN_WINDOW = 3

rng = np.random.default_rng(7)


def t_of(n):
    return np.arange(int(n * SR)) / SR


def place(buf, sig, at):
    i = int(at * SR)
    if i >= len(buf):
        return
    sig = sig[: len(buf) - i]
    buf[i : i + len(sig)] += sig


def lowpass(x, alpha):
    # 한 극 저역 통과. alpha는 상수 또는 x와 같은 길이 배열
    a = np.broadcast_to(alpha, x.shape)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# ---------- 악기 ----------

def pad(notes, dur):
    t = t_of(dur)
    sig = np.zeros_like(t)
    for n in notes:
        f = hz(n)
        for k, amp in ((1, 1.0), (2, 0.35), (3, 0.12)):
            sig += amp * np.sin(2 * np.pi * f * k * t + rng.uniform(0, 6.28))
            # 살짝 어긋난 음으로 두께
            sig += 0.5 * amp * np.sin(2 * np.pi * f * k * 1.004 * t)
    env = np.minimum(1, t / 0.25) * np.minimum(1, (dur - t) / 0.3)
    return lowpass(sig * env / len(notes), 0.08) * 0.5


def bass(note, dur):
    t = t_of(dur)
    f = hz(note)
    sig = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)
    env = np.exp(-t * 4) * np.minimum(1, t / 0.01)
    return sig * env * 0.5


def kick():
    t = t_of(0.35)
    f = 50 + 90 * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 9) * 0.9


def hat():
    t = t_of(0.06)
    n = rng.standard_normal(len(t))
    n = n - lowpass(n, 0.5)
    return n * np.exp(-t * 70) * 0.12


def snare():
    t = t_of(0.18)
    n = rng.standard_normal(len(t))
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25)
    return (lowpass(n, 0.4) * 0.5 + body * 0.4) * np.exp(-t * 18) * 0.35


def xylo(note):
    t = t_of(0.6)
    f = hz(note)
    sig = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t * 20)
    return sig * np.exp(-t * 7) * np.minimum(1, t / 0.002)


# ---------- 효과음 ----------

def sfx_pop():
    t = t_of(0.09)
    f = 380 + 700 * (t / t[-1])
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 35) * 0.8


def sfx_whoosh():
    d = 0.42
    t = t_of(d)
    n = rng.standard_normal(len(t))
    shape = np.sin(np.pi * t / d) ** 2
    y = lowpass(n, 0.02 + 0.25 * shape)
    y = y - lowpass(y, 0.01)
    return y * shape * 1.6


def sfx_tick():
    t = t_of(0.03)
    return np.sin(2 * np.pi * 2200 * t) * np.exp(-t * 200) * 0.6


def sfx_click():
    out = np.zeros(int(0.12 * SR))
    for at, f in ((0.0, 2600), (0.07, 1900)):
        t = t_of(0.02)
        place(out, np.sin(2 * np.pi * f * t) * np.exp(-t * 300) * 0.7, at)
    return out


def sfx_thud():
    t = t_of(0.45)
    f = 45 + 70 * np.exp(-t * 14)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7)
    noise = lowpass(rng.standard_normal(len(t)), 0.05) * np.exp(-t * 30) * 0.8
    return (body + noise) * 0.95


def sfx_ding():
    t = t_of(1.4)
    sig = np.zeros_like(t)
    for ratio, amp, dec in ((1, 1.0, 3), (2.76, 0.4, 5), (5.4, 0.2, 8)):
        sig += amp * np.sin(2 * np.pi * 1320 * ratio * t) * np.exp(-t * dec)
    return sig * 0.35 * np.minimum(1, t / 0.003)


def sfx_wind():
    # 세월이 흘러가는 바람: 4초 동안 부풀었다 잦아드는 바람, 바람 결이 위로 쓸려 올라간다
    d = 4.3
    t = t_of(d)
    n = rng.standard_normal(len(t))
    swell = np.sin(np.pi * np.minimum(1, t / d)) ** 1.5
    gust = 0.75 + 0.25 * np.sin(2 * np.pi * 1.3 * t) * np.sin(2 * np.pi * 0.4 * t)
    body = lowpass(n, 0.015 + 0.10 * swell * (t / d))
    body = body - lowpass(body, 0.004)
    air = n - lowpass(n, 0.6)
    return (body * 2.2 + air * 0.05 * swell) * swell * gust * 1.1


SFX = {
    "wind": sfx_wind,
    "pop": sfx_pop,
    "whoosh": sfx_whoosh,
    "tick": sfx_tick,
    "click": sfx_click,
    "thud": sfx_thud,
    "ding": sfx_ding,
}
# 솎아 낼 때 남기는 순서 (앞일수록 중요)
PRIORITY = ["wind", "thud", "whoosh", "ding", "click", "pop", "tick"]


def thin(events):
    kept = []
    for e in sorted(events, key=lambda e: PRIORITY.index(e["type"])):
        at = e["frame"] / FPS
        near = [k for k in kept if abs(k["frame"] / FPS - at) < SFX_WINDOW]
        # 이 효과음을 넣었을 때 어떤 3초 창에도 3개를 넘지 않는지
        ok = True
        for start in [at - SFX_WINDOW + 1e-6] + [k["frame"] / FPS for k in near] + [at]:
            inside = [k for k in near if start <= k["frame"] / FPS < start + SFX_WINDOW]
            if start <= at < start + SFX_WINDOW and len(inside) + 1 > SFX_MAX_IN_WINDOW:
                ok = False
                break
        if ok:
            kept.append(e)
        else:
            print(f"  솎아 냄: {e['type']} @ {at:.2f}s", file=sys.stderr)
    return sorted(kept, key=lambda e: e["frame"])


# ---------- 곡 ----------

# 웅장한 가단조 진행, 한 마디에 한 화음
CHORDS = [
    (45, [57, 60, 64, 69]),  # Am
    (41, [57, 60, 65, 69]),  # F
    (48, [60, 64, 67, 72]),  # C
    (43, [59, 62, 67, 71]),  # G
]


def music(n_bars):
    buf = np.zeros(int((LENGTH + 1.5) * SR))
    last = n_bars - 1
    for b in range(n_bars):
        root, notes = CHORDS[b % 4] if b < last else (45, [57, 60, 64, 69, 72])
        at = b * BAR
        dur = BAR + (1.2 if b == last else 0.05)
        place(buf, pad(notes, dur), at)
        if b == last:
            place(buf, bass(root - 12, 2.0) * 1.2, at)
            continue
        for beat in (0, 2):
            place(buf, bass(root - 12 if beat == 0 else root, BEAT * 1.8), at + beat * BEAT)
        # 드럼은 둘째 마디부터, 마지막 마디는 빠진다
        if b >= 1:
            for beat in range(4):
                if beat in (0, 2):
                    place(buf, kick(), at + beat * BEAT)
                place(buf, hat(), at + (beat + 0.5) * BEAT)
        if b >= 2:
            for beat in (1, 3):
                place(buf, snare(), at + beat * BEAT)
    return buf


def accents(frames):
    buf = np.zeros(int((LENGTH + 1.5) * SR))
    for i, fr in enumerate(frames):
        at = fr / FPS
        bar = int(at // BAR)
        _, notes = CHORDS[bar % 4]
        # 같은 장면 안에서는 한 음씩 올라간다
        place(buf, xylo(notes[i % len(notes)] + 12), at)
    return buf


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    data = (np.stack([x, x], axis=1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def demo_sfx(locale):
    """timeline의 click은 버리고, 그 언어 녹화의 탭마다 소리를 넣는다 (점·자세히 = 딸깍, 확대 = 톡)"""
    demo = next(s for s in TL["scenes"] if s["id"] == "demo")
    manifest = json.loads((ROOT / "public" / "demo" / locale / "manifest.json").read_text())
    taps = [
        {"frame": demo["from"] + round(t["t"] * FPS), "type": "tick" if t["label"] == "zoom" else "click"}
        for t in manifest["taps"]
        if t["t"] * FPS < demo["duration"]
    ]
    return [e for e in TL["sfx"] if e["type"] != "click"] + taps


def main(locale):
    OUT.mkdir(parents=True, exist_ok=True)
    n = int(LENGTH * SR)
    n_bars = round(LENGTH / BAR)

    mus = music(n_bars)[:n] * MUSIC_GAIN + accents(TL["accents"])[:n] * ACCENT_GAIN
    fade = int(0.4 * SR)
    mus[-fade:] *= np.linspace(1, 0, fade)

    fx = np.zeros(n)
    events = demo_sfx(locale)
    kept = thin(events)
    for e in kept:
        place(fx, SFX[e["type"]]() * SFX_GAIN, e["frame"] / FPS)

    # 합친 소리 기준으로 크기 맞추기 (-14 LUFS 근처를 RMS로 어림)
    # 킥·쿵 봉우리는 부드럽게 눌러서 -1dB 아래로
    mix = mus + fx
    mix = mix * (10 ** (-15 / 20) / np.sqrt(np.mean(mix**2)))
    ceil = 10 ** (-1 / 20)
    mix = np.tanh(mix / ceil) * ceil
    write_wav(OUT / f"mix-{locale}.wav", mix)

    peak = 20 * np.log10(np.max(np.abs(mix)))
    level = 20 * np.log10(np.sqrt(np.mean(mix**2)))
    print(f"{locale}: 길이 {LENGTH:.2f}s · 마디 {n_bars} · 효과음 {len(kept)}/{len(events)}개 · RMS {level:.1f}dBFS · 봉우리 {peak:.1f}dBFS")


# make_social.py가 곡·효과음만 가져다 쓸 때는 돌지 않게
if __name__ == "__main__":
    for loc in sys.argv[1:]:
        main(loc)
