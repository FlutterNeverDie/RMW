#!/bin/bash
# 새 맥에서 한 번: 도구 설치 → 패키지 → 파이썬 → 악기 소리 모음 → 열쇠 확인
# 이 저장소는 ~/hwm/코드 에 두는 것을 기준으로 한다 (산출물은 ~/hwm/영상 등으로 복사됨)
set -e
cd "$(dirname "$0")"
command -v brew >/dev/null || { echo "Homebrew 먼저 설치: https://brew.sh"; exit 1; }
brew list node >/dev/null 2>&1 || brew install node
brew list fluid-synth >/dev/null 2>&1 || brew install fluid-synth
brew list python@3.13 >/dev/null 2>&1 || brew install python@3.13
[ -d "/Applications/Google Chrome.app" ] || { echo "Google Chrome 설치 필요 (렌더·캡처에 씀)"; exit 1; }
npm ci
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q numpy
mkdir -p audio/sf
[ -f audio/sf/MuseScore_General.sf2 ] || curl -fL -o audio/sf/MuseScore_General.sf2 https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf2
mkdir -p ../영상 ../쇼츠 ../배너 ../홍보 ../브금 ../tts
echo
for f in client_secret.json token.json tts_key.txt gemini_key.txt; do
  [ -f "secrets/$f" ] && echo "열쇠 있음: secrets/$f" || echo "열쇠 없음: secrets/$f  ← AirDrop으로 받은 파일을 넣고 chmod 600"
done
echo "지도 캡처가 필요하면 사이트 저장소(chronomap)를 받아 'npx next dev' 후 SITE=http://localhost:3000 으로 scripts/clean.mjs 실행"
echo "준비 끝 - docs/guide/ 부터 읽기"
