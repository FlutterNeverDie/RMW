# 현지화 검토 하네스: 언어마다 "검토 도장"을 찍고, 대사가 바뀌면 도장이 풀려서 한 편 만들기가 멈춘다
# 검토는 Claude가 docs/guide/locales/<언어>.md 기준으로 한다 (/localize 명령, .claude/commands/localize.md)
#
#   python3 scripts/locale-review.py status episodes/mongol-03/ep.json [--json]   언어별 검토 상태
#   python3 scripts/locale-review.py lines  episodes/mongol-03/ep.json es          검토할 줄 (번호 · 영어 · 그 언어)
#   python3 scripts/locale-review.py stamp  episodes/mongol-03/ep.json es notes.json
#        notes.json = {"ok": true, "summary": "...", "fixed": [...], "left": [...]} - 고친 뒤 지금 대사에 도장
#   python3 scripts/locale-review.py gate   episodes/mongol-03/ep.json             검토 안 됐거나 바뀐 언어가 있으면 exit 1
#
# 도장: episodes/<편>/review/<언어>.json (git에 올림 - 어느 대사를 누가 언제 통과시켰는지 남김)
# 지문(hash) = 장면마다 [영어 대사, 그 언어 대사] - 영어가 바뀌어도 다시 검토
import datetime
import hashlib
import json
import sys
from pathlib import Path


def load(ep_path):
    ep = json.loads(Path(ep_path).read_text())
    langs = [l for l in ep.get("langs", ["en"]) if l != "en"]
    return ep, langs


def fingerprint(ep, lang):
    rows = [[s.get("text") or "", (s.get("i18n") or {}).get(lang, "")] for s in ep["scenes"] if s.get("text")]
    return hashlib.sha256(json.dumps(rows, ensure_ascii=False).encode()).hexdigest()[:16]


def review_file(ep_path, lang):
    return Path(ep_path).parent / "review" / f"{lang}.json"


def status(ep_path):
    ep, langs = load(ep_path)
    out = {}
    for lang in langs:
        f = review_file(ep_path, lang)
        r = json.loads(f.read_text()) if f.exists() else None
        if not r:
            st = "검토 안 됨"
        elif r.get("hash") != fingerprint(ep, lang):
            st = "대사 바뀜 - 다시 검토"
        elif not r.get("ok"):
            st = "검토에서 걸림"
        else:
            st = "통과"
        out[lang] = {"state": st, "date": (r or {}).get("date"), "summary": (r or {}).get("summary"), "left": (r or {}).get("left", [])}
    return out


cmd, ep_path, *rest = sys.argv[1:]
if cmd == "status":
    s = status(ep_path)
    if "--json" in rest:
        print(json.dumps(s, ensure_ascii=False))
    else:
        for lang, v in s.items():
            print(f"{lang}: {v['state']}" + (f" ({v['date']})" if v["date"] else ""))
elif cmd == "lines":
    ep, _ = load(ep_path)
    lang = rest[0]
    for i, s in enumerate(ep["scenes"]):
        if s.get("text"):
            who = s.get("speaker") or s.get("role") or ""
            print(f"#{i} [{who}]\n  en: {s['text']}\n  {lang}: {(s.get('i18n') or {}).get(lang, '(없음)')}")
elif cmd == "stamp":
    ep, _ = load(ep_path)
    lang, notes = rest[0], json.loads(Path(rest[1]).read_text())
    f = review_file(ep_path, lang)
    f.parent.mkdir(exist_ok=True)
    rec = {"lang": lang, "hash": fingerprint(ep, lang), "date": datetime.date.today().isoformat(), "by": "claude", "guide": f"docs/guide/locales/{lang}.md", **notes}
    f.write_text(json.dumps(rec, ensure_ascii=False, indent=1) + "\n")
    print(f"→ {f} ({'통과' if rec.get('ok') else '걸림'})")
elif cmd == "gate":
    bad = {l: v["state"] for l, v in status(ep_path).items() if v["state"] != "통과"}
    for l, st in bad.items():
        print(f"현지화 검토: {l} {st} → Claude에게 /localize {ep_path}")
    print(f"현지화 검토: {'통과' if not bad else f'{len(bad)}개 언어 남음'}")
    sys.exit(1 if bad else 0)
