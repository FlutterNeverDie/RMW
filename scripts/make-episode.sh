#!/bin/bash
# 해설 영상 한 편 만들기: 대본 검사(걸리면 멈춤) → 목소리(모든 언어) → 화면 잘림 검사(걸리면 멈춤) → 영상 렌더 → 언어별 더빙 트랙 → hwm/영상으로 복사
# scripts/make-episode.sh episodes/mongol-01/ep.json Mongol01 out/mongol-01.mp4
# 장면표의 langs(예: ["en","ko"])마다 대사가 i18n에 있어야 함. 장면 길이는 가장 긴 언어 기준이라 더빙 트랙 = 영상 길이
set -e
cd "$(dirname "$0")/.."
# 대본·화면 글자 검사 - 목소리 한도를 쓰기 전에 (말투 섞임, 이였, 화면 영어 낱말, 이름 표기)
python3 scripts/check-text.py "$1"
.venv/bin/python -I audio/voice_episode.py "$1" | tail -1
python3 scripts/check-layout.py "$1"
# 캐릭터 입 모양 (목소리 크기 → 프레임별 0·1·2). 실패해도 렌더는 입을 흉내 내며 진행
.venv/bin/python -I audio/characters.py mouth "$1" || echo "입 모양 건너뜀"
# 사람이 못 듣는 언어는 AI가 듣고 검수 (문제는 보고만 하고 멈추지 않음)
for lang in $(python3 -c "import json,sys; print(' '.join(json.load(open(sys.argv[1])).get('langs', ['en'])))" "$1"); do
  node scripts/qa-voice.mjs "$1" "$lang" 2>/dev/null | grep -E "^\[|문제" || true
done
# 화면 배치는 1920×1080 그대로, 4/3배로 찍어 2560×1440(1440p)로 뽑는다 - 유튜브가 1440p 이상은 더 좋은 압축(VP9)을 줘서 1080p로 봐도 선명하다
npx remotion render src/index.ts "$2" "$3" --concurrency=6 --scale=1.3333333333333333 2>&1 | tail -1
# 깜빡임(빈 프레임·튐) 검사 - 걸리면 멈춤
.venv/bin/python -I scripts/check-flicker.py "$3" "public/ep/$(basename "$(dirname "$1")")/$(basename "$1" .json)/timeline.json"
for lang in $(python3 -c "import json,sys; print(' '.join(l for l in json.load(open(sys.argv[1])).get('langs', ['en']) if l != 'en'))" "$1"); do
  npx remotion render src/index.ts "$2" "${3%.mp4}.$lang.wav" --codec=wav --props="{\"lang\":\"$lang\"}" 2>&1 | tail -1
done
node scripts/deliver.mjs
