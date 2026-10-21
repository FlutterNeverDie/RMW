# 렌더 후 깜빡임 검사: 영상을 아주 작은 흑백으로 풀어 프레임마다 변화량을 재고,
# 장면이 바뀌는 프레임(타임라인 기준 ±2)이 아닌데 화면이 확 바뀌는 곳을 찾는다
# python3 scripts/check-flicker.py out/mongol-01.mp4 public/ep/mongol-01/ep/timeline.json
import json, subprocess, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))


from pngframes import png_frames  # noqa: E402


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
# 통과하면 표시 파일을 남긴다 - 업로드(youtube.mjs episode)는 이게 영상보다 새로울 때만 허용
if not bad:
    Path(video + ".checked").write_text("ok")
sys.exit(1 if bad else 0)
