#!/bin/bash
# 해설 영상 한 편 만들기: 목소리(모든 언어) → 화면 잘림 검사(걸리면 멈춤) → 영상 렌더 → 언어별 더빙 트랙 → hwm/영상으로 복사
# scripts/make-episode.sh episodes/mongol-01/ep.json Mongol01 out/mongol-01.mp4
# 장면표의 langs(예: ["en","ko"])마다 대사가 i18n에 있어야 함. 장면 길이는 가장 긴 언어 기준이라 더빙 트랙 = 영상 길이
set -e
cd "$(dirname "$0")/.."
.venv/bin/python -I audio/voice_episode.py "$1" | tail -1
python3 scripts/check-layout.py "$1"
# 사람이 못 듣는 언어는 AI가 듣고 검수 (문제는 보고만 하고 멈추지 않음)
for lang in $(python3 -c "import json,sys; print(' '.join(json.load(open(sys.argv[1])).get('langs', ['en'])))" "$1"); do
  node scripts/qa-voice.mjs "$1" "$lang" 2>/dev/null | grep -E "^\[|문제" || true
done
npx remotion render src/index.ts "$2" "$3" --concurrency=6 2>&1 | tail -1
# 깜빡임(빈 프레임·튐) 검사 - 걸리면 멈춤
.venv/bin/python -I scripts/check-flicker.py "$3" "public/ep/$(basename "$(dirname "$1")")/$(basename "$1" .json)/timeline.json"
for lang in $(python3 -c "import json,sys; print(' '.join(l for l in json.load(open(sys.argv[1])).get('langs', ['en']) if l != 'en'))" "$1"); do
  npx remotion render src/index.ts "$2" "${3%.mp4}.$lang.wav" --codec=wav --props="{\"lang\":\"$lang\"}" 2>&1 | tail -1
done
node scripts/deliver.mjs
