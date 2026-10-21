# 언어별 말투·발음·화면 글자 규칙 엔진. 규칙은 docs/guide/locales/<언어>.rules.json (화면 글자는 screen.rules.json)
# 규칙 하나: id · group · kind(style/pron/screen) · level(error/warn) · scope(narration/dialogue/screen/all) · position(anywhere/sentence_end/clause_end)
#   pattern(정규식, {ㅂ받침}·{받침}·{무받침} 같은 한글 받침 묶음 가능) 또는 check(내장 검사), except(겹치면 봐줌), msg(한국어)
#   suggest(바꿀 말, \1 가능) 또는 fix(내장 고치기) 또는 map(맞은 말 → 바꿀 말), overuse(편 전체에서 이 수를 넘을 때만), types(화면 종류)
#   whole(칸 전체를 한 문제로), bad/good(자체 시험 문장), fixes([틀린 문장, 고친 문장]) → python3 scripts/check-text.py --selftest
import json
import re
from pathlib import Path

CODE = Path(__file__).resolve().parent.parent
RULES_DIR = CODE / "docs/guide/locales"
PRON = json.loads((CODE / "audio/pron.json").read_text()) if (CODE / "audio/pron.json").exists() else {}

# ---------- 한글 ----------
JONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"]
JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"


def split(c):
    n = ord(c) - 0xAC00
    if not 0 <= n < 11172:
        return None
    return n // 588, (n % 588) // 28, n % 28


def join(cho, jung, jong=0):
    return chr(0xAC00 + cho * 588 + jung * 28 + jong)


def has_jong(c):
    p = split(c) if c else None
    return bool(p and p[2])


def _cls(pred):
    return "[" + "".join(chr(0xAC00 + n) for n in range(11172) if pred(n % 28)) + "]"


MACROS = {"{받침}": _cls(lambda j: j), "{무받침}": _cls(lambda j: not j)}
for _k, _j in enumerate(JONG):
    if _j:
        MACROS[f"{{{_j}받침}}"] = _cls(lambda j, k=_k: j == k)


def expand(p):
    for k, v in MACROS.items():
        p = p.replace(k, v)
    return p


def haeyo(stem, before=""):
    """해요체 꼴: stem(어간 끝 음절, 예 '하'·'섰'·'먹') → '해요'·'섰어요'·'먹어요'. before = 앞 글자 (이다 → 이에요/예요)"""
    if stem == "이":
        return "이에요" if has_jong(before[-1:]) or not before else "예요"
    if stem == "니" and before.endswith("아"):
        return "니에요"
    special = {"하": "해요", "되": "돼요", "시": "세요"}
    if stem in special:
        return special[stem]
    p = split(stem)
    if not p:
        return None
    cho, jung, jong = p
    v = JUNG[jung]
    if jong:
        if JONG[jong] == "ㅆ":
            return stem + "어요"
        return stem + ("아요" if v in "ㅏㅗ" else "어요")
    if v in "ㅏㅓㅐㅔㅕㅙㅞ":
        return stem + "요"
    to = {"ㅗ": "ㅘ", "ㅜ": "ㅝ", "ㅣ": "ㅕ", "ㅚ": "ㅙ"}.get(v)
    if v == "ㅡ":
        prev = split(before[-1:]) if before else None
        to = "ㅏ" if prev and JUNG[prev[1]] in "ㅏㅗ" else "ㅓ"
    if to:
        return join(cho, JUNG.index(to)) + "요"
    return stem + "어요"


def drop_jong(c):
    cho, jung, _ = split(c)
    return join(cho, jung)


# ---------- 내장 고치기: (맞은 것, 전체 글) → 바꿀 말 목록 / None(제안 없음) / False(문제 아님) ----------
def fix_ko_hapsyo(m, text):
    # ([앞 음절]?)(ㅂ받침 음절)니(다|까)
    pre, x, end = m.group(1), m.group(2), m.group(3)
    before = text[: m.start()]
    if x == "습":
        if not pre:
            return None
        return [pre + "나요"] if end == "까" else [haeyo(pre, before)]
    base = drop_jong(x)
    if end == "까":
        return [pre + ("인가요" if base == "이" else base + "나요")]
    r = haeyo(base, before + pre)
    return [pre + r] if r else None


def fix_ko_haera(m, text):
    # ([앞 음절]?)(어간 끝 음절)다
    pre, x = m.group(1), m.group(2)
    before = text[: m.start()]
    if x == "는" and pre:  # 먹는다 → 먹어요
        r = haeyo(pre, before)
        return [r] if r else None
    if x == "이":
        return [pre + haeyo("이", before + pre)]
    if x == "든":  # 만든다 → 만들어요 (ㄹ 탈락)
        return [pre + "들어요"]
    if x == "안":  # 안다(알다)·안다(안다) - 모름
        return None
    p = split(x)
    if p and JONG[p[2]] == "ㄴ":  # 한다·간다·된다
        r = haeyo(drop_jong(x), before + pre)
        return [pre + r] if r else None
    r = haeyo(x, before + pre)
    return [pre + r] if r else None


KO_DIGITS = ["", "천", "백", "십"]


def fix_ko_man(m, text):
    n = int(m.group(0).replace(",", ""))
    if n < 10000:
        return False
    eok, rest = divmod(n, 10**8)
    man, one = divmod(rest, 10**4)
    parts = []
    if eok:
        parts.append(f"{eok:,}억")
    if man:
        parts.append(f"{man:,}만")
    if one:
        parts.append(f"{one:,}")
    out = " ".join(parts)
    if not one and re.match(r"[가-힣]", text[m.end() : m.end() + 1]):
        out += " "  # 10만 명
    return [out]


def fix_es_thousands(m, text):
    s = m.group(0).replace(",", "")
    if len(s) < 5 and "," not in m.group(0):
        return False
    return [f"{int(s):,}".replace(",", ".")]


ROMAN = [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]


def roman(n):
    out = ""
    for v, s in ROMAN:
        while n >= v:
            out, n = out + s, n - v
    return out


def fix_roman(m, text):
    return [m.group(0)[: m.start(1) - m.start()] + roman(int(m.group(1)))]


def fix_map(m, text, rule):
    w = m.group(0)
    for k, v in rule["map"].items():
        if k.lower() == w.lower():
            return [v[:1].upper() + v[1:] if w[:1].isupper() else v]
    return None


def fix_screen_strip(m, text):
    # 짧은 줄임말(c. ca)만 빼면 숫자·기호만 남을 때만 제안 (긴 낱말을 빼면 뜻이 바뀜: "~1 MILLION" → "~1")
    if any(len(w) > 2 for w in re.findall(r"[^\W\d_]+", text)):
        return None
    rest = re.sub(r"[^\W\d_]+\.?", "", text)
    rest = re.sub(r"\s{2,}", " ", re.sub(r"^[\s·:,.\-–]+|[\s·:,.\-–]+$", "", rest)).strip()
    return [rest] if re.search(r"\d", rest) else None


FIXES = {"ko_hapsyo": fix_ko_hapsyo, "ko_haera": fix_ko_haera, "ko_man": fix_ko_man, "es_thousands": fix_es_thousands, "roman": fix_roman, "screen_strip": fix_screen_strip}


# ---------- 내장 검사: 글 → [(시작, 끝, 제안)] ----------
def check_es_pairs(text):
    # 여는 부호 없이 닫힘, 닫힘 없이 여는 부호 (말줄임표로 끊긴 문장도 한 문장으로 봄)
    out = []
    for o, c in (("¿", "?"), ("¡", "!")):
        opened = []
        for k, ch in enumerate(text):
            if ch == o:
                opened.append(k)
            elif ch == c:
                if opened:
                    opened.pop()
                elif not (k and text[k - 1] == c):  # ?? !! 겹침은 한 번
                    out.append((k, k + 1, None))
        out += [(k, k + 1, None) for k in opened]
    return sorted(out)


CHECKS = {"es_pairs": check_es_pairs}

# ---------- 규칙 불러오기 ----------
_cache = {}


def load(name):
    if name not in _cache:
        f = RULES_DIR / f"{name}.rules.json"
        data = json.loads(f.read_text()) if f.exists() else {"rules": []}
        for r in data.get("rules", []):
            if "pattern" in r:
                r["_re"] = re.compile(expand(r["pattern"]), re.I if "i" in r.get("flags", "") else 0)
            r["_except"] = [re.compile(expand(x), re.I) for x in r.get("except", [])]
        for cls in (data.get("registers") or {}).get("classes", {}).values():
            cls["_re"] = re.compile(expand(cls["pattern"]), re.I if "i" in cls.get("flags", "") else 0)
        _cache[name] = data
    return _cache[name]


def covered(text, at, keys):
    low = text.lower()
    for k in keys:
        i = low.find(k)
        while i >= 0:
            if i <= at < i + len(k):
                return True
            i = low.find(k, i + 1)
    return False


END = re.compile(r"[\"'”’»)\]\s]*(?:[.!?…。]|\Z)")
CLAUSE = re.compile(r"[\"'”’»)\]]*\s*(?:[,;:.!?…。]|\Z)")


def in_scope(rule, scope):
    sc = rule.get("scope", "all")
    return sc == scope or (sc == "all" and scope in ("narration", "dialogue"))


def lint(text, lang, scope, data, *, show_type=None, allow=()):
    """한 칸의 글을 규칙으로 → [(rule, 시작, 끝, 제안)]"""
    out = []
    pron = {k.lower() for k in PRON.get(lang or "", {})}
    for r in data.get("rules", []):
        if not in_scope(r, scope):
            continue
        if show_type and ((r.get("types") and show_type not in r["types"]) or show_type in r.get("not_types", [])):
            continue
        if "check" in r:
            hits = CHECKS[r["check"]](text)
        else:
            hits = []
            for m in r["_re"].finditer(text):
                if r.get("position") == "sentence_end" and not END.match(text, m.end()):
                    continue
                if r.get("position") == "clause_end" and not CLAUSE.match(text, m.end()):
                    continue
                if any(x.start() < m.end() and m.start() < x.end() for e in r["_except"] for x in e.finditer(text)):
                    continue
                if allow and r.get("kind") == "screen" and m.group(0).lower().rstrip(".") in allow:
                    continue
                if r.get("kind") == "pron" and covered(text, m.start(), pron):
                    continue  # 발음 사전(audio/pron.json)에 있음
                sug = None
                if "fix" in r:
                    sug = FIXES[r["fix"]](m, text)
                    if sug is False:
                        continue
                elif "map" in r:
                    sug = fix_map(m, text, r)
                elif "suggest" in r:
                    sug = [m.expand(s) for s in r["suggest"]]
                if r.get("whole"):  # 칸 전체를 한 번에 (화면 글자: 숫자만 남긴 글로 바꿈)
                    hits.append((0, len(text), sug))
                    break
                hits.append((m.start(), m.end(), sug))
        out += [(r, s, e, sug) for s, e, sug in hits]
    return out


def sentences(text):
    return [s for s in re.split(r"(?<=[.!?…])\s+", text or "") if s.strip()]


def register_of(sentence, data):
    """문장의 말투 이름 (규칙 파일 registers.classes) 또는 None"""
    s = sentence.strip()
    for name, cls in (data.get("registers") or {}).get("classes", {}).items():
        for m in cls["_re"].finditer(s):
            if cls.get("position") == "sentence_end" and not END.match(s, m.end()):
                continue
            return name
    return None


def apply(text, s, e, rep):
    return text[:s] + rep + text[e:]


def selftest():
    bad = 0
    names = sorted(p.name.split(".")[0] for p in RULES_DIR.glob("*.rules.json"))
    for name in names:
        data = load(name)
        n = 0
        for r in data["rules"]:
            scope = {"all": "narration"}.get(r.get("scope", "all"), r.get("scope", "all"))
            st = (r.get("types") or [None])[0] or ("label" if scope == "screen" else None)
            lang = None if name == "screen" else name
            hits = lambda t: [h for h in lint(t, lang, scope, {"rules": [r]}, show_type=st)]
            for t in r.get("bad", []):
                n += 1
                if not hits(t):
                    bad += 1
                    print(f"  ✗ {name} {r['id']}: 못 잡음 - {t}")
            for t in r.get("good", []):
                n += 1
                if hits(t):
                    bad += 1
                    print(f"  ✗ {name} {r['id']}: 잘못 잡음 - {t} ({', '.join(t[s:e] for _, s, e, _ in hits(t))})")
            for t, want in r.get("fixes", []):
                n += 1
                h = hits(t)
                got = apply(t, h[0][1], h[0][2], h[0][3][0]) if h and h[0][3] else None
                if got != want:
                    bad += 1
                    print(f"  ✗ {name} {r['id']}: 고치기 {t} → {got} (기대 {want})")
        for cname, cls in (data.get("registers") or {}).get("classes", {}).items():
            for t in cls.get("examples", []):
                n += 1
                got = register_of(t, data)
                if got != cname:
                    bad += 1
                    print(f"  ✗ {name} 말투 {cname}: {t} → {got}")
        print(f"  {name}: 시험 {n}개")
    return bad
