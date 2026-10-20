# hwm/코드 - ReStory Worlds Map 유튜브 채널 제작 저장소

작업 전에 **`docs/guide/`를 먼저 읽는다** (채널 원칙·제작 결정·만드는 법·사고 기록·외부 서비스). 새 결정이나 사고는 그 파일에 날짜와 함께 추가한다.

- 산출물은 상위 폴더 `~/hwm`(영상/재생목록/편 폴더 등)에 `scripts/deliver.mjs`로 복사. 사용자는 산출물만 본다
- **영상 한 편 만들기는 단계표대로** (`docs/guide/06-제작-단계.md`): 먼저 `python3 scripts/pipeline.py status episodes/<편>/ep.json`, 다음 단계만 진행, 게이트에 걸린 곳만 고친다. **확인 1·2·3(사용자)에서는 반드시 멈추고** 사용자 OK 후 `pipeline.py ok`. 사용자가 `/episode <편>`이라고 하면 이 흐름 그대로
- 더빙 대사를 쓰거나 고치면 `/localize`로 검토 도장 (없으면 한 편 만들기가 멈춤)
- 렌더: `scripts/make-episode.sh` (잘림·깜빡임 검사에 걸리면 멈춤 - 우회하지 말 것)
- 답은 한국어로, 긴 대시 대신 하이픈
- 열쇠(`secrets/`)는 절대 커밋·출력하지 않는다. 커밋·푸시는 사용자가 요청할 때만, Co-Authored-By 넣지 않음
