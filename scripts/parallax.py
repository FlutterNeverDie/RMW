# 옛 그림 2.5D: 그림의 깊이(가까운 곳·먼 곳)를 로컬 AI(Depth Anything V2 Small, Apache-2.0)로 재고,
# 카메라가 그림 속으로 들어가듯 가까운 곳이 더 크게·더 빨리 움직이는 연속 그림을 만든다 (다큐멘터리 기법, 2026-10-21 사용자)
#   .venv/bin/python -I scripts/parallax.py <그림> <출력 폴더> --frames N [--from fx,fy,z] [--to fx,fy,z] [--depth 0.06]
#   → <출력 폴더>/00000.jpg… (2560×1440, JPEG 95). 같은 입력이면 같은 그림 (무작위 없음)
# 그림을 새로 만드는 AI가 아니다 - 깊이만 재고, 화면은 원본 그림 픽셀을 옮겨서 만든다
import argparse, hashlib
from pathlib import Path

import cv2
import numpy as np

CODE = Path(__file__).resolve().parent.parent
MODEL = CODE / "models/depth-anything-v2-small.onnx"
CACHE = CODE / "audio/.depth"  # 깊이 지도 캐시 (그림 지문별)
W, H = 2560, 1440


def depth_map(img):
    key = hashlib.sha1(img.tobytes()).hexdigest()[:16]
    f = CACHE / f"{key}.png"
    if f.exists():
        return cv2.imread(str(f), cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535
    import onnxruntime as ort

    sess = ort.InferenceSession(str(MODEL), providers=["CPUExecutionProvider"])
    x = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2RGB), (518, 518), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255
    x = ((x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]).transpose(2, 0, 1)[None].astype(np.float32)
    d = sess.run(None, {sess.get_inputs()[0].name: x})[0][0]
    d = cv2.resize(d, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_CUBIC)
    d = (d - d.min()) / max(1e-6, d.max() - d.min())  # 1 = 가까움
    # 경계가 찢어지지 않게: 가까운 쪽을 조금 넓히고(팽창) 부드럽게
    k = max(3, img.shape[1] // 300) | 1
    d = cv2.GaussianBlur(cv2.dilate(d, np.ones((k, k), np.uint8)), (0, 0), k)
    CACHE.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(f), (d * 65535).astype(np.uint16))
    return d


def v3(s):
    return [float(v) for v in s.split(",")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("img")
    ap.add_argument("out")
    ap.add_argument("--frames", type=int, required=True)
    ap.add_argument("--from", dest="a", default="0.5,0.5,1.0")
    ap.add_argument("--to", dest="b", default="0.5,0.5,1.12")
    ap.add_argument("--depth", type=float, default=0.06, help="깊이 효과 세기 (화면 폭 비율, 0.03~0.1)")
    o = ap.parse_args()
    img = cv2.imread(o.img, cv2.IMREAD_COLOR)
    d = depth_map(img)
    ih, iw = img.shape[:2]
    out = Path(o.out)
    out.mkdir(parents=True, exist_ok=True)
    a, b = np.array(v3(o.a)), np.array(v3(o.b))
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    # 화면을 꽉 채우는(cover) 기본 배율 - 가장자리가 비지 않게 깊이 효과만큼 더 키운다
    cover = max(W / iw, H / ih) * (1 + o.depth * 1.5)
    for i in range(o.frames):
        t = i / max(1, o.frames - 1)
        e = t * t * (3 - 2 * t)  # 부드럽게 시작·끝
        fx, fy, z = a + (b - a) * e
        s = cover * z
        # 화면 점 → 그림 점 (가운데가 그림의 fx, fy)
        cx = np.clip(fx * iw, W / s / 2, iw - W / s / 2)
        cy = np.clip(fy * ih, H / s / 2, ih - H / s / 2)
        sx, sy = (cx + (xs - W / 2) / s).astype(np.float32), (cy + (ys - H / 2) / s).astype(np.float32)
        # 깊이로 밀기: 가까운 곳은 카메라를 따라 더 커지고(확대 쪽) 옆으로 더 움직인다
        dd = cv2.remap(d, sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT) - 0.5
        push = o.depth * (e - 0.5) * 2  # -depth → +depth
        grow = 1 - dd * push * 0.8
        px = (sx - cx) * grow + cx - dd * push * (b[0] - a[0] + 0.25) * iw * 0.3
        py = (sy - cy) * grow + cy - dd * push * (b[1] - a[1]) * ih * 0.3
        frame = cv2.remap(img, px.astype(np.float32), py.astype(np.float32), cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
        cv2.imwrite(str(out / f"{i:05d}.jpg"), frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"→ {out} ({o.frames}장)")


if __name__ == "__main__":
    main()
