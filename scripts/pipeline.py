# 한 편 제작 단계 실행기: 단계마다 (담당 · 통과 조건)을 두고, 어디까지 됐는지와 다음 할 일을 알려 준다
# 단계표와 규칙은 docs/guide/06-제작-단계.md
#
#   python3 scripts/pipeline.py status episodes/mongol-03/ep.json   단계별 상태 + 다음 할 일
#   python3 scripts/pipeline.py run    episodes/mongol-03/ep.json   코드 단계를 Claude·사용자 차례가 나올 때까지 자동으로
#   python3 scripts/pipeline.py ok     episodes/mongol-03/ep.json <단계>   사용자 확인·Claude 판단 단계에 도장
#
# 도장(episodes/<편>/pipeline.json)은 그 단계가 본 내용의 지문을 담는다 - 앞 단계 내용이 바뀌면 도장이 풀림
# 담당: claude = 토큰 씀 / code = 토큰 없음 / user = 사용자 확인
import datetime
import hashlib
import json
import subprocess
import sys
from pathlib import Path

CODE = Path(__file__).resolve().parent.parent
PY = str(CODE / ".venv/bin/python")


def sh(*cmd, show=False):
    r = subprocess.run(cmd, cwd=CODE, capture_output=not show, text=True)
    return r.returncode == 0, ("" if show else (r.stdout + r.stderr).strip().splitlines()[-1:] or [""])[0]


def fp(obj):
    return hashlib.sha256(json.dumps(obj, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


class Ep:
    def __init__(self, path):
        self.path = Path(path)
        self.id = self.path.parent.name
        self.dir = self.path.parent
        self.data = json.loads(self.path.read_text()) if self.path.exists() else {"scenes": []}
        self.scenes = self.data.get("scenes", [])
        self.langs = [l for l in self.data.get("langs", ["en"]) if l != "en"]
        self.stamp_file = self.dir / "pipeline.json"
        self.stamps = json.loads(self.stamp_file.read_text()) if self.stamp_file.exists() else {}
        self.tl_path = CODE / "public/ep" / self.id / self.path.stem / "timeline.json"
        self.comp = "".join(p.capitalize() for p in self.id.split("-"))  # mongol-03 → Mongol03 (src/Root.tsx 등록 이름)

    # 지문들: 단계가 "본 내용"
    def en(self):
        return [s.get("text") for s in self.scenes]

    def screen(self):
        return [s.get("show") for s in self.scenes]

    def sound(self):
        return [[s.get("music"), s.get("sfx"), s.get("cues")] for s in self.scenes]

    def chars_used(self):
        spec = json.loads((CODE / "characters.json").read_text())["characters"]
        ids = {s.get("char") for s in self.scenes if s.get("char") and s.get("char") != "none"}
        ids |= {cid for cid, c in spec.items() for s in self.scenes if s.get("speaker", "").upper() in [x.upper() for x in c.get("speakers", [])]}
        return {cid: spec.get(cid) for cid in sorted(ids)}

    # 대사 인물인데 characters.json에 설계(speakers)가 없음 (인물이 0명인 편은 통과)
    def chars_missing(self):
        spec = json.loads((CODE / "characters.json").read_text())["characters"]
        known = {x.upper() for c in spec.values() for x in c.get("speakers", [])}
        return sorted({s["speaker"] for s in self.scenes if s.get("speaker") and s["speaker"].upper() not in known and s.get("char") != "none"})

    def stamped(self, stage, view):
        st = self.stamps.get(stage)
        return bool(st) and st.get("fp") == fp(view)

    def stamp(self, stage, view):
        self.stamps[stage] = {"fp": fp(view), "date": datetime.datetime.now().isoformat(timespec="minutes")}
        self.stamp_file.write_text(json.dumps(self.stamps, ensure_ascii=False, indent=1) + "\n")


# 목소리 예보: 연기(Gemini) 호출이 몇 번 필요하고 오늘 무료 한도로 며칠 걸리는지 (모델 2개 × 하루 10번)
GEMINI_MODELS = ["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview"]  # audio/voice_episode.py와 같게


def gemini_forecast(e):
    cast = json.loads((CODE / "cast.json").read_text())["roles"]
    acted = sum(1 for s in e.scenes if s.get("text") and cast.get(s.get("role"), {}).get("direction"))
    need = acted * (1 + len(e.langs))
    try:
        led = json.loads((CODE / "audio/.gemini-usage.json").read_text())
        today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-7))).date().isoformat()
        used = sum(led.get("used", {}).get(m, 0) for m in GEMINI_MODELS) if led.get("date") == today else 0
    except Exception:
        used = 0
    if (CODE / "secrets/gemini_paid").exists():
        return f"연기 {need}번 · Gemini 유료 - 하루에 끝"
    per_day = 10 * len(GEMINI_MODELS)
    left = per_day - used
    days = 1 if need <= left else 1 + -(-(need - left) // per_day)
    return f"연기 {need}번 필요 · 오늘 남은 무료 {left}번 → 약 {days}일 (캐시된 줄은 빠짐)"


# 대본 검사(check-text.py --json)를 규칙 무리별로 세고 + 검토 도장
def text_check(p):
    r = subprocess.run(["python3", "scripts/check-text.py", p, "--json"], cwd=CODE, capture_output=True, text=True)
    try:
        items = json.loads(r.stdout)
    except ValueError:
        return False, "대본 검사기 오류: " + ((r.stderr or r.stdout).strip().splitlines() or ["?"])[-1]
    gate = [x for x in items if x["level"] == "error" and not x.get("nogate")]
    count = {}
    for x in items:
        k = x.get("group") or x["rule"]
        c = count.setdefault(k, [0, 0])
        c[x["level"] != "error"] += 1
    groups = " · ".join(f"{k} {a}" + (f"+{b}경고" if b else "") if a else f"{k} {b}경고" for k, (a, b) in sorted(count.items(), key=lambda kv: -kv[1][0]))
    stamp = sh("python3", "scripts/locale-review.py", "gate", p)[0]
    return not gate and stamp, f"오류 {len(gate)}{' (' + groups + ')' if groups else ''}, 검토 도장 {'있음' if stamp else '없음'}"


# 썸네일·업로드 정보: 언어별 썸네일(thumbs.json → meta.json thumbs·thumbs_i18n) + 언어별 자막(out/<편>.<언어>.srt) + uploads/<편>.json
def thumb_check(e):
    mp = e.dir / "meta.json"
    meta = json.loads(mp.read_text()) if mp.exists() else {}
    miss = []
    if not (e.dir / "thumbs.json").exists():
        miss.append("thumbs.json")
    if not meta.get("thumbs"):
        miss.append("썸네일 en")
    miss += [f"썸네일 {l}" for l in e.langs if not (meta.get("thumbs_i18n") or {}).get(l)]
    miss += [f"자막 {l}" for l in ["en", *e.langs] if not (CODE / "out" / f"{e.id}.{l}.srt").exists()]
    if not (CODE / "uploads" / f"{e.id}.json").exists():
        miss.append(f"uploads/{e.id}.json")
    return not miss, "없음: " + ", ".join(miss) if miss else f"썸네일 {len(meta['thumbs'])}개 × {1 + len(e.langs)}언어, 자막, uploads/{e.id}.json"


# (단계, 이름, 담당, 확인 함수 → (통과?, 한 줄 설명), 할 일)
def stages(e: Ep):
    p = str(e.path)
    return [
        ("plan", "기획: 잘된 영상 분석", "claude",
         lambda: ((e.dir / "plan.md").exists(), "plan.md"),
         f"같은 주제 조회수 높은 영상(사용자가 준 것 + 별별역사: 도입부·전환·구성, 퍄퍄킴 역사 https://www.youtube.com/@퍄퍄킴: 캐릭터 연출, "
         f"Epic History TV: 시리즈·지도 연출, MrBeast: 첫 1분·리텐션 - 01 모티브 채널, docs/guide/07-참고-채널-분석.md)을 분석해 {e.dir}/plan.md에 구조·길이·훅·장면 리듬 정리"),
        ("script", "대본 (영어)", "claude",
         lambda: (sum(1 for s in e.scenes if s.get("text")) > 20, f"대사 {sum(1 for s in e.scenes if s.get('text'))}줄"),
         f"plan.md를 바탕으로 {p} 장면표 작성 (03 만드는 법 4번 형식)"),
        ("fun", "재미 보강", "claude",
         lambda: sh("python3", "scripts/check-pacing.py", p),
         "check-pacing.py에 걸린 곳만 고침: 첫 5초 훅·빠른 줌아웃, 멈춘 화면 나누기, 질문·반전 넣기"),
        ("facts", "사실 검증", "claude",
         lambda: sh("python3", "scripts/factcheck.py", "gate", p),
         f"/factcheck {p} - 장면마다 숫자·연도·이름·지명·[기록] 인용·병력·사상자를 출처로 확인해 {e.dir}/facts.json (바뀐 장면만, 틀림·미확인 0, 논란은 \"chroniclers claimed\"처럼)"),
        ("cmp1", "비교 검토: 대본", "claude",
         lambda: sh("python3", "scripts/compare.py", "gate", p, "script"),
         f"같은 주제 조회수 높은 영상 2~3개(07)와 7개 축(훅·쉬움·리듬·화면·소리·감정·정확성) 비교 → {e.dir}/compare.json refs + script.axes, "
         f"우리가 못한 축은 대본을 고치거나 fix 적기 → python3 scripts/compare.py stamp {p} script"),
        ("ok1", "확인 1: 대본", "user",
         lambda: (e.stamped("ok1", e.en()), "사용자 확인"),
         f"python3 scripts/compare.py report {p} → 비교 검토 HTML을 열어 주고, 대본 요약(한국어)·재미 포인트·사실 검증 결과(논란 숫자)와 함께 보여 줌. OK 받으면: python3 scripts/pipeline.py ok {p} ok1"),
        ("assets", "화면 재료", "code+claude",
         lambda: sh("python3", "scripts/check-screen.py", p) if all((CODE / "public" / s["show"]["img"]).exists() for s in e.scenes if s["show"].get("img")) else (False, "없는 그림 있음"),
         "그림(위키미디어 퍼블릭 도메인·오픈 이미지, credits.json) 받기 + 지도 캡처(clean.mjs, 2560x1440, NAMES=off 검토)"),
        ("screen", "화면 연출", "claude",
         lambda: sh("python3", "scripts/check-screen.py", p),
         "카메라·라벨·도장 정하기. 확대 한도 안, 화면 글자는 이름·지명·연도만"),
        ("langs", "나라별 언어", "claude",
         lambda: (all((s.get("i18n") or {}).get(l) for s in e.scenes if s.get("text") for l in e.langs), "모든 언어 대사"),
         "장면표 i18n에 언어별 대사 (번역 말고 현지화, docs/guide/locales)"),
        ("localize", "언어 다듬기", "claude",
         lambda: text_check(p),
         f"/localize {p}"),
        ("length", "길이 맞추기", "claude",
         lambda: sh("python3", "scripts/check-length.py", p),
         "check-length.py에 걸린 더빙만 영어 110% 안으로 줄이기 → 바뀐 언어는 /localize 도장 다시"),
        ("sound", "효과음·브금 자리", "claude",
         lambda: (e.stamped("sound", [e.en(), e.sound()]), "자리 정함"),
         f"장마다 music(분위기), 핵심 순간에만 cues(도장·반전·전투). 전환음은 코드 규칙. 끝나면: python3 scripts/pipeline.py ok {p} sound"),
        ("chars", "캐릭터 만들기", "claude+code",
         lambda: (not e.chars_missing() and all(v and (CODE / "public/chars" / k / "front/head.svg").exists() for k, v in e.chars_used().items()) and sh("python3", "audio/characters.py", "list", p)[0],
                  f"{len(e.chars_used())}명" + (f", 설계 없음: {', '.join(e.chars_missing())}" if e.chars_missing() else "") if e.chars_used() or e.chars_missing() else "인물 없음"),
         f"python3 audio/characters.py list {p} → 설계 없는 인물을 characters.json에(ko·about 포함) → python3 audio/characters.py build"),
        ("ok2", "확인 2: 캐릭터", "user",
         lambda: (e.stamped("ok2", e.chars_used()), "사용자 확인"),
         f"사용자가 편집기 인물 탭에서 확인 (모습 고치기 가능) → python3 scripts/pipeline.py ok {p} ok2"),
        ("voice", "목소리", "code",
         lambda: (e.tl_path.exists() and [s.get("text") for s in json.loads(e.tl_path.read_text())["scenes"]] == e.en() and sh(PY, "-I", "scripts/check-voice.py", p)[0], gemini_forecast(e)),
         f"{PY} -I audio/voice_episode.py {p} && {PY} -I scripts/check-voice.py {p} && {PY} -I audio/characters.py mouth {p}"),
        ("render", "렌더", "code",
         lambda: ((CODE / "out" / f"{e.id}.mp4").exists() and e.tl_path.exists() and (CODE / "out" / f"{e.id}.mp4").stat().st_mtime > e.path.stat().st_mtime, f"out/{e.id}.mp4"),
         f"scripts/make-episode.sh {p} {e.comp} out/{e.id}.mp4  (src/Root.tsx에 {e.comp} 등록 필요)"),
        ("cmp3", "비교 검토: 렌더", "claude+code",
         lambda: sh("python3", "scripts/compare.py", "gate", p, "render"),
         f"python3 scripts/compare.py report {p} (우리 렌더 같은 시각 프레임) → 프레임 보고 compare.json render.axes 7개 축 평가, 못한 축은 고치고 렌더 다시 또는 fix → python3 scripts/compare.py stamp {p} render"),
        ("ok3", "확인 3: 편집기", "user",
         lambda: (e.stamped("ok3", e.data), "사용자 확인"),
         f"python3 scripts/compare.py report {p} → 비교 검토 HTML 열어 주고, 사용자가 편집기에서 보고 고침(고치면 렌더 다시) → OK면 python3 scripts/pipeline.py ok {p} ok3"),
        ("thumb", "썸네일·업로드 정보", "claude+code",
         lambda: thumb_check(e),
         f"{e.dir}/thumbs.json(변형 3개 × 언어별 현지화 문구) → node scripts/thumbs.mjs {e.dir}/thumbs.json, 자막 없으면 {PY} -I scripts/subtitles.py {p}, "
         f"meta.json sources에 python3 scripts/factcheck.py sources {p} --merge → python3 scripts/upload-info.py {e.dir}/meta.json"),
        ("upload", "업로드 (API)", "code",
         lambda: (bool(json.loads((e.dir / "meta.json").read_text()).get("uploaded")) if (e.dir / "meta.json").exists() else False, "meta.json uploaded"),
         f"node scripts/youtube.mjs upload out/{e.id}.mp4 uploads/{e.id}.json  (API 감사 통과 전엔 비공개로 잠김) → meta.json에 \"uploaded\": 날짜"),
    ]


WHO = {"claude": "Claude", "code": "코드", "user": "사용자", "code+claude": "코드+Claude", "claude+code": "Claude+코드"}


def status(e, quiet=False):
    nxt = None
    for key, name, who, check, todo in stages(e):
        ok, note = check()
        if not quiet:
            print(f"  {'✓' if ok else '·'} {key:9} {name:16} [{WHO[who]}] {note}")
        if not ok and nxt is None:
            nxt = (key, name, who, todo)
    return nxt


cmd, path, *rest = sys.argv[1:]
e = Ep(path)
if cmd == "status":
    print(f"{e.id} 제작 단계")
    n = status(e)
    print(f"\n다음: {n[1]} [{WHO[n[2]]}]\n  {n[3]}" if n else "\n모든 단계 완료")
elif cmd == "ok":
    stage = rest[0]
    views = {"ok1": e.en(), "sound": [e.en(), e.sound()], "ok2": e.chars_used(), "ok3": e.data}
    if stage not in views:
        sys.exit(f"도장을 찍는 단계가 아님: {stage} (가능: {', '.join(views)})")
    # 확인 1·3은 사실 검증·비교 검토가 통과해야 도장 (사용자가 비교표를 보고 판단)
    need = {"ok1": [("scripts/factcheck.py", "gate", path), ("scripts/compare.py", "gate", path, "script")],
            "ok3": [("scripts/compare.py", "gate", path, "render")]}.get(stage, [])
    for c in need:
        ok, note = sh("python3", *c)
        if not ok:
            sys.exit(f"{stage} 도장 못 찍음 - {note} (python3 {' '.join(c)})")
    e.stamp(stage, views[stage])
    print(f"→ {stage} 도장")
elif cmd == "run":
    # 코드 단계만 차례로 실행. Claude·사용자 차례가 오면 멈추고 할 일을 알려 줌
    while True:
        e = Ep(path)
        n = status(e, quiet=True)
        if not n:
            print("모든 단계 완료")
            break
        key, name, who, todo = n
        if who != "code":
            print(f"멈춤 - {name} [{WHO[who]}] 차례\n  {todo}")
            break
        print(f"▶ {name}: {todo}")
        ok = subprocess.run(todo.split("  (")[0], shell=True, cwd=CODE).returncode == 0
        if not ok or Ep(path) and status(Ep(path), quiet=True) == n:
            print(f"멈춤 - {name} 실패 또는 통과 못 함")
            break
