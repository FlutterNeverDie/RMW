# 사실 검증 하네스: 영어 대본의 사실(숫자·연도·이름·지명·[기록] 인용·병력·사상자)을 장면마다 출처로 확인하고 도장을 찍는다
# 확인은 Claude가 한다 (/factcheck, .claude/commands/factcheck.md). 이 파일은 고칠 장면 뽑기·검사·도장·출처 목록만
#
#   python3 scripts/factcheck.py lines   episodes/mongol-03/ep.json [--all]   확인할 장면 (새로 생겼거나 대사가 바뀐 것만, --all은 전부)
#   python3 scripts/factcheck.py stamp   episodes/mongol-03/ep.json <장면...|--changed>   그 장면들을 "확인함"으로 (주장 없는 장면도)
#   python3 scripts/factcheck.py status  episodes/mongol-03/ep.json [--json]  남은 장면·판정별 개수·걸린 주장
#   python3 scripts/factcheck.py gate    episodes/mongol-03/ep.json           통과 못 하면 exit 1 (pipeline.py가 부름)
#   python3 scripts/factcheck.py sources episodes/mongol-03/ep.json [--merge] 설명란 출처 줄 (--merge: meta.json "sources"에 없는 것만 추가)
#
# episodes/<편>/facts.json (git에 올림):
#   {"checked": {"<대사 지문>": "날짜"},          장면 대사 지문 = 그 대사를 확인했다는 표시. 대사를 고치면 지문이 바뀌어 다시 확인
#    "claims": [{"scene": 12, "fp": "<대사 지문>", "claim": "...", "kind": "number|date|name|place|quote|army|casualty|event",
#                "value": "...", "verdict": "ok|disputed|wrong|unverified",
#                "sources": [{"title": "...", "ref": "URL 또는 책·권·쪽", "quote": "출처 원문 한 줄"}], "note": "...", "fix": "..."}]}
# 장면 번호는 stamp 때 지문으로 다시 맞춘다 (장면을 끼워 넣어도 주장이 따라감). 새로 적는 주장은 fp 없이 scene만 - stamp가 채움
# 대사가 바뀐 장면의 옛 주장은 "stale"로 옮겨 둔다 (검사에선 빠지고, lines가 출처 재사용용으로 보여 줌)
import datetime
import hashlib
import json
import re
import sys
from pathlib import Path

KINDS = {"number", "date", "name", "place", "quote", "army", "casualty", "event"}
VERDICTS = {"ok", "disputed", "wrong", "unverified"}
# 논란 숫자를 단정하지 않았다는 표시 (원칙: "chroniclers claimed"처럼 말한다)
HEDGE = re.compile(r"\b(claim\w*|according|reported\w*|perhaps|maybe|may|might|possibly|probably|estimat\w*|legend\w*|chronicl\w*|sources?|historians?|"
                   r"up to|as many as|around|about|roughly|nearly|almost|supposedly|allegedly|disputed|unclear|"
                   r"said to|says|\w+ or \w+ (?:thousand|hundred|million))\b", re.I)  # "the Secret History says", "said to be", 범위("twenty or thirty thousand")


def tfp(text):
    return hashlib.sha256((text or "").strip().encode()).hexdigest()[:12]


def load(ep_path):
    ep = json.loads(Path(ep_path).read_text())
    f = Path(ep_path).parent / "facts.json"
    facts = json.loads(f.read_text()) if f.exists() else {"checked": {}, "claims": []}
    facts.setdefault("checked", {})
    facts.setdefault("claims", [])
    return ep, facts, f


def texts(ep):
    return [(i, s) for i, s in enumerate(ep["scenes"]) if (s.get("text") or "").strip()]


def remap(ep, facts):
    # 주장의 장면 번호를 지문으로 다시 맞춤. 지문이 없어진 주장(대사가 바뀌었거나 지워짐)은 orphan
    where = {}
    for i, s in texts(ep):
        where.setdefault(tfp(s["text"]), i)
    orphan = []
    for c in facts["claims"]:
        if c.get("fp") in where:
            c["scene"] = where[c["fp"]]
        else:
            orphan.append(c)
    return orphan


def problems(ep, facts):
    # (남은 장면 번호들, 걸린 주장들 [(장면, 이유, 주장)])
    live = {tfp(s["text"]): (i, s) for i, s in texts(ep)}
    todo = [i for i, s in texts(ep) if tfp(s["text"]) not in facts["checked"]]
    bad = []
    for c in facts["claims"]:
        if c.get("fp") not in live:
            continue  # 옛 대사의 주장 - 대사가 바뀌면 그 장면이 todo로 다시 뜸
        i, s = live[c["fp"]]
        v = c.get("verdict")
        why = None
        if v not in VERDICTS:
            why = f"판정 없음/이상: {v}"
        elif v in ("wrong", "unverified"):
            why = f"{v} - 고칠 문장: {c.get('fix') or '(fix 없음)'}"
        elif not c.get("sources") or not all(x.get("title") and x.get("ref") for x in c["sources"]):
            why = "출처 없음 (title·ref)"
        elif c.get("kind") == "quote" and not any(x.get("quote") for x in c["sources"]):
            why = "[기록] 인용인데 출처 원문(quote) 없음"
        elif v == "disputed" and not HEDGE.search(s["text"]):
            why = "논란 있는 내용을 단정함 - \"chroniclers claimed\"처럼 바꿀 것"
        elif c.get("kind") not in KINDS:
            why = f"kind 이상: {c.get('kind')}"
        if why:
            bad.append((i, why, c))
    return todo, bad


def save(f, facts):
    facts["claims"].sort(key=lambda c: (c.get("scene", 0), c.get("claim", "")))
    f.write_text(json.dumps(facts, ensure_ascii=False, indent=1) + "\n")


cmd, ep_path, *rest = sys.argv[1:]
ep, facts, f = load(ep_path)

if cmd == "lines":
    # 확인할 장면만: 번호 · 누가 · 영어 대사 (+ 이미 있는 그 장면 주장). 토큰 아끼기 - 바뀐 장면만 읽는다
    todo = {i for i, _ in texts(ep)} if "--all" in rest else set(problems(ep, facts)[0])
    old = {}
    for c in facts["claims"]:
        old.setdefault(c.get("fp"), []).append(c)
    for i, s in texts(ep):
        if i not in todo:
            continue
        who = s.get("speaker") or s.get("role") or ""
        print(f"#{i} [{who}] fp={tfp(s['text'])}\n  {s['text']}")
        for c in old.get(tfp(s["text"]), []):
            print(f"    - 이미 있음: {c.get('claim')} → {c.get('verdict')}")
    if facts.get("stale") and todo:
        print("\n옛 대사의 주장 (출처 다시 쓰기용, 새 대사에 맞으면 scene만 바꿔 claims로 옮김):")
        for c in facts["stale"][:40]:
            print(f"  ~#{c.get('scene')} {c.get('claim')} → {c.get('verdict')} [{'; '.join(x.get('title', '') for x in c.get('sources', []))}]")
    print(f"\n확인할 장면 {len(todo)}개 / 대사 있는 장면 {len(texts(ep))}개")

elif cmd == "stamp":
    # Claude가 facts.json에 주장을 적은 뒤: 그 장면들을 확인함으로. 주장에 지문을 채우고 장면 번호를 다시 맞춤
    scenes = dict(texts(ep))
    pick = problems(ep, facts)[0] if "--changed" in rest else [int(x.lstrip("#")) for x in rest]
    today = datetime.date.today().isoformat()
    for i in pick:
        if i not in scenes:
            sys.exit(f"대사 없는 장면: #{i}")
        facts["checked"][tfp(scenes[i]["text"])] = today
    # 지문이 지금 대사에 있는 주장은 장면 번호만 다시 맞춤. 지문 없는 주장(이번에 새로 적은 것)은 지금 대사로,
    # 지문이 옛 대사인 주장은 stale로 옮김 (출처를 다시 쓸 수 있게 lines가 보여 줌, 검사에선 빠짐)
    orphan = remap(ep, facts)
    for c in orphan:
        if not c.get("fp"):
            if c.get("scene") not in pick:
                sys.exit(f"지문 없는 주장 #{c.get('scene')} '{c.get('claim')}' - 그 장면도 stamp에 넣을 것")
            c["fp"] = tfp(scenes[c["scene"]]["text"])
    gone = [c for c in orphan if c.get("fp") not in {tfp(s["text"]) for _, s in texts(ep)}]
    facts["claims"] = [c for c in facts["claims"] if c not in gone]
    facts["stale"] = (gone + facts.get("stale", []))[:200]
    # 지금 대사에 없는 확인 표시는 지움 (파일이 커지지 않게)
    live = {tfp(s["text"]) for _, s in texts(ep)}
    facts["checked"] = {k: v for k, v in facts["checked"].items() if k in live}
    save(f, facts)
    todo, bad = problems(ep, facts)
    print(f"→ {f}: 장면 {len(pick)}개 확인함, 옛 대사 주장 {len(gone)}개 → stale, 남은 장면 {len(todo)}개, 걸린 주장 {len(bad)}개")

elif cmd in ("status", "gate"):
    todo, bad = problems(ep, facts)
    live = {tfp(s["text"]) for _, s in texts(ep)}
    cur = [c for c in facts["claims"] if c.get("fp") in live]
    count = {v: sum(1 for c in cur if c.get("verdict") == v) for v in ("ok", "disputed", "wrong", "unverified")}
    if "--json" in rest:
        print(json.dumps({"todo": todo, "bad": [{"scene": i, "why": w, "claim": c.get("claim")} for i, w, c in bad], "count": count}, ensure_ascii=False))
        sys.exit(0)
    for i, why, c in bad:
        print(f"#{i} {c.get('claim')}: {why}")
    if todo:
        print(f"확인 안 한 장면 {len(todo)}개: " + " ".join(f"#{i}" for i in todo[:30]) + (" …" if len(todo) > 30 else ""))
    ok = not todo and not bad
    print(f"사실 검증: {'통과' if ok else '남음'} (주장 {len(cur)}: " + " · ".join(f"{k} {v}" for k, v in count.items()) + f", 남은 장면 {len(todo)}, 걸린 주장 {len(bad)})")
    if cmd == "gate":
        sys.exit(0 if ok else 1)

elif cmd == "sources":
    # 설명란 "Sources" 줄: 확인에 쓴 출처를 제목별로 한 번씩. 웹 주소만 붙이고 책은 제목만 (쪽수는 설명란에 안 씀)
    live = {tfp(s["text"]) for _, s in texts(ep)}
    seen, lines = set(), []
    for c in facts["claims"]:
        if c.get("fp") not in live or c.get("verdict") not in ("ok", "disputed"):
            continue
        for x in c.get("sources", []):
            t = (x.get("title") or "").strip()
            if t.lower().startswith("wikipedia"):  # 위키백과는 기본 사실 확인용 - 설명란 출처엔 원 사료·연구서만
                continue
            if not t or t.lower() in seen:
                continue
            seen.add(t.lower())
            ref = x.get("ref", "")
            lines.append(f"- {t}" + (f": {ref}" if ref.startswith("http") else ""))
    if "--merge" not in rest:
        print("\n".join(lines))
        sys.exit(0)
    mp = Path(ep_path).parent / "meta.json"
    meta = json.loads(mp.read_text())
    have = meta.get("sources", [])
    new = [l for l in lines if not any(l[2:].split(":")[0].lower() in h.lower() for h in have)]
    # 지도·국경 자료 줄(- Maps:)은 맨 뒤에 둔다
    tail = [h for h in have if h.startswith("- Maps")]
    meta["sources"] = [h for h in have if h not in tail] + new + tail
    mp.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")
    print(f"→ {mp}: 출처 {len(new)}줄 추가 (모두 {len(meta['sources'])}줄)")
else:
    sys.exit(f"모르는 명령: {cmd}")
