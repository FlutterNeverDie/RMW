# 스페인어 현지화 가이드 (더빙·제목·설명)

사용자는 스페인어를 판단할 수 없다 → 이 문서 + `scripts/check-text.py` 규칙 + Claude 검토(`scripts/locale-review.py` 도장) + AI 음성 검수(`qa-voice.mjs`)로 대신한다.

## 대상
- **중남미 중립 스페인어** (목소리가 es-US). 멕시코·콜롬비아·아르헨티나 시청자가 다 자연스럽게 듣는 말
- 스페인 전용 표현 금지: `vosotros`·`os`·`habéis`·`vale`·`coger`(중남미에선 비속어)·`ordenador`
- 2인칭 복수는 `ustedes`. 시청자에게 말할 땐 친근한 `tú`로 통일 (`usted`와 섞지 않음)

## 목표 말투
- 중남미 역사 유튜버(예: Academia Play, Pero eso es otra historia) 톤 - 가볍고 빠르게, 질문 던지기 ("¿Y saben qué pasó?")
- 문장 짧게, 극적인 곳에서 끊기

## 번역 말고 현지화
- 영어 구조 직역 금지 (anglicismos): "hacer sentido" → "tener sentido", "en orden de" → "para", "aplicar para" → "postularse"
- 수동태(`fue + 과거분사`) 남발 금지 → 능동태나 `se` 구문
- 영어 낱말 그대로 두지 않기 (고유명사 빼고)
- 물음표·느낌표는 여는 부호 `¿ ¡` 짝 필수

## 숫자·연도
- 연도는 숫자로 쓰고 TTS가 "mil doscientos seis"로 읽음. 세기는 로마 숫자: "siglo XIII"
- 천 단위 마침표: "20.000 jinetes" (중남미 일부는 쉼표 - 채널은 마침표로 통일)

## 이름 표기
- `episodes/names.json`의 es 표기 (스페인어 관용 표기: Gengis Kan, Temuyín, Corasmia, Samarcanda)
- 발음이 틀리면 `audio/pron.json`에 (예: "sah" → "saje")

## 자주 나오는 실수
- `tú`/`usted` 섞임, 스페인식 `vosotros`
- 성·수 일치 (los mongoles / la horda)
- 문장이 영어보다 길어짐 - 스페인어는 보통 영어보다 15~25% 김. 영어 길이를 넘지 않게 줄인다 (장면 길이 = 가장 긴 언어)
