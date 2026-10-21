# 장 카드·엔딩 화면용 지도 실루엣 (2026-10-21): 이름 없는 사이트 지도(NAMES=off) → 먹선 해안선 + 제국 영역 마스크
#   .venv/bin/python -I scripts/title-art.py mongol    public/series/mongol/{land,empire}.png
# land.png = 땅을 옅은 먹으로 + 해안선 먹선(투명 배경), empire.png = 제국 영역(흰색 알파, 영상에서 바랜 붉은 물감으로 번지게 칠함)
# empire-<10년>.png = 그 시절 제국 영역 (같은 틀로 찍은 이름 있는 지도 세트에서 색만 뽑음 - 글자 구멍은 메움). 연도 카드는 가까운 10년 것을 씀
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
# 시리즈 → (원본 지도, 제국 색 RGB)
SERIES = {"mongol": ("public/clean/banner3/1279-nonames.png", (187, 207, 212), (1400, 560))}  # (지도, 제국 색, 제국 안 한 점)
# 10년 단위 세트 (같은 틀 2560×1440): 시리즈 → (폴더, 제국 안 한 점)
DECADES = {"mongol": ("public/clean/mg-wide", (1330, 600))}
# 사이트 지도에 아직 나라가 없는 시절은 고향 땅에 번진 얼룩으로 (경계를 주장하지 않게 가장자리를 흐리게): 연도 → (가운데, 반지름 x·y)
BLOBS = {"mongol": {"1200": ((1480, 610), (150, 72)), "1210": ((1460, 620), (190, 92))}}
INK = (43, 29, 20)


def soft(mask, grow=0, blur=1.5):
    im = Image.fromarray((mask * 255).astype(np.uint8))
    im = im.filter(ImageFilter.MedianFilter(5))
    if grow:
        im = im.filter(ImageFilter.MaxFilter(grow))
    return im.filter(ImageFilter.GaussianBlur(blur))


def fill_holes(mask):
    """둘러싸인 구멍(글자 자리)을 메움: 바깥에서 들어갈 수 없는 빈칸 = 구멍"""
    from PIL import ImageDraw

    # 글자 획 사이 틈으로 바깥이 새어 들지 않게 살짝 닫은 뒤 바깥을 칠함
    closed = np.array(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))) > 0
    inv = Image.fromarray(np.pad(~closed, 1, constant_values=True).astype(np.uint8) * 255).copy()
    ImageDraw.floodfill(inv, (0, 0), 128)
    outside = np.array(inv)[1:-1, 1:-1] == 128
    # 경계에 걸친 글자 자리(바깥으로 열린 홈)는 한 번 더 크게 닫아서 메움
    full = Image.fromarray(((mask | ~outside) * 255).astype(np.uint8))
    return np.array(full.filter(ImageFilter.MaxFilter(31)).filter(ImageFilter.MinFilter(31))) > 0


def make(name):
    src, emp, seed = SERIES[name]
    a = np.array(Image.open(ROOT / src).convert("RGB")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    sea = (b - r >= 30) & (b >= 215)  # 바다 + 위경도 격자선
    empire = (np.abs(a - np.array(emp)).sum(-1) <= 12)
    land = ~sea
    out = ROOT / "public/series" / name
    out.mkdir(parents=True, exist_ok=True)
    lm = soft(land, blur=0.8)
    inner = lm.filter(ImageFilter.MinFilter(5))
    coast = np.clip(np.array(lm).astype(int) - np.array(inner).astype(int), 0, 255)
    alpha = np.maximum(np.array(lm) * 0.10, coast * 0.9).astype(np.uint8)
    rgba = np.zeros((*alpha.shape, 4), np.uint8)
    rgba[..., :3] = INK
    rgba[..., 3] = alpha
    Image.fromarray(rgba).save(out / "land.png", optimize=True)
    # 같은 색인 다른 나라는 빼고 제국 덩어리(seed와 이어진 곳)만
    from PIL import ImageDraw

    m = Image.fromarray((empire * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    ImageDraw.floodfill(m, seed, 128)
    em = soft(np.array(m) == 128, grow=3, blur=2)
    e = np.zeros((*alpha.shape, 4), np.uint8)
    e[..., :3] = 255
    e[..., 3] = np.array(em)
    Image.fromarray(e).save(out / "empire.png", optimize=True)
    print(f"→ public/series/{name}/land.png, empire.png")
    if name in DECADES:
        folder, seed2 = DECADES[name]
        for f in sorted((ROOT / folder).glob("1[0-9][0-9]0.png")):
            a = np.array(Image.open(f).convert("RGB")).astype(int)
            raw = np.abs(a - np.array(emp)).sum(-1) <= 12
            m = Image.fromarray((raw * 255).astype(np.uint8)).copy()  # fromarray 그대로면 floodfill이 안 먹음
            if m.getpixel(seed2) != 255:
                if f.stem in BLOBS.get(name, {}):
                    (cx, cy), (rx, ry) = BLOBS[name][f.stem]
                    yy, xx = np.mgrid[: alpha.shape[0], : alpha.shape[1]]
                    ang = np.arctan2(yy - cy, xx - cx)
                    wob = 1 + 0.12 * np.sin(ang * 3 + 1) + 0.07 * np.sin(ang * 7 + 2)
                    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) / wob
                    e = np.zeros((*alpha.shape, 4), np.uint8)
                    e[..., :3] = 255
                    e[..., 3] = (np.clip(1.25 - d, 0, 0.25) / 0.25 * 255 * land).astype(np.uint8)
                    Image.fromarray(e).save(out / f"empire-{f.stem}.png", optimize=True)
                    print(f"  → empire-{f.stem}.png (고향 얼룩)")
                else:
                    print(f"  {f.stem}: 제국 없음")
                continue
            # 경계선으로 갈린 같은 색 이웃 나라(티베트 등)는 빼고 seed 덩어리만 → 그 안의 글자 구멍은 메움
            ImageDraw.floodfill(m, seed2, 128)
            em = soft(fill_holes(np.array(m) == 128), grow=3, blur=2)
            e = np.zeros((*alpha.shape, 4), np.uint8)
            e[..., :3] = 255
            e[..., 3] = np.array(em)
            Image.fromarray(e).save(out / f"empire-{f.stem}.png", optimize=True)
            print(f"  → empire-{f.stem}.png")


if __name__ == "__main__":
    for n in sys.argv[1:] or SERIES:
        make(n)
