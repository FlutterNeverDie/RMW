# 렌더 전에 미리 찍는 장면: 옛 그림 2.5D(art + parallax), 기울인 지도 장면(mapscene), Blender 시네마틱(cinematic)을 목소리로 정해진 길이(frames)만큼
# python3 scripts/scene-frames.py episodes/mongol-01/ep.json   (make-episode.mjs가 목소리 다음에 부름)
# 이미 같은 내용·길이로 찍혀 있으면 건너뛴다 (목소리를 다시 만들어 길이가 바뀌면 다시 찍음)
import hashlib, json, subprocess, sys, urllib.request
from pathlib import Path

CODE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CODE / "scripts"))
import tools  # noqa: E402 - 외부 프로그램 위치 (맥·윈도우)

ep = Path(sys.argv[1])
tl = json.loads((CODE / "public/ep" / ep.parent.name / ep.stem / "timeline.json").read_text())
SITE = "http://localhost:3000"


def stamp(out, key):
    f = out / "meta.json"
    try:
        return json.loads(f.read_text()).get("key") == key
    except (OSError, ValueError):
        return False


for i, sc in enumerate(tl["scenes"]):
    sh, n = sc["show"], sc["frames"]
    if sh["type"] == "art" and sh.get("parallax"):
        out = CODE / "public" / sh["dir"]
        key = hashlib.sha1(json.dumps([sh["img"], sh["from"], sh["to"], sh["parallax"], n]).encode()).hexdigest()
        if stamp(out, key):
            continue
        print(f"장면 {i:02d} 옛 그림 2.5D {sh['img']} ({n}장)", flush=True)
        subprocess.run([sys.executable, "-I", str(CODE / "scripts/parallax.py"), str(CODE / "public" / sh["img"]), str(out), "--frames", str(n),
                        "--from", ",".join(map(str, sh["from"])), "--to", ",".join(map(str, sh["to"])), "--depth", str(sh["parallax"])], check=True, cwd=CODE)
        (out / "meta.json").write_text(json.dumps({"key": key, "frames": n}))
    elif sh["type"] == "mapscene":
        out = CODE / "public" / sh["dir"]
        scene = ep.parent / "maps" / f"{sh['scene']}.json"
        marks = json.dumps(sh.get("marks") or {})
        key = hashlib.sha1((scene.read_text() + marks + str(n)).encode()).hexdigest()
        if stamp(out, key):
            continue
        try:
            urllib.request.urlopen(SITE, timeout=5)
        except OSError:
            sys.exit(f"기울인 지도 장면 {sh['scene']}을 찍으려면 사이트 개발 서버가 필요 - ~/Documents/GitHub/chronomap 에서 npm run dev")
        print(f"장면 {i:02d} 기울인 지도 {sh['scene']} ({n}장)", flush=True)
        cmd = ["node", "scripts/map-scene.mjs", "--scene", str(scene), "--frames", str(n)]
        if sh.get("marks"):
            cmd += ["--marks", marks]
        subprocess.run(cmd, check=True, cwd=CODE)
        meta = json.loads((out / "meta.json").read_text()) if (out / "meta.json").exists() else {}
        (out / "meta.json").write_text(json.dumps({**meta, "key": key}))
    elif sh["type"] == "cinematic":  # Blender 시네마틱 (실제 지형 위 비행, blender/shots/<샷>.json)
        out = CODE / "public" / sh["dir"]
        shot = CODE / "blender/shots" / f"{sh['shot']}.json"
        src = "".join((CODE / "blender" / f).read_text() for f in ("render_shot.py", "prep_terrain.py", "prep_sky.py", "post.py", "geo.py"))
        key = hashlib.sha1((shot.read_text() + str(n) + hashlib.sha1(src.encode()).hexdigest()).encode()).hexdigest()
        if stamp(out, key):
            continue
        blender = str(tools.blender())  # 맥 /Applications, 윈도우 Program Files의 가장 새 Blender, BLENDER 환경 변수
        if not Path(blender).exists():
            sys.exit(f"시네마틱 장면을 찍으려면 Blender 필요 ({blender}) - " + ("winget install BlenderFoundation.Blender (setup.ps1)" if tools.WIN else "brew install --cask blender (setup.sh)"))
        print(f"장면 {i:02d} 시네마틱 {sh['shot']} ({n}장)", flush=True)
        keep_awake = [] if tools.WIN else ["caffeinate", "-i"]  # 샷 하나 30분 넘게 걸려 맥이 잠들면 멈춤
        subprocess.run([*keep_awake, blender, "-b", "--factory-startup", "-P", str(CODE / "blender/render_shot.py"), "--",
                        "--shot", str(shot), "--out", str(out), "--frames", str(n)], check=True, cwd=CODE)
        (out / "meta.json").write_text(json.dumps({"key": key, "frames": n, "shot": sh["shot"]}))
print("미리 찍는 장면: 준비됨")
