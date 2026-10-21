#!/bin/bash
# 해설 영상 한 편 만들기 - 실제 단계는 scripts/make-episode.mjs (맥·윈도우 같은 코드). 이 파일은 예전 명령을 위한 맥 별칭
# scripts/make-episode.sh episodes/mongol-01/ep.json Mongol01 out/mongol-01.mp4 [--dry-run]
exec node "$(dirname "$0")/make-episode.mjs" "$@"
