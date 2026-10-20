# 렌더 후 깜빡임 검사: 영상을 아주 작은 흑백으로 풀어 프레임마다 변화량을 재고,
# 장면이 바뀌는 프레임(타임라인 기준 ±2)이 아닌데 화면이 확 바뀌는 곳을 찾는다
# python3 scripts/check-flicker.py out/mongol-01.mp4 public/ep/mongol-01/ep/timeline.json
import json, struct, subprocess, sys, zlib
import numpy as np


def png_frames(stream):
    """PNG 여러 장이 이어진 바이트(흑백 8비트)를 numpy 배열들로 (Pillow 없이)"""
    out, i = [], 0
    while True:
        i = stream.find(b"\x89PNG\r\n\x1a\n", i)
        if i < 0:
            return out
        j, idat, w = i + 8, b"", 0
        while True:
            n, kind = struct.unpack(">I4s", stream[j : j + 8])
            body = stream[j + 8 : j + 8 + n]
            if kind == b"IHDR":
                w, h = struct.unpack(">II", body[:8])
            elif kind == b"IDAT":
                idat += body
            j += 12 + n
            if kind == b"IEND":
                break
        raw = zlib.decompress(idat)
        img = np.zeros((h, w), np.int32)
        prev = np.zeros(w, np.int32)
        for y in range(h):
            f, row = raw[y * (w + 1)], np.frombuffer(raw[y * (w + 1) + 1 : (y + 1) * (w + 1)], np.uint8).astype(np.int32)
            cur = np.zeros(w, np.int32)
            for x in range(w):
                a = cur[x - 1] if x else 0
                b, c = prev[x], (prev[x - 1] if x else 0)
                if f == 0: p = 0
                elif f == 1: p = a
                elif f == 2: p = b
                elif f == 3: p = (a + b) // 2
                else:
                    pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                    p = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                cur[x] = (row[x] + p) & 255
            img[y], prev = cur, cur
        out.append(img.astype(np.float32))
        i = j

video, tl_path = sys.argv[1], sys.argv[2]
W, H = 32, 18
raw = subprocess.run(
    ["npx", "remotion", "ffmpeg", "-v", "error", "-i", video, "-vf", f"scale={W}:{H},format=gray", "-c:v", "png", "-f", "image2pipe", "-"],
    capture_output=True, check=True,
).stdout
frames = np.stack(png_frames(raw))
diff = np.abs(np.diff(frames, axis=0)).mean(axis=(1, 2))  # diff[i] = i → i+1

tl = json.load(open(tl_path))
cuts, at = set(), 0
for sc in tl["scenes"]:
    for d in range(-2, 3):
        cuts.add(at + d)
    at += sc["frames"]

# 주변(앞뒤 1초)보다 훨씬 큰 변화 = 튐
bad = []
for i in range(len(diff)):
    if i + 1 in cuts or i in cuts:
        continue
    lo, hi = max(0, i - 30), min(len(diff), i + 31)
    around = np.median(np.r_[diff[lo:i], diff[i + 1 : hi]]) if hi - lo > 1 else 0
    if diff[i] > 12 and diff[i] > 6 * max(around, 0.5):
        bad.append((i + 1, diff[i]))
fps = tl["fps"]
# 장면별로 묶기
starts, at = [], 0
for sc in tl["scenes"]:
    starts.append(at)
    at += sc["frames"]
by = {}
for f, d in bad:
    k = max(i for i, a in enumerate(starts) if a <= f)
    by.setdefault(k, []).append(f)
for k, fs in sorted(by.items()):
    show = tl["scenes"][k]["show"]
    print(f"장면 {k:02d} {show['type']:6s} {show.get('img', show.get('set', ''))[-40:]:40s} 튐 {len(fs)}번")
for f, d in bad[:8]:
    print(f"튐 {int(f // fps // 60)}:{int(f // fps % 60):02d} (프레임 {f}, 변화 {d:.1f})")
print(f"검사 {len(frames)}프레임 - " + ("깜빡임 없음" if not bad else f"깜빡임 {len(bad)}곳"))
sys.exit(1 if bad else 0)
