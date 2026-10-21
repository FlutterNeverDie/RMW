# 채널 전용 브금: 곡을 MIDI로 직접 쓰고 실제 오케스트라 녹음 음원으로 렌더
# .venv/bin/python -I audio/make_bgm.py [곡 이름 ...]  ->  public/bgm/<이름>.wav  (곡 목록은 아래 SONGS)
# 2026-10-21 음원 교체: 현·금관·팀파니·하프·타악은 VSCO 2 CE(CC0, 실제 녹음, audio/sf/vsco2) + sfizz,
#   음표 길이로 주법을 고른다(짧으면 스피카토·스타카토, 길면 비브라토 지속음). 음역으로 바이올린·비올라·첼로를 나눈다
#   VSCO에 없는 합창·타이코·샤쿠하치만 fluidsynth + MuseScore_General.sf2(MIT)
#   악기마다 따로 찍어 자리(팬)·크기를 잡고, 합친 뒤 공연장 울림(컨볼루션)을 건다
# 준비: setup.sh (fluid-synth, MuseScore_General.sf2, vsco2, sfizz_render)
import random, re, struct, subprocess, sys, wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SF2 = ROOT / "audio/sf/MuseScore_General.sf2"
VSCO = ROOT / "audio/sf/vsco2"
SFIZZ = Path.home() / "src/sfizz/build/library/bin/sfizz_render"
RATE = 48000
OUT = ROOT / "public/bgm"
TMP = ROOT / "audio/.bgm"
PPQ = 480

# GM 악기 번호
STRINGS, SLOW_STRINGS, TREMOLO, PIZZ, CELLO, CONTRABASS = 48, 49, 44, 45, 42, 43
HORN, BRASS, TROMBONE, TRUMPET, CHOIR, TIMPANI, TAIKO = 60, 61, 57, 56, 52, 47, 116
SHAKUHACHI, FIDDLE, HARP = 77, 110, 46
# 2026-10-21 추가: 목관·건반 타악·독주 바이올린·튜바 등 VSCO에 있는데 안 쓰던 악기
FLUTE, PICCOLO, OBOE, CLARINET, BASSOON, TUBA = 73, 72, 68, 71, 70, 58
GLOCK, MARIMBA, BELLS, VIOLIN, MUTED_HORN = 9, 12, 14, 40, 59
BASS_PIZZ, BASS_TREM, TIMP_ROLL = 32, 34, 117  # GM에 딱 맞는 게 없어 빈 번호를 빌림 (VSCO 전용)
# 드럼(채널 10) 번호
KICK, SNARE, CRASH, CHINA, TOM_LO, TOM_HI = 36, 38, 49, 55, 41, 48  # VSCO 타악에 45·52가 없어 48·55(스플래시)로 (2026-10-21)
# VSCO GM-StylePerc 실제 배치 (주의: 41은 스네어 롤, 45·52는 소리 없음)
BDRUM, SNARE_ROLL, GONG, CYM_SWELL, SUS_CYM, TAMB, TRIANGLE, BELL_TREE = 36, 39, 46, 48, 51, 54, 79, 83
HAND_TAP, HAND_MID, HAND_LO, RUB, ANVIL = 60, 63, 65, 33, 67  # 콩가·툼바(손북 대용), 큰북 문지르기, 모루

PC = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


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


# 채널별 기본 자리(팬) 0=왼쪽 127=오른쪽
PAN = {0: 40, 1: 88, 2: 64, 3: 54, 4: 74, 5: 64, 6: 64, 7: 60, 8: 70, 9: 64, 10: 50, 11: 80, 12: 64, 13: 64, 14: 64, 15: 64}


class Song:
    def __init__(self, bpm):
        self.bpm = bpm
        self.tracks = {}  # 채널 -> (악기, [(시작박, 길이박, 음, 세기)])
        self.pan = dict(PAN)
        self.dyn = {}  # 채널 -> [(박, dB)] 크기 곡선 (렌더 때 소리에 곱함: 크레셴도·스웰)
        self.legato = set()  # 짧은 음도 지속음 주법으로 (선율 악기 이음줄)
        self.trim = {}  # 채널 -> dB (세기는 그대로 두고 크기만: 하프처럼 여리게 뜯은 소리를 키울 때)

    def part(self, ch, program, pan=None):
        self.tracks.setdefault(ch, (program, []))
        if pan is not None:
            self.pan[ch] = pan
        return self.tracks[ch][1]

    def swell(self, ch, *points):
        """(박, dB) 점들로 크기 곡선 - 점 사이는 직선"""
        self.dyn.setdefault(ch, []).extend(points)

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
            data += b"\x00" + bytes([0xB0 | ch, 10, self.pan[ch]]) + b"\x00" + bytes([0xB0 | ch, 91, 70])
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


def arp(notes, chords, start=0, shape=(0, 1, 2, 3), step=0.5, vel=60, up=0, beats=4, accent=8, k=4):
    """화음 펼침(하프·마림바·현 16분음). shape는 화음 음 번호: 0~2 = 3화음, 3~5 = 한 옥타브 위, 6~8 = 두 옥타브 위"""
    for i, c in enumerate(chords):
        _, tri = chord(c)
        tones = tri + [x + 12 for x in tri] + [x + 24 for x in tri]
        for j in range(int(round(beats / step))):
            at = j * step
            notes.append((start + i * beats + at, step, tones[shape[j % len(shape)]] + up, hum(vel + (accent if abs(at - round(at)) < 1e-6 else 0), k)))


def walk(notes, chords, start=0, vel=70, beats=4, up=0):
    """걸어가는 베이스(피치카토): 밑음·3음·5음 + 다음 화음으로 반음 다가가기"""
    for i, c in enumerate(chords):
        b, _ = chord(c)
        nb, _ = chord(chords[(i + 1) % len(chords)])
        third = 3 if c.endswith("m") else 4
        near = min((nb - 1, nb + 1, nb + 11, nb + 13), key=lambda x: abs(x - b - 7))
        for k, p in enumerate((b, b + third, b + 7, near)):
            notes.append((start + i * beats + k * beats / 4, 0.5, p + up, hum(vel + (10 if k == 0 else 0))))


def gallop(notes, chords, start=0, vel=64, up=12):
    """말발굽 셋잇단 (따-다 따-다): 현 저음 스피카토"""
    for i, c in enumerate(chords):
        b, _ = chord(c)
        for beat in range(4):
            notes.append((start + i * 4 + beat, 0.3, b + up, hum(vel + (8 if beat % 2 == 0 else 0))))
            notes.append((start + i * 4 + beat + 2 / 3, 0.3, b + up, hum(vel - 10)))


def hand_drum(notes, bars, start=0, vel=70, full=True):
    """손북(12/8 느낌): 쿵-따 쿵-따 쿵-따 쿵따따 + 큰북 받침"""
    T = 1 / 3
    for b in range(bars):
        s0 = start + b * 4
        notes.append((s0, 1, BDRUM, hum(vel - 12)))
        for beat in range(4):
            notes.append((s0 + beat, T, HAND_LO, hum(vel + (8 if beat % 2 == 0 else 0))))
            if full:
                notes.append((s0 + beat + 2 * T, T, HAND_TAP, hum(vel - 14)))
        if full:
            notes.append((s0 + 3 + T, T, HAND_MID, hum(vel - 8)))


def snare_march(notes, bars, start=0, vel=84, roll_every=4):
    """행진 스네어: 따-다닥 따 따다닥 따 + 4마디마다 롤로 넘김, 큰북은 1·3박"""
    hits = ((0, 14), (0.75, -16), (1, 0), (2, 10), (2.5, -6), (2.75, -16), (3, 0), (3.5, -6))
    for b in range(bars):
        s0 = start + b * 4
        notes.append((s0, 1, BDRUM, hum(vel)))
        notes.append((s0 + 2, 1, BDRUM, hum(vel - 10)))
        last = (b + 1) % roll_every == 0
        for at, acc in hits:
            if not (last and at >= 3):
                notes.append((s0 + at, 0.25, SNARE, hum(vel + acc)))
        if last:
            notes.append((s0 + 3, 1, SNARE_ROLL, hum(vel - 6)))


def cym_swell(notes, at, bpm, vel=80):
    """서스펜디드 심벌 크레셴도: 가장 큰 순간(녹음 3.5초 지점)이 at 박에 오게"""
    pre = 3.5 * bpm / 60
    notes.append((max(0, at - pre), pre, CYM_SWELL, vel))


def timp_note(b):
    """팀파니 음역(C2~C4)에 들어오게 옥타브 맞춤"""
    return b + 12 if b < 36 else b


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
        timp.append((80 + b * 4, 1, 38 if b % 4 != 3 else 45, hum(100)))
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
        high.append((b * 4, 4, note("D5") + (1 if b % 2 else 0), hum(40 + (b - 20) * 4)))
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
        timp.append((b * 4, 1, 38 if prog[b] != "A" else 45, hum(96)))
        timp.append((b * 4 + 2, 1, 38 if prog[b] != "A" else 45, hum(80)))
        dr.append((b * 4, 0.5, KICK, hum(96)))
    dr.extend([(0, 2, CRASH, 100), (32, 2, CRASH, 110), (56, 4, CRASH, 118)])
    roll(timp, 54, 2, 38, 50, 120)
    return s


# ==== 2026-10-21 추가 곡: 분위기·빠르기·조·편성을 서로 다르게 (10분짜리 한 편에서 같은 소리가 반복되지 않게) ====

# ---- 6. 초원·유목: E 도리안, 열린 5도 지속음 위에 플루트 → 독주 바이올린 → 호른, 손북 셋잇단 ----
def steppe():
    s = Song(72)
    T = 1 / 3
    A = [("B4", 1), ("E5", 2 * T), ("F#5", T), ("G5", 1), ("F#5", 2 * T), ("E5", T),
         ("D5", 1), ("E5", 2), ("B4", 1),
         ("E5", 2 * T), ("F#5", T), ("G5", 1), ("A5", 1), ("B5", 1),
         ("C#6", 1), ("B5", 2 * T), ("A5", T), ("B5", 2),
         ("E6", 2), ("D6", 2 * T), ("B5", T), ("A5", 1),
         ("G5", 2 * T), ("A5", T), ("B5", 1), ("A5", 2 * T), ("G5", T), ("F#5", 1),
         ("E5", 1), ("D5", 2 * T), ("B4", T), ("D5", 1), ("F#5", 1),
         ("E5", 4)]
    B = [("B5", 3), ("A5", 1), ("G5", 1), ("A5", 2 * T), ("B5", T), ("D6", 2), ("C#6", 2), ("B5", 1), ("A5", 1), ("B5", 4),
         ("E6", 2), ("D6", 1), ("B5", 1), ("C#6", 1), ("B5", 1), ("A5", 1), ("G5", 1), ("F#5", 2), ("D5", 1), ("F#5", 1), ("E5", 4)]
    prog_a = ["Em", "D", "Em", "A", "Em", "G", "D", "Em"]  # A는 도리안의 장3화음 (초원 느낌)
    prog_b = ["Em", "G", "A", "Em", "Em", "A", "D", "Em"]
    bass, cello, harp = s.part(1, CONTRABASS, 88), s.part(10, CELLO, 76), s.part(11, HARP, 30)
    flute, vln, horn = s.part(2, FLUTE, 58), s.part(12, VIOLIN, 48), s.part(3, HORN, 52)
    pad, strings, timp, dr = s.part(0, SLOW_STRINGS, 40), s.part(13, STRINGS, 44), s.part(6, TIMPANI), s.part(9, 0)
    s.trim.update({11: 8, 12: 3})
    s.legato |= {2, 12}
    # 열린 5도 지속음 E1·E2·B2 (끝 4마디까지, 합주 구간은 화음 베이스로)
    for b in list(range(0, 20, 2)) + [28, 30]:
        v = 62 if b < 4 or b >= 28 else 70
        bass.append((b * 4, 8, note("E1"), hum(v, 3)))
        cello.extend([(b * 4, 8, note("E2"), hum(v - 4, 3)), (b * 4, 8, note("B2"), hum(v - 8, 3))])
    # 1) 앞 4마디: 지속음 + 손북 + 하프 열린 5도
    hand_drum(dr, 4, 0, 60, full=False)
    for b in range(2, 4):
        harp.extend([(b * 4, 2, note("E3"), 58), (b * 4 + T, 2, note("B3"), 54), (b * 4 + 2 * T, 2, note("E4"), 52), (b * 4 + 2, 2, note("B4"), 46)])
    # 2) 플루트 홀로 (지속음만, 화음 없이 선법 그대로)
    melody(flute, A, 16, 80)
    hand_drum(dr, 8, 16, 68)
    for b in range(4, 12):
        harp.extend([(b * 4, 2, note("E3"), 56), (b * 4 + T, 2, note("B3"), 52), (b * 4 + 2, 2, note("F#4" if b % 2 else "E4"), 46)])
    # 3) 독주 바이올린 + 여린 현 화음 + 하프 셋잇단 펼침 + 첼로 말발굽
    melody(vln, B, 48, 84)
    pads(pad, prog_b, 48, 50)
    arp(harp, prog_b, 48, (0, 1, 2, 3, 2, 1), step=T, vel=46, up=-12)
    gallop(cello, prog_b, 48, 52)
    hand_drum(dr, 8, 48, 72)
    s.swell(0, (48, -10), (60, 0), (76, 0), (80, -3))
    # 4) 합주: 호른 + 플루트가 같은 선율, 현 전체, 팀파니
    melody(horn, A, 80, 92, -12)
    melody(flute, A, 80, 84)
    pads(strings, prog_a, 80, 66, up=12)
    pads(strings, prog_a, 80, 58)
    gallop(cello, prog_a, 80, 70)
    basses(bass, prog_a, 80, 78)
    arp(harp, prog_a, 80, (0, 1, 2, 3, 4, 5), step=T, vel=50, up=-12)
    hand_drum(dr, 8, 80, 84)
    for b in range(8):
        timp.append((80 + b * 4, 1, note("E2") if prog_a[b] != "A" else note("A2"), hum(84)))
        timp.append((80 + b * 4 + 2, 1, note("B2"), hum(68)))
    s.swell(13, (80, -8), (92, 0))
    # 5) 끝 4마디: 다시 지속음, 플루트 메아리, 북이 잦아들며 처음으로 이어짐
    melody(flute, A[:9], 112, 64)
    hand_drum(dr, 4, 112, 58, full=False)
    s.swell(9, (0, -2), (16, 0), (110, 0), (128, -8))
    return s


# ---- 7. 음모·수수께끼: B단조, 피치카토 걷는 베이스 + 낮은 클라리넷·바순 + 약음 호른 ----
def intrigue():
    s = Song(96)
    prog = ["Bm", "Bm", "G", "F#", "Bm", "Bm", "C", "F#"]  # C = 나폴리 화음 (어딘가 비틀린 느낌)
    line = [("F#3", 1), ("G3", 0.5), ("F#3", 0.5), ("B3", 2), ("D4", 1.5), ("C#4", 0.5), ("D4", 0.5), ("E4", 0.5), ("F#4", 1),
            ("G4", 2), ("F#4", 0.5), ("E4", 0.5), ("D4", 1), ("C#4", 1), ("Bb3", 1), ("F#3", 2),
            ("F#3", 1), ("G3", 0.5), ("F#3", 0.5), ("B3", 1), ("D4", 1), ("F4", 1.5), ("E4", 0.5), ("D4", 1), ("B3", 1),
            ("E4", 1.5), ("D4", 0.5), ("C4", 2), ("C#4", 1), ("D4", 0.5), ("C#4", 0.5), ("Bb3", 2)]
    bass, pizz, bsn = s.part(1, BASS_PIZZ, 86), s.part(0, PIZZ, 42), s.part(10, BASSOON, 72)
    clar, oboe, horn = s.part(2, CLARINET, 58), s.part(12, OBOE, 68), s.part(3, MUTED_HORN, 50)
    harp, glock, trem = s.part(11, HARP, 30), s.part(13, GLOCK, 80), s.part(14, TREMOLO, 36)
    timp, dr = s.part(6, TIMPANI), s.part(9, 0)
    s.trim.update({11: 8, 2: 4, 12: 3, 3: 5})
    s.legato |= {2, 12}
    sections = [(0, ["Bm", "Bm", "G", "F#"])] + [(16 + k * 32, prog) for k in range(4)]
    for n, (st, ch) in enumerate(sections):
        fade = -8 * (n == 4)
        walk(bass, ch, st, 74 + fade)
        for i, c in enumerate(ch):
            b, tri = chord(c)
            timp.append((st + i * 4, 1, timp_note(b), hum(70 + fade)))
            harp.append((st + i * 4 + 2.5, 1, tri[2] + 24, hum(64)))
            if n >= 1:
                # 바순 스타카토 동기: 밑음 · 3음 · 5음 · 반음 내림(b5)으로 기어감
                third = 3 if c.endswith("m") else 4
                for at, iv in ((0, 0), (1, third), (2, 7), (2.5, 6), (3, third)):
                    bsn.append((st + i * 4 + at, 0.4, b + 12 + iv, hum(70 + fade + (8 if at == 0 else 0))))
                # 바이올린 피치카토 엇박
                for at in (1.5, 3.5):
                    pizz.extend([(st + i * 4 + at, 0.5, tri[0] + 12, hum(56 + fade)), (st + i * 4 + at, 0.5, tri[2] + 12, hum(50 + fade))])
            if n in (2, 3) and i % 2 == 0:
                horn.append((st + i * 4, 8, b + 12, hum(78)))
                horn.append((st + i * 4, 8, b + 19, hum(72)))
    # B: 낮은 클라리넷이 몰래 걷는 선율
    melody(clar, line, 48, 88)
    # C: 오보에가 한 옥타브 위로 받고, 클라리넷은 긴 음으로 받침, 높은 트레몰로가 반음으로 부딪침
    melody(oboe, line, 80, 82, 12)
    for i, c in enumerate(prog):
        _, tri = chord(c)
        clar.append((80 + i * 4, 4, tri[1], hum(60)))
    for k in range(2):
        trem.extend([(80 + k * 16, 16, note("B5"), hum(40)), (84 + k * 16, 12, note("C6"), hum(36))])
    for k, n_ in enumerate(("F#6", "F6", "B6", "C7")):
        glock.append((80 + k * 8 + 3, 2, note(n_), hum(66)))
    # 약음 호른은 2마디마다 부풀었다 꺼짐
    for k in range(8):
        st = 48 + k * 8
        s.swell(3, (st, -16), (st + 5, 0), (st + 7.99, -6))
    s.swell(14, (80, -14), (88, 0), (110, -4))
    cym_swell(dr, 80, 96, 66)
    dr.append((80, 2, SUS_CYM, 60))
    return s


# ---- 8. 진군: C단조, 행진 스네어 + 트롬본·튜바 반복 리듬, 층층이 쌓여 커짐 ----
def march():
    s = Song(104)
    prog = ["Cm", "Cm", "Ab", "Bb", "Cm", "Cm", "Ab", "G", "Fm", "Cm", "Ab", "Eb", "Fm", "Ab", "G", "G"]
    theme = [("G3", 1.5), ("G3", 0.5), ("C4", 1), ("D4", 1), ("Eb4", 1.5), ("D4", 0.5), ("C4", 1), ("G3", 1),
             ("Ab3", 1.5), ("C4", 0.5), ("Eb4", 1), ("F4", 1), ("D4", 3), ("Bb3", 1),
             ("G3", 1.5), ("G3", 0.5), ("C4", 1), ("D4", 1), ("Eb4", 1.5), ("F4", 0.5), ("G4", 1), ("Eb4", 1),
             ("F4", 1.5), ("Eb4", 0.5), ("D4", 1), ("C4", 1), ("B3", 2), ("D4", 1), ("G3", 1),
             ("C4", 1.5), ("C4", 0.5), ("F4", 1), ("G4", 1), ("G4", 1.5), ("F4", 0.5), ("Eb4", 1), ("C4", 1),
             ("Eb4", 1.5), ("F4", 0.5), ("Ab4", 1), ("C5", 1), ("Bb4", 3), ("G4", 1),
             ("Ab4", 1.5), ("G4", 0.5), ("F4", 1), ("Ab4", 1), ("G4", 1.5), ("F4", 0.5), ("Eb4", 1), ("C4", 1),
             ("D4", 1.5), ("Eb4", 0.5), ("F4", 1), ("D4", 1), ("G4", 2), ("D4", 1), ("B3", 1)]
    trb, tuba, horn, tpt = s.part(8, TROMBONE, 80), s.part(15, TUBA, 90), s.part(3, HORN, 50), s.part(4, TRUMPET, 74)
    vln, cello, bass = s.part(0, STRINGS, 40), s.part(10, CELLO, 76), s.part(1, CONTRABASS, 88)
    flute, timp, dr = s.part(2, FLUTE, 60), s.part(6, TIMPANI), s.part(9, 0)
    s.legato.add(2)
    s.trim.update({8: 4, 15: 4})

    def low_brass(chords, st, vel):
        # 둥-둥 . 둥 둥-둥 . 둥: 트롬본은 한 옥타브 위
        for i, c in enumerate(chords):
            b, _ = chord(c)
            for at in (0, 0.5, 1.5, 2, 2.5, 3.5):
                acc = 10 if at in (0, 2) else 0
                tuba.append((st + i * 4 + at, 0.4, b, hum(vel + acc)))
                trb.append((st + i * 4 + at, 0.4, b + 12, hum(vel - 6 + acc)))

    # 1) 북만 4마디
    snare_march(dr, 4, 0, 74)
    for b in range(4):
        timp.append((b * 4, 1, note("C2"), hum(76)))
    # 2) 낮은 금관 + 저음 현 + 호른 주제
    low_brass(prog, 16, 80)
    ostinato(cello, 16, prog, 16, 72, pattern=(0,) * 8, octave=-12)
    basses(bass, prog, 16, 70)
    melody(horn, theme, 16, 90)
    snare_march(dr, 16, 16, 82)
    pads(vln, prog[8:], 48, 60)
    for i, c in enumerate(prog):
        b, _ = chord(c)
        timp.append((16 + i * 4, 1, timp_note(b), hum(84)))
    cym_swell(dr, 80, 104, 84)
    # 3) 전체: 트럼펫 주제(한 옥타브 위) + 호른 + 플루트 + 바이올린 스피카토
    dr.append((80, 2, CRASH, 108))
    low_brass(prog, 80, 92)
    ostinato(cello, 16, prog, 80, 84, pattern=(0,) * 8, octave=-12)
    basses(bass, prog, 80, 82)
    melody(tpt, theme, 80, 100, 12)
    melody(horn, theme, 80, 98)
    melody(flute, theme, 80, 84, 12)
    arp(vln, prog, 80, (3, 2, 1, 2, 3, 2, 1, 2), step=0.5, vel=78)
    snare_march(dr, 16, 80, 96, roll_every=8)
    for i, c in enumerate(prog):
        b, _ = chord(c)
        timp.extend([(80 + i * 4, 1, timp_note(b), hum(100)), (80 + i * 4 + 2, 1, timp_note(b), hum(84))])
    # 4) 끝 4마디: 북과 낮은 금관만 남고 G(딸림)에서 멈춰 처음으로 이어짐
    low_brass(["Cm", "Cm", "Ab", "G"], 144, 74)
    snare_march(dr, 4, 144, 78)
    s.swell(9, (0, -3), (80, 0), (144, -2), (160, -6))
    return s


# ---- 9. 추격: F단조 150, 바이올린 16분 스피카토 + 호른·트럼펫, 쉬지 않고 달림 ----
def chase():
    s = Song(150)
    A = ["Fm", "Db", "Eb", "C", "Fm", "Db", "Bbm", "C"]
    B = ["Bbm", "Fm", "Db", "Eb", "Bbm", "Fm", "Gb", "C"]
    hA = [("C4", 1), ("F4", 2), ("G4", 1), ("Ab4", 3), ("F4", 1), ("G4", 1.5), ("Ab4", 0.5), ("Bb4", 1), ("G4", 1), ("E4", 4),
          ("C4", 1), ("F4", 2), ("G4", 1), ("Ab4", 2), ("Bb4", 1), ("C5", 1), ("Db5", 2), ("C5", 1), ("Bb4", 1), ("C5", 2), ("G4", 1), ("E4", 1)]
    tB = [("F4", 1), ("Bb4", 2), ("C5", 1), ("Ab4", 2), ("G4", 1), ("F4", 1), ("Ab4", 1), ("Db5", 2), ("Eb5", 1), ("G4", 3), ("Bb4", 1),
          ("F5", 2), ("Eb5", 1), ("Db5", 1), ("C5", 2), ("Ab4", 1), ("F4", 1), ("Gb4", 1), ("Bb4", 1), ("Db5", 2), ("G4", 1), ("C5", 1), ("E5", 2)]
    vln, cello, bass = s.part(0, STRINGS, 40), s.part(10, CELLO, 74), s.part(1, CONTRABASS, 88)
    horn, tpt, tuba = s.part(3, HORN, 50), s.part(4, TRUMPET, 74), s.part(15, TUBA, 90)
    timp, dr = s.part(6, TIMPANI), s.part(9, 0)
    fig = (3, 2, 1, 2, 3, 2, 1, 2, 4, 2, 1, 2, 3, 2, 1, 0)
    plan = [(0, ["Fm", "Fm", "Db", "C"], 0)] + [(16 + k * 32, ch, lvl) for k, (ch, lvl) in enumerate(((A, 1), (A, 1), (B, 2), (B, 2), (A, 3)))]
    plan.append((176, ["Fm", "Db", "C", "C"], 1))
    for st, ch, lvl in plan:
        v = (0, 6, 12, 18)[lvl]
        arp(vln, ch, st, fig, step=0.25, vel=70 + v, accent=10)
        if lvl:
            ostinato(cello, len(ch), ch, st, 74 + v, pattern=(0, 0, 12, 0, 0, 0, 12, 0), octave=-12)
            ostinato(bass, len(ch), ch, st, 74 + v, pattern=(0,) * 8, octave=-24)
        for i, c in enumerate(ch):
            b, tri = chord(c)
            s0 = st + i * 4
            timp.append((s0, 1, timp_note(b), hum(80 + v)))
            if lvl:
                tuba.extend([(s0, 1, b, hum(80 + v)), (s0 + 2.5, 0.5, b, hum(70 + v))])
                # 달리는 북: 큰북 1 · 2& · 3&, 스네어 2 · 4 + 16분 잔걸음
                for at in (0, 1.5, 2.5):
                    dr.append((s0 + at, 0.5, BDRUM, hum(84 + v)))
                for at in (1, 3):
                    dr.append((s0 + at, 0.25, SNARE, hum(78 + v)))
                if lvl >= 2:
                    for at in (1.75, 3.25, 3.5, 3.75):
                        dr.append((s0 + at, 0.25, SNARE, hum(50 + v)))
                    timp.append((s0 + 2, 1, timp_note(b), hum(70 + v)))
            if lvl == 2:
                for at in (0, 0.75, 1.5):  # 호른 찌르기
                    horn.extend([(s0 + at, 0.5, x - 12, hum(86)) for x in tri])
    for st in (16, 48, 144):
        melody(horn, hA, st, 96 if st < 144 else 104, 0)
    melody(tpt, tB, 80, 94)
    melody(tpt, tB, 112, 102)
    melody(tpt, hA, 144, 100)  # 호른과 같은 음 (한 옥타브 위는 트럼펫 음역 밖)
    for st in (16, 80, 144):
        dr.append((st, 2, CRASH, 104))
        cym_swell(dr, st, 150, 80)
    s.swell(0, (0, -4), (16, 0))
    return s


# ---- 10. 포위·공포: C# 낮은 금관 덩어리 화음이 부풀고, 팀파니 롤, 낮은 트레몰로, 징 ----
def siege():
    s = Song(60)
    trb, tuba, horn, bsn = s.part(8, TROMBONE, 80), s.part(15, TUBA, 90), s.part(3, MUTED_HORN, 52), s.part(12, BASSOON, 70)
    lo, cb, hi = s.part(10, TREMOLO, 74), s.part(1, BASS_TREM, 88), s.part(0, TREMOLO, 40)
    rolls, timp, dr = s.part(6, TIMP_ROLL, 64), s.part(7, TIMPANI, 60), s.part(9, 0)
    s.trim.update({8: 5, 15: 4, 10: -4, 3: 5, 7: 4})  # 덩어리 화음이 주인공, 첼로 트레몰로는 뒤로
    clusters = [("C#2", "D2", "G#2"), ("D2", "Eb2", "A2"), ("C2", "C#2", "G2"), ("C#2", "D2", "E2", "G#2")]
    bars = 24
    # 낮은 트레몰로 지속음 C#
    for b in range(0, bars, 2):
        v = 58 if b < 8 or b >= 22 else 70
        cb.append((b * 4, 8, note("C#1"), hum(v, 3)))
        lo.extend([(b * 4, 8, note("C#2"), hum(v, 3)), (b * 4, 8, note("G#2"), hum(v - 8, 3))])
    # 느린 전쟁 북: 1박 · 3박 반
    for b in range(bars):
        loud = 16 <= b < 22
        dr.append((b * 4, 2, BDRUM, hum(96 if loud else 80)))
        dr.append((b * 4 + 2.5, 1, BDRUM, hum(80 if loud else 64)))
        if b >= 4:
            timp.extend([(b * 4, 1, note("C#2"), hum(92 if loud else 74)), (b * 4 + 2.5, 1, note("C#2"), hum(76 if loud else 60))])
        if b < 8 and b % 2 == 1:
            dr.append((b * 4 + 1, 3, RUB, hum(70)))
    # 높은 현: 셋온음(G·C#)이 가늘게
    for b in range(4, 22, 4):
        hi.extend([(b * 4, 16, note("G5"), hum(42)), (b * 4 + 2, 14, note("C#6"), hum(38))])
    s.swell(0, (16, -16), (40, -4), (64, 0), (88, 0), (92, -10))
    # 덩어리 화음 부풀기 (2마디마다), 같이 팀파니 롤
    for k in range(4):
        st = 32 + k * 8
        cl = clusters[k]
        trb.extend([(st, 6, note(n), hum(88)) for n in cl])
        tuba.append((st, 6, note(cl[0]), hum(84)))
        bsn.append((st, 6, note(cl[0]), hum(70)))
        rolls.append((st, 6, note("C#2"), hum(76)))
        for ch in (8, 15, 6):
            s.swell(ch, (st, -22), (st + 5.6, 0), (st + 7.99, 0))
    dr.extend([(32, 6, GONG, 86), (64, 8, GONG, 108)])
    cym_swell(dr, 64, 60, 80)
    # 절정 6마디: 한 마디마다 덩어리 화음 내리찍기 + 약음 호른 다-다-쿵
    for b in range(16, 22):
        st = b * 4
        cl = clusters[b % 4]
        trb.extend([(st, 3, note(n), hum(104)) for n in cl])
        tuba.append((st, 3, note(cl[0]), hum(100)))
        bsn.append((st, 3, note(cl[0]), hum(84)))
        horn.extend([(st - 0.5, 0.25, note("C#3"), hum(84)), (st - 0.25, 0.25, note("C#3"), hum(90)), (st, 2, note("D3"), hum(98))])
        dr.append((st + 2, 1, ANVIL, hum(56)))
        if b % 2 == 0:
            rolls.append((st, 8, note("C#2"), hum(90)))
    s.swell(6, (64, -8), (88, 0), (92, -12))
    # 끝: 다시 낮은 지속음과 북만 (처음으로 이어짐)
    return s


# ---- 11. 발견·경이: Eb장조, 하프 펼침 + 글로켄슈필 + 플루트, 첼로 노래, 리디안(F장조) 한 방울 ----
def discovery():
    s = Song(84)
    pa = ["Eb", "Cm", "Ab", "Bb", "Eb", "Gm", "Ab", "Bb"]
    pb = ["Cm", "Ab", "Eb", "Bb", "Ab", "F", "Bb", "Bb"]  # F장조 = 리디안 II (경이로운 빛)
    A = [("Bb4", 1), ("Eb5", 1), ("F5", 1), ("G5", 1), ("G5", 2), ("F5", 1), ("Eb5", 1), ("C6", 2), ("Bb5", 1), ("Ab5", 1), ("Bb5", 3), ("F5", 1),
         ("G5", 1), ("Bb5", 1), ("Eb6", 2), ("D6", 2), ("Bb5", 1), ("G5", 1), ("C6", 1.5), ("Bb5", 0.5), ("Ab5", 1), ("C6", 1), ("Bb5", 4)]
    Bl = [("G3", 1), ("C4", 1), ("Eb4", 2), ("Eb4", 1.5), ("D4", 0.5), ("C4", 1), ("Ab3", 1), ("Bb3", 2), ("G3", 1), ("Bb3", 1), ("F4", 3), ("D4", 1),
          ("Eb4", 1), ("Ab4", 2), ("G4", 1), ("A4", 2), ("F4", 1), ("C5", 1), ("D5", 2), ("C5", 1), ("Bb4", 1), ("Bb4", 4)]
    harp, flute, clar = s.part(11, HARP, 30), s.part(2, FLUTE, 58), s.part(12, CLARINET, 64)
    pad, cello, horn = s.part(0, SLOW_STRINGS, 42), s.part(10, CELLO, 76), s.part(3, HORN, 52)
    glock, mar, vln = s.part(13, GLOCK, 72), s.part(14, MARIMBA, 84), s.part(5, STRINGS, 46)
    bass, timp, dr = s.part(1, CONTRABASS, 88), s.part(6, TIMPANI), s.part(9, 0)
    s.trim[11] = 8
    s.legato |= {2, 12, 10, 5}
    up8 = (0, 1, 2, 3, 4, 3, 2, 1)
    # 1) 앞 4마디: 하프 + 글로켄 반짝 + 벨 트리
    arp(harp, pa[:4], 0, up8, vel=54, up=-12)
    dr.append((0, 3, BELL_TREE, 60))
    for i, c in enumerate(pa[:4]):
        _, tri = chord(c)
        glock.append((i * 4, 2, tri[2] + 24, hum(66)))
    pads(pad, pa[2:4], 8, 46)
    # 2) 플루트 주제 + 클라리넷 긴 음 받침
    arp(harp, pa, 16, up8, vel=56, up=-12)
    pads(pad, pa, 16, 54)
    basses(bass, pa, 16, 56)
    melody(flute, A, 16, 82)
    for i, c in enumerate(pa):
        _, tri = chord(c)
        clar.append((16 + i * 4, 4, tri[1], hum(60)))
    # 3) 첼로가 노래 + 마림바 잔물결 + 플루트 높은 긴 음 + 호른 받침
    arp(harp, pb, 48, up8, vel=50, up=-12)
    arp(mar, pb, 48, (3, 4, 5, 4), step=0.5, vel=46, up=-12)
    pads(pad, pb, 48, 56)
    basses(bass, pb, 48, 60)
    melody(cello, Bl, 48, 86)
    for i, c in enumerate(pb):
        _, tri = chord(c)
        flute.append((48 + i * 4, 4, tri[2] + 12, hum(58)))
    pads(horn, pb[4:], 64, 58, up=-12)
    dr.append((68, 3, BELL_TREE, 56))
    cym_swell(dr, 80, 84, 70)
    # 4) 전체: 바이올린(한 옥타브 아래) + 플루트 + 글로켄이 같은 선율, 호른 화음, 첼로는 B선율로 맞받음
    arp(harp, pa, 80, (0, 1, 2, 3, 4, 5, 4, 3), vel=58, up=-12)
    melody(vln, A, 80, 84, -12)
    melody(flute, A, 80, 88)
    melody(glock, A, 80, 58)
    pads(pad, pa, 80, 62)
    pads(horn, pa, 80, 66, up=-12)
    basses(bass, pa, 80, 68)
    for i, c in enumerate(pa):
        b, _ = chord(c)
        timp.append((80 + i * 4, 1, timp_note(b), hum(60)))
    s.swell(5, (80, -8), (92, 0))
    dr.append((80, 3, SUS_CYM, 58))
    # 5) 끝 4마디: 하프·현만, 글로켄 마지막 반짝 (처음 하프로 이어짐)
    end = ["Ab", "Bb", "Eb", "Eb"]
    arp(harp, end, 112, up8, vel=50, up=-12)
    pads(pad, end, 112, 50)
    basses(bass, end, 112, 52)
    melody(flute, A[:4], 112, 66)
    glock.extend([(120, 2, note("Eb6"), 66), (122, 2, note("G6"), 62), (124, 4, note("Bb6"), 60)])
    dr.append((120, 3, BELL_TREE, 50))
    return s


# ---- 12. 첫 5초 쾅: D단조 7초, 메인 테마 머리(A-D-F)를 금관이 외침 ----
def hook():
    s = Song(120)
    vln, lo, cb = s.part(0, STRINGS, 40), s.part(10, TREMOLO, 72), s.part(1, BASS_TREM, 88)
    spic = s.part(14, CELLO, 72)
    trb, tuba, horn, tpt = s.part(8, TROMBONE, 80), s.part(15, TUBA, 90), s.part(3, HORN, 52), s.part(4, TRUMPET, 74)
    timp, rolls, dr = s.part(6, TIMPANI), s.part(7, TIMP_ROLL, 64), s.part(9, 0)
    # 0박: 전체 한 방
    dr.extend([(0, 2, BDRUM, 124), (0, 6, GONG, 110), (0, 1, CRASH, 100)])
    timp.extend([(0, 1, note("D2"), 124), (0.5, 0.5, note("A2"), 100)])
    trb.extend([(0, 0.8, note(n), 116) for n in ("D2", "A2", "D3")])
    tuba.append((0, 0.8, note("D2"), 116))
    horn.extend([(0, 0.8, note(n), 110) for n in ("D3", "F3", "A3")])
    spic.extend([(0, 0.25, note(n), 118) for n in ("D2", "D3")])
    # 1~3박: 바이올린 16분음 치솟기 + 스네어 롤·팀파니 롤 크레셴도
    run = ["A4", "Bb4", "C5", "D5", "E5", "F5", "G5", "A5"]
    for k, n in enumerate(run):
        vln.append((1 + k * 0.25, 0.25, note(n), 84 + k * 4))
    for k in range(8):
        spic.append((1 + k * 0.25, 0.25, note("D3"), 80 + k * 4))
    dr.append((1, 2, SNARE_ROLL, 96))
    rolls.append((1, 2, note("D2"), 90))
    s.swell(7, (1, -18), (2.9, 0))
    # 3~4박: 금관이 메인 테마 머리 A-D-F
    for at, n, d in ((3, "A4", 0.5), (3.5, "D5", 0.5), (4, "F5", 1)):
        tpt.append((at, d, note(n), 112))
        horn.append((at, d, note(n) - 12, 108))
    timp.extend([(3, 0.5, note("A2"), 104), (3.5, 0.5, note("D3"), 108)])
    # 5박~: 큰 D단조 화음을 끌고 팀파니 롤이 잦아듦
    dr.extend([(5, 4, CRASH, 116), (5, 2, BDRUM, 120)])
    tpt.extend([(5, 5, note(n), 108) for n in ("A4", "D5", "F5")])
    horn.extend([(5, 5, note(n), 104) for n in ("D4", "F4", "A4")])
    trb.extend([(5, 5, note(n), 108) for n in ("D2", "A2", "D3", "F3")])
    tuba.append((5, 5, note("D2"), 110))
    vln.extend([(5, 5, note(n), 104) for n in ("D5", "F5", "A5", "D6")])
    lo.extend([(5, 5, note(n), 104) for n in ("D2", "A2", "D3", "A3", "F4")])
    cb.append((5, 5, note("D1"), 104))
    rolls.append((5, 5, note("D2"), 100))
    timp.append((5, 1, note("D2"), 120))
    for ch in (0, 3, 4, 8, 10, 15, 1, 7):
        s.swell(ch, (5, 0), (7, -4), (10, -14))
    return s


# ---- 13. 엔딩 화면(20초): D장조, 메인 테마 머리를 장조로(A-D-F#), 하프·현·호른, 종소리로 끝 ----
def outro():
    s = Song(66)
    prog = ["D", "Bm", "G", "A"]
    harp, pad, bass = s.part(11, HARP, 30), s.part(0, SLOW_STRINGS, 42), s.part(1, CONTRABASS, 88)
    horn, flute, glock, bells = s.part(3, HORN, 52), s.part(2, FLUTE, 60), s.part(13, GLOCK, 72), s.part(12, BELLS, 84)
    rolls, cello = s.part(6, TIMP_ROLL), s.part(10, CELLO, 76)
    s.trim[11] = 8
    s.legato |= {2, 3, 10}
    arp(harp, prog, 0, (0, 1, 2, 3, 4, 3, 2, 1), vel=56, up=-12)
    pads(pad, prog, 0, 58)
    basses(bass, prog, 0, 62)
    melody(horn, [("A3", 1), ("D4", 1), ("F#4", 2), ("F#4", 1), ("E4", 1), ("D4", 2), ("D4", 1.5), ("E4", 0.5), ("B3", 2), ("E4", 3), ("C#4", 1)], 0, 84)
    melody(cello, [("D3", 4), ("B2", 4), ("G2", 4), ("A2", 4)], 0, 64)
    melody(flute, [("-", 8), ("F#5", 4), ("E5", 2), ("G5", 2)], 0, 62)
    # 마지막 D장조: 길게 + 하프 쓸어올림 + 종
    pads(pad, ["D"], 16, 64, beats=6)
    pads(pad, ["D"], 16, 56, beats=6, up=12)
    basses(bass, ["D"], 16, 64, beats=6)
    horn.extend([(16, 6, note("D4"), 80), (16, 6, note("F#3"), 72)])
    flute.append((16, 6, note("F#5"), 60))
    cello.append((16, 6, note("D3"), 62))
    for k, n in enumerate(("D3", "F#3", "A3", "D4", "F#4", "A4", "D5", "F#5", "A5", "D6")):
        harp.append((16 + k * 0.125, 3, note(n), 54 + k * 2))
    glock.append((17.5, 3, note("D6"), 66))
    bells.append((16, 6, note("D5"), 70))
    rolls.append((15, 7, note("D2"), 84))
    s.swell(6, (15, -20), (16, -6), (22, -20))
    for ch in (0, 1, 3, 2, 10):
        s.swell(ch, (16, 0), (22, -10))
    return s


# ---- 14. 상처뿐인 승리·전쟁 뒤: G단조, 종소리 + 독주 바이올린, 승리 팡파르가 단조로 되울림 ----
def aftermath():
    s = Song(63)
    pa = ["Gm", "Eb", "Cm", "D", "Gm", "Bb", "Eb", "D"]
    pb = ["Eb", "Bb", "Cm", "Gm", "Eb", "Cm", "D", "D"]
    solo = [("D5", 2), ("C5", 1), ("Bb4", 1), ("G5", 3), ("Eb5", 1), ("Eb5", 1.5), ("D5", 0.5), ("C5", 1), ("G4", 1), ("A4", 3), ("D5", 1),
            ("Bb5", 2), ("A5", 1), ("G5", 1), ("F5", 2), ("D5", 1), ("F5", 1), ("G5", 1.5), ("F5", 0.5), ("Eb5", 1), ("C5", 1), ("D5", 4)]
    fanfare = [("Bb3", 1), ("Bb3", 0.5), ("Bb3", 0.5), ("Eb4", 2), ("D4", 1.5), ("C4", 0.5), ("Bb3", 1), ("C4", 1), ("Eb4", 3), ("C4", 1), ("D4", 4)]
    answer = [("Bb4", 2), ("G4", 1), ("Eb4", 1), ("G4", 1.5), ("F4", 0.5), ("Eb4", 1), ("D4", 1), ("F#4", 2), ("A4", 1), ("C5", 1), ("Bb4", 2), ("A4", 2)]
    pad, vln, solo_v = s.part(0, SLOW_STRINGS, 40), s.part(5, STRINGS, 46), s.part(12, VIOLIN, 50)
    oboe, horn, bells = s.part(2, OBOE, 66), s.part(3, HORN, 54), s.part(13, BELLS, 84)
    bass, cello, rolls = s.part(1, CONTRABASS, 88), s.part(10, CELLO, 76), s.part(6, TIMP_ROLL)
    s.legato |= {2, 12}
    s.trim.update({2: 4, 3: 3})
    # 조종: 2마디마다 G 종, 그 사이 D
    for b in range(0, 28, 2):
        if b < 26:
            bells.append((b * 4, 4, note("G4"), hum(68 if b < 4 or b >= 20 else 60)))
            bells.append((b * 4 + 6, 2, note("D4"), hum(50)))
    # 앞 4마디: 현 화음과 종만
    pads(pad, pa[:4], 0, 50)
    basses(bass, pa[:4], 0, 54)
    # A: 독주 바이올린
    pads(pad, pa, 16, 54)
    basses(bass, pa, 16, 58)
    melody(solo_v, solo, 16, 84)
    melody(cello, [(n, 4) for n in ("G3", "Eb3", "C3", "D3", "G3", "Bb2", "Eb3", "D3")], 16, 58)
    # B: 호른이 승리 팡파르를 단조로 (기쁨이 꺾인 채), 오보에가 대답
    pads(pad, pb, 48, 58)
    basses(bass, pb, 48, 62)
    melody(horn, fanfare, 48, 86)
    melody(oboe, answer, 64, 78)
    rolls.append((60, 4, note("G2"), 84))
    s.swell(6, (60, -18), (63.9, 0), (64, -18), (76, -18), (79.9, -2))
    rolls.append((76, 4, note("D2"), 88))
    # A': 바이올린 합주가 한 옥타브 아래로 받치고 독주가 다시
    pads(pad, pa, 80, 62)
    basses(bass, pa, 80, 66)
    melody(solo_v, solo, 80, 90)
    melody(vln, solo, 80, 72, -12)
    pads(horn, pa[:6], 80, 60, up=-12)
    s.swell(5, (80, -10), (96, 0), (104, -2), (112, -10))
    s.swell(0, (80, 0), (104, 0), (112, -8))
    return s


SONGS = {"main": main, "battle": battle, "tension": tension, "lament": lament, "triumph": triumph,
         "steppe": steppe, "intrigue": intrigue, "march": march, "chase": chase, "siege": siege,
         "discovery": discovery, "hook": hook, "outro": outro, "aftermath": aftermath}


# GM 악기 → VSCO 악기: [(음역 아래 끝, 긴 음 sfz, 짧은 음 sfz)] - 음역이 높은 것부터. 짧은 음 = 0.36초 이하(빠른 8분음)
ORCH = {
    STRINGS: [(55, "ViolinEnsSusVib", "ViolinEnsSpic"), (48, "ViolaEnsSusVib", "ViolaEnsSpic"), (0, "CelloEnsSusVib", "CelloEnsSpic")],
    SLOW_STRINGS: [(55, "ViolinEnsSusVib-Quiet", "ViolinEnsSpic"), (48, "ViolaEnsSusVib-Quiet", "ViolaEnsSpic"), (0, "CelloEnsSusVib-Quiet", "CelloEnsSpic")],
    TREMOLO: [(55, "ViolinEnsTrem", "ViolinEnsTrem"), (48, "ViolaEnsTrem", "ViolaEnsTrem"), (0, "CelloEnsTrem", "CelloEnsTrem")],
    PIZZ: [(55, "ViolinEnsPizz", "ViolinEnsPizz"), (48, "ViolaEnsPizz", "ViolaEnsPizz"), (0, "CelloEnsPizz", "CelloEnsPizz")],
    CELLO: [(0, "CelloEnsSusVib", "CelloEnsSpic")],
    CONTRABASS: [(0, "ContrabassSusVB", "ContrabassSpic")],
    HORN: [(0, "FHornSus", "FHornStac")],
    BRASS: [(58, "TrumpetSus", "TrumpetStac"), (0, "TromboneSus", "TromboneStac")],
    TROMBONE: [(0, "TromboneSus", "TromboneStac")],
    TRUMPET: [(0, "TrumpetSus", "TrumpetStac")],
    TIMPANI: [(0, "Timpani", "Timpani")],
    HARP: [(0, "Harp", "Harp")],
    FIDDLE: [(0, "SViolinVib", "SViolinSpic")],
    VIOLIN: [(0, "SViolinVib", "SViolinSpic")],
    FLUTE: [(0, "FluteSusVib", "FluteStac")],
    PICCOLO: [(0, "PiccoloSus", "PiccoloStac")],
    OBOE: [(0, "OboeSusVib", "OboeStac")],
    CLARINET: [(0, "ClarinetSus", "ClarinetStac")],
    BASSOON: [(0, "BassoonSus", "BassoonStac")],
    TUBA: [(0, "TubaSus", "TubaStac")],
    MUTED_HORN: [(0, "FHornMute", "FHornStac")],
    GLOCK: [(0, "Glockenspiel", "Glockenspiel")],
    MARIMBA: [(0, "Marimba", "Marimba")],
    BELLS: [(0, "TubularBells", "TubularBells")],
    BASS_PIZZ: [(0, "ContrabassPizz", "ContrabassPizz")],
    BASS_TREM: [(0, "ContrabassTrem", "ContrabassTrem")],
    TIMP_ROLL: [(0, "TimpaniRolls", "TimpaniRolls")],
}
DRUMS = "GM-StylePerc"
# 악기별 크기(dB) - 녹음 크기가 서로 달라서 귀로 맞춘 값
GAIN = {"Violin": 0, "Viola": -1, "Cello": 0, "ContrabassPizz": 6, "Contrabass": 1, "FHorn": -2, "Trumpet": -4, "Trombone": -3, "TimpaniRolls": 3, "Timpani": -2, "Harp": -3, "SViolin": -2, DRUMS: -4,
        "Flute": 0, "Piccolo": -4, "Oboe": 1, "Clarinet": -5, "Bassoon": -2, "Tuba": 0, "Glockenspiel": 10, "Marimba": 4, "TubularBells": -5}
_KEYS = {}


def sfz_keys(sfz):
    """sfz 파일이 소리 내는 건반 모음 (음역 밖 음은 조용히 빠지므로 미리 거른다)"""
    if sfz not in _KEYS:
        t = (VSCO / f"{sfz}.sfz").read_text(errors="ignore")
        ks = set()
        for reg in t.split("<region>")[1:]:
            lo, hi, k = (re.search(rf"\b{a}=(\d+)", reg) for a in ("lokey", "hikey", "key"))
            if lo or k:
                ks.update(range(int((lo or k)[1]), int((hi or k)[1]) + 1))
        _KEYS[sfz] = ks
    return _KEYS[sfz]


def write_notes(path, bpm, notes, program=None):
    """한 악기 음표만 담은 MIDI (sfizz·fluidsynth용)"""
    song = Song(bpm)
    song.tracks[0 if program is not None else 9] = (program or 0, notes)
    song.pan[0] = 64  # sfizz가 CC10 팬을 먹는다 - 가운데로 찍고 자리는 render에서 한 번만 잡는다
    song.write(path)


def read_wav(path):
    with wave.open(str(path)) as w:
        ch = w.getnchannels()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32).reshape(-1, ch) / 32768
    return x if ch == 2 else np.repeat(x, 2, axis=1)


def hall(n, seconds=2.6):
    """공연장 울림 IR: 이른 반사 몇 개 + 좌우가 다른 지수 감쇠 잡음(고음은 더 빨리 줄어듦)"""
    rng = np.random.default_rng(7)
    t = np.arange(int(seconds * RATE)) / RATE
    ir = np.zeros((len(t), 2), np.float32)
    for c in range(2):
        noise = rng.standard_normal(len(t)).astype(np.float32)
        dark = np.convolve(noise, np.ones(6) / 6, mode="same")  # 뒤쪽 꼬리는 둥글게
        k = np.clip(t / seconds, 0, 1)
        ir[:, c] = (noise * (1 - k) + dark * k) * np.exp(-6.9 * t / seconds)
        for d, g in ((0.013, 0.5), (0.021, 0.35), (0.034, 0.28), (0.047, 0.2)):
            ir[int((d + 0.004 * c) * RATE), c] += g
    ir[: int(0.018 * RATE)] = 0  # 앞 지연
    return ir / np.abs(ir).sum(axis=0).max() * 6


def convolve(x, ir):
    n = len(x) + len(ir) - 1
    size = 1 << (n - 1).bit_length()
    out = np.zeros((n, 2), np.float32)
    for c in range(2):
        out[:, c] = np.fft.irfft(np.fft.rfft(x[:, c], size) * np.fft.rfft(ir[:, c], size), size)[:n]
    return out


def render(name):
    random.seed(name)
    s = SONGS[name]()
    TMP.mkdir(exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    sec = 60 / s.bpm
    stems = []  # (소리, 팬 0~127, 울림 보내기)
    fluid = Song(s.bpm)  # VSCO에 없는 악기 모음
    missing = []  # 음역 밖이라 소리 안 나는 음
    print(f"{name}:")
    for ch, (prog, notes) in sorted(s.tracks.items()):
        pan = s.pan[ch]
        if ch == 9:
            groups = {DRUMS: [n for n in notes if n[2] in sfz_keys(DRUMS) or missing.append((ch, DRUMS, n[2]))]}
        elif prog in ORCH:
            groups = {}
            for st, du, p, v in notes:
                lo, long_, short = next(r for r in ORCH[prog] if p >= r[0])
                pick = long_ if ch in s.legato or du * sec > 0.36 else short
                if p not in sfz_keys(pick):  # 짧은 주법 음역이 좁으면 긴 주법으로
                    pick = long_ if pick == short else short
                if p not in sfz_keys(pick):
                    missing.append((ch, pick, p))
                    continue
                # 사람이 연주하듯 시작을 아주 조금씩 흔든다 (±8ms)
                jit = random.uniform(-0.008, 0.008) / sec
                groups.setdefault(pick, []).append((max(0, st + jit), du, p, v))
        else:
            fluid.tracks[ch] = (prog, notes)
            continue
        env = sorted(s.dyn.get(ch, []))
        for sfz, ns in groups.items():
            if not ns:
                continue
            mid, wav_ = TMP / f"{name}-{ch}-{sfz}.mid", TMP / f"{name}-{ch}-{sfz}.wav"
            write_notes(mid, s.bpm, ns, None if ch == 9 else 0)
            subprocess.run([str(SFIZZ), "--sfz", str(VSCO / f"{sfz}.sfz"), "--midi", str(mid), "--wav", str(wav_), "-s", str(RATE), "-q", "3"],
                           check=True, capture_output=True, cwd=VSCO)
            g = next((v for k, v in GAIN.items() if sfz.startswith(k)), 0) + s.trim.get(ch, 0)
            x = read_wav(wav_) * 10 ** (g / 20)
            if env:  # 크기 곡선 (박 -> 초)
                beats = np.arange(len(x)) / RATE / sec
                x *= (10 ** (np.interp(beats, [b for b, _ in env], [d for _, d in env]) / 20))[:, None].astype(np.float32)
            stems.append((x, pan, 0.22 if ch != 9 else 0.12))
            rms, peak = np.sqrt((x ** 2).mean()), np.abs(x).max()
            db = lambda a: 20 * np.log10(max(a, 1e-9))
            print(f"  ch{ch:<2} {sfz:<22} 음 {len(ns):>4}  RMS {db(rms):6.1f} dB  최고 {db(peak):6.1f} dB" + ("  <- 거의 안 들림" if db(peak) < -45 else ""))
    if missing:
        print(f"  음역 밖(소리 없음) {len(missing)}개: " + ", ".join(sorted({f"ch{c} {k} {p}" for c, k, p in missing})))
    if fluid.tracks:
        mid, raw = TMP / f"{name}-fluid.mid", TMP / f"{name}-fluid.wav"
        fluid.write(mid)
        subprocess.run(["fluidsynth", "-ni", "-q", "-r", str(RATE), "-g", "0.5", "-o", "synth.reverb.active=0", "-o", "synth.chorus.active=0",
                        "-F", str(raw), str(SF2), str(mid)], check=True)
        stems.append((read_wav(raw) * 0.9, 64, 0.25))
        print(f"  fluidsynth {sorted(p for p, _ in fluid.tracks.values())}  RMS {20 * np.log10(np.sqrt((stems[-1][0] ** 2).mean()) + 1e-9):6.1f} dB")
    n = max(len(x) for x, _, _ in stems)
    dry, send = np.zeros((n, 2), np.float32), np.zeros((n, 2), np.float32)
    for x, pan, wet in stems:
        a = (pan / 127) * np.pi / 2  # 같은 힘 팬
        y = np.zeros((n, 2), np.float32)
        y[: len(x)] = x * [np.cos(a) * 1.41, np.sin(a) * 1.41] if pan != 64 else x
        dry += y
        send += y * wet
    x = dry + convolve(send, hall(n))[:n]
    # 끝 무음 자르고(울림 2.5초는 남김) 크기 맞추기, 부드러운 리미터
    loud = np.where(np.abs(x).max(axis=1) > 1e-3)[0]
    x = x[: min(len(x), loud[-1] + int(2.5 * RATE))]
    x /= max(1e-6, np.percentile(np.abs(x), 99.9))
    squash = (np.abs(x) > 1.1).mean() * 100  # 리미터가 크게 누르는 비율
    # 작은 소리 기울기는 예전(tanh(0.8x)/tanh(0.8)*0.89)과 같고 천장은 0.98 - 예전 식은 1.34까지 올라가 꼭대기가 잘렸음
    x = 0.98 * np.tanh(x * 1.094)
    fade = int(1.5 * RATE)
    x[-fade:] *= np.linspace(1, 0, fade)[:, None]
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
    # 곡마다 크기를 -14 LUFS로 맞춘다 - 촘촘한 곡(긴장)이 목소리를 덮지 않게, 곡이 바뀌어도 크기가 튀지 않게 (2026-10-21 소리 섞임 검사)
    norm = OUT / f"{name}.norm.wav"
    subprocess.run([sys.executable, "-I", str(ROOT / "scripts/loudness.py"), str(OUT / f"{name}.wav"), str(norm)], check=True, capture_output=True)
    norm.replace(OUT / f"{name}.wav")
    print(f"  -> public/bgm/{name}.wav {len(x) / RATE:.1f}s, 악기 {len(stems)}겹, RMS {20 * np.log10(np.sqrt((x ** 2).mean())):.1f} dBFS, 리미터 눌림 {squash:.2f}%")


if __name__ == "__main__":
    for n in sys.argv[1:] or SONGS:
        render(n)
