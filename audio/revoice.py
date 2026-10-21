# 편집기 "이 줄 목소리 다시 만들기": 고친 대사 한 줄만 목소리를 새로 만들고 timeline.json·입 모양을 고친다
# echo '{"tl": 12, "lang": "ko", "text": "...", "role": "narrator", "direction": ""}' | .venv/bin/python -I audio/revoice.py episodes/mongol-01/ep.json
#   tl = timeline.json의 장면 번호 (편집기가 영어 대사로 짝지은 번호), 결과는 JSON 한 줄 {dur, frames, engine}
# 바뀌지 않은 다른 줄은 손대지 않는다. 같은 대사는 TTS 캐시를 써서 무료 한도를 다시 쓰지 않음
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cast as C  # noqa: E402
import voice_episode as V  # noqa: E402

src = Path(sys.argv[1])
req = json.loads(sys.stdin.read())
base = C.CODE / "public/ep" / src.parent.name / src.stem
tl_path = base / "timeline.json"
tl = json.loads(tl_path.read_text())
j, lang, text = req["tl"], req["lang"], req["text"]
sc = tl["scenes"][j]
r = C.CAST[req["role"]]
raw = V.RAW / f"{src.parent.name}-{src.stem}-{lang}-{j:02d}-re.wav"
y, sr, engine = V.make_line(r, text, lang, raw, req.get("direction", ""))
rel = sc.get("vo") if lang == "en" else (sc.get("vo_i18n") or {}).get(lang)
rel = rel or f"ep/{src.parent.name}/{src.stem}/vo/{lang}/{j:02d}.wav"
(C.CODE / "public" / rel).parent.mkdir(parents=True, exist_ok=True)
C.write(C.CODE / "public" / rel, y, sr)
# 장면 기록: 이 언어 대사·길이·모델, 장면 길이 다시 계산
if lang == "en":
    sc["text"], sc["vo"], sc["acted"] = text, rel, engine != "chirp"
else:
    sc.setdefault("i18n", {})[lang] = text
    sc.setdefault("vo_i18n", {})[lang] = rel
sc.setdefault("dur", {})[lang] = round(len(y) / sr, 3)
# 예전 timeline에는 언어별 길이가 없을 수 있다 - 다른 언어 길이는 그 목소리 파일에서 (없으면 장면이 짧아짐)
for l, pth in [("en", sc.get("vo")), *(sc.get("vo_i18n") or {}).items()]:
    if pth and l not in sc["dur"] and (C.CODE / "public" / pth).exists():
        x, r2 = C.read(C.CODE / "public" / pth)
        sc["dur"][l] = round(len(x) / r2, 3)
sc.setdefault("engine", {})[lang] = engine
sc["frames"] = V.scene_frames(sc, list(sc["dur"].values()))
tl_path.write_text(json.dumps(tl, ensure_ascii=False, indent=1))
# 입 모양 (Rhubarb)
mouth = base / "mouth.json"
try:
    import characters as CH

    m = json.loads(mouth.read_text()) if mouth.exists() else {}
    m[rel] = CH.visemes(C.CODE / "public" / rel, text, lang, tl["fps"])
    mouth.write_text(json.dumps(m))
except Exception as e:  # noqa: BLE001 - 입 모양 실패는 목소리 교체를 막지 않음 (렌더는 입을 흉내 냄)
    print(f"입 모양 건너뜀: {e}", file=sys.stderr)
print(json.dumps({"dur": sc["dur"][lang], "frames": sc["frames"], "engine": engine, "vo": rel}))
