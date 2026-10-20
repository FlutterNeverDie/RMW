# 인물 캐릭터: characters.json(Claude가 편마다 설계) → 겹 SVG → 영상에서 숨쉬기·깜빡임·입 움직임
#   python3 audio/characters.py list episodes/mongol-03/ep.json   이 편에 필요한 인물과 아직 설계가 없는 인물
#   python3 audio/characters.py build [id...]                     public/chars/<id>/<포즈>/{body,head,eyes0,eyes1,mouth0,mouth1,mouth2}.svg
#                                                                 포즈: front·side·angry·shocked·sad·happy (POSES)
#   .venv/bin/python -I audio/characters.py mouth episodes/mongol-03/ep.json
#                                                                 목소리 크기 → 프레임별 입 모양(0·1·2) public/ep/<편>/ep/mouth.json
# 겹은 모두 같은 600×720 판. 머리 겹(head·eyes·mouth)은 영상에서 같이 흔들리고 몸은 숨쉬기만 한다
# 그림체: 먹선(#2b1d14) + 옛 지도 색(바랜 물감) + 큰 머리. 설계 칸은 characters.json 맨 위 _설명 참고
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "characters.json"
OUT = ROOT / "public/chars"
INK = "#2b1d14"
W, H = 600, 720
HX, HY = 300, 285  # 얼굴 가운데


def svg(body, defs=""):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
        f"<defs>{defs}</defs>"
        f'<g stroke="{INK}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">{body}</g></svg>'
    )


def shade(hex_color, k):
    """k<1 어둡게, k>1 밝게"""
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) for i in (0, 2, 4))
    f = (lambda c: int(c * k)) if k < 1 else (lambda c: int(c + (255 - c) * (k - 1)))
    return "#" + "".join(f"{max(0, min(255, f(c))):02x}" for c in (r, g, b))


# ---------- 몸 ----------
def body_layer(c):
    cloth = c.get("cloth", "#8b3a2b")
    trim = c.get("trim", "#d9b45a")
    kind = c.get("outfit", "deel")
    dark = shade(cloth, 0.72)
    out = []
    # 어깨·몸통 (모든 옷 공통 바탕)
    torso = "M 70 720 C 80 560 150 488 228 470 L 372 470 C 450 488 520 560 530 720 Z"
    out.append(f'<path d="{torso}" fill="{cloth}"/>')
    out.append(f'<path d="M 470 520 C 505 570 520 640 528 720 L 440 720 C 445 640 450 580 470 520 Z" fill="{dark}" stroke="none"/>')
    # 목
    out.append(f'<path d="M 262 420 L 262 478 Q 300 500 338 478 L 338 420 Z" fill="{shade(c["skin"], 0.85)}"/>')
    if kind == "deel":  # 몽골 옷: 오른쪽으로 여미는 깃
        out.append(f'<path d="M 232 468 C 270 520 330 560 400 600 L 418 574 C 360 540 310 505 282 466 Z" fill="{trim}"/>')
        out.append(f'<path d="M 368 468 C 360 500 340 525 318 540" fill="none"/>')
        out.append(f'<path d="M 120 690 L 480 690 L 485 720 L 115 720 Z" fill="{c.get("belt", "#c9822e")}"/>')
    elif kind == "armor":  # 비늘 갑옷
        out.append(f'<path d="M 232 468 Q 300 520 368 468" fill="{trim}"/>')
        for row in range(5):
            y = 540 + row * 36
            x0 = 120 - row * 8
            for k in range(int((360 + row * 16) / 40)):
                x = x0 + k * 40 + (20 if row % 2 else 0)
                if 100 < x < 500:
                    out.append(f'<path d="M {x} {y} q 20 34 40 0" fill="{shade(cloth, 0.9)}" stroke-width="4"/>')
    elif kind == "gown":  # 유럽 왕족 옷
        out.append(f'<path d="M 228 470 Q 300 540 372 470" fill="{trim}"/>')
        out.append(f'<path d="M 300 520 L 300 720" fill="none" stroke="{trim}" stroke-width="14"/>')
    elif kind == "robe":  # 페르시아·수도사 긴 옷
        out.append(f'<path d="M 240 470 L 300 600 L 360 470" fill="{trim}"/>')
        out.append(f'<path d="M 300 600 L 300 720" fill="none"/>')
    if c.get("cape"):
        out.append(f'<path d="M 70 720 C 75 600 120 520 200 478 L 150 720 Z" fill="{c["cape"]}"/>')
        out.append(f'<path d="M 530 720 C 525 600 480 520 400 478 L 450 720 Z" fill="{c["cape"]}"/>')
    out.append(c.get("extra_body", ""))
    return svg("".join(out))


# ---------- 머리 ----------
FACE = f"M 172 270 C 168 150 432 150 428 270 C 428 360 380 420 300 425 C 220 420 172 360 172 270 Z"


def hair_back(c):
    hair = c.get("hair", "#2a2018")
    st = c.get("hair_style", "braids")
    if st == "long":
        # 얼굴 양옆으로 내려오는 머리 (턱 밑은 비움 - 수염처럼 보이지 않게)
        return "".join(
            f'<path d="M {x} 230 C {x - d * 30} 330 {x - d * 30} 430 {x - d * 10} 500 L {x + d * 50} 500 C {x + d * 30} 420 {x + d * 20} 330 {x + d * 40} 260 Z" fill="{hair}"/>'
            for x, d in ((172, 1), (428, -1))
        )
    if st == "braids":  # 몽골식: 정수리를 밀고 귀 뒤로 땋은 머리
        return "".join(
            f'<path d="M {x} 330 C {x + d * 10} 380 {x + d * 6} 430 {x + d * 14} 470" fill="none" stroke="{hair}" stroke-width="26"/>'
            f'<path d="M {x} 330 C {x + d * 10} 380 {x + d * 6} 430 {x + d * 14} 470" fill="none" stroke="{INK}" stroke-width="4" stroke-dasharray="8 14"/>'
            for x, d in ((178, -1), (422, 1))
        )
    return ""


def hat(c):
    kind = c.get("hat", "none")
    col = c.get("hat_color", "#7a2e22")
    fur = c.get("fur", "#a07850")
    if kind == "fur":  # 몽골 털모자: 둥근 꼭대기 + 넓은 털 띠
        return (
            f'<path d="M 200 190 C 200 90 400 90 400 190 Z" fill="{col}"/>'
            f'<path d="M 300 92 L 300 70" stroke-width="8"/><circle cx="300" cy="64" r="10" fill="{c.get("trim", "#d9b45a")}"/>'
            f'<path d="M 160 214 C 150 160 450 160 440 214 C 440 238 160 238 160 214 Z" fill="{fur}"/>'
            + "".join(f'<path d="M {x} 196 l 6 22" stroke="{shade(fur, 0.7)}" stroke-width="4"/>' for x in range(180, 430, 22))
        )
    if kind == "helmet":  # 뾰족 투구 + 목 가리개
        steel = c.get("hat_color", "#8d8f8a")
        return (
            f'<path d="M 168 236 C 160 330 175 380 200 410 L 214 300 Z" fill="{fur}"/>'
            f'<path d="M 432 236 C 440 330 425 380 400 410 L 386 300 Z" fill="{fur}"/>'
            f'<path d="M 168 230 C 175 120 260 70 300 40 C 340 70 425 120 432 230 Z" fill="{steel}"/>'
            f'<path d="M 300 44 L 300 6" stroke-width="10"/><circle cx="300" cy="0" r="8" fill="{c.get("trim", "#c0392b")}"/>'
            f'<path d="M 162 228 Q 300 205 438 228 L 438 246 Q 300 224 162 246 Z" fill="{shade(steel, 0.75)}"/>'
            f'<path d="M 240 120 Q 260 90 300 60" fill="none" stroke="{shade(steel, 1.5)}" stroke-width="8"/>'
        )
    if kind == "crown":
        gold = c.get("hat_color", "#d9a92e")
        return (
            f'<path d="M 190 205 L 190 120 L 235 165 L 270 100 L 300 150 L 330 100 L 365 165 L 410 120 L 410 205 Z" fill="{gold}"/>'
            f'<circle cx="300" cy="185" r="12" fill="#b3261e"/><circle cx="240" cy="188" r="8" fill="#2a5db0"/><circle cx="360" cy="188" r="8" fill="#2a5db0"/>'
        )
    if kind == "turban":
        cloth = c.get("hat_color", "#efe4cc")
        return (
            f'<path d="M 165 225 C 150 110 450 110 435 225 C 400 205 200 205 165 225 Z" fill="{cloth}"/>'
            f'<path d="M 180 190 C 260 150 360 170 425 205 M 175 160 C 260 120 350 140 410 165" fill="none" stroke-width="4"/>'
            f'<path d="M 300 150 l -16 22 l 16 22 l 16 -22 Z" fill="{c.get("trim", "#2e8b57")}"/>'
            f'<path d="M 300 150 C 290 110 310 90 330 80" fill="none" stroke="{c.get("trim", "#2e8b57")}" stroke-width="8"/>'
        )
    if kind == "scarf":  # 여인 머릿수건
        cloth = c.get("hat_color", "#4f6d5a")
        return (
            f'<path d="M 160 300 C 130 120 470 120 440 300 L 470 470 L 400 450 C 430 380 425 300 420 250 C 380 180 220 180 180 250 C 175 300 170 380 200 450 L 130 470 Z" fill="{cloth}"/>'
            f'<path d="M 182 248 C 230 190 370 190 418 248" fill="none" stroke="{c.get("trim", "#d9b45a")}" stroke-width="10"/>'
        )
    if kind == "hood":
        cloth = c.get("hat_color", "#5a4632")
        return f'<path d="M 150 330 C 120 110 480 110 450 330 L 470 480 L 130 480 Z M 190 300 C 185 170 415 170 410 300 C 400 380 200 380 190 300 Z" fill="{cloth}" fill-rule="evenodd"/>'
    return ""


def beard(c):
    kind = c.get("beard", "none")
    col = c.get("beard_color", c.get("hair", "#2a2018"))
    if kind == "mustache":  # 몽골식 늘어진 콧수염 + 턱 끝 수염
        return (
            f'<path d="M 300 338 C 270 334 250 345 240 380 C 255 362 275 352 300 352 C 325 352 345 362 360 380 C 350 345 330 334 300 338 Z" fill="{col}"/>'
            f'<path d="M 288 405 L 300 450 L 312 405 Z" fill="{col}"/>'
        )
    if kind == "goatee":
        return f'<path d="M 270 398 C 280 440 320 440 330 398 Z" fill="{col}"/>'
    if kind == "full":
        return (
            f'<path d="M 182 320 C 190 430 250 470 300 472 C 350 470 410 430 418 320 C 400 380 360 400 300 402 C 240 400 200 380 182 320 Z" fill="{col}"/>'
            f'<path d="M 262 345 C 280 335 320 335 338 345 C 320 352 280 352 262 345 Z" fill="{col}"/>'
        )
    return ""


# 포즈 = 보는 방향(view) + 표정(expr). 장면표에서 "pose": "angry" 처럼 고른다 (없으면 front)
POSES = {
    "front": ("front", None),
    "side": ("side", None),  # 3/4 옆모습, 오른쪽을 봄 (왼쪽은 영상에서 뒤집기 facing: "left")
    "angry": ("front", "angry"),
    "shocked": ("front", "shocked"),
    "sad": ("front", "sad"),
    "happy": ("front", "happy"),
}
# 옆모습: 이목구비를 가로로 0.82배 줄이고 오른쪽으로 40 옮김 (300 기준)
SIDE = "matrix(0.82 0 0 1 94 0)"


def feat(view, inner):
    return f'<g transform="{SIDE}">{inner}</g>' if view == "side" else inner


def brows(c, expr):
    col = c.get("brow", c.get("hair", "#2a2018"))
    mood = expr or c.get("mood", "calm")
    tilt = {"angry": 16, "stern": 8, "calm": 0, "worried": -12, "sad": -14, "smug": 4, "shocked": -4, "happy": -2}.get(mood, 0)
    lift = {"shocked": 18, "happy": 6, "sad": 2}.get(mood, 0)
    sw = 12 if mood in ("angry", "stern") else 9
    y = 238 - lift
    return (
        f'<path d="M 212 {y - tilt} Q 240 {y - 12 - tilt} 272 {y + 2 + tilt}" fill="none" stroke="{col}" stroke-width="{sw}"/>'
        f'<path d="M 388 {y - tilt} Q 360 {y - 12 - tilt} 328 {y + 2 + tilt}" fill="none" stroke="{col}" stroke-width="{sw}"/>'
    )


FACE_SIDE = "M 178 270 C 172 150 430 146 438 258 C 448 292 446 330 428 352 C 405 402 360 425 306 426 C 230 420 178 360 178 270 Z"


def head_layer(c, view, expr):
    skin = c["skin"]
    out = [hair_back(c)]
    if view == "side":
        out.append(f'<ellipse cx="190" cy="290" rx="22" ry="32" fill="{skin}"/>')
        out.append(f'<path d="{FACE_SIDE}" fill="{skin}"/>')
        out.append(f'<path d="M 214 230 C 196 290 206 370 270 418 C 220 400 180 340 214 230 Z" fill="{shade(skin, 0.86)}" stroke="none"/>')
    else:
        out.append(f'<ellipse cx="172" cy="285" rx="20" ry="30" fill="{skin}"/><ellipse cx="428" cy="285" rx="20" ry="30" fill="{skin}"/>')
        out.append(f'<path d="{FACE}" fill="{skin}"/>')
        out.append(f'<path d="M 400 220 C 425 290 410 370 330 418 C 380 400 430 340 400 220 Z" fill="{shade(skin, 0.86)}" stroke="none"/>')
    blush = 0.55 if expr in ("happy", "angry") else 0.35
    f = [f'<ellipse cx="228" cy="335" rx="24" ry="13" fill="#d9776a" opacity="{blush}" stroke="none"/><ellipse cx="372" cy="335" rx="24" ry="13" fill="#d9776a" opacity="{blush}" stroke="none"/>']
    if view == "side":
        f.append('<path d="M 300 288 Q 318 316 330 322 Q 316 330 302 326" fill="none" stroke-width="5"/>')
    else:
        f.append('<path d="M 300 290 Q 292 318 300 324 Q 306 326 312 320" fill="none" stroke-width="5"/>')
    if c.get("age", "adult") == "old":
        f.append('<path d="M 210 372 q 14 10 28 6 M 362 378 q 14 4 28 -6 M 255 210 q 45 -10 90 0" fill="none" stroke-width="4" opacity="0.7"/>')
    if c.get("scar"):
        f.append('<path d="M 350 245 L 380 320" fill="none" stroke="#8a3b2e" stroke-width="5"/>')
    if expr == "angry":  # 미간 주름
        f.append('<path d="M 292 236 l 4 16 M 308 236 l -4 16" fill="none" stroke-width="4" opacity="0.6"/>')
    if expr == "sad":  # 눈물
        f.append('<path d="M 368 300 Q 360 318 368 326 Q 376 318 368 300 Z" fill="#8cc4e8" stroke="#3a6a8a" stroke-width="3"/>')
    out.append(feat(view, "".join(f)))
    if c.get("hat", "none") == "none":
        hair = c.get("hair", "#2a2018")
        g = ""
        if c.get("hair_style") == "braids":
            g += f'<path d="M 184 236 C 200 160 400 160 416 236 C 380 196 220 196 184 236 Z" fill="{shade(skin, 0.8)}"/>'
            g += f'<path d="M 282 175 C 290 200 310 200 318 175 L 312 212 L 288 212 Z" fill="{hair}"/>'
        else:
            g += f'<path d="M 172 262 C 160 140 440 140 428 262 C 400 210 360 190 300 200 C 240 190 200 210 172 262 Z" fill="{hair}"/>'
        out.append(f'<g transform="translate(10 0)">{g}</g>' if view == "side" else g)
    out.append(feat(view, beard(c) + brows(c, expr)))
    h = hat(c)
    out.append(f'<g transform="translate(12 0)">{h}</g>' if view == "side" else h)
    out.append(c.get("extra_head", ""))
    return svg("".join(out))


def eyes_layer(c, closed, view, expr):
    if closed or expr == "happy":  # 기쁨은 눈웃음(∩)
        d = "M 218 288 Q 242 266 266 288 M 334 288 Q 358 266 382 288" if expr == "happy" and not closed else "M 218 284 Q 242 296 266 284 M 334 284 Q 358 296 382 284"
        return svg(feat(view, f'<path d="{d}" fill="none" stroke-width="7"/>'))
    col = c.get("eye_color", "#2b1d14")
    if expr == "shocked":  # 동그랗게 커진 눈 + 작은 눈동자
        return svg(feat(view, "".join(
            f'<circle cx="{x}" cy="280" r="22" fill="#fbf4e4"/><circle cx="{x}" cy="281" r="6" fill="{col}" stroke="none"/>' for x in (242, 358)
        )))
    ry = 11 if c.get("eyes", "almond") == "narrow" else 16
    out = "".join(
        f'<path d="M {x - 26} 282 Q {x} {282 - ry * 1.6} {x + 26} 282 Q {x} {282 + ry * 0.9} {x - 26} 282 Z" fill="#fbf4e4"/>'
        f'<circle cx="{x + 3}" cy="{282 - ry * 0.25}" r="{ry * 0.75}" fill="{col}" stroke="none"/>'
        f'<circle cx="{x + 7}" cy="{282 - ry * 0.55}" r="3.5" fill="#fff" stroke="none"/>'
        for x in (242, 358)
    )
    skin = c["skin"]
    if expr == "angry":  # 위 눈꺼풀이 안쪽으로 내려옴
        out += f'<path d="M 212 262 L 272 262 L 272 284 Q 250 270 214 268 Z M 388 262 L 328 262 L 328 284 Q 350 270 386 268 Z" fill="{skin}" stroke="none"/>'
        out += '<path d="M 214 268 Q 250 270 270 282 M 386 268 Q 350 270 330 282" fill="none" stroke-width="6"/>'
    if expr == "sad":  # 바깥으로 처진 눈꺼풀
        out += f'<path d="M 212 260 L 272 260 L 270 270 Q 240 266 214 282 Z M 388 260 L 328 260 L 330 270 Q 360 266 386 282 Z" fill="{skin}" stroke="none"/>'
        out += '<path d="M 214 282 Q 240 266 270 270 M 386 282 Q 360 266 330 270" fill="none" stroke-width="6"/>'
    return svg(feat(view, out))


def mouth_layer(level, c, view, expr):
    lip = shade(c["skin"], 0.62)
    if expr == "shocked":
        ry = (12, 17, 24)[level]
        return svg(feat(view, f'<ellipse cx="300" cy="{372 + ry * 0.3}" rx="{10 + level * 3}" ry="{ry}" fill="#5a1f19"/>'))
    if level == 0:
        d = {"angry": "M 276 378 Q 300 364 324 378", "sad": "M 278 380 Q 300 366 322 380", "happy": "M 268 364 Q 300 394 332 364"}.get(expr, "M 278 372 Q 300 380 322 370")
        return svg(feat(view, f'<path d="{d}" fill="none" stroke-width="6"/>'))
    h = (14 if level == 1 else 30) + (8 if expr == "angry" else 0)
    w = 30 if expr in ("angry", "happy") else 24
    top = 364 if expr == "happy" else 368
    teeth = f'<path d="M {300 - w + 6} {top + 3} L {300 + w - 6} {top + 3} L {300 + w - 9} {top + 10} L {300 - w + 9} {top + 10} Z" fill="#fbf4e4" stroke="none"/>' if expr in ("angry", "happy") else ""
    return svg(feat(view,
        f'<path d="M {300 - w} {top} Q 300 {top - 6} {300 + w} {top} Q {300 + w * 0.75} {top + h} 300 {top + 2 + h} Q {300 - w * 0.75} {top + h} {300 - w} {top} Z" fill="#5a1f19"/>'
        + teeth
        + f'<path d="M 286 {top - 6 + h} Q 300 {top - 12 + h * 0.8} 314 {top - 6 + h}" fill="#c5534a" stroke="none"/>'
        f'<path d="M {300 - w} {top} Q 300 {top - 6} {300 + w} {top}" fill="none" stroke="{lip}" stroke-width="3"/>'
    ))


def body_for(c, view):
    b = body_layer(c)
    # 옆모습은 몸을 살짝 돌린 느낌으로 (가로 0.94배, 오른쪽으로)
    return b.replace('<g stroke=', f'<g transform="matrix(0.94 0 0 1 30 0)" stroke=', 1) if view == "side" else b


def build(ids=None):
    import shutil

    spec = json.loads(SPEC.read_text())["characters"]
    for cid, c in spec.items():
        if ids and cid not in ids:
            continue
        d = OUT / cid
        if d.exists():
            shutil.rmtree(d)
        for pose, (view, expr) in POSES.items():
            pd = d / pose
            pd.mkdir(parents=True)
            files = {
                "body": body_for(c, view),
                "head": head_layer(c, view, expr),
                "eyes0": eyes_layer(c, False, view, expr),
                "eyes1": eyes_layer(c, True, view, expr),
                **{f"mouth{k}": mouth_layer(k, c, view, expr) for k in range(3)},
            }
            for name, text in files.items():
                (pd / f"{name}.svg").write_text(text)
        print(f"→ public/chars/{cid}/ (포즈 {len(POSES)}개)")


def needed(ep_path):
    ep = json.loads(Path(ep_path).read_text())
    spec = json.loads(SPEC.read_text())["characters"] if SPEC.exists() else {}
    by_speaker = {s.upper(): cid for cid, c in spec.items() for s in c.get("speakers", [])}
    names = json.loads((ROOT / "episodes/names.json").read_text())["names"]
    speakers = sorted({s["speaker"] for s in ep["scenes"] if s.get("speaker")})
    mentioned = sorted({n for n in names if not names[n].get("place") for s in ep["scenes"] if n in (s.get("text") or "")})
    print("대사 인물:")
    for s in speakers:
        print(f"  {s:24} {'→ ' + by_speaker[s.upper()] if s.upper() in by_speaker else '설계 없음'}")
    print("대사에 나오는 이름(사전):")
    for n in mentioned:
        hit = [cid for cid, c in spec.items() if n in c.get("names", [])]
        print(f"  {n:24} {'→ ' + hit[0] if hit else '설계 없음'}")


def mouth(ep_path):
    """목소리 wav → 프레임마다 입 모양 0(닫힘)·1·2(크게). 장면 길이·fps는 timeline.json 기준"""
    import wave

    import numpy as np

    ep = Path(ep_path)
    base = ROOT / "public/ep" / ep.parent.name / ep.stem
    tl = json.loads((base / "timeline.json").read_text())
    fps = tl["fps"]
    res = {}
    for sc in tl["scenes"]:
        for path in [sc.get("vo"), *(sc.get("vo_i18n") or {}).values()]:
            if not path or path in res:
                continue
            f = ROOT / "public" / path
            if not f.exists():
                continue
            with wave.open(str(f)) as w:
                sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
                x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32)
            x = x.reshape(-1, ch).mean(axis=1) if ch > 1 else x
            hop = sr // fps
            rms = np.array([np.sqrt(np.mean(x[i : i + hop] ** 2)) if len(x[i : i + hop]) else 0 for i in range(0, len(x), hop)])
            peak = np.percentile(rms, 95) or 1
            lv = np.where(rms > peak * 0.55, 2, np.where(rms > peak * 0.18, 1, 0))
            # 한 프레임짜리 깜빡임은 지운다 (입이 덜덜 떨리지 않게)
            for i in range(1, len(lv) - 1):
                if lv[i - 1] == lv[i + 1] != lv[i]:
                    lv[i] = lv[i - 1]
            res[path] = "".join(map(str, lv))
    (base / "mouth.json").write_text(json.dumps(res))
    print(f"→ {base.relative_to(ROOT)}/mouth.json ({len(res)}개 목소리)")


if __name__ == "__main__":
    cmd, *args = sys.argv[1:] or ["build"]
    {"build": lambda: build(args or None), "list": lambda: needed(args[0]), "mouth": lambda: mouth(args[0])}[cmd]()
