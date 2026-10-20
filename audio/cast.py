# 배역 목소리 오디션: cast.json의 배역마다 대표 대사를 읽혀서 높낮이·울림을 입힌다
# .venv/bin/python -I audio/cast.py [배역키...]  ->  public/voices/cast/<키>.wav + hwm/tts/배역 목소리/<한글 이름>.wav
# 목소리는 scripts/tts.mjs로 받는다(무료 한도 지킴이·캐시 그대로). Chirp 3 HD는 높낮이 조절이 안 돼서 여기서 직접 바꾼다
import json, shutil, subprocess, sys, wave
from pathlib import Path
import numpy as np

CODE = Path(__file__).resolve().parent.parent
HOME = CODE.parent
CAST = json.loads((CODE / "cast.json").read_text())["roles"]
RAW = CODE / "audio/.cast-raw"
OUT = CODE / "public/voices/cast"
DELIVER = HOME / "tts/배역 목소리"


def read(p):
    with wave.open(str(p)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768, w.getframerate()


def write(p, x, sr):
    p.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def stretch(x, factor, n=2048, h=512):
    """길이만 factor배로 (음 높이 그대로) - 위상 보코더"""
    win = np.hanning(n)
    frames = np.array([np.fft.rfft(win * x[i : i + n]) for i in range(0, len(x) - n, h)])
    steps = np.arange(0, len(frames) - 1, 1 / factor)
    expected = 2 * np.pi * h * np.arange(n // 2 + 1) / n
    phase = np.angle(frames[0])
    out = np.zeros(int(len(steps) * h + n))
    for k, s in enumerate(steps):
        i = int(s)
        a, b = frames[i], frames[i + 1]
        mag = (1 - (s - i)) * np.abs(a) + (s - i) * np.abs(b)
        out[k * h : k * h + n] += win * np.fft.irfft(mag * np.exp(1j * phase))
        d = np.angle(b) - np.angle(a) - expected
        phase += expected + (d - 2 * np.pi * np.round(d / (2 * np.pi)))
    return out / (win**2).sum() * h


def shift(x, semis):
    """음 높이만 semis 반음 (길이 그대로)"""
    if not semis:
        return x
    r = 2 ** (semis / 12)
    y = stretch(np.concatenate([x, np.zeros(2048)]), r)
    idx = np.arange(0, len(y) - 1, r)
    return np.interp(idx, np.arange(len(y)), y)[: len(x)]


def reverb(x, sr, seconds, mix, dark=False):
    """부드러운 울림: 고음은 빨리, 저음은 천천히 사라지는 잔향 (잡음 섞인 쉬익 소리가 안 남게)"""
    rng = np.random.default_rng(7)
    n = int(sr * seconds)
    t = np.arange(n) / sr
    noise = rng.standard_normal(n)
    lo = lowpass(noise, sr, 1800 if dark else 2600) * np.exp(-6.9 * t / seconds)
    hi = (noise - lowpass(noise, sr, 2600)) * np.exp(-6.9 * t / (seconds * 0.25)) * 0.3
    ir = (lo + (0 if dark else hi)) * np.minimum(1, t / 0.03)  # 0.03초에 걸쳐 부드럽게 시작
    ir[: int(0.015 * sr)] = 0
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x) + n]
    wet *= np.abs(x).max() / max(1e-9, np.abs(wet).max())
    dry = np.concatenate([x, np.zeros(n)])
    return (1 - mix) * dry + mix * wet


def lowpass(x, sr, hz):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / sr)
    X *= 1 / np.sqrt(1 + (f / hz) ** 4)
    return np.fft.irfft(X, len(x))


def gate(x, sr):
    """말 사이 숨소리·바탕 잡음만 부드럽게 줄인다 (말소리는 건드리지 않음)"""
    n = int(sr * 0.01)
    e = np.sqrt(np.convolve(x**2, np.ones(n) / n, "same"))
    th = np.abs(x).max() * 10 ** (-38 / 20)
    g = np.clip((e / th - 0.5) / 0.5, 0, 1) ** 2
    g = np.maximum(g, 10 ** (-24 / 20))  # 완전히 끊지 않고 -24dB까지만
    # 문 열고 닫히는 게 들리지 않게 매끄럽게
    k = int(sr * 0.03)
    g = np.convolve(g, np.hanning(k) / np.hanning(k).sum(), "same")
    return x * g


def clarity(x, sr):
    """먹먹함 풀기: 목소리마다 부족한 만큼만 또렷한 대역(2~6kHz)을 올리고, 웅웅거리는 저음(250Hz 아래)은 줄인다"""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / sr)
    p = np.abs(X) ** 2
    share = lambda a, b: p[(f >= a) & (f < b)].sum() / p.sum()
    up = np.clip(10 * np.log10(0.035 / max(share(2000, 5000), 1e-6)), 0, 6)  # 너무 올리면 잡음도 커진다
    down = np.clip(10 * np.log10(share(0, 250) / 0.18), 0, 6)
    bell = lambda c, w: np.exp(-0.5 * (np.log2(np.maximum(f, 1) / c) / w) ** 2)
    gain_db = up * bell(3500, 0.8) + up * 0.2 * bell(7000, 0.5) - down * (1 / (1 + (f / 220) ** 4))
    gain_db -= 6 * (1 / (1 + (10500 / np.maximum(f, 1)) ** 6))  # 10.5kHz 위 쉿 소리는 깎는다
    gain = 10 ** (gain_db / 20) / np.sqrt(1 + (70 / np.maximum(f, 1)) ** 4)  # 70Hz 아래 울림 제거
    return np.fft.irfft(X * gain, len(x))


def level(x, target_db=-20):
    """크기 맞추기: 말소리 평균 크기 기준, 끝은 -1dB 안 넘게"""
    loud = x[np.abs(x) > np.abs(x).max() * 0.05]
    rms = np.sqrt((loud**2).mean()) if len(loud) else 1e-9
    y = x * 10 ** (target_db / 20) / rms
    return y * min(1, 0.89 / max(1e-9, np.abs(y).max()))


def fx(x, sr, kind):
    if kind == "hall":
        return reverb(x, sr, 1.8, 0.16)
    if kind == "room":
        return reverb(x, sr, 0.45, 0.09)
    if kind == "dark":
        x = lowpass(x, sr, 6000)
        return reverb(x, sr, 1.4, 0.15, dark=True)
    return x


def build(key):
    r = CAST[key]
    RAW.mkdir(parents=True, exist_ok=True)
    raw = RAW / f"{key}.wav"
    subprocess.run(["node", str(CODE / "scripts/tts.mjs"), "say", r["line"], str(raw), r["voice"], str(r["rate"])], check=True)
    x, sr = read(raw)
    y = level(fx(shift(gate(clarity(x, sr), sr), r["pitch"]), sr, r["fx"]))
    write(OUT / f"{key}.wav", y, sr)
    DELIVER.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(OUT / f"{key}.wav", DELIVER / f"{r['ko'].replace('/', '·')}.wav")


if __name__ == "__main__":
    for k in sys.argv[1:] or CAST:
        build(k)
