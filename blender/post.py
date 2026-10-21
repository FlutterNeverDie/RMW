# 시네마틱 필름 마감 - 블렌더가 찍은 선형 EXR → 바랜 지도 톤 JPEG 95 (render_shot.py가 부름)
#   OPENCV_IO_ENABLE_OPENEXR=1 .venv/bin/python -I blender/post.py <exr 폴더> <출력 폴더> '<grade json>' <scale>
# 순서: 노출 → 빛 번짐(bloom, 해 둘레 붉은 halation) → 필름 곡선 → 바랜 톤(세피아 그늘·크림 하이라이트) → 채도 → 비네트 → 입자(프레임 번호로 씨앗 고정)
import json
import os
import sys
from multiprocessing import Pool
from pathlib import Path

import cv2
import numpy as np

SRC, DST = Path(sys.argv[1]), Path(sys.argv[2])
G = {**{
    "exposure": 0.0,        # 노출 (스톱)
    "bloom": 0.06,          # 밝은 곳 번짐 세기
    "bloom_threshold": 1.0,
    "lift": [0.085, 0.068, 0.058],   # 가장 어두운 곳의 색 (바랜 세피아, sRGB 0~1)
    "white": [0.975, 0.955, 0.905],  # 가장 밝은 곳의 색 (크림)
    "contrast": 1.0,
    "saturation": 0.82,
    "vignette": 0.22,
    "grain": 0.016,
}, **json.loads(sys.argv[3] if len(sys.argv) > 3 else "{}")}
SCALE = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0


def aces(x):
    return np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)


def to_srgb(x):
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(np.maximum(x, 0), 1 / 2.4) - 0.055)


def one(f):
    x = cv2.imread(str(f), cv2.IMREAD_UNCHANGED)[..., :3].astype(np.float32)  # BGR 선형
    h, w = x.shape[:2]
    x *= 2 ** G["exposure"]
    # 빛 번짐: 1/4 크기에서 여러 반경
    hi = np.maximum(x - G["bloom_threshold"], 0)
    sm = cv2.resize(hi, (w // 4, h // 4), interpolation=cv2.INTER_AREA)
    bl = np.zeros_like(sm)
    for s, wt in ((3, 0.5), (12, 0.3), (40, 0.2)):
        bl += wt * cv2.GaussianBlur(sm, (0, 0), s * SCALE)
    bl = cv2.resize(bl, (w, h), interpolation=cv2.INTER_LINEAR)
    x += G["bloom"] * 12 * bl * np.array([0.75, 0.92, 1.15], np.float32)  # BGR - 붉은 halation
    # 필름 곡선 + 대비
    y = aces(x * 0.8)
    if G["contrast"] != 1:
        y = np.clip(0.5 + (y - 0.5) * G["contrast"], 0, 1)
    y = to_srgb(y)
    # 바랜 톤: 검정은 세피아로 들어 올리고 흰색은 크림으로 낮춤
    lift = np.array(G["lift"][::-1], np.float32)
    white = np.array(G["white"][::-1], np.float32)
    y = lift + (white - lift) * y
    lum = y @ np.array([0.0722, 0.7152, 0.2126], np.float32)
    y = lum[..., None] + (y - lum[..., None]) * G["saturation"]
    # 비네트
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.hypot((xx - w / 2) / (w / 2), (yy - h / 2) / (h / 2)) / 1.414
    y *= (1 - G["vignette"] * r ** 2.2)[..., None]
    # 필름 입자 (프레임마다 다르지만 매번 같은 씨앗)
    rng = np.random.default_rng(int(f.stem) + 1234)
    n = rng.standard_normal((h, w), np.float32)
    n = cv2.GaussianBlur(n, (0, 0), 0.65 * SCALE)
    n /= n.std() + 1e-6
    y += (G["grain"] * n * (0.35 + 0.65 * np.sqrt(np.clip(lum * (1 - lum) * 4, 0, 1))))[..., None]
    out = np.clip(y * 255 + 0.5, 0, 255).astype(np.uint8)
    cv2.imwrite(str(DST / f"{f.stem}.jpg"), out, [cv2.IMWRITE_JPEG_QUALITY, 95])


if __name__ == "__main__":
    files = sorted(SRC.glob("*.exr"))
    DST.mkdir(parents=True, exist_ok=True)
    with Pool(min(6, os.cpu_count() or 4)) as p:
        p.map(one, files)
    print(f"[post] {len(files)}장 → {DST}", flush=True)
