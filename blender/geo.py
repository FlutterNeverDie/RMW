# 시네마틱 공용 지리 계산 - prep_terrain.py(.venv 파이썬)와 render_shot.py(블렌더 파이썬)가 같이 쓴다
# 좌표: 샷 중심(lon0, lat0) 기준 정거방위도법(azimuthal equidistant), 단위 km, x=동 y=북
# 지구 곡률: 평면 격자에 z -= (x²+y²)/2R 로 내려서 멀리 갈수록 지평선 아래로 가라앉게 한다 (과장 배율과 무관한 실제 값)
import math

import numpy as np

R = 6371.0088  # km


def fwd(lon, lat, lon0, lat0):
    """경위도(도) → 평면 x, y (km)"""
    lam, phi = np.radians(lon), np.radians(lat)
    lam0, phi0 = math.radians(lon0), math.radians(lat0)
    cosc = np.clip(math.sin(phi0) * np.sin(phi) + math.cos(phi0) * np.cos(phi) * np.cos(lam - lam0), -1, 1)
    c = np.arccos(cosc)
    k = np.where(c > 1e-12, c / np.where(c > 1e-12, np.sin(c), 1), 1.0)
    x = R * k * np.cos(phi) * np.sin(lam - lam0)
    y = R * k * (math.cos(phi0) * np.sin(phi) - math.sin(phi0) * np.cos(phi) * np.cos(lam - lam0))
    return x, y


def inv(x, y, lon0, lat0):
    """평면 x, y (km) → 경위도(도)"""
    phi0 = math.radians(lat0)
    rho = np.hypot(x, y)
    c = rho / R
    sc, cc = np.sin(c), np.cos(c)
    safe = np.where(rho > 1e-12, rho, 1.0)
    lat = np.arcsin(np.clip(cc * math.sin(phi0) + np.where(rho > 1e-12, y * sc * math.cos(phi0) / safe, 0), -1, 1))
    lon = math.radians(lon0) + np.arctan2(x * sc, rho * math.cos(phi0) * cc - y * math.sin(phi0) * sc)
    return np.degrees(lon), np.degrees(lat)


def drop(x, y):
    """지구 곡률로 내려가는 높이 (km)"""
    return (x * x + y * y) / (2 * R)


def north_angle(lon, lat, lon0, lat0):
    """그 지점에서 진북이 평면 +y에서 몇 도 돌아 있나 (시계 방향 +) - 방위각 보정용"""
    x0, y0 = fwd(lon, lat, lon0, lat0)
    x1, y1 = fwd(lon, lat + 0.01, lon0, lat0)
    return math.degrees(math.atan2(float(x1 - x0), float(y1 - y0)))


def grid(meta):
    """격자 픽셀 중심 좌표 (행 0 = 북쪽 끝)"""
    W, H = meta["extent_km"]
    nx, ny = meta["size"]
    xs = -W / 2 + (np.arange(nx) + 0.5) * W / nx
    ys = H / 2 - (np.arange(ny) + 0.5) * H / ny
    return xs, ys


def sample(arr, meta, x, y):
    """격자 배열을 평면 좌표 x, y(km)에서 쌍선형으로 읽기 (배열 해상도는 meta 격자의 정수 배 축소여도 됨)"""
    W, H = meta["extent_km"]
    ny, nx = arr.shape[:2]
    fx = np.clip((np.asarray(x) + W / 2) / W * nx - 0.5, 0, nx - 1.001)
    fy = np.clip((H / 2 - np.asarray(y)) / H * ny - 0.5, 0, ny - 1.001)
    i0, j0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
    ax, ay = fx - i0, fy - j0
    return (arr[j0, i0] * (1 - ax) * (1 - ay) + arr[j0, i0 + 1] * ax * (1 - ay)
            + arr[j0 + 1, i0] * (1 - ax) * ay + arr[j0 + 1, i0 + 1] * ax * ay)


def sun_vector(azimuth, elevation):
    """방위각(북 기준 시계 방향, 도)·고도(도) → 해 쪽 단위 벡터 (x=동, y=북, z=위)"""
    a, e = math.radians(azimuth), math.radians(elevation)
    return (math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e))
