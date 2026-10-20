# 대본·화면 글자 검사 (LLM 없이 규칙만): 목소리를 만들기 전에 돌려서 걸리면 멈춤
# python3 scripts/check-text.py episodes/mongol-03/ep.json
#
# 오류(멈춤)
#   - 언어 빠짐: langs에 있는 언어의 i18n이 없거나 영어 원문 그대로
#   - 한국어 "이였" (→ 이었/였)
#   - 한국어 내레이션 말투 섞임: 채널 말투는 해요체(~요/~죠). "~습니다/~ㅂ니다"는 안 씀 (2026-10-20 사용자: 어색함)
#   - 화면 글자에 이름·지명·연도가 아닌 낱말 (화면을 모든 언어 더빙이 같이 씀)
#   - 이름 사전(episodes/names.json)의 variants(틀린 영어 표기)를 씀 (Begter → Bekter)
#     (스페인어 Gengis Kan·Temuyín처럼 나라마다 다르게 쓰는 건 맞는 현지화 - 사전에 적어 두면 편마다 같은 표기로 맞춰짐)
#   - 스페인어에 스페인 전용 표현 (vosotros·habéis·vale 등 - 채널은 중남미 중립)
# 경고(보고만)
#   - 스페인어 내레이션에 usted, 번역 안 하고 남은 영어 낱말
#   - 사전에 없는 새 이름: 표기를 확인하고 names.json에 추가
#   - 영어에 사전 이름이 나왔는데 다른 언어 대사에 사전 표기가 없음 (대명사로 바꿨으면 괜찮음)
#   - 한국어 내레이션 "~다." 끝맺음, 한국어 대사 속 영어 글자, 스페인어 ¿ ¡ 짝
#
# 화면 글자로 써도 되는 낱말은 ep.json의 "screen_ok": ["PART", ...]에 추가 (채널 공통은 아래 SCREEN_OK)
import json
import re
import sys
import unicodedata
from pathlib import Path

SCREEN_OK = {"of", "the", "al", "din", "de", "c", "part", "&", "·", "×", "-", "x", "ii", "iii", "iv"}
NAMES_PATH = Path(__file__).resolve().parent.parent / "episodes/names.json"
NAMES = json.loads(NAMES_PATH.read_text())["names"] if NAMES_PATH.exists() else {}
NARRATOR = re.compile(r"^narrator")

path = Path(sys.argv[1])
ep = json.loads(path.read_text())
scenes = ep["scenes"]
langs = [l for l in ep.get("langs", ["en"]) if l != "en"]
screen_ok = SCREEN_OK | {w.lower() for w in ep.get("screen_ok", [])}
errors, warns = [], []


def fold(w):
    return "".join(c for c in unicodedata.normalize("NFD", w) if unicodedata.category(c) != "Mn").lower()


def words(s):
    return re.findall(r"[A-Za-zÀ-ÿĀ-ž']+", s)


def where(i, sc):
    return f"#{i} {(sc.get('text') or '')[:50]}"


def edit(a, b):
    if abs(len(a) - len(b)) > 2:
        return 9
    d = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        p, d[0] = d[0], i
        for j, cb in enumerate(b, 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (ca != cb))
    return d[-1]


# 고유명사 = 영어 대사에서 문장 첫머리가 아닌데 대문자로 시작하는 낱말 (+ 화면 이름 칸)
proper = {}
for i, sc in enumerate(scenes):
    for sent in re.split(r"(?<=[.!?…])\s+", sc.get("text") or ""):
        for k, w in enumerate(words(sent)):
            w = w.removesuffix("'s")
            if k > 0 and w[:1].isupper():
                proper.setdefault(fold(w), set()).add(w)

def is_name(w):
    w = fold(w.removesuffix("'s"))
    return any(w == k or (len(w) >= 4 and (k.startswith(w) or w.startswith(k))) for k in proper) or any(
        w in fold(n) for n in NAMES
    )


# 화면 글자
for i, sc in enumerate(scenes):
    sh = dict(sc.get("show", {}), speaker=sc.get("speaker"))
    for key in ("text", "name", "sub", "title", "speaker"):
        v = sh.get(key)
        if not isinstance(v, str):
            continue
        bad = [w for w in words(v) if not is_name(w) and fold(w) not in screen_ok]
        if bad:
            errors.append(f"{where(i, sc)}\n    화면 {sh['type']}.{key} = {v!r} → 이름·지명·연도가 아닌 낱말: {', '.join(bad)}")

# 언어별 대사
seen_es = {}
for i, sc in enumerate(scenes):
    en = sc.get("text")
    if not en:
        continue
    tr = sc.get("i18n", {})
    narr = bool(NARRATOR.match(sc.get("role") or "narrator"))
    for lang in langs:
        t = tr.get(lang)
        if not t:
            errors.append(f"{where(i, sc)}\n    {lang} 대사 없음")
        elif t.strip() == en.strip():
            errors.append(f"{where(i, sc)}\n    {lang} 대사가 영어 원문 그대로")
    ko = tr.get("ko", "")
    if "이였" in ko:
        errors.append(f"{where(i, sc)}\n    ko \"이였\" → \"이었\"/\"였\": {ko}")
    if ko and narr:
        for s in re.split(r"(?<=[.!?…])\s+", ko):
            end = s.rstrip(" .!?…\"'”’)")
            if re.search(r"(니다|니까)$", end):
                errors.append(f"{where(i, sc)}\n    ko 말투 섞임(~니다 → ~요/~죠): {s}")
            elif re.search(r"[^요죠]다$", end) and not re.search(r"(거|것|뿐|때문)이다$", end):
                warns.append(f"{where(i, sc)}\n    ko \"~다\" 끝맺음, 해요체가 맞는지: {s}")
    if ko and re.search(r"[A-Za-z]{2,}", ko):
        warns.append(f"{where(i, sc)}\n    ko 대사에 영어 글자: {ko}")
    es = tr.get("es", "")
    if es and (es.count("¿") != es.count("?") or es.count("¡") != es.count("!")):
        warns.append(f"{where(i, sc)}\n    es ¿? ¡! 짝이 안 맞음: {es}")
    # 스페인어는 중남미 중립 (docs/guide/locales/es.md): 스페인 전용 표현·usted 섞임
    spain = re.findall(r"\b(vosotros|vosotras|habéis|sois|tenéis|estáis|vale|coger|ordenador|os)\b", es, re.I)
    if spain:
        errors.append(f"{where(i, sc)}\n    es 스페인 전용 표현(중남미 중립으로): {', '.join(sorted(set(spain)))}: {es}")
    if narr and re.search(r"\busted(es)?\b", es, re.I) and re.search(r"\busted\b", es, re.I):
        warns.append(f"{where(i, sc)}\n    es 내레이션에 usted - 시청자에겐 tú로 통일: {es}")
    # 번역하지 않고 남은 영어 낱말 (이름 빼고)
    for lang in langs:
        left = [w for w in re.findall(r"\b(the|and|of|with|but|this|that|was|were|they|their)\b", tr.get(lang, ""), re.I)]
        if left:
            warns.append(f"{where(i, sc)}\n    {lang}에 영어 낱말이 남음: {', '.join(left)}")
    # 이름 사전: 이 장면 영어에 나온 사전 이름은 언어마다 사전 표기로
    for name, forms in NAMES.items():
        variants = [v for v in forms.get("variants", []) if re.search(rf"\b{re.escape(v)}\b", en)]
        if variants:
            errors.append(f"{where(i, sc)}\n    en 이름 표기 {variants[0]} → 사전 표기 {name}")
        if not re.search(rf"\b{re.escape(name)}", en):
            continue
        for lang in langs:
            want = forms.get(lang)
            if want and tr.get(lang) and not any(w in tr[lang] for w in want.split("|")):
                warns.append(f"{where(i, sc)}\n    {lang} 이름 표기: {name} → {want} 이어야 함: {tr[lang]}")

# 같은 이름이 영어 안에서 여러 철자 (Temüjin / Temujin)
for k, forms in proper.items():
    if len(forms - {f.upper() for f in forms}) > 1 and len({f.lower() for f in forms}) > 1:
        warns.append(f"영어 이름 철자 여러 개: {', '.join(sorted(forms))}")

new = sorted({sorted(f)[0] for k, f in proper.items() if not any(k == fold(w) or fold(n) .startswith(k) for n in NAMES for w in n.split())})
if new:
    warns.append(f"사전에 없는 이름 {len(new)}개 (표기 확인 후 episodes/names.json에 추가): {', '.join(new)}")

for title, items in (("오류", errors), ("경고", warns)):
    if items:
        print(f"[{title} {len(items)}]")
        for e in items:
            print("  " + e)
print(f"대본 검사: 오류 {len(errors)}, 경고 {len(warns)}")
sys.exit(1 if errors else 0)
