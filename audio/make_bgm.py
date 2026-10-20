# 채널 전용 브금: 곡을 MIDI로 직접 쓰고 fluidsynth + MuseScore_General.sf2(MIT)로 오케스트라 소리로 렌더
# .venv/bin/python -I audio/make_bgm.py [main battle tension lament triumph]  ->  public/bgm/<이름>.wav
# 준비: brew install fluid-synth, audio/sf/MuseScore_General.sf2
import random, struct, subprocess, sys, wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SF2 = ROOT / "audio/sf/MuseScore_General.sf2"
OUT = ROOT / "public/bgm"
TMP = ROOT / "audio/.bgm"
PPQ = 480

# GM 악기 번호
STRINGS, SLOW_STRINGS, TREMOLO, PIZZ, CELLO, CONTRABASS = 48, 49, 44, 45, 42, 43
HORN, BRASS, TROMBONE, TRUMPET, CHOIR, TIMPANI, TAIKO = 60, 61, 57, 56, 52, 47, 116
SHAKUHACHI, FIDDLE, HARP = 77, 110, 46
# 드럼(채널 10) 번호
KICK, SNARE, CRASH, CHINA, TOM_LO, TOM_HI = 36, 38, 49, 52, 41, 45

PC = {"C": 0, "C#": 1, "Db": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}


def chord(name):
    """'Dm' · 'Bb' · 'A' · 'Ebm' -> (베이스 음, 가운데 음역 3화음)"""
    q = "m" if name.endswith("m") else ""
    root = PC[name[:-1] if q else name]
    third = 3 if q else 4
    tones = [root, root + third, root + 7]
    voiced = sorted(57 + ((t - 57) % 12) for t in tones)  # A3~G#4 안에 모은다
    return 33 + (root - 9) % 12, voiced  # 베이스는 A1~G#2


def note(name):
    """'A4' · 'C#5' · 'Bb3' -> MIDI 번호"""
    return 12 * (int(name[-1]) + 1) + PC[name[:-1]]


class Song:
    def __init__(self, bpm):
        self.bpm = bpm
        self.tracks = {}  # 채널 -> (악기, [(시작박, 길이박, 음, 세기)])

    def part(self, ch, program):
        self.tracks.setdefault(ch, (program, []))
        return self.tracks[ch][1]

    def write(self, path):
        def vlq(n):
            b = [n & 0x7F]
            while n > 127:
                n >>= 7
                b.insert(0, (n & 0x7F) | 0x80)
            return bytes(b)

        chunks = []
        tempo = int(60_000_000 / self.bpm)
        chunks.append(b"\x00\xff\x51\x03" + tempo.to_bytes(3, "big") + b"\x00\xff\x2f\x00")
        for ch, (prog, notes) in sorted(self.tracks.items()):
            ev = []
            for st, du, p, v in notes:
                a = int(st * PPQ)
                b = a + max(1, int(du * PPQ) - 8)
                ev.append((a, 1, bytes([0x90 | ch, p, max(1, min(127, v))])))
                ev.append((b, 0, bytes([0x80 | ch, p, 0])))
            ev.sort(key=lambda e: (e[0], e[1]))
            data = b"\x00" + bytes([0xC0 | ch, prog]) if ch != 9 else b""
            # 오른쪽·왼쪽 자리(팬)와 크기
            pan = {0: 40, 1: 88, 2: 64, 3: 54, 4: 74, 5: 64, 6: 64, 7: 60, 8: 70, 9: 64, 10: 50, 11: 80}.get(ch, 64)
            data += b"\x00" + bytes([0xB0 | ch, 10, pan]) + b"\x00" + bytes([0xB0 | ch, 91, 70])
            t = 0
            for at, _, msg in ev:
                data += vlq(at - t) + msg
                t = at
            data += b"\x00\xff\x2f\x00"
            chunks.append(data)
        with open(path, "wb") as f:
            f.write(b"MThd" + struct.pack(">IHHH", 6, 1, len(chunks), PPQ))
            for c in chunks:
                f.write(b"MTrk" + struct.pack(">I", len(c)) + c)


def hum(v, k=6):
    return v + random.randint(-k, k)


# ---- 곡마다 공통 손놀림 ----
def ostinato(notes, bars, chords, start=0, vel=78, pattern=(0, 0, 7, 0, 12, 0, 7, 0), step=0.5, octave=-12):
    """현악 8분음 반복 리듬: 코드 바뀌어도 계속 달린다"""
    for i, c in enumerate(chords):
        bass, _ = chord(c)
        for k, iv in enumerate(pattern * int(4 / (step * len(pattern)))):
            accent = 14 if k % 4 == 0 else (6 if k % 2 == 0 else 0)
            notes.append((start + i * 4 + k * step, step, bass + 24 + octave + iv, hum(vel + accent)))


def pads(notes, chords, start=0, vel=60, beats=4, up=0):
    for i, c in enumerate(chords):
        _, tri = chord(c)
        for p in tri:
            notes.append((start + i * beats, beats, p + up, hum(vel, 3)))


def basses(notes, chords, start=0, vel=80, beats=4):
    for i, c in enumerate(chords):
        b, _ = chord(c)
        notes.append((start + i * beats, beats, b, hum(vel, 3)))
        if b - 12 >= 28:
            notes.append((start + i * beats, beats, b - 12, hum(vel - 10, 3)))


def melody(notes, line, start=0, vel=88, shift=0):
    t = start
    for n, d in line:
        if n != "-":
            notes.append((t, d, note(n) + shift, hum(vel)))
        t += d
    return t


def drums_march(notes, bars, start=0, vel=96, fill_every=4):
    for b in range(bars):
        s = start + b * 4
        for beat in (0, 2):
            notes.append((s + beat, 1, KICK, hum(vel)))
        notes.append((s + 1, 1, TOM_LO, hum(vel - 20)))
        notes.append((s + 3, 1, TOM_LO, hum(vel - 20)))
        if (b + 1) % fill_every == 0:
            for k in range(8):
                notes.append((s + 2 + k * 0.25, 0.25, TOM_HI if k % 2 else TOM_LO, hum(vel - 30 + k * 4)))


def taiko(notes, bars, start=0, vel=100, pat=(0, 1.5, 2, 3)):
    for b in range(bars):
        for k, p in enumerate(pat):
            notes.append((start + b * 4 + p, 0.5, 41 if k == 0 else 45, hum(vel - (0 if k == 0 else 18))))


def roll(notes, at, beats, pitch, v0=40, v1=100):
    n = int(beats * 8)
    for k in range(n):
        notes.append((at + k / 8, 1 / 8, pitch, int(v0 + (v1 - v0) * k / n)))


# ---- 1. 메인 테마: D단조, 말 달리는 8분음 위에 샤쿠하치 → 호른 → 금관 ----
def main():
    s = Song(92)
    prog = ["Dm", "Bb", "F", "C", "Dm", "Gm", "Bb", "A"]
    A = [("A4", 2), ("D5", 1), ("F5", 1), ("F5", 1.5), ("D5", 0.5), ("Bb4", 2), ("C5", 2), ("A4", 1), ("C5", 1), ("G4", 4),
         ("A4", 1), ("D5", 1), ("F5", 1), ("A5", 1), ("G5", 2), ("F5", 1), ("D5", 1), ("F5", 1.5), ("E5", 0.5), ("D5", 1), ("Bb4", 1), ("C#5", 2), ("A4", 2)]
    B = [("D5", 1.5), ("E5", 0.5), ("F5", 2), ("D5", 1.5), ("F5", 0.5), ("Bb5", 2), ("A5", 3), ("F5", 1), ("G5", 2), ("E5", 2),
         ("F5", 1), ("A5", 1), ("D6", 2), ("Bb5", 1.5), ("A5", 0.5), ("G5", 2), ("F5", 1), ("G5", 1), ("A5", 1), ("Bb5", 1), ("A5", 4)]
    strings, bass = s.part(0, STRINGS), s.part(1, CONTRABASS)
    flute, horn, brass = s.part(2, SHAKUHACHI), s.part(3, HORN), s.part(4, BRASS)
    choir, timp, tai, dr = s.part(5, CHOIR), s.part(6, TIMPANI), s.part(7, TAIKO), s.part(9, 0)
    # 인트로 4마디: 낮은 현 + 북
    for i in range(4):
        bass.append((i * 4, 4, 38, hum(70)))
        bass.append((i * 4, 4, 26, hum(60)))
    taiko(tai, 4, 0, 82, (0, 2))
    roll(timp, 14, 2, 38)
    # A 8마디: 8분음 + 샤쿠하치
    ostinato(strings, 8, prog, 16, 70)
    basses(bass, prog, 16, 72)
    melody(flute, A, 16, 84)
    taiko(tai, 8, 16, 90)
    # B 8마디: 호른이 받고 합창이 깔린다
    ostinato(strings, 8, prog, 48, 80)
    basses(bass, prog, 48, 82)
    pads(choir, prog, 48, 56, up=12)
    melody(horn, A, 48, 96, -12)
    taiko(tai, 8, 48, 100)
    drums_march(dr, 8, 48, 80)
    roll(timp, 78, 2, 38, 50, 115)
    # C 8마디: 절정, 금관이 높은 선율
    dr.append((80, 2, CRASH, 110))
    ostinato(strings, 8, ["Dm", "Bb", "F", "C", "Dm", "Gm", "Bb", "A"], 80, 92)
    basses(bass, prog, 80, 92)
    pads(choir, prog, 80, 70, up=12)
    melody(brass, B, 80, 108, -12)
    melody(horn, B, 80, 92, -24)
    taiko(tai, 8, 80, 112, (0, 1, 1.5, 2, 3, 3.5))
    drums_march(dr, 8, 80, 100, 2)
    for b in range(8):
        timp.append((80 + b * 4, 1, 38 if b % 4 != 3 else 33, hum(100)))
    # 끝 4마디: D 화음으로 내려앉음
    dr.append((112, 4, CHINA, 100))
    pads(strings, ["Dm"] * 2, 112, 80, beats=8)
    pads(choir, ["Dm"], 112, 70, beats=8, up=12)
    basses(bass, ["Dm"], 112, 85, beats=8)
    horn.extend([(112, 8, note("D4"), 90), (112, 8, note("A4"), 85)])
    roll(timp, 112, 6, 38, 110, 30)
    return s


# ---- 2. 전투: 빠른 3+3+2 리듬, 금관 찌르기, 합창 ----
def battle():
    s = Song(138)
    prog = ["Dm", "Dm", "Bb", "C"] * 2 + ["Gm", "Gm", "Bb", "A"] * 2
    strings, lo, bass = s.part(0, STRINGS), s.part(10, CELLO), s.part(1, CONTRABASS)
    brass, horn, trb = s.part(4, BRASS), s.part(3, HORN), s.part(8, TROMBONE)
    choir, timp, tai, dr = s.part(5, CHOIR), s.part(6, TIMPANI), s.part(7, TAIKO), s.part(9, 0)
    stab_rhythm = [0, 1.5, 3]  # 3+3+2
    total = 0
    for rep in range(3):
        st = rep * len(prog) * 4
        level = [0, 10, 18][rep]
        ostinato(strings, len(prog), prog, st, 80 + level, pattern=(0, 0, 0, 12, 0, 0, 7, 0), step=0.5, octave=0)
        ostinato(lo, len(prog), prog, st, 84 + level, pattern=(0, 0, 0, 0, 0, 0, 0, 0), step=0.5, octave=-12)
        basses(bass, prog, st, 86 + level)
        for i, c in enumerate(prog):
            _, tri = chord(c)
            for p in stab_rhythm:
                for n in tri:
                    (brass if rep else trb).append((st + i * 4 + p, 0.5 if p < 3 else 1, n - 12, hum(96 + level)))
            dr.append((st + i * 4, 0.5, KICK, hum(108)))
            dr.append((st + i * 4 + 1.5, 0.5, KICK, hum(100)))
            dr.append((st + i * 4 + 2, 0.5, SNARE, hum(90 + level)))
            dr.append((st + i * 4 + 3, 0.5, KICK, hum(100)))
            if i % 4 == 3:
                for k in range(8):
                    dr.append((st + i * 4 + 2 + k * 0.25, 0.25, SNARE, hum(70 + k * 6)))
        taiko(tai, len(prog), st, 104 + level // 2, (0, 0.75, 1.5, 2, 3, 3.5))
        if rep >= 1:
            pads(choir, prog, st, 70 + level, up=12)
            hero = [("D5", 3), ("A4", 1), ("D5", 2), ("F5", 2), ("E5", 3), ("C5", 1), ("G5", 4),
                    ("F5", 2), ("E5", 1), ("D5", 1), ("C5", 2), ("A4", 2), ("D5", 8)]
            hero2 = [("G5", 3), ("D5", 1), ("G5", 2), ("Bb5", 2), ("A5", 3), ("F5", 1), ("D5", 4),
                     ("Bb5", 2), ("A5", 1), ("G5", 1), ("F5", 2), ("E5", 2), ("C#5", 4), ("A4", 4)]
            t = melody(horn, hero, st, 100 + level, -12)
            melody(horn, hero2, t, 100 + level, -12)
            melody(brass, hero, st, 92 + level, 0) if rep == 2 else None
            melody(brass, hero2, t, 92 + level, 0) if rep == 2 else None
        dr.append((st, 2, CRASH, 112))
        for b in range(len(prog)):
            timp.append((st + b * 4, 1, 38, hum(96 + level)))
        total = st + len(prog) * 4
    # 끝: 쾅
    for n in (38, 45, 50, 53, 57, 62):
        brass.append((total, 4, n, 118))
    dr.append((total, 4, CRASH, 120))
    dr.append((total, 4, KICK, 120))
    roll(timp, total, 4, 38, 120, 30)
    return s


# ---- 3. 긴장: 낮은 지속음, 반음 부딪침, 심장 뛰는 팀파니 ----
def tension():
    s = Song(72)
    trem, cello, bass, pizz = s.part(0, TREMOLO), s.part(10, CELLO), s.part(1, CONTRABASS), s.part(11, PIZZ)
    choir, timp, horn, high = s.part(5, CHOIR), s.part(6, TIMPANI), s.part(3, HORN), s.part(2, SLOW_STRINGS)
    bars = 28
    for b in range(0, bars, 2):
        bass.append((b * 4, 8, 26, hum(78)))
        cello.append((b * 4, 8, 38, hum(70)))
    # 위쪽 현이 반음씩 기어오른다
    clash = [("D4", "Eb4"), ("D4", "F4"), ("C4", "Db4"), ("D4", "Eb4"), ("Bb3", "Cb4" if False else "B3"), ("D4", "Eb4"), ("Db4", "D4")]
    for i in range(bars // 4):
        a, b2 = clash[i % len(clash)]
        trem.append((i * 16, 16, note(a), hum(56 + i * 3)))
        trem.append((i * 16 + 4, 12, note(b2), hum(48 + i * 3)))
    for b in range(bars):
        # 심장 박동: 쿵-쿵 ... 쿵-쿵
        timp.append((b * 4, 0.5, 38, hum(80 + b)))
        timp.append((b * 4 + 0.6, 0.5, 38, hum(64 + b)))
        if b >= 8:
            for k in range(4):
                pizz.append((b * 4 + k, 0.5, 38 + (12 if k == 2 else 0), hum(66 + b // 2)))
    for i, st in enumerate(range(32, bars * 4, 16)):
        choir.extend([(st, 12, note("D5"), hum(50 + 4 * i)), (st, 12, note("Eb5"), hum(40 + 4 * i))])
    horn.extend([(72, 6, note("A3"), 78), (78, 2, note("Bb3"), 84), (80, 12, note("A3"), 88)])
    for b in range(20, bars):
        high.append((b * 4, 4, note("D6") + (1 if b % 2 else 0), hum(40 + (b - 20) * 4)))
    roll(timp, bars * 4 - 6, 6, 38, 40, 118)
    s.part(9, 0).append((bars * 4, 4, CHINA, 115))
    return s


# ---- 4. 비가: 느린 현, 첼로 독주, 합창 ----
def lament():
    s = Song(64)
    prog = ["Dm", "Bb", "Gm", "A", "Dm", "F", "Gm", "A", "Bb", "F", "Gm", "Dm", "Bb", "Gm", "A", "Dm"]
    strings, cello, bass, choir, harp, fiddle = s.part(0, SLOW_STRINGS), s.part(10, CELLO), s.part(1, CONTRABASS), s.part(5, CHOIR), s.part(11, HARP), s.part(2, FIDDLE)
    pads(strings, prog, 0, 58)
    basses(bass, prog, 0, 62)
    for i, c in enumerate(prog):
        _, tri = chord(c)
        for k, p in enumerate((tri + [tri[0] + 12]) * 2):
            harp.append((i * 4 + k * 0.5, 0.5, p, hum(46, 4)))
    line = [("A4", 3), ("G4", 0.5), ("F4", 0.5), ("D4", 4), ("D5", 2), ("C5", 1), ("Bb4", 1), ("A4", 2), ("E4", 2),
            ("F4", 1.5), ("G4", 0.5), ("A4", 2), ("C5", 2), ("Bb4", 1), ("A4", 1), ("E4", 2), ("A4", 2), ("C5", 2),
            ("D5", 3), ("F5", 1), ("C5", 4), ("Bb4", 2), ("D5", 2), ("A4", 4), ("Bb4", 2), ("G4", 2), ("A4", 2), ("C#5", 2), ("D5", 8)]
    melody(cello, line, 0, 82, -12)
    melody(fiddle, line[12:], 32, 70, 0)
    pads(choir, prog[8:], 32, 52, up=12)
    return s


# ---- 5. 승리·엔딩: D장조 팡파르 ----
def triumph():
    s = Song(100)
    prog = ["D", "A", "Bm", "G", "D", "A", "G", "A", "Bm", "G", "D", "A", "G", "A", "D", "D"]
    strings, bass, brass, horn, trumpet = s.part(0, STRINGS), s.part(1, CONTRABASS), s.part(4, BRASS), s.part(3, HORN), s.part(8, TRUMPET)
    choir, timp, dr = s.part(5, CHOIR), s.part(6, TIMPANI), s.part(9, 0)
    ostinato(strings, len(prog), prog, 0, 76, pattern=(0, 7, 12, 7), step=0.5, octave=0)
    basses(bass, prog, 0, 84)
    pads(choir, prog, 16, 64, up=12)
    pads(horn, prog, 0, 70)
    fan = [("D5", 1), ("D5", 0.5), ("D5", 0.5), ("A5", 2), ("F#5", 1.5), ("E5", 0.5), ("D5", 1), ("E5", 1), ("F#5", 3), ("D5", 1),
           ("B4", 2), ("D5", 2), ("G5", 3), ("F#5", 0.5), ("E5", 0.5), ("D5", 2), ("C#5", 2), ("E5", 4),
           ("D5", 1), ("D5", 0.5), ("D5", 0.5), ("A5", 2), ("B5", 1.5), ("A5", 0.5), ("G5", 1), ("F#5", 1), ("E5", 4),
           ("G5", 2), ("F#5", 2), ("E5", 2), ("C#5", 2), ("D5", 8)]
    melody(trumpet, fan, 16, 104)
    melody(brass, fan, 32, 100, -12)
    for b in range(len(prog)):
        timp.append((b * 4, 1, 38 if prog[b] != "A" else 33, hum(96)))
        timp.append((b * 4 + 2, 1, 38 if prog[b] != "A" else 33, hum(80)))
        dr.append((b * 4, 0.5, KICK, hum(96)))
    dr.extend([(0, 2, CRASH, 100), (32, 2, CRASH, 110), (56, 4, CRASH, 118)])
    roll(timp, 54, 2, 38, 50, 120)
    return s


SONGS = {"main": main, "battle": battle, "tension": tension, "lament": lament, "triumph": triumph}


def render(name):
    random.seed(name)
    s = SONGS[name]()
    TMP.mkdir(exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    mid, raw = TMP / f"{name}.mid", TMP / f"{name}.wav"
    s.write(mid)
    subprocess.run(
        ["fluidsynth", "-ni", "-q", "-r", "48000", "-g", "0.5",
         "-o", "synth.reverb.room-size=0.75", "-o", "synth.reverb.level=0.55", "-o", "synth.reverb.width=1.0",
         "-o", "synth.chorus.active=0", "-F", str(raw), str(SF2), str(mid)],
        check=True,
    )
    with wave.open(str(raw)) as w:
        ch, rate = w.getnchannels(), w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32).reshape(-1, ch) / 32768
    # 끝 무음 자르고(울림 2.5초는 남김) 크기 맞추기
    loud = np.where(np.abs(x).max(axis=1) > 1e-3)[0]
    x = x[: min(len(x), loud[-1] + int(2.5 * rate))]
    x *= 0.89 / max(1e-6, np.abs(x).max())
    fade = int(1.5 * rate)
    x[-fade:] *= np.linspace(1, 0, fade)[:, None]
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(ch)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    print(f"{name}: {len(x) / rate:.1f}s -> public/bgm/{name}.wav")


if __name__ == "__main__":
    for n in sys.argv[1:] or SONGS:
        render(n)
