# 대본·화면 글자 검사 (LLM 없이 규칙만): 목소리를 만들기 전에 돌려서 걸리면 멈춤
#   python3 scripts/check-text.py episodes/mongol-03/ep.json [--json] [--stdin]   (형식은 scripts/checklib.py)
#   python3 scripts/check-text.py --selftest                                     규칙 파일의 bad/good 예문 시험
#
# 규칙은 언어마다 docs/guide/locales/<언어>.rules.json (엔진 scripts/langrules.py), 화면 글자는 screen.rules.json
#   말투: 한국어 내레이션 합쇼체 (해요체 "~요"·"~죠" 금지, 질문 "~까요?"만 허용, 해라체 "~것이다"·"~했다"), 인물마다 말투 하나 (장면 사이) - 2026-10-22 사용자
#   번역투·맞춤법·숫자(만 단위, 천 단위 마침표, 세기 로마 숫자), 스페인 전용 표현·tú/usted·anglicismos
#   발음(TTS 위험): 로마자·단위 없는 숫자·괄호·줄임말 (audio/pron.json에 있으면 봐줌)
#   화면 글자: 숫자·연도·기호만 (2026-10-21 사용자)
# 여기서 직접: 언어 빠짐(오류), 이름 사전 episodes/names.json (틀린 영어 표기는 오류, 언어별 표기·새 이름은 경고),
#   AI 음성 검수 결과 public/ep/<편>/<이름>/qa-<언어>.json (high → 오류, 대사가 바뀌었으면 "낡음" 경고. 게이트는 안 막음)
# 업로드한 편(meta.json uploaded)은 화면을 못 바꾸니 화면 글자는 경고로
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import langrules as L  # noqa: E402
from checklib import Ctx, item, is_narr, report  # noqa: E402

if "--selftest" in sys.argv:
    bad = L.selftest()
    print(f"규칙 자체 시험: {'통과' if not bad else f'{bad}개 실패'}")
    sys.exit(1 if bad else 0)

NAMES_PATH = L.CODE / "episodes/names.json"
NAMES = json.loads(NAMES_PATH.read_text())["names"] if NAMES_PATH.exists() else {}
SCREEN_FIELDS = ("title", "sub", "name", "text")

ctx = Ctx()
scenes = ctx.scenes
langs = ctx.langs
allow = {w.lower() for w in ctx.ep.get("screen_ok", [])}
out = []


def fold(w):
    return "".join(c for c in unicodedata.normalize("NFD", w) if unicodedata.category(c) != "Mn").lower()


def words(s):
    return re.findall(r"[A-Za-zÀ-ÿĀ-ž']+", s)


def field_of(lang):
    return "text" if lang == "en" else f"i18n.{lang}"


def line_of(sc, lang):
    return (sc.get("text") if lang == "en" else (sc.get("i18n") or {}).get(lang)) or ""


def add_hits(i, lang, field, text, hits, source_of=None):
    for r, s, e, sug in hits:
        out.append(item(i, r["msg"], source=source_of or ("pron" if r.get("kind") == "pron" else "screen" if r.get("kind") == "screen" else "text"),
                        rule=r["id"], group=r.get("group"), level=r["level"], lang=lang, field=field, span=[s, e], match=text[s:e], suggest=sug, text=text))


# ---------- 언어별 대사: 규칙 파일 ----------
for i, sc in enumerate(scenes):
    if not sc.get("text"):
        continue
    scope = "narration" if is_narr(sc) else "dialogue"
    tr = sc.get("i18n") or {}
    for lang in langs:
        t = tr.get(lang)
        if not t:
            out.append(item(i, f"{lang} 대사 없음", source="text", rule="lang-missing", group="언어 빠짐", lang=lang, field=field_of(lang)))
        elif t.strip() == sc["text"].strip():
            out.append(item(i, f"{lang} 대사가 영어 원문 그대로", source="text", rule="lang-same", group="언어 빠짐", lang=lang, field=field_of(lang), text=t))
    for lang in ["en", *langs]:
        t = line_of(sc, lang)
        if t:
            add_hits(i, lang, field_of(lang), t, L.lint(t, lang, scope, L.load(lang)))

# 편 전체에서 많을 때만 (overuse)
for lang in ["en", *langs]:
    for r in L.load(lang).get("rules", []):
        n = r.get("overuse")
        if not n:
            continue
        mine = [x for x in out if x["rule"] == r["id"]]
        if len(mine) <= n:
            out = [x for x in out if x["rule"] != r["id"]]
        else:
            for x in mine:
                x["msg"] = f"{r['msg']} ({len(mine)}번 - {n}번까지)"

# ---------- 인물 말투: 한 인물(말하는 사람)은 장면 사이에서 말투 하나 ----------
for lang in ["en", *langs]:
    data = L.load(lang)
    reg = data.get("registers")
    if not reg:
        continue
    by = {}
    for i, sc in enumerate(scenes):
        if not sc.get("text") or is_narr(sc):
            continue
        who = (sc.get("speaker") or sc.get("role") or "?").upper()
        for s in L.sentences(line_of(sc, lang)):
            r = L.register_of(s, data)
            if r:
                by.setdefault(who, []).append((i, s, r))
    for who, xs in by.items():
        count = {}
        for _, _, r in xs:
            count[r] = count.get(r, 0) + 1
        if len(count) < 2:
            continue
        main = max(count, key=count.get)
        for i, s, r in xs:
            if r != main:
                t = line_of(scenes[i], lang)
                at = t.find(s)
                out.append(item(i, f"인물 말투 섞임: {who}는 주로 {main}인데 여기만 {r} ({', '.join(f'{k} {v}' for k, v in count.items())})", source="text",
                                rule=f"{lang}-speaker-register", group="인물 말투", level=reg.get("speaker_level", "warn"), lang=lang, field=field_of(lang),
                                span=[at, at + len(s)] if at >= 0 else None, match=s, text=t))

# ---------- 화면 글자 ----------
screen = L.load("screen")
for i, sc in enumerate(scenes):
    sh = sc.get("show") or {}
    typ = sh.get("type") or "?"
    fields = [(f"show.{k}", sh[k]) for k in SCREEN_FIELDS if isinstance(sh.get(k), str)]
    for key in ("labels", "pins"):
        for k, lb in enumerate(sh.get(key) or []):
            if isinstance(lb, dict) and isinstance(lb.get("text"), str):
                fields.append((f"show.{key}.{k}.text", lb["text"]))
    for field, v in fields:
        hits = L.lint(v, None, "screen", screen, show_type=typ, allow=allow)
        n0 = len(out)
        add_hits(i, None, field, v, hits)
        for x in out[n0:]:
            bad = [w for w in re.findall(r"[^\W\d_]+", v) if w.lower() not in allow]
            x["msg"] = f"화면 {typ}.{field[5:]} = {v!r}: {x['msg']}" + (f" ({', '.join(bad[:6])})" if bad else "")
            if ctx.uploaded:
                x["level"] = "warn"  # 이미 올린 화면은 못 바꿈

# ---------- 이름 사전 ----------
proper = {}  # 고유명사 = 영어 대사에서 문장 첫머리가 아닌데 대문자로 시작하는 낱말
for i, sc in enumerate(scenes):
    for sent in L.sentences(sc.get("text") or ""):
        for k, w in enumerate(words(sent)):
            w = w.removesuffix("'s")
            if k > 0 and w[:1].isupper():
                proper.setdefault(fold(w), set()).add(w)
for i, sc in enumerate(scenes):
    en = sc.get("text")
    if not en:
        continue
    tr = sc.get("i18n") or {}
    for name, forms in NAMES.items():
        for v in forms.get("variants", []):
            m = re.search(rf"\b{re.escape(v)}\b", en)
            if m:
                out.append(item(i, f"이름 표기 {v} → 사전 표기 {name}", source="text", rule="name-variant", group="이름", lang="en", field="text",
                                span=[m.start(), m.end()], match=v, suggest=[name], text=en))
        if not re.search(rf"\b{re.escape(name)}", en):
            continue
        for lang in langs:
            want = forms.get(lang)
            t = tr.get(lang)
            if want and t and not any(w in t for w in want.split("|")):
                out.append(item(i, f"{lang} 이름 표기: {name} → {want} 이어야 함 (대명사로 바꿨으면 괜찮음)", source="text", rule="name-form", group="이름",
                                level="warn", lang=lang, field=field_of(lang), text=t))
for k, forms in proper.items():
    if len(forms - {f.upper() for f in forms}) > 1 and len({f.lower() for f in forms}) > 1:
        out.append(item(None, f"영어 이름 철자 여러 개: {', '.join(sorted(forms))}", source="text", rule="name-spelling", group="이름", level="warn"))
new = sorted({sorted(f)[0] for k, f in proper.items() if not any(k == fold(w) or fold(n).startswith(k) for n in NAMES for w in n.split())})
if new:
    out.append(item(None, f"사전에 없는 이름 {len(new)}개 (표기 확인 후 episodes/names.json에 추가): {', '.join(new)}", source="text", rule="name-new", group="이름", level="warn"))

# ---------- AI 음성 검수 (qa-voice.mjs) ----------
tl = (ctx.tl or {}).get("scenes") or []
for lang in ["en", *langs]:
    f = ctx.base / f"qa-{lang}.json"
    if not f.exists():
        continue
    try:
        rep = json.loads(f.read_text())
    except ValueError:
        continue
    for p in rep:
        c = p.get("clip")
        if not isinstance(c, int):
            continue
        # 검수한 줄의 지문: 보고서에 적힌 대사(새 qa-voice.mjs), 없으면 목소리 만들 때의 대사(timeline)
        t0 = tl[c] if c < len(tl) else {}
        en0 = p.get("en") or t0.get("text")
        said = p.get("text") or (t0.get("text") if lang == "en" else (t0.get("i18n") or {}).get(lang))
        i = c if c < len(scenes) and (en0 is None or scenes[c].get("text") == en0) else next((k for k, s in enumerate(scenes) if s.get("text") == en0), None)
        if i is None:
            continue  # 그 장면이 없어짐
        now = line_of(scenes[i], lang)
        stale = said is not None and now != said
        lv = "error" if p.get("severity") == "high" and not stale else "warn"
        out.append(item(i, f"{'(낡음 - 대사가 바뀜, 목소리 다시 만들고 검수) ' if stale else ''}AI 검수: {p.get('problem')}", source="qa", rule="qa", group="AI 검수",
                        level=lv, lang=lang, field=field_of(lang), text=now, stale=stale, nogate=True))

# 같은 칸·같은 무리에서 오류와 겹치는 경고는 뺌 (해라체 오류 + "~다" 경고)
errs = [x for x in out if x["level"] == "error" and x.get("span")]
out = [x for x in out if not (x["level"] == "warn" and x.get("span") and any(
    e["scene"] == x["scene"] and e["field"] == x["field"] and e["group"] == x["group"] and e["span"][0] < x["span"][1] and x["span"][0] < e["span"][1] for e in errs))]
out.sort(key=lambda x: (x["scene"] if x["scene"] is not None else 1 << 30, x["field"] or ""))
report(ctx, out, "대본 검사")
