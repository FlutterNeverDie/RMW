# 장면표(episodes/<편>/*.json)의 대사마다 배역 목소리를 만들고 길이를 재서 타임라인을 쓴다
# .venv/bin/python -I audio/voice_episode.py episodes/mongol-01/pilot.json
#   -> public/ep/<편>/<이름>/vo/NN.wav + public/ep/<편>/<이름>/timeline.json (Remotion이 읽음)
import json, re, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cast as C

FPS = 30
# 언어별 TTS 지역 코드 (Chirp 3 HD는 같은 목소리 이름을 여러 언어로 쓸 수 있다)
LOC = {"en": None, "ko": "ko-KR", "es": "es-US", "ja": "ja-JP", "pt": "pt-BR", "hi": "hi-IN", "fr": "fr-FR", "de": "de-DE", "id": "id-ID", "ar": "ar-XA", "zh": "cmn-CN"}
LANG_NAME = {"en": "English", "ko": "Korean", "es": "Spanish", "ja": "Japanese", "pt": "Brazilian Portuguese", "hi": "Hindi", "fr": "French", "de": "German", "id": "Indonesian", "ar": "Arabic", "zh": "Mandarin Chinese"}
GAP = 0.18  # 대사 사이 숨 고르기(초) - 빠른 유튜브 호흡
src = Path(sys.argv[1])
ep = json.loads(src.read_text())
out = C.CODE / "public/ep" / src.parent.name / src.stem
(out / "vo").mkdir(parents=True, exist_ok=True)
raw_dir = C.CODE / "audio/.ep-raw"
raw_dir.mkdir(exist_ok=True)

langs = ep.get("langs", ["en"])


PRON = json.loads((C.CODE / "audio/pron.json").read_text())
DIGIT = "영일이삼사오육칠팔구"


def ko_number(n):
    """1206 -> 천이백육 (연도 읽기용)"""
    out = ""
    for unit, name in ((1000, "천"), (100, "백"), (10, "십")):
        q, n = divmod(n, unit)
        if q:
            out += ("" if q == 1 else DIGIT[q]) + name
    return out + (DIGIT[n] if n else "")


def ko_years(text):
    # "1202년" 같은 연도를 한글로 (TTS가 숫자를 끊어 읽지 않게)
    return re.sub(r"(\d{3,4})년", lambda m: ko_number(int(m.group(1))) + "년", text)


def voice_line(r, text, lang, raw, extra=""):
    """배역 r이 text를 lang으로 말한 원본 wav를 raw에. 연기(Gemini)면 True"""
    for word, sound in PRON.get(lang, {}).items():
        text = text.replace(word, sound)
    if lang == "ko":
        text = ko_years(text)
    voice = r["voice"] if lang == "en" else f"{LOC[lang]}-" + r["voice"].split("-", 2)[2]
    if r.get("direction"):
        pace = " Pace: brisk and gripping like a top YouTube history channel - never slow."
        for model in ("gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview"):
            g = subprocess.run(["node", str(C.CODE / "scripts/gemini-tts.mjs"), "say", f"{r['direction']}{pace} Language: {LANG_NAME[lang]}. {extra}", text, str(raw), r["voice"].split("-")[-1], model], capture_output=True, text=True)
            if g.returncode == 0:
                return True
    subprocess.run(["node", str(C.CODE / "scripts/tts.mjs"), "say", text, str(raw), voice, str(r["rate"])], check=True, capture_output=True)
    return False


scenes = []
for i, s in enumerate(ep["scenes"]):
    sc = {**s, "vo": None, "vo_i18n": {}, "acted": False, "dur": {}}
    secs = s["show"].get("seconds", 0)
    if s.get("text"):
        r = C.CAST[s["role"]]
        for lang in langs:
            text = s["text"] if lang == "en" else s.get("i18n", {}).get(lang)
            if not text:
                raise SystemExit(f"장면 {i} {lang} 대사 없음")
            raw = raw_dir / f"{src.parent.name}-{src.stem}-{lang}-{i:02d}.wav"
            acted = voice_line(r, text, lang, raw, s.get("direction", ""))
            x, sr = C.read(raw)
            y = C.level(C.gate(C.clarity(x, sr), sr))
            name = f"vo/{lang}/{i:02d}.wav"
            (out / "vo" / lang).mkdir(parents=True, exist_ok=True)
            C.write(out / name, y, sr)
            path = f"ep/{src.parent.name}/{src.stem}/{name}"
            if lang == "en":
                sc["vo"], sc["acted"] = path, acted
            else:
                sc["vo_i18n"][lang] = path
            # 장면 길이 = 가장 긴 언어 (더빙 트랙이 영상과 같은 길이가 되게). 언어별 실제 길이는 편집기가 타이밍 맞추기에 씀
            sc["dur"][lang] = round(len(y) / sr, 3)
            secs = max(secs, len(y) / sr + GAP)
    # hold = 장면 끝 여유(초, 모든 언어 공통). 편집기에서 장면 끝을 끌어 정함
    secs += s.get("hold", 0)
    sc["frames"] = round(secs * FPS)
    scenes.append(sc)
    print(f"{i:02d} {sc['frames'] / FPS:5.2f}s  {s.get('role', '-'):9s}{' (연기)' if sc['acted'] else ''} {s.get('text', '')[:60]}")

(out / "timeline.json").write_text(json.dumps({"fps": FPS, "bgm": ep.get("bgm"), "langs": langs, "scenes": scenes}, ensure_ascii=False, indent=1))
print(f"합계 {sum(s['frames'] for s in scenes) / FPS:.1f}s")
