# 소리 마감: 유튜브 기준 크기(-14 LUFS, 최고점 -1 dBTP)로 맞춘다 - 두 번 재는 loudnorm(첫 번 측정 → 그 값으로 한 번에 선형 보정)
# .venv/bin/python -I scripts/loudness.py <입력.wav> <출력.wav>
# 영어 영상 소리와 더빙 트랙이 같은 크기여야 언어를 바꿔도 소리가 튀지 않는다 (2026-10-21 사용자: 최고 품질)
import json, re, subprocess, sys
from pathlib import Path

CODE = Path(__file__).resolve().parent.parent
TARGET = "I=-14:TP=-1.0:LRA=11"


def ffmpeg(*a):
    return subprocess.run(["npx", "remotion", "ffmpeg", "-hide_banner", "-nostats", *a], cwd=CODE, capture_output=True, text=True, check=True)


src, dst = sys.argv[1], sys.argv[2]
err = ffmpeg("-i", src, "-af", f"loudnorm={TARGET}:print_format=json", "-f", "null", "-").stderr
m = json.loads(re.findall(r"\{[^{}]*\}", err)[-1])
ffmpeg("-y", "-i", src, "-af",
       f"loudnorm={TARGET}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true",
       "-ar", "48000", "-c:a", "pcm_s16le", dst)
print(f"소리 크기 {float(m['input_i']):.1f} → -14 LUFS ({Path(dst).name})")
