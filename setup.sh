#!/bin/bash
# 새 맥에서 한 번: 도구 설치 → 패키지 → 파이썬 → 악기 소리 모음 → 열쇠 확인
# 저장소는 어디에 둬도 된다 (이 맥: ~/Documents/GitHub/RMW). 산출물은 ~/hwm/영상 등으로 복사됨 (HWM 환경 변수로 바꿀 수 있음)
set -e
cd "$(dirname "$0")"
command -v brew >/dev/null || { echo "Homebrew 먼저 설치: https://brew.sh"; exit 1; }
brew list node >/dev/null 2>&1 || brew install node
brew list fluid-synth >/dev/null 2>&1 || brew install fluid-synth
brew list python@3.13 >/dev/null 2>&1 || brew install python@3.13
[ -d "/Applications/Google Chrome.app" ] || { echo "Google Chrome 설치 필요 (렌더·캡처에 씀)"; exit 1; }
npm ci
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q numpy onnxruntime opencv-python-headless pillow
# 옛 그림 2.5D 깊이 모델 (Depth Anything V2 Small, Apache-2.0, 약 100MB) - scripts/parallax.py
mkdir -p models && [ -f models/depth-anything-v2-small.onnx ] || curl -fL -o models/depth-anything-v2-small.onnx https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx
# 입 모양 Rhubarb Lip Sync (MIT, 인텔 앱이라 Rosetta로 돎) - audio/characters.py mouth
if [ ! -x ~/src/rhubarb/rhubarb ]; then
  mkdir -p ~/src && curl -fL -o /tmp/rhubarb.zip https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v1.14.0/Rhubarb-Lip-Sync-1.14.0-macOS.zip
  unzip -q -o /tmp/rhubarb.zip -d ~/src && mv ~/src/Rhubarb-Lip-Sync-1.14.0-macOS ~/src/rhubarb && xattr -dr com.apple.quarantine ~/src/rhubarb
fi
brew list cmake >/dev/null 2>&1 || brew install cmake
mkdir -p audio/sf
# 오케스트라 음원 VSCO 2 CE (CC0, 약 5GB, SFZ 가지) + SFZ 렌더러 sfizz (브금, audio/make_bgm.py)
[ -d audio/sf/vsco2 ] || git clone --depth 1 --branch SFZ https://github.com/sgossner/VSCO-2-CE.git audio/sf/vsco2
if [ ! -x ~/src/sfizz/build/library/bin/sfizz_render ]; then
  mkdir -p ~/src && [ -d ~/src/sfizz ] || git clone --depth 1 --recursive https://github.com/sfztools/sfizz.git ~/src/sfizz
  # 새 clang이 atomic_queue의 template 문법을 오류로 막아서 경고로 내림
  cmake -S ~/src/sfizz -B ~/src/sfizz/build -DCMAKE_BUILD_TYPE=Release -DSFIZZ_RENDER=ON -DSFIZZ_JACK=OFF -DSFIZZ_LV2=OFF -DSFIZZ_VST=OFF -DSFIZZ_AU=OFF -DSFIZZ_TESTS=OFF -DSFIZZ_BENCHMARKS=OFF -DSFIZZ_DEMOS=OFF -DSFIZZ_DEVTOOLS=OFF -DCMAKE_CXX_FLAGS="-Wno-missing-template-arg-list-after-template-kw"
  cmake --build ~/src/sfizz/build -j8 --target sfizz_render
fi
[ -f audio/sf/MuseScore_General.sf2 ] || curl -fL -o audio/sf/MuseScore_General.sf2 https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf2
mkdir -p "${HWM:-$HOME/hwm}"/{영상,쇼츠,배너,홍보,브금,tts}
echo
for f in client_secret.json token.json tts_key.txt gemini_key.txt; do
  [ -f "secrets/$f" ] && echo "열쇠 있음: secrets/$f" || echo "열쇠 없음: secrets/$f  ← AirDrop으로 받은 파일을 넣고 chmod 600"
done
# 채널 브금 14곡 렌더 (git에 안 올림)
ls public/bgm/*.wav >/dev/null 2>&1 || .venv/bin/python -I audio/make_bgm.py
echo "지도 캡처가 필요하면 사이트 저장소(chronomap)를 받아 'npx next dev' 후 SITE=http://localhost:3000 으로 scripts/clean.mjs 실행"
echo "준비 끝 - docs/guide/ 부터 읽기"
# 시네마틱 장면(실제 지형 위 비행, blender/render_shot.py) - Blender (무료, GPL)
[ -d /Applications/Blender.app ] || brew install --cask blender
# 효과음 원본 녹음 (Kenney·OpenGameArt·NPS·Wikimedia Commons - CC0·퍼블릭 도메인·CC BY, 약 600MB, git 제외) - audio/make_sfx.py
# 가공본 public/sfx/ep/*.wav 는 git에 있음. 원본은 소리를 다시 만들 때만 필요 (.venv/bin/python -I audio/make_sfx.py)
.venv/bin/python -I audio/make_sfx.py fetch
