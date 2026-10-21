---
description: 영어 대본의 사실(숫자·연도·이름·지명·[기록] 인용·병력·사상자)을 장면마다 출처로 확인하고 facts.json 도장을 찍는다
argument-hint: episodes/<편>/ep.json [장면 번호...]
---

사실 검증 하네스. 대상: $ARGUMENTS (장면 번호를 안 주면 새로 생겼거나 대사가 바뀐 장면 전부)

기준: 우리는 글로벌 채널이라 별별역사보다 엄격해야 한다(07 피할 것: 사실 오류와 과장). 틀린 숫자 하나가 댓글 1위가 된다.

1. `python3 scripts/factcheck.py lines <장면표>`로 **확인할 장면만** 뽑는다 (지문이 같은 장면은 이미 확인됨 - 다시 읽지 않는다). 옛 대사의 주장(stale)이 같이 나오면 그 출처를 다시 쓴다
2. 장면마다 사실 주장을 뽑는다. 주장이 없는 장면(감탄, 질문, 구독 안내)도 확인 대상 - 주장 없이 stamp만
   - kind: `number`(일반 숫자) · `date` · `name` · `place` · `quote`([기록] 인용, script.txt `[기록]` 표시) · `army`(병력) · `casualty`(사상자) · `event`(누가 무엇을 했다)
   - 극화된 인물 대사는 "그런 일이 있었나"(event)만 본다. 말투는 극화라 괜찮다
3. 확인은 **종류별로 깊이를 다르게** (2026-10-21 사용자: 토큰을 아끼되 틀리기 쉬운 곳만 깊게)
   | 종류 | kind | 확인 | 출처로 적는 것 |
   |---|---|---|---|
   | 기본 사실 (약 70%) | `date` `name` `place` `event` | **영어 위키백과의 출처 달린 문장으로 충분**. 문서 하나로 그 장면들의 주장을 한꺼번에 확인 (WebFetch 한 번에 여러 주장) | `{"title": "Wikipedia: Battle of the Kalka River", "ref": "https://en.wikipedia.org/wiki/..."}` |
   | 숫자 (약 20%) | `number` `army` `casualty` | 위키백과가 인용한 연구서·사료를 확인 (각주를 따라감). 두 곳이 다르면 `disputed` - 대본은 "chroniclers claimed", "Persian sources say", "up to"처럼 | 각주의 원 출처 (책·쪽 또는 학술 링크) |
   | 인용·극적 장면 (약 10%) | `quote` (`[기록]` 대사) | **1차 사료 원문** 확인 - 몽골 비사(de Rachewiltz §), 주베이니(Boyle 권·쪽), 라시드 앗딘(Thackston), 이븐 알아시르, 노브고로드 연대기 등. quote에 원문 한 줄 필수 | 1차 사료 |
   - 아는 것은 바로 적고, 애매한 것만 WebSearch·WebFetch. 같은 위키백과 문서를 두 번 받지 않는다
   - 2차 연구로 다시 볼 곳: Timothy May, Peter Jackson, de Rachewiltz, Allsen, Ratchnevsky, Encyclopaedia Iranica, Britannica. Weatherford(대중서)의 숫자는 다른 책으로 한 번 더
   - 극화된 인물 대사는 "그런 일이 있었나"(event)만 본다. 말투는 극화라 괜찮다
   - 대본 문장은 위키백과를 베끼지 않는다 (01 원칙) - 확인에만 쓴다
4. 판정: `ok`(출처와 맞음) · `disputed`(학자·사료마다 다름 - 대본이 그렇게 말하면 통과) · `wrong`(틀림 - `fix`에 고친 영어 문장) · `unverified`(못 찾음). **wrong·unverified는 대본을 고치거나 빼서 없앤다** - 남기면 게이트가 막는다
5. `episodes/<편>/facts.json`의 `claims`에 적는다 (새 주장은 `fp` 없이 `scene`만, 형식은 scripts/factcheck.py 머리 주석):
   `{"scene": 12, "claim": "Genghis proclaimed Great Khan at the 1206 kurultai", "kind": "date", "value": "1206", "verdict": "ok", "sources": [{"title": "The Secret History of the Mongols (trans. de Rachewiltz)", "ref": "§202", "quote": "In the Year of the Tiger (1206) ..."}], "note": "", "fix": ""}`
   - `quote`는 출처 원문 한 줄 (판정 근거). `[기록]` 인용은 quote 필수
   - 대본을 고쳤으면(wrong·disputed 표현) 바뀐 장면을 다시 lines로 보고 주장을 맞춘다. 더빙(i18n)도 같은 뜻으로 고치고 `/localize` 도장 다시
6. `python3 scripts/factcheck.py stamp <장면표> --changed` (또는 장면 번호) → `python3 scripts/factcheck.py gate <장면표>`로 통과 확인 (남은 장면 0, 걸린 주장 0)
7. 장면이 많으면(30개 이상) 장면 묶음마다 서브에이전트를 나눠 띄우고, 각자 주장 목록(JSON)만 돌려받아 한 번에 facts.json에 합친다
8. 사용자에게 한국어로: 확인한 장면·주장 수, wrong으로 고친 곳(전/후·근거), disputed로 말을 바꾼 곳, 확인 1에서 같이 볼 논란 숫자

## 설명란 출처
- 썸네일·업로드 단계에서 `python3 scripts/factcheck.py sources <장면표> --merge` → facts.json의 ok·disputed 출처를 제목별로 한 번씩 meta.json `"sources"`에 추가 (이미 있는 제목은 건너뜀, `- Maps:` 줄은 맨 뒤). `upload-info.py`가 그 줄을 언어별 설명란 "Sources"에 넣는다
- 위키백과 출처(`Wikipedia:`로 시작)는 확인용이라 설명란에 넣지 않는다 - `sources --merge`가 건너뜀
- 출처 제목은 설명란에 그대로 나가니 `"Ata-Malik Juvaini, History of the World Conqueror (13th c.)"`처럼 사람이 읽을 이름으로 적는다
