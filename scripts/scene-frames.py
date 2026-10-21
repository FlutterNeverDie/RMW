# 렌더 전에 미리 찍는 장면: 옛 그림 2.5D(art + parallax)와 기울인 지도 장면(mapscene)을 목소리로 정해진 길이(frames)만큼
# python3 scripts/scene-frames.py episodes/mongol-01/ep.json   (make-episode.sh가 목소리 다음에 부름)
# 이미 같은 내용·길이로 찍혀 있으면 건너뛴다 (목소리를 다시 만들어 길이가 바뀌면 다시 찍음)
import hashlib, json, subprocess, sys, urllib.request
from pathlib import Path

CODE = Path(__file__).resolve().parent.parent
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
print("미리 찍는 장면: 준비됨")
