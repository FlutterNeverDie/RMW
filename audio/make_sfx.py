# 해설 영상 효과음: 타악·금관 한 방은 오케스트라 소리(fluidsynth + MuseScore_General), 바람 소리는 numpy로
# .venv/bin/python -I audio/make_sfx.py  ->  public/sfx/ep/<이름>.wav
import subprocess, wave
from pathlib import Path
import numpy as np
import make_bgm as M

OUT = M.ROOT / "public/sfx/ep"
SR = 48000
rng = np.random.default_rng(3)


def save(name, x):
    OUT.mkdir(parents=True, exist_ok=True)
    x = x / max(1e-9, np.abs(x).max()) * 0.9
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    print(f"{name}: {len(x) / SR:.2f}s")


def band_noise(seconds, lo, hi):
    n = int(seconds * SR)
    X = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, n)


def whoosh(seconds=0.7, rise=0.55):
    # 높아지며 지나가는 바람: 대역을 시간에 따라 올린 잡음 조각을 겹친다
    n = int(seconds * SR)
    out = np.zeros(n)
    steps = 14
    for k in range(steps):
        a, b = k * n // steps, (k + 1) * n // steps
        c = 300 + 2600 * (k / steps) ** 1.5
        seg = band_noise((b - a) / SR + 0.05, c * 0.6, c * 1.8)[: b - a]
        out[a:b] += seg * np.hanning(b - a)
    env = np.interp(np.arange(n), [0, rise * n, n], [0, 1, 0]) ** 1.6
    return out * env


def midi_hit(name, notes, seconds=3.0, gain="0.6"):
    """notes = [(채널, 악기, 음, 세기, 길이박)] 한 번 치고 울림까지"""
    s = M.Song(60)
    for ch, prog, p, v, d in notes:
        s.part(ch, prog).append((0, d, p, v))
    mid, raw = M.TMP / f"sfx-{name}.mid", M.TMP / f"sfx-{name}.wav"
    M.TMP.mkdir(exist_ok=True)
    s.write(mid)
    subprocess.run(["fluidsynth", "-ni", "-q", "-r", str(SR), "-g", gain, "-o", "synth.reverb.room-size=0.7", "-o", "synth.reverb.level=0.5", "-F", str(raw), str(M.SF2), str(mid)], check=True)
    with wave.open(str(raw)) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32).reshape(-1, 2) / 32768
    x = x[: int(seconds * SR)]
    fade = int(0.3 * SR)
    x[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return x


if __name__ == "__main__":
    save("whoosh", whoosh(0.75))
    save("swish", whoosh(0.45, 0.4) * 0.7)
    # 제목 카드: 낮은 금관 + 팀파니 + 심벌
    save("boom", midi_hit("boom", [(0, M.BRASS, 38, 120, 2), (1, M.BRASS, 26, 110, 2), (6, M.TIMPANI, 38, 127, 1), (7, M.TAIKO, 41, 127, 1), (9, 0, M.CRASH, 120, 2), (9, 0, M.KICK, 127, 1)], 3.2))
    # 도장·충격: 팀파니 + 태고 + 차이나 심벌
    save("impact", midi_hit("impact", [(6, M.TIMPANI, 33, 127, 1), (7, M.TAIKO, 41, 127, 1), (9, 0, M.CHINA, 115, 1), (9, 0, M.KICK, 127, 1)], 2.2))
    # 인물 대사 등장: 낮은 현 한 번 + 북
    save("hit", midi_hit("hit", [(0, M.STRINGS, 38, 110, 1), (1, M.CONTRABASS, 26, 120, 1), (7, M.TAIKO, 41, 110, 1)], 1.8))
    # 연도 넘김: 나무 토막
    save("tick", midi_hit("tick", [(9, 0, 76, 70, 0.25)], 0.35, "0.4"))
    # 전투·진군: 태고 연타
    s = [(7, M.TAIKO, 41, 120 - k * 6, 0.25) for k in range(1)]
    save("drum", midi_hit("drum", [(7, M.TAIKO, 41, 125, 1), (9, 0, M.KICK, 120, 1)], 1.5))
