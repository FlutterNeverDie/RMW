# PNG 여러 장이 이어진 바이트를 흑백 numpy 배열들로 (Pillow 없이) - check-flicker·render-checked 공용
import struct, zlib
import numpy as np


def png_frames(stream):
    """PNG 여러 장이 이어진 바이트(흑백 8비트)를 numpy 배열들로 (Pillow 없이)"""
    out, i = [], 0
    while True:
        i = stream.find(b"\x89PNG\r\n\x1a\n", i)
        if i < 0:
            return out
        j, idat, w = i + 8, b"", 0
        while True:
            n, kind = struct.unpack(">I4s", stream[j : j + 8])
            body = stream[j + 8 : j + 8 + n]
            if kind == b"IHDR":
                w, h = struct.unpack(">II", body[:8])
            elif kind == b"IDAT":
                idat += body
            j += 12 + n
            if kind == b"IEND":
                break
        raw = zlib.decompress(idat)
        img = np.zeros((h, w), np.int32)
        prev = np.zeros(w, np.int32)
        for y in range(h):
            f, row = raw[y * (w + 1)], np.frombuffer(raw[y * (w + 1) + 1 : (y + 1) * (w + 1)], np.uint8).astype(np.int32)
            cur = np.zeros(w, np.int32)
            for x in range(w):
                a = cur[x - 1] if x else 0
                b, c = prev[x], (prev[x - 1] if x else 0)
                if f == 0: p = 0
                elif f == 1: p = a
                elif f == 2: p = b
                elif f == 3: p = (a + b) // 2
                else:
                    pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                    p = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                cur[x] = (row[x] + p) & 255
            img[y], prev = cur, cur
        out.append(img.astype(np.float32))
        i = j
