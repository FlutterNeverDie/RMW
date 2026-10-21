#!/bin/bash
# 다른 맥·윈도우 PC로 옮길 작은 것들(열쇠·Claude 기억)을 바탕화면 한 폴더에 모은다 - AirDrop·USB로 옮긴 뒤 이 폴더는 지울 것
# 맥에서만 돌림 (모으는 쪽). 받는 쪽이 윈도우여도 아래 읽어주세요.txt대로 넣으면 됨
set -e
cd "$(dirname "$0")/.."
D=~/Desktop/hwm-옮길것
rm -rf "$D"; mkdir -p "$D/secrets" "$D/claude-memory"
cp secrets/* "$D/secrets/"
cp ~/.claude/projects/-Users-sanghoon/memory/*.md "$D/claude-memory/"
chmod 600 "$D/secrets/"*
cat > "$D/읽어주세요.txt" <<'TXT'
새 맥에서
1) secrets/ 안의 파일 → 저장소(RMW)의 secrets/ 에 넣고: chmod 600 secrets/*
2) claude-memory/ 안의 .md → ~/.claude/projects/-Users-<새 맥 사용자이름>/memory/ 에 넣기
   (폴더 이름은 새 맥에서 홈 폴더에서 claude를 한 번 켜면 생긴다)
새 윈도우 PC에서
1) secrets\ 안의 파일 → 저장소(RMW)의 secrets\ 에 넣기
2) claude-memory\ 안의 .md → %USERPROFILE%\.claude\projects\<홈 폴더 이름의 프로젝트 폴더>\memory\ 에 넣기
   (홈 폴더에서 claude를 한 번 켜면 C--Users-<사용자이름> 같은 폴더가 생긴다)
3) 옮긴 뒤 이 폴더와 휴대폰에 받은 사본은 지울 것 - 유튜브 업로드 권한이 들어 있다
TXT
echo "→ $D (열쇠 $(ls "$D/secrets" | wc -l | tr -d ' ')개, 기억 $(ls "$D/claude-memory" | wc -l | tr -d ' ')개)"
