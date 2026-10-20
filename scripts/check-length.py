# 언어 길이 검사 (제작 7단계 "길이 맞추기"의 게이트, 토큰 없음)
# 장면 길이 = 가장 긴 언어라서 더빙이 길면 영어 원본(메인 시청자)이 말을 멈추고 기다린다 → 더빙은 영어의 110% 이하 (2026-10-20 사용자)
# python3 scripts/check-length.py episodes/mongol-03/ep.json   (목소리를 만들었으면 실제 길이, 아니면 글자 수 어림)
import json
import re
import sys
from pathlib import Path

CODE = Path(__file__).resolve().parent.parent
LIMIT = 1.10
ep_path = Path(sys.argv[1])
ep = json.loads(ep_path.read_text())
tl_path = CODE / "public/ep" / ep_path.parent.name / ep_path.stem / "timeline.json"
tl = json.loads(tl_path.read_text()) if tl_path.exists() else None
langs = [l for l in ep.get("langs", ["en"]) if l != "en"]


def est(text, lang):  # 편집기 editor/app.tsx estimate와 같은 계수
    if not text:
        return 0
    t = text.replace("...", "…")
    pauses = len(re.findall(r"[.,!?…;:]", t)) * 0.18
    if re.match(r"^(ko|ja|zh)", lang):
        return len(re.sub(r"[\s.,!?…\"'“”]", "", t)) / 6.3 + pauses
    if lang == "en":
        return len(t.split()) / 2.7 + pauses
    return len(re.sub(r"\s", "", t)) / 14.5 + pauses


def secs(i, s, lang):
    text = s.get("text") if lang == "en" else (s.get("i18n") or {}).get(lang)
    t = tl["scenes"][i] if tl and i < len(tl["scenes"]) else None
    voiced = (t or {}).get("text") if lang == "en" else ((t or {}).get("i18n") or {}).get(lang)
    if t and voiced == text and (t.get("dur") or {}).get(lang):
        return t["dur"][lang], True
    return est(text, lang), False


bad = []
real_any = False
for i, s in enumerate(ep["scenes"]):
    if not s.get("text"):
        continue
    en, r = secs(i, s, "en")
    real_any |= r
    for lang in langs:
        d, _ = secs(i, s, lang)
        if en and d > en * LIMIT and d - en > 0.4:
            bad.append(f"  #{i} {lang} {d:.1f}초 / 영어 {en:.1f}초 (×{d / en:.2f}): {(s.get('i18n') or {}).get(lang, '')[:60]}")
print("\n".join(bad))
print(f"길이 검사{'' if real_any else ' (어림)'}: {'통과' if not bad else f'{len(bad)}줄이 영어보다 10% 넘게 김 - 줄이기'}")
sys.exit(1 if bad else 0)
