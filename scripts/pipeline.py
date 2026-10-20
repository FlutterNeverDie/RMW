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

    def stamped(self, stage, view):
        st = self.stamps.get(stage)
        return bool(st) and st.get("fp") == fp(view)

    def stamp(self, stage, view):
        self.stamps[stage] = {"fp": fp(view), "date": datetime.datetime.now().isoformat(timespec="minutes")}
        self.stamp_file.write_text(json.dumps(self.stamps, ensure_ascii=False, indent=1) + "\n")


# (단계, 이름, 담당, 확인 함수 → (통과?, 한 줄 설명), 할 일)
def stages(e: Ep):
    p = str(e.path)
    return [
        ("plan", "기획: 잘된 영상 분석", "claude",
         lambda: ((e.dir / "plan.md").exists(), "plan.md"),
         f"같은 주제 조회수 높은 영상(별별역사 등 + 사용자가 준 것)을 분석해 {e.dir}/plan.md에 구조·길이·훅·장면 리듬 정리"),
        ("script", "대본 (영어)", "claude",
         lambda: (sum(1 for s in e.scenes if s.get("text")) > 20, f"대사 {sum(1 for s in e.scenes if s.get('text'))}줄"),
         f"plan.md를 바탕으로 {p} 장면표 작성 (03 만드는 법 4번 형식)"),
        ("fun", "재미 보강", "claude",
         lambda: sh("python3", "scripts/check-pacing.py", p),
         "check-pacing.py에 걸린 곳만 고침: 첫 5초 훅·빠른 줌아웃, 멈춘 화면 나누기, 질문·반전 넣기"),
        ("ok1", "확인 1: 대본", "user",
         lambda: (e.stamped("ok1", e.en()), "사용자 확인"),
         f"사용자에게 대본 요약(한국어)과 재미 포인트를 보여 주고 OK 받으면: python3 scripts/pipeline.py ok {p} ok1"),
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
         lambda: (sh("python3", "scripts/check-text.py", p)[0] and sh("python3", "scripts/locale-review.py", "gate", p)[0], "대본 검사 + 검토 도장"),
         f"/localize {p}"),
        ("length", "길이 맞추기", "claude",
         lambda: sh("python3", "scripts/check-length.py", p),
         "check-length.py에 걸린 더빙만 영어 110% 안으로 줄이기 → 바뀐 언어는 /localize 도장 다시"),
        ("sound", "효과음·브금 자리", "claude",
         lambda: (e.stamped("sound", [e.en(), e.sound()]), "자리 정함"),
         f"장마다 music(분위기), 핵심 순간에만 cues(도장·반전·전투). 전환음은 코드 규칙. 끝나면: python3 scripts/pipeline.py ok {p} sound"),
        ("chars", "캐릭터 만들기", "claude+code",
         lambda: (bool(e.chars_used()) and all(v and (CODE / "public/chars" / k / "front/head.svg").exists() for k, v in e.chars_used().items()) and sh("python3", "audio/characters.py", "list", p)[0], f"{len(e.chars_used())}명"),
         f"python3 audio/characters.py list {p} → 설계 없는 인물을 characters.json에(ko·about 포함) → python3 audio/characters.py build"),
        ("ok2", "확인 2: 캐릭터", "user",
         lambda: (e.stamped("ok2", e.chars_used()), "사용자 확인"),
         f"사용자가 편집기 인물 탭에서 확인 (모습 고치기 가능) → python3 scripts/pipeline.py ok {p} ok2"),
        ("voice", "목소리", "code",
         lambda: (e.tl_path.exists() and [s.get("text") for s in json.loads(e.tl_path.read_text())["scenes"]] == e.en() and sh(PY, "-I", "scripts/check-voice.py", p)[0], "목소리 + 끝 잡음 검사"),
         f"{PY} -I audio/voice_episode.py {p} && {PY} -I scripts/check-voice.py {p} && {PY} -I audio/characters.py mouth {p}"),
        ("render", "렌더", "code",
         lambda: ((CODE / "out" / f"{e.id}.mp4").exists() and e.tl_path.exists() and (CODE / "out" / f"{e.id}.mp4").stat().st_mtime > e.path.stat().st_mtime, f"out/{e.id}.mp4"),
         f"scripts/make-episode.sh {p} {e.comp} out/{e.id}.mp4  (src/Root.tsx에 {e.comp} 등록 필요)"),
        ("ok3", "확인 3: 편집기", "user",
         lambda: (e.stamped("ok3", e.data), "사용자 확인"),
         f"사용자가 편집기에서 보고 고침(고치면 렌더 다시) → OK면 python3 scripts/pipeline.py ok {p} ok3"),
        ("thumb", "썸네일·업로드 정보", "claude+code",
         lambda: ((CODE / "uploads" / f"{e.id}.json").exists(), f"uploads/{e.id}.json"),
         f"썸네일 3개(src/episode/Thumb.tsx) + {e.dir}/meta.json → python3 scripts/upload-info.py {e.dir}/meta.json"),
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
