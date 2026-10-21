# 깜빡임 없는 렌더: 프레임 사진으로 렌더 → 깨진 프레임 찾기 → 그 프레임만 한 장씩 다시 찍기 → 다시 검사 → 소리와 합쳐 mp4
# .venv/bin/python -I scripts/render-checked.py <컴포지션> <timeline.json> <출력.mp4> [--resume [시작-끝]]
# 화면 배치는 1920×1080 그대로 4/3배로 찍어 2560×1440(1440p) - make-episode.mjs 참고
# 크롬이 긴 렌더 중 가끔 화면을 3×3 타일로 깨뜨려 찍는다(설정으로 못 막음, docs/guide/04 참고). 한 장씩 다시 찍으면 정상
import json, shutil, subprocess, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pngframes import png_frames
import tools  # noqa: E402 - 외부 프로그램 위치 (맥·윈도우), npx 대신 노드로 remotion

comp, tl_path, out = sys.argv[1], sys.argv[2], Path(sys.argv[3])  # 그 뒤 --resume [시작-끝]
CODE = Path(__file__).resolve().parent.parent
frames_dir = CODE / "out/frames" / comp
tl = json.load(open(tl_path))
FPS = tl["fps"]
SHOT = ["--image-format=jpeg", "--jpeg-quality=95", "--scale=1.3333333333333333", "--timeout=120000"]


def run(*a):
    subprocess.run(list(a), check=True, cwd=CODE, capture_output=True)


def small_frames():
    raw = subprocess.run(
        [*tools.remotion(), "ffmpeg", "-v", "error", "-framerate", str(FPS), "-i", str(frames_dir / "element-%05d.jpeg"),
         "-vf", "scale=32:18,format=gray", "-c:v", "png", "-f", "image2pipe", "-"],
        capture_output=True, check=True, cwd=CODE,
    ).stdout
    return np.stack(png_frames(raw))


def bad_frames():
    fr = small_frames()
    diff = np.abs(np.diff(fr, axis=0)).mean(axis=(1, 2))
    cuts, at = set(), 0
    for sc in tl["scenes"]:
        cuts.update(range(at - 2, at + 3))
        at += sc["frames"]
    bad = set()
    for i in range(len(diff)):
        if i in cuts or i + 1 in cuts:
            continue
        lo, hi = max(0, i - 30), min(len(diff), i + 31)
        around = np.median(np.r_[diff[lo:i], diff[i + 1 : hi]])
        if diff[i] > 12 and diff[i] > 6 * max(around, 0.5):
            bad.update({i, i + 1})  # 튄 쪽이 어느 프레임인지 모르니 둘 다 다시 찍는다
    return sorted(bad)


# --resume: 이미 찍어 둔 프레임을 쓰고 깨진 것만 다시 (뒤에 프레임 번호를 주면 그 범위도 다시 찍음, 예: --resume 19400-19531)
resume = "--resume" in sys.argv
if resume and frames_dir.exists():
    rng = [a for a in sys.argv if "-" in a and a[0].isdigit()]
    if rng:
        a, b = map(int, rng[0].split("-"))
        for f in range(a, b + 1):
            run(*tools.remotion(), "still", "src/index.ts", comp, str(frames_dir / f"element-{f:05d}.jpeg"), f"--frame={f}", *SHOT)
else:
  if frames_dir.exists():
    shutil.rmtree(frames_dir)
  frames_dir.mkdir(parents=True)
  print("1) 프레임 렌더", flush=True)
  run(*tools.remotion(), "render", "src/index.ts", comp, str(frames_dir), "--sequence", "--concurrency=6", *SHOT)
  # 리모션은 자릿수를 전체 길이에 맞춰 붙이므로 5자리로 통일
  for f in frames_dir.glob("element-*.jpeg"):
      n = int(f.stem.split("-")[1])
      f.replace(frames_dir / f"element-{n:05d}.jpeg")  # replace: 윈도우 rename은 같은 이름이 있으면 오류

for round_ in range(1, 6):
    bad = bad_frames()
    print(f"{round_ + 1}) 깨진 프레임 {len(bad)}장", flush=True)
    if not bad:
        break
    for f in bad:
        run(*tools.remotion(), "still", "src/index.ts", comp, str(frames_dir / f"element-{f:05d}.jpeg"), f"--frame={f}", *SHOT)
else:
    sys.exit("5번 다시 찍어도 깨진 프레임이 남음 - 멈춤")

print("소리 렌더 + 합치기", flush=True)
wav = frames_dir / "audio.wav"
# 긴 소리 렌더는 동시 처리가 많으면 가끔 한 프레임에서 멈춰 시간 초과가 난다 - 3개로 줄이고 한 번 더 시도
for attempt in range(2):
    try:
        run(*tools.remotion(), "render", "src/index.ts", comp, str(wav), "--codec=wav", "--timeout=120000", "--concurrency=3")
        break
    except subprocess.CalledProcessError:
        if attempt:
            raise
# 소리 마감: -14 LUFS (scripts/loudness.py) - 더빙 트랙도 같은 기준
run(sys.executable, "-I", "scripts/loudness.py", str(wav), str(frames_dir / "audio-mastered.wav"))
wav = frames_dir / "audio-mastered.wav"
run(*tools.remotion(), "ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-i", str(frames_dir / "element-%05d.jpeg"), "-i", str(wav),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-c:a", "aac", "-b:a", "320k", "-shortest", "-movflags", "+faststart", str(CODE / out))
shutil.rmtree(frames_dir)
print(f"→ {out}")
