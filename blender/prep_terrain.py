# 시네마틱 샷 지형 준비 - 고도·빛을 미리 구워 둔다 (render_shot.py가 캐시가 없으면 부름)
#   .venv/bin/python -I blender/prep_terrain.py blender/shots/<샷>.json <캐시 폴더>
# 결과(캐시 폴더, git 밖 data/geo/cinematic/):
#   height.npy   고도(m, float32, 격자 그대로) - 블렌더가 메시를 만들고 카메라 높이를 잰다
#   clear.npy    카메라 안전 높이(m, 주변 최고점을 넓게 부드럽게) - 1/8 해상도
#   lit.png      빛까지 구운 땅 색(16비트, 선형값 ÷ 2) - 해 그림자·하늘빛·골짜기 어둠 포함
#   aux.png      R=물, G=햇빛 몫(구름 그림자가 지울 비율), B=강가
#   meta.json    격자(extent_km·size·center·origin_km), 고도 자료 출처
#   근경 층(near/): 카메라 길 둘레만 촘촘한 격자(기본 15 m) - 같은 파일 + aux2.png(R=바위 G=눈 B=풀 A=자갈, 미세 질감용)
#     고도 = Copernicus DEM GLO-30(AWS 공개 COG, 없는 조각은 Terrain Tiles z13), 가장자리는 원경 높이로 녹여 이음매가 없다
# 출처는 blender/credits.json (설명란용)
# 자료: 근경 고도 = Copernicus DEM GLO-30 (data/geo/copdem30/), 원경 고도 = AWS Terrain Tiles(terrarium, 공개 자료·로그인 없음, data/geo/terrarium/에 캐시) 또는 ETOPO 2022 15″(data/geo/etopo15)
#       땅 색 = Natural Earth I 토지 피복(NE1_HR_LC), 해안·호수·강 = Natural Earth 10m
# 같은 입력이면 같은 결과 (난수 씨앗 고정)
import json
import math
import struct
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import geo  # noqa: E402

CODE = Path(__file__).resolve().parent.parent
GEO = CODE / "data/geo"
T0 = time.time()


def log(*a):
    print(f"[prep {time.time() - T0:5.1f}s]", *a, flush=True)


def srgb2lin(c):
    c = np.asarray(c, np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def hexlin(h):
    h = h.lstrip("#")
    return srgb2lin([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def blur(a, sigma_px):
    if sigma_px < 0.3:
        return a
    return cv2.GaussianBlur(a, (0, 0), sigma_px, borderType=cv2.BORDER_REFLECT)


# ── 셰이프파일 (Natural Earth 10m) - 필요한 것만 읽는 작은 파서 ──
def read_shp(path, bbox):
    """선·면 셰이프의 부분(part) 목록 [(점 배열 Nx2 lon/lat, 레코드 번호)] - bbox(서,남,동,북)와 겹치는 레코드만"""
    data = Path(path).read_bytes()
    out, pos, W, S, E, N = [], 100, *bbox
    while pos < len(data):
        rec_no, clen = struct.unpack(">ii", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + clen * 2]
        pos += 8 + clen * 2
        stype = struct.unpack("<i", body[:4])[0]
        if stype not in (3, 5, 13, 15, 23, 25):
            continue
        xmin, ymin, xmax, ymax = struct.unpack("<4d", body[4:36])
        if xmax < W or xmin > E or ymax < S or ymin > N:
            continue
        nparts, npts = struct.unpack("<ii", body[36:44])
        parts = list(struct.unpack(f"<{nparts}i", body[44:44 + 4 * nparts])) + [npts]
        pts = np.frombuffer(body, "<f8", npts * 2, 44 + 4 * nparts).reshape(-1, 2)
        for a, b in zip(parts[:-1], parts[1:]):
            out.append((pts[a:b], rec_no - 1))
    return out


def read_dbf_field(path, field):
    data = Path(path).read_bytes()
    nrec, hlen, rlen = struct.unpack("<IHH", data[4:12])
    fields, off, p = [], 1, 32
    while data[p] != 0x0D:
        name = data[p:p + 11].split(b"\0")[0].decode()
        flen = data[p + 16]
        fields.append((name, off, flen))
        off += flen
        p += 32
    for name, o, fl in fields:
        if name.lower() == field.lower():
            vals = []
            for r in range(nrec):
                s = data[hlen + r * rlen + o:hlen + r * rlen + o + fl].decode("latin1").strip()
                try:
                    vals.append(float(s))
                except ValueError:
                    vals.append(None)
            return vals
    return None


# ── 고도: AWS Terrain Tiles (terrarium PNG, 웹 메르카토르 256px 조각) ──
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"


def merc(lon, lat, z):
    n = 256 * 2 ** z
    X = (lon + 180) / 360 * n
    Y = (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * n
    return X, Y


def get_tile(z, x, y):
    f = GEO / "terrarium" / str(z) / str(x) / f"{y}.png"
    if not f.exists():
        f.parent.mkdir(parents=True, exist_ok=True)
        for k in range(4):
            try:
                with urllib.request.urlopen(TILE_URL.format(z=z, x=x, y=y), timeout=30) as r:
                    b = r.read()
                break
            except OSError:
                if k == 3:
                    raise
                time.sleep(1 + k)
        tmp = f.with_suffix(".part")
        tmp.write_bytes(b)
        tmp.rename(f)
    im = cv2.imread(str(f), cv2.IMREAD_COLOR)  # BGR
    im = im.astype(np.float32)
    return im[:, :, 2] * 256 + im[:, :, 1] + im[:, :, 0] / 256 - 32768


def dem_terrarium(lon, lat, cell_m, lat0, zmax):
    # 격자 칸 크기에 맞는 확대 단계 (조각 픽셀이 칸보다 조금 작게)
    z = int(math.ceil(math.log2(156543.03 * math.cos(math.radians(lat0)) / cell_m)))
    z = max(4, min(zmax, z))
    X, Y = merc(lon, lat, z)
    tx0, tx1 = int(np.floor(X.min() / 256)), int(np.floor(X.max() / 256))
    ty0, ty1 = int(np.floor(Y.min() / 256)), int(np.floor(Y.max() / 256))
    tiles = [(tx, ty) for ty in range(ty0, ty1 + 1) for tx in range(tx0, tx1 + 1)]
    log(f"고도 terrarium z{z} 조각 {len(tiles)}개 ({tx1 - tx0 + 1}×{ty1 - ty0 + 1})")
    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), np.float32)
    with ThreadPoolExecutor(16) as pool:
        for (tx, ty), t in zip(tiles, pool.map(lambda t: get_tile(z, *t), tiles)):
            mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = t
    mx = (X - tx0 * 256 - 0.5).astype(np.float32)
    my = (Y - ty0 * 256 - 0.5).astype(np.float32)
    return cv2.remap(mosaic, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE), z


def dem_etopo(lon, lat):
    # ETOPO 2022 15″ 15°×15° 조각 (이름 = 북서 모서리). 지도 세션이 받아 둔 것만 쓴다
    out = np.full(lon.shape, np.nan, np.float32)
    for north in range(-75, 91, 15):
        for west in range(-180, 180, 15):
            m = (lat <= north) & (lat > north - 15) & (lon >= west) & (lon < west + 15)
            if not m.any():
                continue
            name = f"{'N' if north >= 0 else 'S'}{abs(north):02d}{'E' if west >= 0 else 'W'}{abs(west):03d}"
            f = GEO / "etopo15" / f"{name}.tif"
            if not f.exists():
                sys.exit(f"ETOPO 조각 {f} 없음 - scripts/terrain.mjs가 받거나 terrarium을 쓸 것")
            t = cv2.imread(str(f), cv2.IMREAD_UNCHANGED)
            px = 15 / t.shape[1]
            mx = ((lon - west) / px - 0.5).astype(np.float32)
            my = ((north - lat) / px - 0.5).astype(np.float32)
            out[m] = cv2.remap(t, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)[m]
    log("고도 ETOPO 2022 15″")
    return out


# ── Copernicus DEM GLO-30 (1°×1° COG, 로그인 없음). 아르메니아·아제르바이잔 등 공개 안 된 조각은 404 → None ──
COP_URL = "https://copernicus-dem-30m.s3.amazonaws.com/{n}/{n}.tif"


def cop_tile(lat, lon):
    n = f"Copernicus_DSM_COG_10_{'N' if lat >= 0 else 'S'}{abs(lat):02d}_00_{'E' if lon >= 0 else 'W'}{abs(lon):03d}_00_DEM"
    f = GEO / "copdem30" / f"{n}.tif"
    miss = f.with_suffix(".missing")
    if miss.exists():
        return None
    if not f.exists():
        f.parent.mkdir(parents=True, exist_ok=True)
        try:
            with urllib.request.urlopen(COP_URL.format(n=n), timeout=120) as r:
                b = r.read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                miss.write_text("공개 안 된 조각")
                return None
            raise
        tmp = f.with_suffix(".part")
        tmp.write_bytes(b)
        tmp.rename(f)
    return cv2.imread(str(f), cv2.IMREAD_UNCHANGED)


def dem_copernicus(lon, lat, cell_m, lat0):
    out = np.full(lon.shape, np.nan, np.float32)
    used, missing = [], []
    for la in range(int(np.floor(lat.min())), int(np.floor(lat.max())) + 1):
        for lo in range(int(np.floor(lon.min())), int(np.floor(lon.max())) + 1):
            m = (lat >= la) & (lat < la + 1) & (lon >= lo) & (lon < lo + 1)
            if not m.any():
                continue
            t = cop_tile(la, lo)
            if t is None:
                missing.append((la, lo))
                continue
            used.append((la, lo))
            th, tw = t.shape
            mx = ((lon - lo) * tw).astype(np.float32)
            my = ((la + 1 - lat) * th).astype(np.float32)
            out[m] = cv2.remap(t, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)[m]
    src = []
    if used:
        src.append(f"copernicus glo-30 {len(used)}조각")
    if np.isnan(out).any():  # 빈 곳은 Terrain Tiles z13 (SRTM 30 m 바탕)
        fill, z = dem_terrarium(lon, lat, cell_m, lat0, 13)
        out = np.where(np.isnan(out), fill, out)
        src.append(f"terrarium z{z} (copernicus 없음 {missing})")
    log("근경 고도", ", ".join(src))
    return out, ", ".join(src)


# ── 값 잡음: 평면 좌표(km)의 연속 함수 - 원경·근경 격자가 같은 얼룩을 갖게 ──
def lattice(ix, iy, seed):
    v = np.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453
    return (v - np.floor(v)).astype(np.float32)


def cnoise(X, Y, cell_km, seed):
    gx0, gx1 = int(np.floor(X.min() / cell_km)) - 2, int(np.ceil(X.max() / cell_km)) + 3
    gy0, gy1 = int(np.floor(Y.min() / cell_km)) - 2, int(np.ceil(Y.max() / cell_km)) + 3
    iy, ix = np.mgrid[gy0:gy1, gx0:gx1].astype(np.float64)
    L = lattice(ix, iy, seed)
    return cv2.remap(L, (X / cell_km - gx0).astype(np.float32), (Y / cell_km - gy0).astype(np.float32),
                     cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def cfbm(X, Y, cell_km, seed, octaves=4, min_km=0.0):
    acc, amp, tot = np.zeros(X.shape, np.float32), 1.0, 0.0
    for k in range(octaves):
        if cell_km < min_km:
            break
        acc += amp * cnoise(X, Y, cell_km, seed * 31 + k)
        tot += amp
        amp *= 0.5
        cell_km /= 2
    return np.clip(acc / tot, 0, 1)


def edge_weight(meta, ramp_km):
    """근경 격자 가장자리에서 0 → 안쪽 ramp_km 지나 1 (셰이더와 같은 식)"""
    xs, ys = geo.grid(meta)
    ox, oy = meta.get("origin_km", [0, 0])
    W, H = meta["extent_km"]
    dx = np.minimum(xs - (ox - W / 2), (ox + W / 2) - xs)
    dy = np.minimum(ys - (oy - H / 2), (oy + H / 2) - ys)
    return smooth(0, ramp_km, np.minimum(dx[None, :], dy[:, None])).astype(np.float32)


def near_rect(shot, margin_km):
    """카메라 길(키 사이 촘촘히)의 평면 상자 + 여유 → (가운데 x, y, 폭, 높이) km"""
    lon0, lat0 = shot["terrain"]["center"]
    ks = sorted(shot["camera"], key=lambda k: k["t"])
    lo = np.array([k["lon"] for k in ks])
    la = np.array([k["lat"] for k in ks])
    t = np.linspace(0, 1, 50)
    kt = np.array([k["t"] for k in ks])
    x, y = geo.fwd(np.interp(t, kt, lo), np.interp(t, kt, la), lon0, lat0)
    x0, x1, y0, y1 = x.min() - margin_km, x.max() + margin_km, y.min() - margin_km, y.max() + margin_km
    return (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0


def sky_overrides(shot):
    """HDRI 하늘을 쓰는 샷이면 prep_sky.py가 잰 해 색·고도·하늘빛으로 바꾼다"""
    h = shot.get("hdri")
    if not h:
        return shot
    f = GEO / "hdri" / f"{h['id']}.json"
    if not f.exists():
        sys.exit(f"{f} 없음 - render_shot.py가 prep_sky.py를 먼저 부른다")
    s = json.loads(f.read_text())
    shot = json.loads(json.dumps(shot))
    sun = shot.setdefault("sun", {})
    sun["elevation"] = max(h.get("min_elevation", 3), s["sun_elevation"]) if h.get("use_hdri_elevation", True) else sun.get("elevation", 8)
    sun["color"] = s["sun_color_srgb"]
    sky = shot.setdefault("sky", {})
    sky["ambient"] = s["ambient_srgb"]
    return shot


def bake(shot, meta, cache, layer, far=None):
    """한 격자(원경 또는 근경)의 고도·색·빛을 굽는다. far = 원경 캐시 폴더(근경 굽기 때 그림자·큰 골짜기·가장자리 높이를 빌림)"""
    T = shot["terrain"]
    lon0, lat0 = meta["center"]
    W, H = meta["extent_km"]
    ox, oy = meta.get("origin_km", [0, 0])
    nx, ny = meta["size"]
    cell = meta["cell_m"]
    cache.mkdir(parents=True, exist_ok=True)
    log(f"[{layer}] 격자 {nx}×{ny} ({W:.1f}×{H:.1f} km, {cell} m)")

    xs, ys = geo.grid(meta)
    X, Y = np.meshgrid(xs.astype(np.float32), ys.astype(np.float32))
    lon, lat = geo.inv(X.astype(np.float64), Y.astype(np.float64), lon0, lat0)
    lon, lat = lon.astype(np.float32), lat.astype(np.float32)
    bb = [float(lon.min()) - 0.3, float(lat.min()) - 0.3, float(lon.max()) + 0.3, float(lat.max()) + 0.3]

    # 고도
    if layer == "near":
        h, meta["dem"] = dem_copernicus(lon, lat, cell, lat0)
    elif T.get("dem", "terrarium") == "etopo15":
        h = dem_etopo(lon, lat)
        meta["dem"] = "etopo15"
    else:
        h, z = dem_terrarium(lon, lat, cell, lat0, T.get("zmax", 11))
        meta["dem"] = f"terrarium z{z}"
    h = h.astype(np.float32)
    if far is not None:  # 가장자리는 원경 높이로 (이음매 없이)
        fmeta = json.loads((far / "meta.json").read_text())
        hf = geo.sample(np.load(far / "height.npy"), fmeta, X, Y).astype(np.float32)
        wgt = edge_weight(meta, T.get("near_ramp_km", 1.5))
        h = hf + (h - hf) * wgt
        del hf

    # 물: Natural Earth 땅 다각형 밖 + 호수 (경위도 격자에 칠한 뒤 평면 격자로 옮긴다)
    res = max(cell, 30) / 111320 / 1.5
    lw, ls, le, ln = bb
    lnx, lny = int((le - lw) / res) + 1, int((ln - ls) / res) + 1
    shift = 4

    def ll_px(p):
        return np.round(np.stack([(p[:, 0] - lw) / res, (ln - p[:, 1]) / res], 1) * (1 << shift)).astype(np.int32)

    land = np.zeros((lny, lnx), np.uint8)
    polys = [ll_px(p) for p, _ in read_shp(GEO / "ne/ne_10m_land/ne_10m_land.shp", bb)]
    cv2.fillPoly(land, polys, 255, cv2.LINE_AA, shift)
    for lake in ("ne_10m_lakes", "ne_10m_lakes_europe"):
        f = GEO / "ne" / lake / f"{lake}.shp"
        if f.exists():
            lp = [ll_px(p) for p, _ in read_shp(f, bb)]
            if lp:
                lk = np.zeros_like(land)
                cv2.fillPoly(lk, lp, 255, cv2.LINE_AA, shift)
                land = np.minimum(land, 255 - lk)
    mx = ((lon - lw) / res).astype(np.float32)
    my = ((ln - lat) / res).astype(np.float32)
    water = 1 - cv2.remap(land.astype(np.float32) / 255, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    del land
    # 물 높이 = 가장 가까운 물가 땅 높이 (카스피해처럼 해수면 아래 호수도 물가와 딱 맞게)
    wm = (water > 0.5).astype(np.uint8)
    if wm.any() and (wm == 0).any():
        _, lab = cv2.distanceTransformWithLabels(wm, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        landpix = wm == 0
        lab_of_land = np.zeros(lab.max() + 1, np.float32)
        lab_of_land[lab[landpix]] = h[landpix]
        shore = lab_of_land[lab]
        hw = np.where(wm == 1, np.minimum(shore, np.maximum(h, shore - 5)) - 3, h)
        h = h * (1 - water) + hw * water
    meta["water_frac"] = float(water.mean())

    # 강 (평면 격자에 바로 그림, 큰 강일수록 굵게)
    river = np.zeros((ny, nx), np.float32)
    rcfg = shot.get("rivers", {})
    if rcfg.get("show", True):
        rshp = GEO / "ne/ne_10m_rivers_lake_centerlines/ne_10m_rivers_lake_centerlines.shp"
        ranks = read_dbf_field(rshp.with_suffix(".dbf"), "scalerank") or []
        rs = 1 << shift
        for p, rec in read_shp(rshp, bb):
            rk = ranks[rec] if rec < len(ranks) and ranks[rec] is not None else 8
            w_m = rcfg.get("width_m", 150) * (1.6 if rk <= 4 else 1.15 if rk <= 6 else 0.8)
            px, py = geo.fwd(p[:, 0], p[:, 1], lon0, lat0)
            pts = np.round(np.stack([(px - ox + W / 2) / W * nx - 0.5, (H / 2 - (py - oy)) / H * ny - 0.5], 1) * rs).astype(np.int32)
            cv2.polylines(river, [pts], False, 1.0, max(1, int(round(w_m / cell))), cv2.LINE_AA, shift)
        river = blur(river, 0.6 * max(1, 80 / cell) ** 0.5)
    log(f"[{layer}] 물·강 마스크")

    # ── 땅 색 (Natural Earth I 토지 피복 → 바랜 지도 팔레트) ──
    lc_full = cv2.imread(str(GEO / "ne/NE1_HR_LC/NE1_HR_LC.tif"), cv2.IMREAD_COLOR)
    ppd = lc_full.shape[1] / 360
    c0, c1 = int((bb[0] + 180) * ppd), int((bb[2] + 180) * ppd) + 2
    r0, r1 = int((90 - bb[3]) * ppd), int((90 - bb[1]) * ppd) + 2
    lc = lc_full[r0:r1, c0:c1, ::-1].astype(np.float32) / 255
    del lc_full
    lc = cv2.GaussianBlur(lc, (0, 0), 0.8)
    mx = ((lon + 180) * ppd - c0 - 0.5).astype(np.float32)
    my = ((90 - lat) * ppd - r0 - 0.5).astype(np.float32)
    lc = cv2.remap(lc, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    del mx, my, lon, lat
    lc = np.clip(lc, 0, 1)  # sRGB 그대로 (NE1 토지 피복은 아주 옅은 지도색이라 차이만 읽는다)
    log(f"[{layer}] 토지 피복")

    pal = {**{
        "steppe": "#d9cf9a", "steppe_dry": "#d8c08e", "green": "#91a774", "forest": "#506b50",
        "rock": "#9a8a76", "rock_dark": "#6e6458", "snow": "#f2eee4", "water": "#7d9590", "shore": "#c9bf96",
    }, **shot.get("palette", {})}
    P = {k: hexlin(v) for k, v in pal.items()}
    seed = shot.get("seed", 7)
    px_km = 1000 / cell  # 1 km 당 픽셀

    # 토지 피복 밝기·초록 정도를 팔레트 사이 보간 값으로 쓴다 (원본 색을 그대로 쓰지 않고 지도 톤으로 다시 칠함)
    # NE1 토지 피복: 숲 ≈ (193,210,176), 풀밭·밭 ≈ (231,233,190), 마른 땅 ≈ (235,227,198) - 초록-빨강 차이와 어두움으로 나눈다
    gmr = (lc[..., 1] - lc[..., 0]) * 255
    green = np.clip((gmr - 1) / 14, 0, 1)
    dark = np.clip((222 - lc.mean(-1) * 255) / 28, 0, 1) * smooth(4, 12, gmr)  # 숲
    aridity = np.clip(-gmr / 8, 0, 1)
    ice = np.clip((lc[..., 2] - (lc[..., 0] + lc[..., 1]) / 2) * 255 / 8 + 1.2, 0, 1) * smooth(0.82, 0.88, lc.min(-1))  # 빙하·만년설 (회백색)
    patch = cfbm(X, Y, 25, seed, 3)  # 수십 km 얼룩 (풀 많은 곳·마른 곳)
    fine = cfbm(X, Y, 1.2, seed + 1, 4)  # 1 km 이하 붓 자국
    if layer == "near":  # 근경만: 수십~수백 m 얼룩을 더해 원경 텍스처 칸보다 잘게
        fine = np.clip(fine * 0.7 + cfbm(X, Y, 0.25, seed + 2, 4, 0.03) * 0.3, 0, 1)
    dry = np.clip(0.35 + aridity * 0.6 - green * 0.6 + (patch - 0.5) * 0.9, 0, 1)
    col = P["steppe"] * (1 - dry[..., None]) + P["steppe_dry"] * dry[..., None]
    veg = np.clip(green * 1.1 + (patch - 0.5) * 0.4, 0, 1) * T.get("greenness", 0.75)
    g = veg[..., None]
    col = col * (1 - g) + P["green"] * g
    f = np.clip(dark * 1.2, 0, 1)[..., None]
    col = col * (1 - f) + P["forest"] * f
    del lc, gmr, green, dark, dry, g, f, aridity

    # 기울기·고도
    ex = shot.get("exaggeration", 1.5)
    gy, gx = np.gradient(h * ex, cell)  # 행이 남쪽으로 증가 → gy는 -∂/∂y
    slope = np.degrees(np.arctan(np.hypot(gx, gy) / ex))  # 실제 기울기 (과장 전)
    # 골짜기·능선 (여러 크기의 높이 차이) - 색과 빛 둘 다에 쓴다. 근경은 큰 크기 항을 원경에서 빌린다
    he = h * ex
    cav = np.zeros_like(h)
    scales = ((0.12, 0.15), (0.6, 0.35), (3, 0.35)) if layer == "near" else ((0.6, 0.5), (3, 0.35))
    for km, wgt in scales:
        cav += wgt * np.tanh((he - blur(he, km * px_km)) / (km * 120))
    if far is not None:
        cav += 0.15 * geo.sample(np.load(far / "cav12.npy").astype(np.float32), fmeta, X, Y)
    else:
        c12 = np.tanh((he - blur(he, 12 * px_km)) / (12 * 120)).astype(np.float32)
        np.save(cache / "cav12.npy", c12.astype(np.float16))
        cav += 0.15 * c12
        del c12
    del he
    # 움푹한 곳은 풀이 짙고, 능선은 마르고 밝다
    hollow = np.clip(-cav * 1.6, 0, 1)[..., None] * T.get("hollow_green", 0.55)
    col = col * (1 - hollow) + P["green"] * hollow
    ridge = np.clip(cav * 1.4, 0, 1)[..., None] * 0.45
    col = col * (1 - ridge) + P["steppe_dry"] * ridge
    # 북사면 숲 (몽골 산지의 낙엽송처럼 북쪽을 향한 비탈에만)
    fcfg = T.get("forest")
    if fcfg:
        northness = gy / (np.hypot(gx, gy) + 1e-3)
        fz = smooth(fcfg["min_m"] - 150, fcfg["min_m"] + 150, h) * smooth(fcfg["max_m"] + 150, fcfg["max_m"] - 150, h)
        fa = np.clip(smooth(0.05, 0.6, northness + (patch - 0.5) * 0.6) * smooth(4, 12, slope) * fz * fcfg.get("amount", 0.7), 0, 1)[..., None]
        col = col * (1 - fa) + P["forest"] * (0.85 + 0.3 * fine[..., None]) * fa
    # 높은 산(수목한계 위)은 자갈·바위 빛 + 이끼 낀 툰드라 얼룩
    alp = T.get("alpine_m")
    gravel = np.zeros_like(h)
    if alp:
        gravel = smooth(alp - 250, alp + 250, h + (patch - 0.5) * 400) * (0.55 + 0.45 * fine)
        az_ = gravel[..., None]
        tundra = smooth(0.45, 0.7, fine)[..., None] * 0.35
        alpc = P["rock"] * (1 - tundra) + P["green"] * 0.8 * tundra
        col = col * (1 - az_) + alpc * az_
    r0, r1 = T.get("rock_slope", [16, 32])
    if layer == "near":  # 촘촘한 고도는 기울기가 더 크게 잡힌다
        r0, r1 = r0 + 4, r1 + 6
    rockm = smooth(r0, r1, slope + (fine - 0.5) * 12)
    rock = rockm[..., None]
    rockc = P["rock"] * (1 - fine[..., None] * 0.5) + P["rock_dark"] * (fine[..., None] * 0.5)
    col = col * (1 - rock) + rockc * rock
    snowline = T.get("snowline_m", 3400)
    sn = smooth(snowline - 250, snowline + 350, h + (patch - 0.5) * 500 + (fine - 0.5) * 300)
    sn = np.maximum(sn, ice * smooth(snowline - 900, snowline - 300, h))
    sn *= smooth(52, 32, slope)  # 가파른 벽엔 눈이 덜 붙음
    # 북사면(법선이 북쪽 = gy>0)에 눈이 더
    snm = np.clip(sn * (1 + np.clip(gy * 2, -0.4, 0.4)), 0, 1)
    sn = snm[..., None]
    col = col * (1 - sn) + P["snow"] * sn
    # 강가 초록 (강 둘레 넓게)
    if river.any():
        rb = np.clip(blur(river, 0.8 * px_km) * 3.0, 0, 1)[..., None] * rcfg.get("green", 0.55)
        col = col * (1 - rb) + P["forest"] * 0.5 * rb + P["green"] * 0.5 * rb
    else:
        rb = np.zeros((ny, nx, 1), np.float32)
    # 붓 자국 얼룩 (밝기 ±)
    col *= (0.9 + 0.2 * fine)[..., None]
    # 물
    wv = np.clip(np.maximum(water, river * rcfg.get("highlight", 0.8)), 0, 1)
    shore = np.clip(blur(water, 0.15 * px_km) * 2 - wv, 0, 1)[..., None] * 0.6
    col = col * (1 - shore) + P["shore"] * shore
    col = col * (1 - wv[..., None]) + P["water"] * wv[..., None]
    if layer == "near":
        aux2 = np.stack([rockm, snm, np.clip(veg + hollow[..., 0], 0, 1) * (1 - rockm) * (1 - snm), gravel * (1 - snm)], -1)
        aux2 *= (1 - wv)[..., None]
        cv2.imwrite(str(cache / "aux2.png"), np.clip(aux2[..., [2, 1, 0, 3]] * 255 + 0.5, 0, 255).astype(np.uint8))
        del aux2
    del shore, rock, rockc, sn, X, Y
    log(f"[{layer}] 땅 색")

    # ── 빛 굽기 ──
    sun = shot.get("sun", {})
    az, el = sun.get("azimuth", 250), sun.get("elevation", 8)
    L = np.array(geo.sun_vector(az, el), np.float32)
    nxv, nyv = -gx, gy  # x=동, y=북 (gy는 남쪽 방향 미분)
    nrm = np.sqrt(nxv ** 2 + nyv ** 2 + 1)
    ndl = (nxv * L[0] + nyv * L[1] + L[2]) / nrm
    upz = 1 / nrm
    del gx, gy, nxv, nyv, nrm

    # 그림자: 해 쪽으로 걸어가며 지형이 해를 가리는지 (부드러운 반그림자). 근경은 가까운 그림자만 직접, 먼 산 그림자는 원경에서
    dn = 2 if layer == "far" else 1
    hs = cv2.resize(h * ex, (nx // dn, ny // dn), interpolation=cv2.INTER_AREA) if dn > 1 else h * ex
    cs = cell * dn
    dirx, diry = L[0] / math.hypot(L[0], L[1]), -L[1] / math.hypot(L[0], L[1])  # 픽셀 좌표 (행은 남쪽)
    tan_e = math.tan(math.radians(el))
    soft = math.tan(math.radians(sun.get("softness_deg", 0.6)))
    occ = np.full(hs.shape, -1e9, np.float32)
    d, maxd = 1.0, (sun.get("shadow_km", 90) if layer == "far" else T.get("near_shadow_km", 8)) * 1000 / cs
    while d < maxd:
        M = np.float32([[1, 0, dirx * d], [0, 1, diry * d]])
        hh = cv2.warpAffine(hs, M, (hs.shape[1], hs.shape[0]), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
                           borderMode=cv2.BORDER_REPLICATE)
        dm = d * cs
        occ = np.maximum(occ, (hh - hs - dm * tan_e) / (dm * soft + cs * 0.5))
        d = d * 1.06 + 0.5
    shadow = np.clip(0.5 - occ, 0, 1)
    if dn > 1:
        shadow = cv2.resize(shadow, (nx, ny), interpolation=cv2.INTER_LINEAR)
    del hs, occ
    if layer == "far":
        np.save(cache / "shadow.npy", cv2.resize(shadow, (nx // 2, ny // 2), interpolation=cv2.INTER_AREA).astype(np.float16))
    else:
        X2, Y2 = np.meshgrid(*[a.astype(np.float32) for a in geo.grid(meta)])
        fs = geo.sample(np.load(far / "shadow.npy").astype(np.float32), fmeta, X2, Y2)
        shadow = np.minimum(shadow, fs).astype(np.float32)
        del X2, Y2, fs
    log(f"[{layer}] 해 그림자")

    # 골짜기 어둠
    ao = np.clip(0.78 + 0.35 * cav, 0.45 if layer == "far" else 0.6, 1.1)  # 근경 골짜기가 새까맣게 꺼지지 않게
    del cav

    sunc = srgb2lin(sun.get("color", [1.0, 0.78, 0.55])) * sun.get("strength", 3.2)
    skyc = srgb2lin(shot.get("sky", {}).get("ambient", [0.62, 0.66, 0.74])) * shot.get("sky", {}).get("ambient_strength", 0.55)
    bounce = srgb2lin([0.75, 0.62, 0.48]) * 0.12  # 땅에서 튀는 따뜻한 빛
    direct = (np.clip(ndl, 0, 1) * shadow)[..., None] * sunc
    amb = (ao * (0.55 + 0.45 * upz))[..., None] * skyc + (ao * (1 - upz))[..., None] * bounce
    lit = col * (direct + amb)
    sunfrac = np.clip((direct.mean(-1)) / (direct.mean(-1) + amb.mean(-1) + 1e-5), 0, 1)
    del direct, amb, ndl, shadow, ao
    log(f"[{layer}] 빛 굽기")

    # 저장
    cv2.imwrite(str(cache / "lit.png"), np.clip(lit[..., ::-1] / 2 * 65535, 0, 65535).astype(np.uint16))
    aux = np.stack([wv, sunfrac, np.clip(rb[..., 0], 0, 1)], -1)
    cv2.imwrite(str(cache / "aux.png"), np.clip(aux[..., ::-1] * 255 + 0.5, 0, 255).astype(np.uint8))
    np.save(cache / "height.npy", h.astype(np.float32))
    if layer == "far":
        # 카메라 안전 높이: 주변 1.5 km 최고점을 넓게 부드럽게, 1/8 해상도
        hk = cv2.dilate(h, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(3 * px_km) | 1,) * 2))
        hk = cv2.resize(hk, (max(2, nx // 8), max(2, ny // 8)), interpolation=cv2.INTER_AREA)
        hk = blur(hk, 3 * px_km / 8)
        np.save(cache / "clear.npy", hk.astype(np.float32))
    meta["height_range"] = [float(h.min()), float(h.max())]
    (cache / "meta.json").write_text(json.dumps(meta, indent=1))
    log(f"[{layer}] 저장", cache)


def main():
    shot_path, cache = Path(sys.argv[1]), Path(sys.argv[2])
    shot = sky_overrides(json.loads(shot_path.read_text()))
    T = shot["terrain"]
    lon0, lat0 = T["center"]
    W, H = T["extent_km"]
    cell = T.get("cell_m", 100)
    meta = {"center": [lon0, lat0], "extent_km": [W, H], "origin_km": [0, 0], "cell_m": cell,
            "size": [int(round(W * 1000 / cell)), int(round(H * 1000 / cell))],
            "sun": shot.get("sun", {})}
    bake(shot, meta, cache, "far")
    nr = T.get("near")
    if nr:  # 근경 층: 카메라 길 둘레만
        c = nr.get("cell_m", 15)
        cx, cy, w, hgt = near_rect(shot, nr.get("margin_km", 8))
        nmeta = {"center": [lon0, lat0], "extent_km": [w, hgt], "origin_km": [cx, cy], "cell_m": c,
                 "size": [int(round(w * 1000 / c)), int(round(hgt * 1000 / c))], "ramp_km": T.get("near_ramp_km", 1.5)}
        bake(shot, nmeta, cache / "near", "near", far=cache)


if __name__ == "__main__":
    main()
