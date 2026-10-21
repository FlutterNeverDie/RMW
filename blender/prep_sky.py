# 시네마틱 하늘 준비 - Poly Haven CC0 HDRI(구름 있는 노을·새벽 하늘)를 받아 재 둔다 (render_shot.py가 부름)
#   .venv/bin/python -I blender/prep_sky.py <hdri id> [해상도 8k]
# 결과(data/geo/hdri/, git 밖):
#   <id>_<res>.hdr        원본 (https://polyhaven.com/a/<id>, CC0, 로그인 없는 공식 다운로드 주소)
#   <id>_horizon.exr      방위별 지평선 띠(고도 1~6°) 색 1024칸 - 땅의 공기 원근 색과 하늘 아랫단을 이어 붙인다
#   <id>.json             해 방위·고도(HDRI 안), 해 색, 하늘빛(위 반구 평균) 색, 노출 배율(지평선 밝기를 0.5에 맞춤)
# 방향 규칙은 블렌더 환경 텍스처와 같다: u = -atan2(y, x)/2π + 0.5, v = 고도/π + 0.5 (x=동, y=북) - 렌더로 해 위치를 확인함
import json
import math
import os
import sys
import urllib.request
from pathlib import Path

os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "1")
import cv2  # noqa: E402
import numpy as np  # noqa: E402

CODE = Path(__file__).resolve().parent.parent
DIR = CODE / "data/geo/hdri"


def to_srgb(c):
    c = np.clip(np.asarray(c, np.float64), 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def main():
    hid = sys.argv[1]
    res = sys.argv[2] if len(sys.argv) > 2 else "8k"
    DIR.mkdir(parents=True, exist_ok=True)
    f = DIR / f"{hid}_{res}.hdr"
    if not f.exists():
        ua = {"User-Agent": "RMW-cinematic/1.0 (local render)"}  # 기본 파이썬 UA는 403
        with urllib.request.urlopen(urllib.request.Request(f"https://api.polyhaven.com/files/{hid}", headers=ua), timeout=60) as r:
            url = json.load(r)["hdri"][res]["hdr"]["url"]
        print(f"[sky] 받는 중 {url}", flush=True)
        tmp = f.with_suffix(".part")
        with urllib.request.urlopen(urllib.request.Request(url, headers=ua), timeout=600) as r:
            tmp.write_bytes(r.read())
        tmp.rename(f)
    im = cv2.imread(str(f), cv2.IMREAD_UNCHANGED)[..., ::-1].astype(np.float32)  # RGB 선형
    H, W = im.shape[:2]
    lum = im @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    el = (0.5 - (np.arange(H) + 0.5) / H) * 180  # 행별 고도 (도)
    phi = ((np.arange(W) + 0.5) / W - 0.5) * 2 * math.pi
    azc = np.degrees(np.arctan2(np.cos(phi), -np.sin(phi))) % 360  # 열별 방위 (북 기준 시계): x = cos φ, y = -sin φ

    # 해: 위 반구에서 흐린 밝기가 가장 큰 곳
    up = lum[: H // 2]
    sb = cv2.GaussianBlur(up, (0, 0), W / 2000)
    r, c = np.unravel_index(np.argmax(sb), sb.shape)
    sun_az, sun_el = float(azc[c]), float(el[r])
    rad = max(3, int(W / 360 * 0.8))
    patch = im[max(0, r - rad):r + rad, max(0, c - rad):c + rad].reshape(-1, 3)
    pl = patch @ np.array([0.2126, 0.7152, 0.0722])
    core = patch[pl >= np.percentile(pl, 90)].mean(0)
    sun_col = core / core.max()

    # 해 쪽 25° 안은 빼고 잰다 (구름 색·하늘빛이 해에 끌려가지 않게)
    E, A = np.meshgrid(np.radians(el), np.radians(azc), indexing="ij")
    sv = np.array([math.sin(math.radians(sun_az)) * math.cos(math.radians(sun_el)),
                   math.cos(math.radians(sun_az)) * math.cos(math.radians(sun_el)), math.sin(math.radians(sun_el))])
    cosd = np.cos(E) * np.sin(A) * sv[0] + np.cos(E) * np.cos(A) * sv[1] + np.sin(E) * sv[2]
    far = cosd < math.cos(math.radians(25))

    band = (el >= 1) & (el <= 6)
    bl = lum[band][far[band]]
    k = 0.5 / float(np.median(bl))  # 노출 배율: 지평선 띠 중앙값 → 0.5

    # 하늘빛: 위 반구 cos 가중 평균 (해 원반 근처 제외, 너무 밝은 점은 자름)
    w = np.clip(np.sin(np.radians(el)), 0, 1)[:, None] * np.cos(np.radians(el))[:, None] * far
    clipv = np.minimum(im, np.percentile(lum[: H // 2], 99.5))
    amb = (clipv * w[..., None]).sum((0, 1)) / w.sum()
    amb_col = amb / amb.max()

    # 방위별 지평선 띠 색 (밝은 해 점은 띠 중앙값의 4배로 자름) → 1024칸, 방위로 부드럽게
    bandim = im[band]
    bm = np.median(bandim @ np.array([0.2126, 0.7152, 0.0722]))
    bl_all = bandim @ np.array([0.2126, 0.7152, 0.0722])
    bandim = bandim * np.minimum(1, 4 * bm / np.maximum(bl_all, 1e-6))[..., None]
    lut = bandim.mean(0)  # (W, 3)
    lut = cv2.resize(lut[None], (1024, 1), interpolation=cv2.INTER_AREA)[0]
    lut = cv2.GaussianBlur(np.tile(lut, (3, 1, 1)).reshape(3, 1024, 3), (0, 0), sigmaX=4, sigmaY=0.01)[1] * k
    cv2.imwrite(str(DIR / f"{hid}_horizon.exr"), np.repeat(lut[None], 4, 0)[..., ::-1].astype(np.float32))

    out = {
        "id": hid, "file": f.name, "url": f"https://polyhaven.com/a/{hid}", "license": "CC0",
        "exposure": k, "sun_azimuth_in_hdri": sun_az, "sun_elevation": sun_el,
        "sun_color_srgb": [round(float(v), 3) for v in to_srgb(sun_col)],
        "ambient_srgb": [round(float(v), 3) for v in to_srgb(amb_col)],
        "horizon_lut": f"{hid}_horizon.exr", "size": [W, H],
    }
    (DIR / f"{hid}.json").write_text(json.dumps(out, indent=1))
    print(f"[sky] {hid}: 해 방위 {sun_az:.1f}° 고도 {sun_el:.1f}°, 노출 ×{k:.3f}, 해 색 {out['sun_color_srgb']}, 하늘빛 {out['ambient_srgb']}", flush=True)


if __name__ == "__main__":
    main()
