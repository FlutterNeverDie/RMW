# 언어 길이 검사 (제작 7단계 "길이 맞추기"의 게이트, 토큰 없음)
# 장면 길이 = 가장 긴 언어라서 더빙이 길면 영어 원본(메인 시청자)이 말을 멈추고 기다린다 → 더빙은 영어의 110% 이하 (2026-10-20 사용자)
# python3 scripts/check-length.py episodes/mongol-03/ep.json [--json] [--stdin]
# 목소리를 만들었으면 실제 길이(timeline dur, 없으면 wav 헤더 - 대사가 그대로인 줄만), 아니면 글자 수 어림(scripts/estimate.json)
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from checklib import Ctx, item, report  # noqa: E402

LIMIT = 1.10
ctx = Ctx()
out = []
n_real = n_all = 0
for i, s in enumerate(ctx.scenes):
    if not s.get("text"):
        continue
    en, r_en = ctx.secs(i, "en")
    for lang in ctx.langs:
        d, r = ctx.secs(i, lang)
        n_all += 1
        n_real += r and r_en
        if en and d > en * LIMIT and d - en > 0.4:
            how = "" if r and r_en else " (어림)"
            out.append(item(i, f"{lang} {d:.1f}초 / 영어 {en:.1f}초 (×{d / en:.2f}){how} - 영어의 110% 안으로 줄이기", source="length", rule="length", group="길이",
                            lang=lang, field=f"i18n.{lang}", text=(s.get("i18n") or {}).get(lang, "")))
report(ctx, out, "길이 검사", f" (실제 목소리 {n_real}/{n_all}줄, 나머지 어림)" if n_all else "")
