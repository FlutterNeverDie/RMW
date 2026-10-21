# 인물 캐릭터: characters.json(Claude가 편마다 설계) → 겹 SVG → 영상에서 숨쉬기·깜빡임·입 움직임
#   python3 audio/characters.py list episodes/mongol-03/ep.json   이 편에 필요한 인물과 아직 설계가 없는 인물
#   python3 audio/characters.py build [id...]                     public/chars/<id>/<포즈>/{body,head,eyes0,eyes1,mouth0,mouth1,mouth2}.svg
#                                                                 포즈: front·side·angry·shocked·sad·happy (POSES)
#   .venv/bin/python -I audio/characters.py mouth episodes/mongol-03/ep.json
#                                                                 목소리 크기 → 프레임별 입 모양(0·1·2) public/ep/<편>/ep/mouth.json
# 겹은 모두 같은 600×720 판. 머리 겹(head·eyes·mouth)은 영상에서 같이 흔들리고 몸은 숨쉬기만 한다
# 그림체: 먹선(#2b1d14) + 옛 지도 색(바랜 물감) + 큰 머리. 설계 칸은 characters.json 맨 위 _설명 참고
# 2026-10-21 그림체 개편(사용자 시안 A): 손으로 그은 듯 흔들리는 먹선, 종이 질감, 지도 톤으로 바랜 색, 2단 그림자
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "characters.json"
OUT = ROOT / "public/chars"
INK = "#2b1d14"
W, H = 600, 720
HX, HY = 300, 285  # 얼굴 가운데


# 겹마다 같은 필터(같은 seed)라 머리·눈·입 겹의 선 흔들림이 서로 맞는다
LOOK = (
    # 먹선을 손으로 그은 것처럼 살짝 흔들기
    '<filter id="ink" x="-5%" y="-5%" width="110%" height="110%">'
    '<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="n"/>'
    '<feDisplacementMap in="SourceGraphic" in2="n" scale="4"/></filter>'
    # 종이 질감(그림 안쪽에만) + 지도 톤으로 바랜 색(채도 낮추고 따뜻하게)
    '<filter id="paper" x="0" y="0" width="100%" height="100%">'
    '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="t"/>'
    '<feColorMatrix in="t" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.33  0 0 0 0 0.2  0 0 0 0.5 0" result="tc"/>'
    '<feComposite in="tc" in2="SourceAlpha" operator="in" result="tx"/>'
    '<feBlend in="SourceGraphic" in2="tx" mode="multiply" result="m"/>'
    '<feColorMatrix in="m" type="matrix" values="0.86 0.12 0.02 0 0.02  0.06 0.88 0.06 0 0.01  0.04 0.1 0.8 0 0  0 0 0 1 0"/></filter>'
)


def svg(body, defs=""):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
        f"<defs>{LOOK}{defs}</defs>"
        f'<g filter="url(#paper)"><g filter="url(#ink)" stroke="{INK}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">{body}</g></g></svg>'
    )


def shade(hex_color, k):
    """k<1 어둡게, k>1 밝게"""
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) for i in (0, 2, 4))
    f = (lambda c: int(c * k)) if k < 1 else (lambda c: int(c + (255 - c) * (k - 1)))
    return "#" + "".join(f"{max(0, min(255, f(c))):02x}" for c in (r, g, b))


# ---------- 몸 ----------
TORSO = "M 70 720 C 80 560 150 488 228 470 L 372 470 C 450 488 520 560 530 720 Z"
# 쇠사슬 갑옷 무늬 (겹마다 같은 id - 한 SVG 안에서만 쓰임)
MAIL = (
    '<pattern id="mail" width="16" height="12" patternUnits="userSpaceOnUse">'
    '<path d="M 0 6 Q 8 15 16 6 M -8 0 Q 0 9 8 0 M 8 0 Q 16 9 24 0" fill="none" stroke="#2b1d14" stroke-width="2.2" opacity=".55"/></pattern>'
    f'<clipPath id="torso"><path d="{TORSO}"/></clipPath>'
)


def back_props(c):
    """어깨 뒤로 보이는 소품 (몸통보다 먼저 그림): bow(활) · quiver(화살통) · spear(창)"""
    out = []
    for p in c.get("back", []):
        if p == "quiver":  # 오른쪽 어깨 위로 화살 깃
            out.append('<g transform="rotate(14 450 560)">')
            for k, x in enumerate((430, 446, 462, 478)):
                y = 392 + (k % 2) * 14
                out.append(f'<path d="M {x} {y + 20} L {x} 560" fill="none" stroke-width="5"/>'
                           f'<path d="M {x} {y} l -9 -26 l 9 8 l 9 -8 Z" fill="#efe2c4" stroke-width="4"/>')
            out.append(f'<path d="M 418 452 L 492 452 L 486 600 L 424 600 Z" fill="{c.get("quiver", "#7a4a2a")}"/>'
                       f'<path d="M 418 470 L 492 470" fill="none" stroke="{c.get("trim", "#d9b45a")}" stroke-width="8"/></g>')
        if p == "bow":  # 왼쪽 어깨 뒤로 활 끝 (몽골 복합궁: 끝이 뒤로 젖힘)
            out.append('<path d="M 120 610 C 90 520 120 420 170 380 C 182 370 192 356 188 340" fill="none" stroke="#5a3a1e" stroke-width="16"/>'
                       '<path d="M 120 610 C 90 520 120 420 170 380 C 182 370 192 356 188 340" fill="none" stroke="#a8743a" stroke-width="7"/>'
                       '<path d="M 186 344 L 214 560" fill="none" stroke="#efe2c4" stroke-width="3"/>')
        if p == "spear":
            out.append('<path d="M 470 720 L 520 150" fill="none" stroke="#5a3a1e" stroke-width="14"/>'
                       '<path d="M 520 150 l -14 -10 l 22 -90 l 20 92 Z" fill="#a9aba6"/>'
                       f'<path d="M 508 182 q 14 30 34 10 q -8 -22 -34 -10" fill="{c.get("plume", "#8b2f22")}"/>')
    return "".join(out)


def body_layer(c):
    cloth = c.get("cloth", "#8b3a2b")
    trim = c.get("trim", "#d9b45a")
    kind = c.get("outfit", "deel")
    dark = shade(cloth, 0.72)
    out = [back_props(c)]
    # 어깨·몸통 (모든 옷 공통 바탕)
    out.append(f'<path d="{TORSO}" fill="{cloth}"/>')
    out.append(f'<path d="M 470 520 C 505 570 520 640 528 720 L 440 720 C 445 640 450 580 470 520 Z" fill="{dark}" stroke="none"/>')
    out.append(f'<path d="M 70 720 C 76 640 105 585 145 548 C 130 610 128 670 135 720 Z" fill="{shade(cloth, 1.25)}" stroke="none" opacity=".6"/>')
    # 목
    out.append(f'<path d="M 262 420 L 262 478 Q 300 500 338 478 L 338 420 Z" fill="{shade(c["skin"], 0.85)}"/>')
    if kind == "deel":  # 몽골 옷: 오른쪽으로 여미는 깃
        out.append(f'<path d="M 232 468 C 270 520 330 560 400 600 L 418 574 C 360 540 310 505 282 466 Z" fill="{trim}"/>')
        out.append(f'<path d="M 296 522 C 336 552 372 576 408 594" fill="none" stroke="{shade(trim, 0.75)}" stroke-width="4"/>')
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
    elif kind == "lamellar":  # 미늘 갑옷: 작은 쇠·가죽 조각을 끈으로 줄줄이 엮음 + 어깨 가리개
        g = []
        for row, y in enumerate(range(500, 730, 32)):
            for k in range(-1, 22):
                x = 60 + k * 24 + (12 if row % 2 else 0)
                g.append(f'<rect x="{x}" y="{y}" width="22" height="34" rx="5" fill="{shade(cloth, 1.08 if (k + row) % 3 == 0 else 0.96)}" stroke-width="3"/>')
            g.append(f'<path d="M 60 {y + 26} L 560 {y + 26}" fill="none" stroke="{trim}" stroke-width="4" opacity=".85"/>')
        out.append(f'<g clip-path="url(#torso)">{"".join(g)}</g>')
        out.append(f'<path d="{TORSO}" fill="none"/>')
        for d in (1, -1):  # 어깨 가리개 3단
            for k in range(3):
                x = 300 - d * (168 + k * 22)
                y = 500 + k * 34
                out.append(f'<path d="M {x + d * 70} {y - 8} C {x + d * 30} {y - 18} {x - d * 40} {y + 10} {x - d * 62} {y + 70} L {x - d * 40} {y + 84} C {x - d * 22} {y + 40} {x + d * 20} {y + 20} {x + d * 70} {y + 22} Z" fill="{shade(cloth, 0.86 + k * 0.06)}" stroke-width="5"/>')
        out.append(f'<path d="M 228 470 C 250 500 350 500 372 470 L 360 520 C 330 540 270 540 240 520 Z" fill="{trim}"/>')
        out.append(f'<path d="M 110 690 L 490 690 L 494 720 L 106 720 Z" fill="{c.get("belt", "#5a3a22")}"/>')
    elif kind == "mail":  # 쇠사슬 갑옷 (루스·호라즘 기사)
        out.append(f'<path d="{TORSO}" fill="url(#mail)" stroke="none"/>')
        out.append(f'<path d="M 236 470 Q 300 504 364 470" fill="none" stroke-width="6"/>')
        if c.get("surcoat"):  # 가운데 겉옷 띠
            out.append(f'<path d="M 240 520 L 360 520 L 380 720 L 220 720 Z" fill="{c["surcoat"]}"/>'
                       f'<path d="M 240 520 L 360 520" fill="none" stroke="{trim}" stroke-width="8"/>')
        out.append(f'<path d="M 110 680 L 490 680 L 494 708 L 106 708 Z" fill="{c.get("belt", "#5a3a22")}"/>'
                   f'<rect x="284" y="676" width="32" height="36" rx="4" fill="{trim}" stroke-width="4"/>')
    elif kind == "gown":  # 유럽·조지아 왕족 옷: 금실 깃 + 가운데 수놓은 띠 + 진주
        out.append(f'<path d="M 222 470 C 240 520 360 520 378 470 L 392 482 C 370 548 230 548 208 482 Z" fill="{trim}"/>')
        out.append(f'<path d="M 278 528 L 322 528 L 330 720 L 270 720 Z" fill="{trim}"/>')
        out.append("".join(f'<circle cx="{300 + (k % 2) * 0}" cy="{560 + k * 34}" r="7" fill="#f3ead6" stroke-width="3"/>' for k in range(5)))
        out.append("".join(f'<circle cx="{x}" cy="{y}" r="5" fill="#f3ead6" stroke-width="2.5"/>' for x, y in ((236, 500), (262, 516), (300, 522), (338, 516), (364, 500))))
    elif kind == "robe":  # 페르시아 긴 옷: 깊은 V깃 + 허리띠
        out.append(f'<path d="M 236 470 L 300 610 L 364 470 L 384 480 L 300 650 L 216 480 Z" fill="{trim}"/>')
        out.append(f'<path d="M 252 470 L 300 590 L 348 470 Z" fill="{c.get("inner", shade(trim, 0.85))}"/>')
        out.append(f'<path d="M 112 668 C 200 690 400 690 488 668 L 492 704 C 400 726 200 726 108 704 Z" fill="{c.get("belt", "#c9822e")}"/>')
    if c.get("fur_collar"):  # 털 깃 (쿠만·초원 귀족)
        fur = c.get("fur", "#a07850")
        out.append(f'<path d="M 150 520 C 190 470 250 450 300 470 C 350 450 410 470 450 520 C 420 548 380 520 340 512 C 320 530 280 530 260 512 C 220 520 180 548 150 520 Z" fill="{fur}"/>')
        out.append("".join(f'<path d="M {x} {506 + abs(300 - x) // 12} l 8 -14" fill="none" stroke="{shade(fur, 1.35)}" stroke-width="4"/>' for x in range(176, 430, 26)))
    if c.get("cape"):
        if c.get("cape_style") == "rus":  # 루스식 망토: 오른쪽 어깨에서 금 브로치로 여밈
            out.append(f'<path d="M 70 720 C 72 600 120 520 220 476 L 420 500 C 330 540 220 620 190 720 Z" fill="{c["cape"]}"/>')
            out.append(f'<path d="M 530 720 C 526 620 500 560 450 520 L 470 720 Z" fill="{c["cape"]}"/>')
            out.append(f'<path d="M 120 690 C 140 610 190 556 260 520" fill="none" stroke="{shade(c["cape"], 0.7)}" stroke-width="5"/>')
            out.append(f'<circle cx="420" cy="506" r="20" fill="{trim}"/><circle cx="420" cy="506" r="7" fill="#8b2f22" stroke-width="3"/>')
        else:
            out.append(f'<path d="M 70 720 C 75 600 120 520 200 478 L 150 720 Z" fill="{c["cape"]}"/>')
            out.append(f'<path d="M 530 720 C 525 600 480 520 400 478 L 450 720 Z" fill="{c["cape"]}"/>')
    if c.get("pendant") == "cross":  # 네스토리우스파 십자가 (케레이트)
        out.append(f'<path d="M 300 500 L 300 548" fill="none" stroke-width="3"/>'
                   f'<path d="M 292 548 h 16 v 14 h 14 v 16 h -14 v 26 h -16 v -26 h -14 v -16 h 14 Z" fill="{trim}" stroke-width="4"/>')
    out.append(c.get("extra_body", ""))
    return svg("".join(out), MAIL)


# ---------- 머리 ----------
FACE = "M 172 270 C 168 150 432 150 428 270 C 428 360 380 420 300 425 C 220 420 172 360 172 270 Z"
# 얼굴형 (정면만, 귀·이목구비 자리는 같음): round 둥근 볼(외게데이) · square 각진 턱(장군)
FACES = {
    "oval": FACE,
    "round": "M 166 272 C 160 150 440 150 434 272 C 438 372 384 426 300 428 C 216 426 162 372 166 272 Z",
    "square": "M 174 262 C 170 150 430 150 426 262 L 422 348 C 414 398 364 424 300 426 C 236 424 186 398 178 348 Z",
}


def hair_back(c):
    hair = c.get("hair", "#2a2018")
    st = c.get("hair_style", "braids")
    if st == "long":
        # 얼굴 양옆으로 내려오는 머리 (턱 밑은 비움 - 수염처럼 보이지 않게)
        return "".join(
            f'<path d="M {x} 230 C {x - d * 30} 330 {x - d * 30} 430 {x - d * 10} 500 L {x + d * 50} 500 C {x + d * 30} 420 {x + d * 20} 330 {x + d * 40} 260 Z" fill="{hair}"/>'
            for x, d in ((172, 1), (428, -1))
        )
    if st == "braids":  # 몽골식: 정수리를 밀고 귀 뒤로 땋아 늘어뜨린 고리
        return "".join(
            f'<path d="M {300 - d * 142} 300 C {300 - d * 172} 360 {300 - d * 172} 430 {300 - d * 150} 470 C {300 - d * 132} 498 {300 - d * 104} 486 {300 - d * 112} 452 C {300 - d * 120} 420 {300 - d * 122} 370 {300 - d * 104} 330 Z" fill="{hair}"/>'
            f'<path d="M {300 - d * 150} 400 q {d * 18} 8 {d * 36} 0 M {300 - d * 148} 436 q {d * 16} 8 {d * 32} 0" fill="none" stroke="{shade(hair, 1.3)}" stroke-width="4"/>'
            for d in (1, -1)
        )
    return ""


def hat_back(c):
    """얼굴 뒤로 내려오는 모자 부분: 사슬 목가리개·면사포·보크타 장식 줄"""
    kind = c.get("hat", "none")
    if kind == "rus_helmet":
        steel = shade(c.get("hat_color", "#9a9c96"), 0.92)
        d = "M 168 236 C 150 330 150 420 196 478 L 404 478 C 450 420 450 330 432 236 Z"
        return f'<path d="{d}" fill="{steel}"/><path d="{d}" fill="url(#mail)" stroke="none"/>'
    if kind == "georgian_crown":  # 얇은 면사포가 어깨까지
        v = c.get("veil", "#efe6d2")
        return (f'<path d="M 190 170 C 140 250 120 400 110 520 L 230 500 C 200 420 190 320 200 230 Z" fill="{v}" opacity=".85"/>'
                f'<path d="M 410 170 C 460 250 480 400 490 520 L 370 500 C 400 420 410 320 400 230 Z" fill="{v}" opacity=".85"/>')
    if kind == "boqta":  # 뺨 옆으로 늘어진 구슬 줄
        gold = c.get("trim", "#d9b45a")
        return "".join(
            f'<path d="M {x} 220 L {x} 380" fill="none" stroke-width="3"/>' + "".join(f'<circle cx="{x}" cy="{y}" r="7" fill="{gold if k % 2 else "#2e6b4f"}" stroke-width="3"/>' for k, y in enumerate(range(240, 400, 26)))
            for x in (162, 438)
        )
    return ""


def hat(c):
    kind = c.get("hat", "none")
    col = c.get("hat_color", "#7a2e22")
    fur = c.get("fur", "#a07850")
    if kind == "fur":  # 몽골 털모자: 둥근 꼭대기 + 넓은 털 띠
        return (
            f'<path d="M 190 182 C 192 66 408 66 410 182 Z" fill="{col}"/>'
            f'<path d="M 342 92 C 392 106 410 146 410 182 L 364 182 C 364 146 356 114 342 92 Z" fill="{shade(col, 0.72)}" stroke="none"/>'
            f'<path d="M 300 72 L 300 48" stroke-width="8"/><circle cx="300" cy="42" r="11" fill="{c.get("trim", "#d9b45a")}"/>'
            f'<path d="M 150 188 C 165 154 435 154 450 188 C 462 212 444 232 422 228 C 360 214 240 214 178 228 C 156 232 138 212 150 188 Z" fill="{fur}"/>'
            f'<path d="M 380 168 C 420 172 450 182 450 188 C 462 212 444 232 422 228 C 410 222 395 220 380 218 Z" fill="{shade(fur, 0.75)}" stroke="none"/>'
            + "".join(f'<path d="M {x} 196 l {6 + (x % 3)} -13" fill="none" stroke="{shade(fur, 1.35)}" stroke-width="4"/>' for x in range(172, 432, 30))
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
            + (f'<path d="M 300 14 C 330 18 350 46 354 84 C 340 68 326 56 310 50 C 312 66 318 84 316 98 C 300 74 296 46 300 14 Z" fill="{c["plume"]}"/>' if c.get("plume") else "")
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
            + (f'<path d="M 304 156 C 300 100 330 40 372 10 C 360 60 340 110 316 158 Z" fill="{c["plume"]}"/>'
               f'<path d="M 310 150 C 318 100 340 56 364 22" fill="none" stroke="{shade(c["plume"], 1.4)}" stroke-width="3"/>'
               f'<circle cx="300" cy="172" r="15" fill="#d9a92e"/><circle cx="300" cy="172" r="7" fill="#8b2f22" stroke="none"/>' if c.get("plume") else "")
        )
    if kind == "scarf":  # 여인 머릿수건
        cloth = c.get("hat_color", "#4f6d5a")
        return (
            f'<path d="M 160 300 C 130 120 470 120 440 300 L 470 470 L 400 450 C 430 380 425 300 420 250 C 380 180 220 180 180 250 C 175 300 170 380 200 450 L 130 470 Z" fill="{cloth}"/>'
            f'<path d="M 182 248 C 230 190 370 190 418 248" fill="none" stroke="{c.get("trim", "#d9b45a")}" stroke-width="10"/>'
        )
    if kind == "fur_flaps":  # 귀덮개 털모자 (노장·초원 겨울)
        return (
            f'<path d="M 186 196 C 186 84 414 84 414 196 Z" fill="{col}"/>'
            f'<path d="M 350 104 C 396 122 414 160 414 196 L 370 196 C 368 160 362 128 350 104 Z" fill="{shade(col, 0.72)}" stroke="none"/>'
            f'<path d="M 258 134 Q 300 118 342 134" fill="none" stroke="{c.get("trim", "#d9b45a")}" stroke-width="8"/>'
            + "".join(
                f'<path d="M {300 - d * 150} 186 C {300 - d * 172} 230 {300 - d * 170} 300 {300 - d * 146} 336 C {300 - d * 128} 350 {300 - d * 112} 330 {300 - d * 116} 300 L {300 - d * 120} 200 Z" fill="{fur}"/>'
                for d in (1, -1)
            )
            + f'<path d="M 150 196 C 165 164 435 164 450 196 C 456 216 440 230 420 226 C 360 214 240 214 180 226 C 160 230 144 216 150 196 Z" fill="{fur}"/>'
            + "".join(f'<path d="M {x} 204 l {6 + (x % 3)} -13" fill="none" stroke="{shade(fur, 1.35)}" stroke-width="4"/>' for x in range(174, 432, 30))
        )
    if kind == "fur_peak":  # 뾰족한 꼭대기 + 앞이 갈라져 올라간 챙 (몽골 귀족)
        return (
            f'<path d="M 196 196 C 200 120 262 60 300 22 C 338 60 400 120 404 196 Z" fill="{col}"/>'
            f'<path d="M 300 22 C 338 60 400 120 404 196 L 360 196 C 356 130 330 70 300 22 Z" fill="{shade(col, 0.74)}" stroke="none"/>'
            f'<circle cx="300" cy="20" r="12" fill="{c.get("trim", "#d9b45a")}"/>'
            f'<path d="M 152 214 C 150 170 226 160 292 176 L 300 200 L 308 176 C 374 160 450 170 448 214 C 380 204 220 204 152 214 Z" fill="{fur}"/>'
            f'<path d="M 152 214 C 220 204 380 204 448 214 C 452 232 432 240 416 236 C 360 226 240 226 184 236 C 168 240 148 232 152 214 Z" fill="{shade(fur, 0.82)}"/>'
            + (f'<path d="M 292 92 h 16 v 16 h 16 v 16 h -16 v 22 h -16 v -22 h -16 v -16 h 16 Z" fill="{c["hat_mark"]}" stroke-width="4"/>' if c.get("hat_mark") else "")
        )
    if kind == "cuman":  # 쿠만: 끝이 살짝 꺾인 높은 펠트 모자 + 위로 젖힌 털 챙
        return (
            f'<path d="M 194 200 C 200 120 250 50 330 6 C 340 30 334 50 322 62 C 380 110 402 150 406 200 Z" fill="{col}"/>'
            f'<path d="M 322 62 C 380 110 402 150 406 200 L 366 200 C 362 150 346 100 322 62 Z" fill="{shade(col, 0.74)}" stroke="none"/>'
            f'<path d="M 250 120 C 270 100 290 84 310 74" fill="none" stroke="{shade(col, 1.3)}" stroke-width="6"/>'
            f'<path d="M 156 214 C 140 176 196 166 230 178 C 280 168 320 168 370 178 C 404 166 460 176 444 214 C 380 202 220 202 156 214 Z" fill="{fur}"/>'
            f'<path d="M 156 214 C 220 202 380 202 444 214 C 448 230 430 238 414 234 C 360 224 240 224 186 234 C 170 238 152 230 156 214 Z" fill="{shade(fur, 0.8)}"/>'
            + "".join(f'<path d="M {x} 196 l {6 + (x % 3)} -13" fill="none" stroke="{shade(fur, 1.35)}" stroke-width="4"/>' for x in range(180, 430, 28))
        )
    if kind == "rus_helmet":  # 루스 원뿔 투구 (쉬샤크) - 사슬 목가리개는 hat_back
        steel = c.get("hat_color", "#9a9c96")
        return (
            f'<path d="M 172 232 C 170 150 236 92 300 12 C 364 92 430 150 428 232 Z" fill="{steel}"/>'
            f'<path d="M 300 12 C 364 92 430 150 428 232 L 380 232 C 378 150 346 84 300 12 Z" fill="{shade(steel, 0.72)}" stroke="none"/>'
            f'<path d="M 236 170 C 250 120 272 80 296 40" fill="none" stroke="{shade(steel, 1.6)}" stroke-width="9"/>'
            f'<path d="M 300 12 L 300 -6" stroke-width="9"/><circle cx="300" cy="-8" r="7" fill="{c.get("trim", "#d9a92e")}"/>'
            f'<path d="M 166 222 Q 300 200 434 222 L 434 246 Q 300 224 166 246 Z" fill="{c.get("trim", "#d9a92e")}"/>'
            + "".join(f'<circle cx="{x}" cy="{233 - 9 * (1 - ((x - 300) / 134) ** 2)}" r="4" fill="{shade(c.get("trim", "#d9a92e"), 0.7)}" stroke="none"/>' for x in range(190, 420, 26))
            + f'<path d="M 292 244 L 300 312 L 308 244 Z" fill="{steel}" stroke-width="5"/>'  # 코가리개
        )
    if kind == "crown_cap":  # 키예프 대공 모자: 둥근 금실 모자 + 검은 담비 털 띠 + 작은 십자가
        gold = c.get("hat_color", "#c99a3a")
        return (
            f'<path d="M 190 196 C 186 90 414 90 410 196 Z" fill="{gold}"/>'
            f'<path d="M 350 104 C 396 124 414 160 410 196 L 366 196 C 366 160 360 126 350 104 Z" fill="{shade(gold, 0.74)}" stroke="none"/>'
            + "".join(f'<path d="M {x} 196 Q {300 + (x - 300) * 0.55} 130 300 92" fill="none" stroke="{shade(gold, 0.7)}" stroke-width="4"/>' for x in (230, 265, 335, 370))
            + "".join(f'<circle cx="{x}" cy="{y}" r="8" fill="{col2}" stroke-width="3"/>' for x, y, col2 in ((248, 150, "#2a5db0"), (300, 128, "#8b2f22"), (352, 150, "#2a5db0")))
            + '<path d="M 300 92 L 300 52 M 286 66 L 314 66" fill="none" stroke-width="7"/><circle cx="300" cy="92" r="9" fill="#f3ead6"/>'
            f'<path d="M 156 200 C 170 168 430 168 444 200 C 456 222 438 240 418 236 C 360 222 240 222 182 236 C 162 240 144 222 156 200 Z" fill="{fur}"/>'
            + "".join(f'<path d="M {x} 206 l {5 + (x % 3)} -12" fill="none" stroke="{shade(fur, 1.5)}" stroke-width="3"/>' for x in range(176, 430, 22))
        )
    if kind == "georgian_crown":  # 조지아 여왕관: 금 띠 + 십자가 끝 + 보석 (면사포는 hat_back)
        gold = c.get("hat_color", "#d6a838")
        pts = "M 192 206 L 192 150 L 222 172 L 246 118 L 274 160 L 300 100 L 326 160 L 354 118 L 378 172 L 408 150 L 408 206 Z"
        return (
            f'<path d="{pts}" fill="{gold}"/>'
            f'<path d="M 300 100 L 326 160 L 354 118 L 378 172 L 408 150 L 408 206 L 350 206 Z" fill="{shade(gold, 0.78)}" stroke="none"/>'
            + "".join(f'<path d="M {x} {y} l 0 -22 M {x - 8} {y - 14} l 16 0" fill="none" stroke-width="5"/>' for x, y in ((246, 118), (300, 100), (354, 118)))
            + f'<path d="M 186 196 Q 300 180 414 196 L 414 222 Q 300 206 186 222 Z" fill="{shade(gold, 0.9)}"/>'
            + "".join(f'<circle cx="{x}" cy="{208 - 6 * (1 - ((x - 300) / 114) ** 2)}" r="{9 if x == 300 else 6}" fill="{g}" stroke-width="3"/>' for x, g in ((220, "#2e6b4f"), (260, "#8b2f22"), (300, "#2a5db0"), (340, "#8b2f22"), (380, "#2e6b4f")))
        )
    if kind == "boqta":  # 몽골 귀부인 보크타: 머리에 맞는 모자 + 높은 기둥 + 위가 벌어진 꼭대기 + 깃털
        red = c.get("hat_color", "#8b2f22")
        gold = c.get("trim", "#d9b45a")
        return (
            f'<path d="M 182 226 C 176 120 424 120 418 226 C 360 210 240 210 182 226 Z" fill="{red}"/>'
            f'<path d="M 272 140 C 270 90 262 40 254 8 L 346 8 C 338 40 330 90 328 140 Z" fill="{red}"/>'
            f'<path d="M 304 140 C 306 90 312 40 318 8 L 346 8 C 338 40 330 90 328 140 Z" fill="{shade(red, 0.72)}" stroke="none"/>'
            f'<path d="M 238 14 Q 300 -8 362 14 L 352 30 Q 300 16 248 30 Z" fill="{gold}"/>'
            f'<path d="M 268 60 L 332 60 M 266 96 L 334 96" fill="none" stroke="{gold}" stroke-width="7"/>'
            f'<path d="M 182 226 C 240 210 360 210 418 226" fill="none" stroke="{gold}" stroke-width="12"/>'
            f'<circle cx="300" cy="186" r="13" fill="{gold}"/><circle cx="300" cy="186" r="5" fill="#2e6b4f" stroke="none"/>'
        )
    if kind == "turban_helmet":  # 터번을 감은 뾰족 투구 (호라즘 전사)
        steel = c.get("steel", "#9a9c96")
        cloth = c.get("hat_color", "#efe4cc")
        return (
            f'<path d="M 206 186 C 206 110 254 70 300 24 C 346 70 394 110 394 186 Z" fill="{steel}"/>'
            f'<path d="M 300 24 C 346 70 394 110 394 186 L 352 186 C 350 120 330 70 300 24 Z" fill="{shade(steel, 0.72)}" stroke="none"/>'
            f'<path d="M 252 140 C 262 100 280 70 298 46" fill="none" stroke="{shade(steel, 1.6)}" stroke-width="8"/>'
            f'<path d="M 300 24 L 300 0" stroke-width="8"/>'
            f'<path d="M 166 230 C 150 170 450 170 434 230 C 400 212 200 212 166 230 Z" fill="{cloth}"/>'
            f'<path d="M 172 206 C 260 176 350 186 428 214 M 180 184 C 250 168 330 170 410 190" fill="none" stroke-width="4"/>'
            f'<path d="M 300 196 l -12 16 l 12 16 l 12 -16 Z" fill="{c.get("trim", "#2e8b57")}"/>'
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
    if kind == "droop":  # 턱까지 늘어진 콧수염만 (쿠만·루스)
        return f'<path d="M 300 336 C 272 332 252 346 246 372 C 238 400 232 424 226 440 C 246 420 252 392 262 368 C 274 354 288 350 300 352 C 312 350 326 354 338 368 C 348 392 354 420 374 440 C 368 424 362 400 354 372 C 348 346 328 332 300 336 Z" fill="{col}"/>'
    if kind == "short":  # 짧게 다듬은 턱수염 + 콧수염
        return (
            f'<path d="M 188 316 C 192 400 240 440 300 444 C 360 440 408 400 412 316 C 396 370 368 396 300 398 C 232 396 204 370 188 316 Z" fill="{col}"/>'
            f'<path d="M 300 340 C 276 334 256 344 250 360 C 270 352 286 352 300 356 C 314 352 330 352 350 360 C 344 344 324 334 300 340 Z" fill="{col}"/>'
        )
    if kind == "long":  # 가슴까지 내려오는 긴 수염 (노인 왕)
        return (
            f'<path d="M 184 320 C 186 420 230 470 252 540 C 270 580 290 600 300 610 C 310 600 330 580 348 540 C 370 470 414 420 416 320 C 398 376 366 400 300 402 C 234 400 202 376 184 320 Z" fill="{col}"/>'
            f'<path d="M 262 440 C 270 500 284 550 296 590 M 338 440 C 330 500 316 550 304 590 M 300 410 L 300 600" fill="none" stroke="{shade(col, 0.75)}" stroke-width="3"/>'
            f'<path d="M 300 338 C 270 332 250 344 242 366 C 262 356 284 354 300 358 C 316 354 338 356 358 366 C 350 344 330 332 300 338 Z" fill="{col}"/>'
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
    out = [hat_back(c), hair_back(c)]
    if view == "side":
        out.append(f'<ellipse cx="190" cy="290" rx="22" ry="32" fill="{skin}"/>')
        out.append(f'<path d="{FACE_SIDE}" fill="{skin}"/>')
        out.append(f'<path d="M 214 230 C 196 290 206 370 270 418 C 220 400 180 340 214 230 Z" fill="{shade(skin, 0.86)}" stroke="none"/>')
    else:
        out.append(f'<ellipse cx="172" cy="285" rx="20" ry="30" fill="{skin}"/><ellipse cx="428" cy="285" rx="20" ry="30" fill="{skin}"/>')
        out.append(f'<path d="{FACES.get(c.get("face", "oval"), FACE)}" fill="{skin}"/>')
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
    return svg("".join(out), MAIL)


def eyes_layer(c, closed, view, expr):
    if closed or expr == "happy":  # 기쁨은 눈웃음(∩)
        d = "M 218 288 Q 242 266 266 288 M 334 288 Q 358 266 382 288" if expr == "happy" and not closed else "M 218 284 Q 242 296 266 284 M 334 284 Q 358 296 382 284"
        return svg(feat(view, f'<path d="{d}" fill="none" stroke-width="7"/>'))
    col = c.get("eye_color", "#2b1d14")
    if expr == "shocked":  # 동그랗게 커진 눈 + 작은 눈동자
        return svg(feat(view, "".join(
            f'<circle cx="{x}" cy="280" r="22" fill="#fbf4e4"/><circle cx="{x}" cy="281" r="6" fill="{col}" stroke="none"/>' for x in (242, 358)
        )))
    ry = {"narrow": 11, "round": 18}.get(c.get("eyes", "almond"), 16)
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


# 발음 입 모양 9개 (Rhubarb Lip Sync 기호, 2026-10-21): 목소리를 음소로 풀어 프레임마다 고른다
#   X 쉼 · A 입술 닫힘(ㅁ·ㅂ·ㅍ, M·B·P) · B 살짝 벌림(대부분 자음) · C 벌림(에·애) · D 크게(아)
#   E 둥글게(오·어) · F 오므림(우·W) · G 윗니가 아랫입술(F·V) · H 혀 올림(L)
VISEMES = "XABCDEFGH"


def viseme_layer(code, c, view, expr):
    if code == "X":
        return mouth_layer(0, c, view, expr)
    if expr == "shocked":  # 놀람은 모양과 상관없이 둥근 입, 크기만 따라감
        ry = {"A": 10, "B": 13, "F": 12, "G": 13}.get(code, 20)
        return svg(feat(view, f'<ellipse cx="300" cy="{372 + ry * 0.3}" rx="{12 + ry * 0.2}" ry="{ry}" fill="#5a1f19"/>'))
    lip = shade(c["skin"], 0.62)
    up = -6 if expr == "happy" else (3 if expr == "sad" else 0)  # 입꼬리
    top = 366
    if code == "A":  # 닫힌 입술: 조금 도톰한 한 줄
        return svg(feat(view, f'<path d="M 278 {370 + up} Q 300 374 322 {370 + up}" fill="none" stroke-width="7"/>'
                              f'<path d="M 284 376 Q 300 381 316 376" fill="none" stroke="{lip}" stroke-width="4"/>'))
    # 모양별 (반너비, 높이, 윗니, 아랫니, 혀, 둥글기)
    w, h, teeth_t, teeth_b, tongue, rnd = {
        "B": (22, 9, True, True, False, 0),
        "C": (26, 18, True, False, False, 0),
        "D": (28, 32, True, False, True, 0),
        "E": (19, 22, False, False, True, 0.6),
        "F": (11, 13, False, False, False, 1),
        "G": (22, 10, True, False, False, 0),
        "H": (24, 22, True, False, True, 0),
    }[code]
    if expr == "angry":
        w, teeth_b = w + 4, True
    cy = top + h / 2
    if rnd:  # 둥근 입은 타원 + 두꺼운 입술 테
        body = f'<ellipse cx="300" cy="{cy}" rx="{w}" ry="{h / 2 + 2}" fill="#5a1f19"/><ellipse cx="300" cy="{cy}" rx="{w + 5}" ry="{h / 2 + 6}" fill="none" stroke="{lip}" stroke-width="5"/>'
    else:
        body = f'<path d="M {300 - w} {top + up} Q 300 {top - 6} {300 + w} {top + up} Q {300 + w * 0.75} {top + h} 300 {top + 2 + h} Q {300 - w * 0.75} {top + h} {300 - w} {top + up} Z" fill="#5a1f19"/>'
    if tongue:
        body += f'<ellipse cx="300" cy="{top + h * 0.8}" rx="{w * 0.55}" ry="{max(4, h * 0.22)}" fill="#c5534a" stroke="none"/>'
    if teeth_t:
        body += f'<path d="M {300 - w + 6} {top + 1} L {300 + w - 6} {top + 1} L {300 + w - 8} {top + min(8, h * 0.45)} L {300 - w + 8} {top + min(8, h * 0.45)} Z" fill="#fbf4e4" stroke="none"/>'
    if teeth_b:
        body += f'<path d="M {300 - w + 9} {top + h - 4} L {300 + w - 9} {top + h - 4} L {300 + w - 11} {top + h} L {300 - w + 11} {top + h} Z" fill="#fbf4e4" stroke="none"/>'
    if code == "G":  # 아랫입술을 윗니가 문다
        body += f'<path d="M {300 - w + 2} {top + h} Q 300 {top + h + 8} {300 + w - 2} {top + h}" fill="none" stroke="{lip}" stroke-width="6"/>'
    if not rnd:
        body += f'<path d="M {300 - w} {top + up} Q 300 {top - 6} {300 + w} {top + up}" fill="none" stroke="{lip}" stroke-width="3"/>'
    return svg(feat(view, body))


# ---------- 팔·손짓 (2026-10-21) ----------
# 상반신 그림이라 팔은 화면 아래에서 올라오는 겹 하나(arm_<손짓>.svg). 장면표 "gesture"로 고르면 영상에서 스프링으로 올라온다
#   point 가리킴 · fist 주먹 · open 두 손을 펼침(설명·하소연)
GESTURES = ("point", "fist", "open")


def hand(kind, skin):
    """손목이 (0,0), 손끝이 위(-y)인 손 하나"""
    dk = shade(skin, 0.82)
    if kind == "palm":
        fingers = "".join(f'<rect x="{x - 8}" y="{top}" width="16" height="{-top - 52}" rx="8" fill="{skin}" stroke-width="5"/>'
                          for x, top in ((-24, -122), (-8, -136), (8, -132), (24, -116)))
        thumb = f'<path d="M -28 -22 C -48 -34 -68 -58 -64 -74 C -58 -86 -44 -78 -26 -56 Z" fill="{skin}" stroke-width="5"/>'
        return (fingers + thumb
                + f'<path d="M -34 -70 C -36 -40 -30 -6 0 2 C 30 -6 36 -40 34 -70 C 20 -78 -20 -78 -34 -70 Z" fill="{skin}" stroke-width="5"/>'
                + f'<path d="M -14 -40 Q 0 -28 12 -44" fill="none" stroke="{dk}" stroke-width="4"/>')
    # 앞에서 본 주먹: 손바닥 덩어리 + 말아 쥔 손가락 네 마디(위) + 가로지르는 엄지
    point = kind == "point"
    palm = f'<path d="M -36 -58 C -38 -30 -32 -4 0 0 C 32 -4 38 -30 36 -58 Z" fill="{skin}" stroke-width="5"/>'
    knuck = "".join(f'<rect x="{x}" y="-88" width="19" height="40" rx="9.5" fill="{skin}" stroke-width="5"/>'
                    for i, x in enumerate((-38, -19, 0, 19)) if not (point and i == 0))
    index = '<rect x="-38" y="-168" width="21" height="120" rx="10.5" fill="{}" stroke-width="5"/>'.format(skin) if point else ""
    thumb = f'<path d="M -40 -50 C -40 -60 -30 -62 -20 -60 L 14 -54 C 24 -52 24 -38 14 -36 L -24 -34 C -36 -34 -40 -40 -40 -50 Z" fill="{skin}" stroke-width="5"/>'
    shade_ = f'<path d="M 22 -30 C 30 -24 30 -10 18 -4" fill="none" stroke="{dk}" stroke-width="4"/>'
    return index + palm + knuck + thumb + shade_


def arm(c, x0, y0, x1, y1, rot_extra, kind, mirror=False, w0=70, w1=42):
    """화면 아래 (x0,y0)에서 손목 (x1,y1)까지 소매 + 손"""
    import math

    cloth = c.get("sleeve", c.get("cloth", "#8b3a2b"))
    trim = c.get("cuff", c.get("trim", "#d9b45a"))
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    nx, ny = -dy / L, dx / L  # 팔 방향에 수직
    a = math.degrees(math.atan2(dx, -dy))
    p = lambda x, y, w: f"{x + nx * w:.1f} {y + ny * w:.1f}"  # noqa: E731
    mx, my = x0 + dx * 0.5, y0 + dy * 0.5
    sl = (f'<path d="M {p(x0, y0, -w0)} Q {p(mx, my, -(w0 + w1) / 2 - 8)} {p(x1, y1, -w1)} L {p(x1, y1, w1)} Q {p(mx, my, (w0 + w1) / 2 + 8)} {p(x0, y0, w0)} Z" fill="{cloth}"/>'
          f'<path d="M {p(x0, y0, w0 * 0.55)} Q {p(mx, my, (w0 + w1) / 2 * 0.55)} {p(x1, y1, w1 * 0.5)} L {p(x1, y1, w1 * 0.9)} Q {p(mx, my, (w0 + w1) / 2 + 2)} {p(x0, y0, w0 * 0.95)} Z" fill="{shade(cloth, 0.75)}" stroke="none"/>')
    cuff = f'<rect x="{-w1 - 6}" y="-10" width="{2 * w1 + 12}" height="24" rx="10" fill="{trim}" stroke-width="5" transform="translate({x1} {y1}) rotate({a:.1f})"/>'
    flip = " scale(-1 1)" if mirror else ""
    h = f'<g transform="translate({x1 + dx / L * 8:.1f} {y1 + dy / L * 8:.1f}) rotate({a + rot_extra:.1f}){flip} scale(1.22)">{hand(kind, c["skin"])}</g>'
    return h + sl + cuff


def arms_layer(c, view, gesture):
    s = 22 if view == "side" else 0  # 옆모습은 손을 더 앞(오른쪽)으로
    if gesture == "point":
        # 손끝이 판(600×720) 밖으로 나가지 않게: 정면은 오른쪽 위, 옆모습은 앞쪽 비스듬히
        return svg(arm(c, 400, 790, 450, 560, 30, "point") if view == "side" else arm(c, 396, 790, 462, 524, 16, "point"))
    if gesture == "fist":
        return svg(arm(c, 400 + s, 790, 404 + s, 572, -6, "fist"))
    if gesture == "open":
        return svg(arm(c, 140 + s, 790, 150 + s, 592, -30, "palm", mirror=True) + arm(c, 460 + s, 790, 450 + s, 592, 30, "palm"))
    return svg("")


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
                **{f"mouth{v}": viseme_layer(v, c, view, expr) for v in VISEMES},
                **{f"arm_{g}": arms_layer(c, view, g) for g in GESTURES},
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


RHUBARB = Path.home() / "src/rhubarb/rhubarb"


def visemes(wav, text, lang, fps):
    """Rhubarb로 목소리 → 프레임마다 입 모양 글자(X·A~H). 영어는 대사 글로 음소를 맞추고, 다른 언어는 소리만으로(phonetic)"""
    import subprocess, tempfile

    with tempfile.TemporaryDirectory() as tmp:
        cmd = [str(RHUBARB), "-q", "--machineReadable", "-f", "tsv", "--extendedShapes", "GHX"]
        if lang == "en" and text:
            dialog = Path(tmp) / "d.txt"
            dialog.write_text(text)
            cmd += ["-d", str(dialog)]
        else:
            cmd += ["-r", "phonetic"]
        out = subprocess.run(cmd + [str(wav)], capture_output=True, text=True, check=True).stdout
    cues = [(float(t), v) for t, v in (l.split("\t") for l in out.strip().splitlines())]
    with __import__("wave").open(str(wav)) as w:
        n = int(w.getnframes() / w.getframerate() * fps) + 1
    res, k = [], 0
    for f in range(n):
        while k + 1 < len(cues) and cues[k + 1][0] <= f / fps:
            k += 1
        res.append(cues[k][1] if cues else "X")
    return "".join(res)


def mouth(ep_path):
    """목소리 wav → 프레임마다 입 모양. Rhubarb가 있으면 발음 입 모양 9개(X·A~H), 없으면 크기로 0(닫힘)·1·2(크게). 장면 길이·fps는 timeline.json 기준"""
    import wave

    import numpy as np

    ep = Path(ep_path)
    base = ROOT / "public/ep" / ep.parent.name / ep.stem
    tl = json.loads((base / "timeline.json").read_text())
    fps = tl["fps"]
    res = {}
    for sc in tl["scenes"]:
        langs = [("en", sc.get("vo"), sc.get("text")), *((l, p, (sc.get("i18n") or {}).get(l)) for l, p in (sc.get("vo_i18n") or {}).items())]
        for lang, path, text in langs:
            if not path or path in res:
                continue
            f = ROOT / "public" / path
            if not f.exists():
                continue
            if RHUBARB.exists():
                try:
                    res[path] = visemes(f, text, lang, fps)
                    continue
                except Exception as e:  # noqa: BLE001 - 한 줄 실패는 크기 방식으로
                    print(f"  입 모양(Rhubarb) 실패 {path}: {e}")
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
