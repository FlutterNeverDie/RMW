---
description: 한 편 제작을 단계표대로 진행한다 - 다음 단계를 하고, 사용자 확인 단계에서 멈춘다
argument-hint: <편 id, 예: mongol-03> [하고 싶은 말]
---

한 편 제작 진행. 대상: $ARGUMENTS

1. `docs/guide/` 전체(특히 `06-제작-단계.md`)를 읽었는지 확인. 안 읽었으면 먼저 읽는다
2. 편 폴더 `episodes/<편>/`가 없으면 만들고 ep.json 뼈대(`{"_설명": ..., "bgm": "bgm/main.wav", "langs": ["en","ko","es"], "scenes": []}`)와 meta.json을 둔다 (기존 편 형식 참고)
3. `python3 scripts/pipeline.py run episodes/<편>/ep.json` → 코드 단계는 알아서 돌고, Claude나 사용자 차례에서 멈춘다
4. 멈춘 단계가 **Claude** 차례면 그 단계의 "할 일"을 한다. 게이트 검사에 걸린 곳만 고치고(전체를 다시 쓰지 않음), 다시 `run`. 통과하면 다음 단계로 계속
5. 멈춘 단계가 **사용자**(확인 1·2·3)면 **편집기를 그 편으로 열어 주고**(`curl -s localhost:4600 >/dev/null || (npm run editor &)` 후 `node scripts/tools.mjs open "http://localhost:4600/?e=<편>"` - 맥·윈도우 공용) 반드시 멈추고 보고한다. 사용자가 OK하면 그때 `python3 scripts/pipeline.py ok episodes/<편>/ep.json <단계>` 후 계속
   - 확인 1: 대본 한국어 요약(장면 흐름 · 첫 30초 · 재미 포인트 · 길이) + 사실 검증 결과(고친 곳·논란 숫자) + `python3 scripts/compare.py report <장면표>`로 만든 비교 검토 HTML을 `node scripts/tools.mjs open <파일>`로 열어 줌. 편집기 대사 탭에서 언어별로 볼 수 있다고 안내
   - 확인 2: 편집기 인물 탭에서 캐릭터 보기·모습 고치기
   - 확인 3: 편집기에서 렌더본 보고 고치기 (이름 붙여 저장) + 비교 검토 HTML(우리 렌더 프레임 포함) 다시 만들어 열어 줌. 사용자가 고쳤으면 렌더 다시 → 비교 검토 다시
   - `ok1`·`ok3`는 사실 검증·비교 검토 게이트가 통과해야 찍힌다 (pipeline.py가 막음)
6. 0단계 기획에서 사용자가 참고 영상을 줬으면 그것부터, 아니면 같은 주제 조회수 높은 영상을 직접 찾는다. 도입부·전환·구성은 별별역사, 캐릭터 등장·표정·연출은 퍄퍄킴 역사, 시리즈·지도 연출은 Epic History TV, 첫 1분·리텐션은 MrBeast를 기준으로 본다 (01 모티브 채널, 07 분석)
7. **사실 검증**(재미 보강 다음)은 `/factcheck <장면표>` 그대로 - 바뀐 장면만, wrong·unverified 0, 논란 숫자는 "chroniclers claimed"처럼
8. **비교 검토**(확인 1·3 직전): 같은 주제 조회수 높은 영상 2~3개(기획 때 본 것 + 07: 별별역사·Epic History TV·Kings and Generals 등)를 WebSearch·WebFetch로 조사해(설명·자막·분석 글, 영상은 받지 않음) `episodes/<편>/compare.json`에 첫 30초·구조·리듬을 적고, 7개 축(훅·쉬움·리듬·화면·소리·감정·정확성)마다 "참고 영상 최고 vs 우리"를 better·equal·worse로. **worse면 먼저 고친다** - 못 고치면 fix에 고칠 일. 우리 수치는 `compare.py ours`, 렌더 단계 뒤엔 `compare.py report`가 뽑은 `out/compare/<편>/*.jpg` 프레임을 직접 보고(Read) 평가. 끝나면 `compare.py stamp <장면표> script|render`. 형식은 06 비교 검토. 기준은 01 최상위 원칙 - 어느 축이든 "비슷함"에 머물지 않고 이기는 쪽으로
9. 토큰이 드는 일(대본·언어·검토)과 들지 않는 일(코드 단계)을 구분해서, 코드로 되는 건 코드로
10. 단계를 마칠 때마다 한두 줄로: 무엇을 했고, 다음이 누구 차례인지
11. Gemini 목소리는 모델당 하루 10번 - 목소리 단계 전에 `node scripts/gemini-tts.mjs quota` 확인, 모자라면 사용자에게 오늘 할지 내일 할지 묻는다
