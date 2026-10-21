# 참고 영상 비교: 같은 주제 조회수 높은 영상 2~3개와 우리 편을 축마다 나란히 놓고, 모든 축에서 같거나 나아야 확인 1·3으로 간다
# 비교는 Claude가 채운다 (episodes/<편>/compare.json, 형식은 docs/guide/06). 이 파일은 우리 쪽 수치·프레임·보고서·도장만
# 유튜브 영상은 받지 않는다 - 참고 영상은 Claude가 보고·읽은 내용을 적고, 프레임은 우리 렌더에서만 뽑는다
#
#   python3 scripts/compare.py ours   episodes/mongol-03/ep.json            우리 쪽 수치 (길이·화면 바뀜 평균 초·첫 30초 장면) - compare.json "ours"에 옮겨 적기
#   python3 scripts/compare.py report episodes/mongol-03/ep.json            ~/hwm/<meta.folder>/<이름>_비교 검토.html (렌더 있으면 같은 시각 프레임 포함)
#   python3 scripts/compare.py stamp  episodes/mongol-03/ep.json script|render   검사 통과하면 지금 대본·렌더 지문을 compare.json에
#   python3 scripts/compare.py gate   episodes/mongol-03/ep.json script|render   통과 못 하면 exit 1 (pipeline.py가 부름)
import base64
import datetime
import hashlib
import html
import json
import os
import subprocess
import sys
from pathlib import Path

CODE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CODE / "scripts"))
import tools  # noqa: E402 - 외부 프로그램 위치 (맥·윈도우)

HOME = Path(os.environ.get("HWM", Path.home() / "hwm"))
AXES = [("hook", "훅 (첫 5초·30초)"), ("clarity", "알아듣기 쉬움"), ("pacing", "리듬 (화면 바뀜)"), ("visuals", "화면"),
        ("sound", "소리 (브금·효과음·목소리)"), ("emotion", "감정·몰입"), ("accuracy", "정확성")]
RATES = {"better": "우리가 나음", "equal": "같음", "worse": "우리가 못함"}
GRID = [0, 2, 5, 10, 15, 20, 30]  # 첫 30초는 촘촘히, 그 뒤는 1분마다 + 참고 영상 moments 시각


def fp(obj):
    return hashlib.sha256(json.dumps(obj, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


def ff(tool, *a):
    b = tools.ffmpeg(tool)  # Remotion에 든 ffmpeg, 없으면 remotion ffmpeg
    if b:  # 옆의 libav*.dylib를 상대 경로로 찾아서 그 폴더에서 돌린다
        return subprocess.run([str(b), *a], cwd=b.parent, capture_output=True)
    return subprocess.run(tools.remotion(tool, *a), cwd=CODE, capture_output=True)


class Ep:
    def __init__(self, path):
        self.path = Path(path)
        self.id = self.path.parent.name
        self.data = json.loads(self.path.read_text())
        self.cf = self.path.parent / "compare.json"
        self.c = json.loads(self.cf.read_text()) if self.cf.exists() else {}
        self.video = CODE / "out" / f"{self.id}.mp4"
        self.tl = CODE / "public/ep" / self.id / self.path.stem / "timeline.json"

    def view(self, which):
        # 그 비교가 본 내용: 확인 1은 영어 대본, 확인 3은 렌더 파일
        if which == "script":
            return [s.get("text") for s in self.data["scenes"]]
        st = self.video.stat() if self.video.exists() else None
        return [st.st_size, int(st.st_mtime)] if st else None


def ours(e):
    # 장면 = 화면이 바뀌는 단위. 목소리 전엔 estimate.json 어림(단어/초), 뒤엔 timeline 실제 길이
    est = json.loads((CODE / "scripts/estimate.json").read_text())
    if e.tl.exists():
        tl = json.loads(e.tl.read_text())
        secs = [s["frames"] / tl["fps"] for s in tl["scenes"]]
        how = "timeline 실제"
    else:
        secs = [max(1.5, len((s.get("text") or "").split()) / est["en_words_per_sec"] + est["gap"]) for s in e.data["scenes"]]
        how = "어림 (목소리 전)"
    t, first = 0, []
    for s, d in zip(e.data["scenes"], secs):
        if t < 30:
            first.append({"t": round(t, 1), "type": s["show"].get("type"), "text": s.get("text") or ""})
        t += d
    return {"length_sec": round(t), "scenes": len(secs), "sec_per_change": round(t / max(1, len(secs)), 1), "how": how, "first30": first}


def check(e, which):
    # 통과 조건: 참고 영상 2개 이상(첫 30초·구조·리듬), 모든 축 평가, "worse"는 고칠 일(fix) 필수, 지문이 지금 내용
    c, bad = e.c, []
    refs = c.get("refs", [])
    if len(refs) < 2:
        bad.append(f"참고 영상 {len(refs)}개 (2개 이상)")
    for r in refs:
        miss = [k for k in ("title", "channel", "url", "first30", "structure") if not r.get(k)]
        if miss:
            bad.append(f"참고 영상 '{r.get('title', '?')}': {', '.join(miss)} 없음")
    sec = c.get(which, {})
    for k, name in AXES:
        a = sec.get("axes", {}).get(k)
        if not a or a.get("rate") not in RATES:
            bad.append(f"{which} 축 {k}({name}) 평가 없음")
        elif a["rate"] == "worse" and not a.get("fix"):
            bad.append(f"{which} 축 {k}: worse인데 fix 없음")
    if which == "render" and e.view("render") is None:
        bad.append(f"렌더 없음: out/{e.id}.mp4")
    stale = sec.get("fp") != fp(e.view(which))
    return bad, stale


def frames(e, times, width=640):
    # 우리 렌더에서 같은 시각 프레임을 작은 JPEG로 → data URI (보고서 한 파일에 담음). out/compare/<편>/에 캐시
    cache = CODE / "out/compare" / e.id
    cache.mkdir(parents=True, exist_ok=True)
    key = fp(e.view("render"))
    for old in cache.glob("*.jpg"):  # 예전 렌더의 프레임은 지움
        if not old.name.startswith(key):
            old.unlink()
    out = []
    for t in times:
        f = cache / f"{key}_{t:07.2f}.jpg"
        if not f.exists():
            ff("ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", str(e.video), "-frames:v", "1", "-vf", f"scale={width}:-2", "-q:v", "4", str(f))
        if f.exists():
            out.append((t, "data:image/jpeg;base64," + base64.b64encode(f.read_bytes()).decode()))
    return out


def duration(e):
    r = ff("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(e.video))
    try:
        return float(r.stdout.decode().strip())
    except ValueError:
        return 0


def mmss(t):
    t = int(t)
    return f"{t // 60}:{t % 60:02d}"


def report(e):
    meta_p = e.path.parent / "meta.json"
    if not meta_p.exists():
        sys.exit(f"meta.json 없음: {meta_p} (folder·name 필요)")
    meta = json.loads(meta_p.read_text())
    c, o = e.c, ours(e)
    esc = html.escape
    refs = "".join(
        f"<div class=card><h3><a href='{esc(r.get('url', ''))}'>{esc(r.get('title', ''))}</a></h3><p class=muted>{esc(r.get('channel', ''))}"
        f" · 조회수 {esc(str(r.get('views', '?')))} · {esc(str(r.get('length', '?')))} · 화면 바뀜 {esc(str(r.get('sec_per_change') or '잴 수 없음'))}초</p>"
        f"<p><b>첫 30초</b> {esc(r.get('first30', ''))}</p><p><b>구조</b> {esc(r.get('structure', ''))}</p>"
        + (f"<p><b>리듬</b> {esc(r.get('pacing', ''))}</p>" if r.get("pacing") else "")
        + (f"<p><b>가져올 점</b> {esc(r.get('take', ''))}</p>" if r.get("take") else "")
        + "".join(f"<p class=muted>{esc(mmss(m.get('t', 0)))} {esc(m.get('what', ''))}</p>" for m in r.get("moments", []))
        + "</div>" for r in c.get("refs", []))

    def table(which, label):
        sec = c.get(which, {})
        if not sec:
            return f"<h2>{label}</h2><p class=muted>아직 비교 안 함</p>"
        bad, stale = check(e, which)
        rows = "".join(
            f"<tr class={a.get('rate', 'none')}><td>{name}</td><td>{esc(a.get('best', ''))}</td><td>{esc(a.get('ours', ''))}</td>"
            f"<td><b>{RATES.get(a.get('rate'), '평가 없음')}</b>{'<br>' + esc(a['fix']) if a.get('fix') else ''}</td></tr>"
            for k, name in AXES for a in [sec.get("axes", {}).get(k, {})])
        state = "통과" if not bad and not stale else ("내용이 바뀜 - 다시 비교" if stale and not bad else "남음: " + " / ".join(bad))
        return (f"<h2>{label}</h2><p class=muted>{esc(sec.get('date', ''))} · {esc(state)}</p>"
                f"<table><tr><th>축</th><th>참고 영상 최고</th><th>우리</th><th>판정</th></tr>{rows}</table>"
                + (f"<p>{esc(sec['summary'])}</p>" if sec.get("summary") else ""))

    first = "".join(f"<li>{x['t']}초 [{esc(x['type'] or '')}] {esc(x['text'])}</li>" for x in o["first30"])
    shots = ""
    if e.video.exists():
        dur = duration(e)
        ts = set(GRID) | set(range(60, int(dur), 60)) | {m.get("t", 0) for r in c.get("refs", []) for m in r.get("moments", [])}
        ts = sorted(t for t in ts if t < dur)
        shots = "<h2>우리 렌더 프레임 (같은 시각)</h2><div class=grid>" + "".join(
            f"<figure><img src='{src}' loading=lazy><figcaption>{mmss(t)}</figcaption></figure>" for t, src in frames(e, ts)) + "</div>"
    page = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{esc(meta['name'])} 비교 검토</title>
<style>:root{{--bg:#faf6ec;--card:#fffdf7;--ink:#2b2418;--muted:#6f6450;--line:#e4dcc8;--good:#15803d;--bad:#b91c1c}}
@media (prefers-color-scheme: dark){{:root{{--bg:#0b1220;--card:#111a2c;--ink:#e5e7eb;--muted:#94a3b8;--line:#22304a;--good:#4ade80;--bad:#f87171}}}}
body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,"Apple SD Gothic Neo",sans-serif}}main{{max-width:1100px;margin:0 auto;padding:28px 16px 80px}}
h2{{margin-top:34px;border-top:1px solid var(--line);padding-top:12px}}.muted{{color:var(--muted);font-size:14px}}a{{color:inherit}}
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}}.card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:4px 16px}}
.wrap{{overflow-x:auto}}table{{border-collapse:collapse;width:100%;min-width:640px}}td,th{{border:1px solid var(--line);padding:8px;vertical-align:top;text-align:left;font-size:14px}}
tr.better td:last-child{{color:var(--good)}}tr.worse td:last-child,tr.none td:last-child{{color:var(--bad)}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}}figure{{margin:0}}img{{width:100%;border-radius:6px;display:block}}figcaption{{font-size:13px;color:var(--muted)}}</style></head><body><main>
<h1>{esc(meta['name'])} 비교 검토</h1>
<p class=muted>모든 축에서 참고 영상과 같거나 나아야 통과. "우리가 못함"은 고칠 일이 적혀 있어야 한다. 판단은 사용자가.</p>
<h2>참고 영상</h2><div class=cards>{refs or '<p class=muted>없음</p>'}</div>
<h2>우리 편</h2><p>길이 {mmss(o['length_sec'])} · 장면 {o['scenes']}개 · 화면 바뀜 평균 {o['sec_per_change']}초 ({o['how']})</p>
<details><summary>첫 30초 장면</summary><ul>{first}</ul></details>
<div class=wrap>{table('script', '확인 1: 대본 비교')}</div><div class=wrap>{table('render', '확인 3: 렌더 비교')}</div>
{shots}
</main></body></html>"""
    dest = HOME / meta["folder"] / f"{meta['name']}_비교 검토.html"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(page)
    print("→", dest)


cmd, path, *rest = sys.argv[1:]
e = Ep(path)
if cmd == "ours":
    print(json.dumps(ours(e), ensure_ascii=False, indent=1))
elif cmd == "report":
    report(e)
elif cmd in ("stamp", "gate"):
    which = rest[0] if rest else "script"
    if which not in ("script", "render"):
        sys.exit("script 또는 render")
    if not e.c:
        print(f"비교 없음: {e.cf} (/factcheck 다음, 확인 전에 Claude가 채움 - 06 참고)")
        sys.exit(1)
    bad, stale = check(e, which)
    for b in bad:
        print(b)
    if cmd == "stamp":
        if bad:
            sys.exit("→ 도장 못 찍음")
        e.c[which]["fp"] = fp(e.view(which))
        e.c[which]["date"] = datetime.date.today().isoformat()
        e.cf.write_text(json.dumps(e.c, ensure_ascii=False, indent=1) + "\n")
        print(f"→ {e.cf} {which} 도장")
    else:
        if stale and not bad:
            print(f"비교 뒤에 {'대본' if which == 'script' else '렌더'}이 바뀜 → 다시 비교하고 stamp")
        print(f"비교 검토({which}): {'통과' if not bad and not stale else '남음'}")
        sys.exit(1 if bad or stale else 0)
else:
    sys.exit(f"모르는 명령: {cmd}")
