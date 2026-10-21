# 시네마틱 샷 렌더 - 실제 지형 위를 나는 카메라 (블렌더 EEVEE, 화면 글자 없음)
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P blender/render_shot.py -- \
#       --shot blender/shots/<샷>.json --out <폴더> --frames N [--scale 0.5] [--only 0,45,89] [--samples 16]
# 결과: <폴더>/00000.jpg… (2560×1440 JPEG 95, 30fps 기준 N장). 같은 입력이면 같은 그림.
# 흐름: prep_terrain.py(.venv)로 고도·빛을 구워 캐시 → 블렌더에서 메시·셰이더·하늘·카메라 → EXR → post.py(.venv)로 필름 마감 → JPEG
# 빛은 미리 굽고(해 그림자·하늘빛) 블렌더는 원근·안개·구름·물 반사만 계산한다 - 빠르고, 매번 같고, 칠한 듯한 톤을 맘대로 잡을 수 있다
# 근경 층(terrain.near): 카메라 길 둘레만 15 m 메시·텍스처 + 미세 질감, 원경 메시는 그 안쪽을 뚫고 가장자리 띠에서 섞는다
# 하늘(hdri): Poly Haven CC0 HDRI를 해 방위에 맞춰 돌려 쓰고(prep_sky.py), 지평선 띠 색으로 땅 안개를 맞춘다
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import bpy
import numpy as np
from mathutils import Euler, Matrix

HERE = Path(__file__).resolve().parent
CODE = HERE.parent
sys.path.insert(0, str(HERE))
import geo  # noqa: E402

T0 = time.time()


def log(*a):
    print(f"[shot {time.time() - T0:6.1f}s]", *a, flush=True)


# ── 인자 ──
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(k, d=None):
    return argv[argv.index(f"--{k}") + 1] if f"--{k}" in argv else d


SHOT_PATH = Path(arg("shot")).resolve()
OUT = Path(arg("out")).resolve()
NFRAMES = int(arg("frames", 90))
SCALE = float(arg("scale", 1))
ONLY = [int(v) for v in arg("only").split(",")] if arg("only") else None
shot = json.loads(SHOT_PATH.read_text())
SAMPLES = int(arg("samples", shot.get("samples", 16)))
sys.path.insert(0, str(CODE / "scripts"))
import tools  # noqa: E402  (표준 라이브러리만 씀 - 블렌더 파이썬에서도 됨. 맥·윈도우 .venv 위치, RMW_PYTHON으로 덮어쓰기)

PY = str(tools.python())


def srgb2lin(c):
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def hexlin(h):
    h = h.lstrip("#")
    return srgb2lin([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


# ── 1. 하늘(HDRI)·지형 굽기 (캐시) ──
HDRI = shot.get("hdri")  # {"id": Poly Haven 이름, "res": "8k", ...} - 있으면 하늘은 실제 사진 하늘
SKYJ = None
if HDRI:
    skyf = CODE / "data/geo/hdri" / f"{HDRI['id']}.json"
    if not skyf.exists() or not (CODE / "data/geo/hdri" / f"{HDRI['id']}_{HDRI.get('res', '8k')}.hdr").exists():
        log("하늘 준비", HDRI["id"])
        subprocess.run([PY, "-I", str(HERE / "prep_sky.py"), HDRI["id"], HDRI.get("res", "8k")], check=True,
                       env=dict(os.environ, OPENCV_IO_ENABLE_OPENEXR="1"))
    SKYJ = json.loads(skyf.read_text())
    # 굽기와 같은 규칙으로 해 고도·색, 하늘빛을 HDRI에서 (prep_terrain.sky_overrides)
    sun0 = shot.setdefault("sun", {})
    if HDRI.get("use_hdri_elevation", True):
        sun0["elevation"] = max(HDRI.get("min_elevation", 3), SKYJ["sun_elevation"])
    sun0["color"] = SKYJ["sun_color_srgb"]
    shot.setdefault("sky", {})["ambient"] = SKYJ["ambient_srgb"]
prep_keys = ["terrain", "palette", "sun", "rivers", "exaggeration", "seed", "hdri", "camera"]
prep_in = json.dumps({k: shot.get(k) for k in prep_keys} | {"sky": (shot.get("sky") or {}).get("ambient"),
                     "amb": (shot.get("sky") or {}).get("ambient_strength")}, sort_keys=True)
prep_hash = hashlib.sha1((prep_in + (HERE / "prep_terrain.py").read_text() + (HERE / "geo.py").read_text()).encode()).hexdigest()[:12]
CACHE = CODE / "data/geo/cinematic" / f"{SHOT_PATH.stem}-{prep_hash}"
if not (CACHE / "meta.json").exists() or (shot["terrain"].get("near") and not (CACHE / "near/meta.json").exists()):
    log("지형 굽기", CACHE.name)
    subprocess.run([PY, "-I", str(HERE / "prep_terrain.py"), str(SHOT_PATH), str(CACHE)], check=True)
    for old in CACHE.parent.glob(f"{SHOT_PATH.stem}-*"):  # 같은 샷의 예전 굽기는 지운다 (크다)
        if old != CACHE and len(old.name) == len(CACHE.name):
            shutil.rmtree(old, ignore_errors=True)
meta = json.loads((CACHE / "meta.json").read_text())
lon0, lat0 = meta["center"]
W, H = meta["extent_km"]
EX = shot.get("exaggeration", 1.5)
height = np.load(CACHE / "height.npy")
clear = np.load(CACHE / "clear.npy")
NEAR = CACHE / "near" if (CACHE / "near/meta.json").exists() else None
nmeta = json.loads((NEAR / "meta.json").read_text()) if NEAR else None

# ── 2. 장면 비우기 ──
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = int(2560 * SCALE)
scene.render.resolution_y = int(1440 * SCALE)
scene.render.resolution_percentage = 100
scene.render.fps = 30
scene.eevee.taa_render_samples = SAMPLES
scene.render.film_transparent = False
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.render.image_settings.file_format = "OPEN_EXR"
scene.render.image_settings.color_depth = "16"
scene.render.image_settings.exr_codec = "ZIP"
scene.render.use_compositing = False
scene.render.use_sequencer = False
try:
    bpy.context.preferences.system.anisotropic_filter = "FILTER_16"
except Exception:
    pass

# ── 3. 지형 메시 (고도 격자를 그대로 꼭짓점으로, 지구 곡률로 내림). 근경 층이 있으면 원경은 그 안쪽을 뚫는다 ──
def near_inside(x, y, inset):
    """근경 사각형 안쪽(가장자리에서 inset km 이상 들어간 곳)"""
    ox, oy = nmeta["origin_km"]
    nw, nh = nmeta["extent_km"]
    return (np.abs(x - ox) < nw / 2 - inset) & (np.abs(y - oy) < nh / 2 - inset)


def make_mesh(name, hgt, m, step, zoff=0.0, hole=None):
    hm = hgt[step // 2::step, step // 2::step]
    ny, nx = hm.shape
    xs, ys = geo.grid(m)
    gx, gy = np.meshgrid(xs[step // 2::step][:nx], ys[step // 2::step][:ny])
    gz = hm * EX / 1000 - geo.drop(gx, gy) + zoff
    verts = np.stack([gx, gy, gz], -1).reshape(-1, 3).astype(np.float32)
    idx = np.arange(nx * ny).reshape(ny, nx)
    quads = np.stack([idx[1:, :-1], idx[1:, 1:], idx[:-1, 1:], idx[:-1, :-1]], -1).reshape(-1, 4)
    if hole is not None:  # 네 꼭짓점이 모두 근경 안쪽인 칸은 뺀다
        ins = hole(gx, gy).reshape(-1)
        quads = quads[~ins[quads].all(1)]
    nq = len(quads)
    mesh = bpy.data.meshes.new(name)
    mesh.vertices.add(nx * ny)
    mesh.vertices.foreach_set("co", verts.ravel())
    mesh.loops.add(nq * 4)
    mesh.loops.foreach_set("vertex_index", quads.reshape(-1).astype(np.int32))
    mesh.polygons.add(nq)
    mesh.polygons.foreach_set("loop_start", np.arange(0, nq * 4, 4, dtype=np.int32))
    mesh.polygons.foreach_set("use_smooth", np.ones(nq, dtype=bool))
    mesh.update(calc_edges=True)
    ob = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(ob)
    log(f"메시 {name} {nx}×{ny} 꼭짓점 ({nq * 2 / 1e6:.1f}M 삼각형)")
    return ob


RAMP = nmeta.get("ramp_km", 1.5) if nmeta else 0
terrain = make_mesh("terrain", height, meta, shot["terrain"].get("mesh_step", 3),
                    hole=(lambda x, y: near_inside(x, y, RAMP)) if NEAR else None)
near_ob = None
if NEAR:
    # 근경은 가장자리 띠에서 원경과 겹친다 - 2 m(장면) 위에 올려 겹친 곳에서 근경이 보이게 (가장자리는 원경 높이·색과 같음)
    near_ob = make_mesh("near", np.load(NEAR / "height.npy"), nmeta, shot["terrain"]["near"].get("mesh_step", 1), zoff=0.002)
del height


# ── 4. 노드 도우미 ──
class NB:
    """노드 트리에 수식처럼 노드를 쌓는 도우미"""

    def __init__(self, tree):
        self.t = tree
        self.n = tree.nodes
        self.l = tree.links

    def node(self, kind, **props):
        nd = self.n.new(kind)
        for k, v in props.items():
            setattr(nd, k, v)
        return nd

    def _in(self, sock, v):
        if hasattr(v, "is_output") or hasattr(v, "links"):
            self.l.new(v, sock)
        elif v is not None:
            sock.default_value = v

    def math(self, op, a, b=None, c=None, clamp=False):
        nd = self.node("ShaderNodeMath", operation=op, use_clamp=clamp)
        self._in(nd.inputs[0], a)
        if b is not None:
            self._in(nd.inputs[1], b)
        if c is not None:
            self._in(nd.inputs[2], c)
        return nd.outputs[0]

    def vec(self, op, a, b=None, scale=None):
        nd = self.node("ShaderNodeVectorMath", operation=op)
        self._in(nd.inputs[0], a)
        if b is not None:
            self._in(nd.inputs[1], b)
        if scale is not None:
            self._in(nd.inputs["Scale"], scale)
        outs = [o for o in nd.outputs if o.enabled]
        return nd.outputs["Value"] if op in ("DOT_PRODUCT", "LENGTH", "DISTANCE") else nd.outputs["Vector"]

    def xyz(self, x, y, z):
        nd = self.node("ShaderNodeCombineXYZ")
        for i, v in enumerate((x, y, z)):
            self._in(nd.inputs[i], v)
        return nd.outputs[0]

    def sep(self, v):
        nd = self.node("ShaderNodeSeparateXYZ")
        self._in(nd.inputs[0], v)
        return nd.outputs

    def rgb(self, c):
        nd = self.node("ShaderNodeRGB")
        nd.outputs[0].default_value = (*c, 1)
        return nd.outputs[0]

    def mix(self, a, b, f, blend="MIX"):
        nd = self.node("ShaderNodeMix", data_type="RGBA", blend_type=blend)
        self._in(nd.inputs["Factor"], f)
        self._in(nd.inputs[6], a)
        self._in(nd.inputs[7], b)
        return nd.outputs[2]

    def cmul(self, a, f):
        """색 × 수"""
        return self.vec("SCALE", a, scale=f)

    def smooth(self, e0, e1, x):
        nd = self.node("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP")
        self._in(nd.inputs["Value"], x)
        nd.inputs["From Min"].default_value = e0
        nd.inputs["From Max"].default_value = e1
        return nd.outputs["Result"]

    def group(self, ng, **ins):
        nd = self.node("ShaderNodeGroup")
        nd.node_tree = ng
        for k, v in ins.items():
            self._in(nd.inputs[k], v)
        return nd.outputs


def new_group(name, ins, outs):
    ng = bpy.data.node_groups.new(name, "ShaderNodeTree")
    for nm, ty in ins:
        ng.interface.new_socket(nm, in_out="INPUT", socket_type=ty)
    for nm, ty in outs:
        ng.interface.new_socket(nm, in_out="OUTPUT", socket_type=ty)
    b = NB(ng)
    gi = b.node("NodeGroupInput")
    go = b.node("NodeGroupOutput")
    return ng, b, gi, go


# ── 5. 빛·하늘 설정값 ──
sun = shot.get("sun", {})
L = geo.sun_vector(sun.get("azimuth", 250), sun.get("elevation", 8))
sky = shot.get("sky", {})
haze = shot.get("haze", {})
cl = shot.get("clouds", {})
HAZE_COL = hexlin(haze.get("color", "#cbbfa8"))
GLOW_COL = hexlin(sky.get("glow", "#f0b070"))
ZENITH = hexlin(sky.get("zenith", "#8a9db0"))
CLOUD_LIT = hexlin(cl.get("lit", "#f7dcb4"))
CLOUD_SHADE = hexlin(cl.get("shade", "#7a7486"))
SUN_DISC = [c * (0 if HDRI else sun.get("disc", 40)) for c in srgb2lin(sun.get("color", [1.0, 0.78, 0.55]))]  # HDRI엔 해가 있다
HC = cl.get("height_km", 5.5)

# 카메라 위치·시간을 셰이더에 넘기는 그룹 (프레임마다 키)
rig, rb, rgi, rgo = new_group("rig", [], [("cam", "NodeSocketVector"), ("time", "NodeSocketFloat")])
rig_cam = rb.node("ShaderNodeCombineXYZ")
rig_time = rb.node("ShaderNodeValue")
rb.l.new(rig_cam.outputs[0], rgo.inputs["cam"])
rb.l.new(rig_time.outputs[0], rgo.inputs["time"])

# 구름 밀도 (평면 좌표 km, 시간 s) - 하늘과 땅 그림자가 같은 구름을 쓴다
cg, b, gi, go = new_group("clouds", [("p", "NodeSocketVector"), ("time", "NodeSocketFloat")], [("d", "NodeSocketFloat")])
wind = cl.get("wind_kmps", [0.012, 0.004])  # km/s - 천천히 흐름
off = b.xyz(b.math("MULTIPLY", gi.outputs["time"], -wind[0]), b.math("MULTIPLY", gi.outputs["time"], -wind[1]), 0)
q = b.vec("ADD", gi.outputs["p"], off)
q = b.vec("SCALE", q, scale=1 / cl.get("size_km", 14))
nz = b.node("ShaderNodeTexNoise", noise_dimensions="4D")
nz.inputs["Detail"].default_value = 7
nz.inputs["Roughness"].default_value = 0.58
nz.inputs["Distortion"].default_value = 0.25
b._in(nz.inputs["Vector"], q)
b._in(nz.inputs["W"], b.math("ADD", b.math("MULTIPLY", gi.outputs["time"], 0.004), cl.get("seed", 3.7)))
cover = cl.get("cover", 0.35)
# 잡음 값은 대체로 0.3~0.7 - 덮인 비율(cover)에 맞춰 문턱을 옮기고, 가장자리는 부드럽게
th = 0.66 - cover * 0.28
dd = b.smooth(th, th + cl.get("softness", 0.12), nz.outputs["Fac"])
b._in(go.inputs["d"], b.math("MULTIPLY", dd, cl.get("opacity", 0.92) if cover > 0 else 0))

# HDRI 방향 돌리기: HDRI 속 해 방위를 샷의 해 방위에 맞춘다 (블렌더 환경 텍스처 규칙: u = -atan2(y,x)/2π + 0.5)
HDRI_ROT = math.radians(sun.get("azimuth", 250) - SKYJ["sun_azimuth_in_hdri"]) if HDRI else 0.0


def hdri_dir(b, v):
    nd = b.node("ShaderNodeVectorRotate", rotation_type="Z_AXIS")
    b._in(nd.inputs["Vector"], v)
    nd.inputs["Angle"].default_value = HDRI_ROT
    return nd.outputs[0]


def load_img(path, colorspace="Non-Color"):
    im = bpy.data.images.load(str(path), check_existing=True)
    im.colorspace_settings.name = colorspace
    return im


# 지평선 안개 색 (방향 → 색): 바랜 크림색 + 해 쪽 금빛. HDRI 하늘이면 HDRI 지평선 띠 색(방위별)을 그대로 - 땅의 안개와 하늘이 같은 색으로 만난다
hg, b, gi, go = new_group("hazecol", [("v", "NodeSocketVector")], [("c", "NodeSocketColor")])
gdot = b.math("MAXIMUM", b.vec("DOT_PRODUCT", gi.outputs["v"], L), 0)
glow_k = sky.get("hdri_glow", 0.35) if HDRI else 1.0
glow = b.math("ADD", b.math("MULTIPLY", b.math("POWER", gdot, 5), sky.get("glow_wide", 0.55) * glow_k),
              b.math("MULTIPLY", b.math("POWER", gdot, 40), sky.get("glow_tight", 1.3) * glow_k))
vz = b.sep(gi.outputs["v"])[2]
# 지평선 바로 위가 가장 밝고 위로 갈수록 살짝 어두워짐
hb = b.math("SUBTRACT", 1, b.math("MULTIPLY", b.math("MAXIMUM", vz, 0), 0.35))
if HDRI:
    hx, hy, _ = b.sep(hdri_dir(b, gi.outputs["v"]))
    u = b.math("MULTIPLY_ADD", b.math("ARCTAN2", b.math("MULTIPLY", hy, -1), hx), 1 / (2 * math.pi), 0.5)
    lut = b.node("ShaderNodeTexImage", interpolation="Linear", extension="REPEAT")
    lut.image = load_img(CODE / "data/geo/hdri" / SKYJ["horizon_lut"], "Linear Rec.709")
    b._in(lut.inputs["Vector"], b.xyz(u, 0.5, 0))
    hbase = b.vec("SCALE", lut.outputs["Color"], scale=b.math("MULTIPLY", hb, haze.get("brightness", 1.0)))
    # 바랜 지도 톤 쪽으로 살짝 (HDRI의 파란 기운을 크림으로)
    hbase = b.mix(hbase, b.cmul(b.rgb(HAZE_COL), b.math("MULTIPLY", hb, haze.get("brightness", 1.0))), haze.get("tone", 0.3))
    c = b.vec("ADD", hbase, b.cmul(b.rgb(GLOW_COL), glow))
else:
    c = b.vec("ADD", b.cmul(b.rgb(HAZE_COL), b.math("MULTIPLY", hb, haze.get("brightness", 1.0))), b.cmul(b.rgb(GLOW_COL), glow))
b._in(go.inputs["c"], c)

# 하늘 (방향, 카메라, 시간 → 색) - 구름 없는 하늘은 물 반사에도 씀
sg, b, gi, go = new_group("sky", [("v", "NodeSocketVector"), ("cam", "NodeSocketVector"), ("time", "NodeSocketFloat"),
                                  ("clouds", "NodeSocketFloat")], [("c", "NodeSocketColor")])
v = gi.outputs["v"]
vx, vy, vz = b.sep(v)
up = b.math("MAXIMUM", vz, 0)
tz = b.math("SUBTRACT", 1, b.math("EXPONENT", b.math("MULTIPLY", up, -sky.get("zenith_falloff", 3.2))))
hcol = b.group(hg, v=v)["c"]
base = b.mix(hcol, b.rgb(ZENITH), tz)
gd = b.vec("DOT_PRODUCT", v, L)
r = math.radians(sun.get("disc_deg", 0.55))
disc = b.smooth(math.cos(r * 1.25), math.cos(r * 0.8), gd)
base = b.vec("ADD", base, b.cmul(b.rgb(SUN_DISC), disc))
# 구름: 시선이 구름 층(높이 HC)과 만나는 점
cx, cy, cz = b.sep(gi.outputs["cam"])
tcl = b.math("DIVIDE", b.math("SUBTRACT", HC, cz), b.math("MAXIMUM", vz, 0.012))
qp = b.vec("ADD", gi.outputs["cam"], b.vec("SCALE", v, scale=tcl))
dens = b.group(cg, p=qp, time=gi.outputs["time"])["d"]
dens = b.math("MULTIPLY", dens, b.smooth(0.015, 0.09, vz))
dens = b.math("MULTIPLY", dens, gi.outputs["clouds"])
# 구름 빛: 낮은 해가 밑면을 비춰 하늘보다 밝은 복숭아빛, 두꺼운 곳만 살짝 보라 그늘, 해 쪽은 금빛 테두리
fw = b.math("POWER", b.math("MAXIMUM", gd, 0), 3)
ccol = b.mix(b.rgb(CLOUD_LIT), b.rgb(CLOUD_SHADE), b.math("MULTIPLY", b.math("POWER", dens, 1.5), cl.get("shading", 0.55)))
ccol = b.vec("ADD", ccol, b.cmul(b.rgb(GLOW_COL), b.math("ADD", b.math("MULTIPLY", fw, 0.6),
                                                          b.math("MULTIPLY", b.math("POWER", b.math("MAXIMUM", gd, 0), 12), 1.6))))
ccol = b.vec("SCALE", ccol, scale=cl.get("brightness", 1.0))
# 먼 구름은 지평선 안개 속으로
far = b.math("SUBTRACT", 1, b.math("EXPONENT", b.math("DIVIDE", tcl, -cl.get("haze_km", 140))))
ccol = b.mix(ccol, hcol, far)
skyc = b.mix(base, ccol, dens)
if HDRI:
    # 실제 노을 하늘 사진 (CC0) + 노을 단계 색(지평선 금빛 → 붉음 → 위쪽 보라) + 해 쪽 구름 가장자리 금빛
    env = b.node("ShaderNodeTexEnvironment", interpolation="Linear")
    env.image = load_img(CODE / "data/geo/hdri" / SKYJ["file"], "Linear Rec.709")
    b._in(env.inputs["Vector"], hdri_dir(b, v))
    ec = b.vec("SCALE", env.outputs["Color"], scale=SKYJ["exposure"] * sky.get("hdri_brightness", 1.0))
    t1 = b.smooth(0.02, 0.16, vz)
    t2 = b.smooth(0.16, 0.55, vz)
    tint = b.mix(b.mix(b.rgb(sky.get("stage_gold", [1.16, 0.97, 0.74])), b.rgb(sky.get("stage_red", [1.12, 0.84, 0.80])), t1),
                 b.rgb(sky.get("stage_violet", [0.93, 0.88, 1.08])), t2)
    toward = b.math("POWER", b.math("MULTIPLY_ADD", gd, 0.5, 0.5), 2)
    amt = b.math("MULTIPLY", sky.get("sunset_grade", 0.6), b.math("MULTIPLY_ADD", toward, 0.65, 0.35))
    ec = b.vec("MULTIPLY", ec, b.mix((1, 1, 1, 1), tint, amt))
    lumE = b.vec("DOT_PRODUCT", ec, (0.2126, 0.7152, 0.0722))
    rim = b.math("MULTIPLY", b.math("POWER", b.math("MAXIMUM", gd, 0), sky.get("rim_power", 5)),
                 b.smooth(sky.get("rim_lo", 0.35), sky.get("rim_hi", 1.4), lumE))
    ec = b.vec("ADD", ec, b.vec("MULTIPLY", ec, b.cmul(b.rgb(sky.get("rim_gold", [0.9, 0.5, 0.12])), b.math("MULTIPLY", rim, sky.get("rim_gain", 0.9)))))
    skyc = b.mix(hcol, ec, b.smooth(0.0, sky.get("horizon_band", 0.07), vz))
b._in(go.inputs["c"], skyc)

# 근경 미세 질감: 근경 마스크(바위·눈·풀·자갈)에 맞춘 풀결·바위 금·자갈 알갱이를 범프와 색으로 - 가까울 때만 (거리로 섞음)
MC = shot.get("micro", {})


def near_micro(b, lit, aux2, wN, P, dist, geom, sunfrac, noise):
    fade = b.math("MULTIPLY", b.smooth(MC.get("far_km", 8.0), 0.05, dist), wN)
    rock, snow, grass = b.sep(aux2.outputs["Color"])
    gravel = aux2.outputs["Alpha"]
    # 풀결: 바람 방향으로 눕힌 길쭉한 잡음 + 포기(덩이)
    rot = b.node("ShaderNodeVectorRotate", rotation_type="Z_AXIS")
    b._in(rot.inputs["Vector"], P)
    rot.inputs["Angle"].default_value = math.radians(MC.get("grass_dir", 35))
    streak = noise(1.0, 4, 0.6, vec=b.vec("MULTIPLY", rot.outputs[0], (1 / 0.008, 1 / 0.05, 1 / 0.008)))
    vc = b.node("ShaderNodeTexVoronoi", feature="F1")
    vc.inputs["Scale"].default_value = 1 / 0.007
    b._in(vc.inputs["Vector"], P)
    clump = b.math("SUBTRACT", 1, vc.outputs["Distance"])
    hum = noise(MC.get("hummock_km", 0.07), 4, 0.55)  # 수십 m 둔덕 - 낮은 해가 작은 그늘을 만든다
    hg = b.math("ADD", b.math("ADD", b.math("MULTIPLY", streak, 0.3), b.math("MULTIPLY", clump, 0.2)), b.math("MULTIPLY", hum, 1.2))
    # 덤불 점: 수십 m 간격 어두운 포기 (풀 많은 곳에만, 반쯤만 켬)
    vs = b.node("ShaderNodeTexVoronoi", feature="F1")
    vs.inputs["Scale"].default_value = 1 / MC.get("shrub_km", 0.03)
    b._in(vs.inputs["Vector"], P)
    on = b.smooth(1 - MC.get("shrub_density", 0.45), 1.0, b.sep(vs.outputs["Color"])[0])
    shrub = b.math("MULTIPLY", b.smooth(0.16, 0.06, vs.outputs["Distance"]), on)
    # 바위: 갈라진 덩어리(보로노이 가장자리 거리) + 잔 결
    vr = b.node("ShaderNodeTexVoronoi", feature="DISTANCE_TO_EDGE")
    vr.inputs["Scale"].default_value = 1 / MC.get("rock_block_km", 0.035)
    vr.inputs["Randomness"].default_value = 0.9
    b._in(vr.inputs["Vector"], b.vec("ADD", P, b.vec("SCALE", b.xyz(noise(0.05, 3, 0.5), 0.0, 0.0), scale=0.01)))
    crack = b.smooth(0.0, 0.09, vr.outputs["Distance"])
    hr = b.math("ADD", b.math("MULTIPLY", crack, 0.7), b.math("MULTIPLY", noise(0.012, 5, 0.6), 0.3))
    # 자갈: 몇 m 알갱이
    vg = b.node("ShaderNodeTexVoronoi", feature="F1")
    vg.inputs["Scale"].default_value = 1 / 0.003
    b._in(vg.inputs["Vector"], P)
    hv = b.math("SUBTRACT", 1, vg.outputs["Distance"])
    hs = noise(0.06, 3, 0.5)
    H = b.math("ADD", b.math("ADD", b.math("MULTIPLY", rock, hr), b.math("MULTIPLY", gravel, b.math("MULTIPLY", hv, 0.5))),
               b.math("ADD", b.math("MULTIPLY", grass, b.math("MULTIPLY", hg, 0.35)), b.math("MULTIPLY", snow, b.math("MULTIPLY", hs, 0.2))))
    bump = b.node("ShaderNodeBump")
    b._in(bump.inputs["Height"], H)
    bump.inputs["Distance"].default_value = MC.get("height_km", 0.008) * EX
    b._in(bump.inputs["Strength"], fade)
    b._in(bump.inputs["Normal"], geom.outputs["Normal"])
    ndl_b = b.vec("DOT_PRODUCT", bump.outputs["Normal"], L)
    ndl_g = b.vec("DOT_PRODUCT", geom.outputs["Normal"], L)
    ratio = b.math("DIVIDE", b.math("MAXIMUM", b.math("ADD", ndl_b, 0.05), 0), b.math("MAXIMUM", b.math("ADD", ndl_g, 0.05), 0.05))
    ratio = b.math("MINIMUM", ratio, 2.0)
    lit = b.cmul(lit, b.math("ADD", b.math("SUBTRACT", 1, sunfrac), b.math("MULTIPLY", sunfrac, ratio)))
    # 색: 바위 금은 어둡게, 자갈은 알갱이 얼룩, 풀은 결 따라 밝고 어두운 초록·짚색, 오목한 곳 그늘
    lit = b.cmul(lit, b.math("SUBTRACT", 1, b.math("MULTIPLY", b.math("MULTIPLY", rock, b.math("SUBTRACT", 1, crack)), b.math("MULTIPLY", fade, 0.45))))
    lit = b.cmul(lit, b.math("ADD", 1, b.math("MULTIPLY", b.math("MULTIPLY", b.math("SUBTRACT", hv, 0.5), gravel), b.math("MULTIPLY", fade, 0.35))))
    lit = b.cmul(lit, b.math("SUBTRACT", 1, b.math("MULTIPLY", b.math("MULTIPLY", shrub, grass), b.math("MULTIPLY", fade, MC.get("shrub_dark", 0.45)))))
    gt = b.mix(b.rgb(MC.get("grass_dark", [0.88, 0.92, 0.82])), b.rgb(MC.get("grass_light", [1.12, 1.05, 0.86])), streak)
    lit = b.vec("MULTIPLY", lit, b.mix((1, 1, 1, 1), gt, b.math("MULTIPLY", grass, b.math("MULTIPLY", fade, MC.get("grass_tint", 0.5)))))
    lit = b.cmul(lit, b.math("ADD", 1, b.math("MULTIPLY", b.math("SUBTRACT", H, 0.35), b.math("MULTIPLY", fade, 0.2))))
    return lit


# ── 6. 땅 셰이더 ──
def make_material(name, is_near=False):
    global b
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = NB(mat.node_tree)
    b.n.clear()
    out = b.node("ShaderNodeOutputMaterial")
    geom = b.node("ShaderNodeNewGeometry")
    camd = b.node("ShaderNodeCameraData")
    rigo = b.group(rig)
    P = geom.outputs["Position"]
    I = geom.outputs["Incoming"]
    V = b.vec("SCALE", I, scale=-1)  # 카메라 → 점
    dist = camd.outputs["View Distance"]
    px, py, pz = b.sep(P)
    uv = b.xyz(b.math("MULTIPLY_ADD", px, 1 / W, 0.5), b.math("MULTIPLY_ADD", py, 1 / H, 0.5), 0)

    def img(path, at, alpha=False):
        im = load_img(path)
        if alpha:
            im.alpha_mode = "CHANNEL_PACKED"
        nd = b.node("ShaderNodeTexImage", interpolation="Cubic" if shot.get("cubic") else "Linear", extension="EXTEND")
        nd.image = im
        b._in(nd.inputs["Vector"], at)
        return nd

    lit_c = b.cmul(img(CACHE / "lit.png", uv).outputs["Color"], 2.0)
    aux_c = img(CACHE / "aux.png", uv).outputs["Color"]
    wN = None
    if is_near:
        # 근경 층: 가장자리 RAMP km 띠에서 원경 텍스처 → 근경 텍스처로 (높이도 같은 비율로 녹아 있음)
        nox, noy = nmeta["origin_km"]
        nw, nh = nmeta["extent_km"]
        uvn = b.xyz(b.math("MULTIPLY_ADD", b.math("SUBTRACT", px, nox), 1 / nw, 0.5),
                    b.math("MULTIPLY_ADD", b.math("SUBTRACT", py, noy), 1 / nh, 0.5), 0)
        dx = b.math("SUBTRACT", nw / 2, b.math("ABSOLUTE", b.math("SUBTRACT", px, nox)))
        dy = b.math("SUBTRACT", nh / 2, b.math("ABSOLUTE", b.math("SUBTRACT", py, noy)))
        wN = b.smooth(0.0, RAMP, b.math("MINIMUM", dx, dy))
        lit_c = b.mix(lit_c, b.cmul(img(NEAR / "lit.png", uvn).outputs["Color"], 2.0), wN)
        aux_c = b.mix(aux_c, img(NEAR / "aux.png", uvn).outputs["Color"], wN)
        aux2 = img(NEAR / "aux2.png", uvn, alpha=True)
    lit = lit_c
    water, sunfrac, _ = b.sep(aux_c)
    # 구름 그림자: 이 점에서 해 쪽으로 구름 층까지
    k = (HC) / max(L[2], 0.03)
    sp = b.vec("ADD", P, b.vec("SCALE", (L[0] / max(L[2], 0.03), L[1] / max(L[2], 0.03), 0),
                              scale=b.math("SUBTRACT", HC, pz)))
    cd = b.group(cg, p=sp, time=rigo["time"])["d"]
    cs = b.math("SUBTRACT", 1, b.math("MULTIPLY", cd, cl.get("shadow", 0.75)))
    lit = b.cmul(lit, b.math("SUBTRACT", 1, b.math("MULTIPLY", sunfrac, b.math("SUBTRACT", 1, cs))))
    # 가까운 땅의 잔주름 빛: 잡음 높이로 법선을 흔들어 낮은 해가 만드는 작은 그늘 (구운 빛 대비 비율만 곱함)
    mr = b.node("ShaderNodeTexNoise", noise_dimensions="3D")
    mr.inputs["Scale"].default_value = 1.0
    mr.inputs["Detail"].default_value = 8
    mr.inputs["Roughness"].default_value = 0.62
    mr.inputs["Distortion"].default_value = 0.0
    b._in(mr.inputs["Vector"], b.vec("SCALE", P, scale=1 / shot.get("micro_km", 0.35)))
    near_m = b.smooth(shot.get("micro_far_km", 18), 0.5, dist)
    bump = b.node("ShaderNodeBump")
    b._in(bump.inputs["Height"], mr.outputs["Fac"])
    bump.inputs["Distance"].default_value = shot.get("micro_height_km", 0.03) * EX
    b._in(bump.inputs["Strength"], near_m)
    b._in(bump.inputs["Normal"], geom.outputs["Normal"])
    ndl_b = b.vec("DOT_PRODUCT", bump.outputs["Normal"], L)
    ndl_g = b.vec("DOT_PRODUCT", geom.outputs["Normal"], L)
    ratio = b.math("DIVIDE", b.math("MAXIMUM", b.math("ADD", ndl_b, 0.04), 0), b.math("MAXIMUM", b.math("ADD", ndl_g, 0.04), 0.04))
    ratio = b.math("MINIMUM", ratio, 2.2)
    lit = b.cmul(lit, b.math("ADD", b.math("SUBTRACT", 1, sunfrac), b.math("MULTIPLY", sunfrac, ratio)))
    # 가까운 땅의 얼룩: 수백 m 풀밭·마른 땅 색 얼룩 + 수십 m 밝기 얼룩 (멀면 사라짐 - 구운 색이 맡음)
    def noise(scale_km, detail=4, rough=0.55, vec=None):
        nd = b.node("ShaderNodeTexNoise", noise_dimensions="3D")
        nd.inputs["Scale"].default_value = 1.0
        nd.inputs["Detail"].default_value = detail
        nd.inputs["Roughness"].default_value = rough
        b._in(nd.inputs["Vector"], b.vec("SCALE", vec if vec is not None else P, scale=1 / scale_km))
        return nd.outputs["Fac"]


    pa = b.smooth(0.38, 0.62, noise(shot.get("patch_km", 0.45), 5, 0.6))
    tint = b.mix(b.rgb(shot.get("patch_a", [0.86, 1.0, 0.82])), b.rgb(shot.get("patch_b", [1.1, 0.97, 0.84])), pa)
    near = b.smooth(shot.get("detail_far_km", 22), 1.0, dist)
    tint = b.mix((1, 1, 1, 1), tint, b.math("MULTIPLY", near, shot.get("detail", 0.8)))
    lit = b.vec("MULTIPLY", lit, tint)
    near2 = b.smooth(shot.get("fine_far_km", 6), 0.3, dist)
    fine = b.math("SUBTRACT", noise(0.04, 3, 0.5), 0.5)
    lit = b.cmul(lit, b.math("ADD", 1, b.math("MULTIPLY", fine, b.math("MULTIPLY", near2, shot.get("fine", 0.35)))))
    if is_near:
        lit = near_micro(b, lit, aux2, wN, P, dist, geom, sunfrac, noise)
    # 물: 하늘 반사(프레넬) + 해 반짝임
    vx_, vy_, vz_ = b.sep(V)
    wn = b.node("ShaderNodeTexNoise", noise_dimensions="3D")
    wn.inputs["Scale"].default_value = 1.0
    wn.inputs["Detail"].default_value = 3
    b._in(wn.inputs["Vector"], b.vec("SCALE", P, scale=6))
    wob = b.math("MULTIPLY", b.math("SUBTRACT", wn.outputs["Fac"], 0.5), 0.06)
    R = b.vec("NORMALIZE", b.xyz(b.math("ADD", vx_, wob), b.math("SUBTRACT", vy_, wob), b.math("MULTIPLY", vz_, -1)))
    refl = b.group(sg, v=R, cam=P, time=rigo["time"], clouds=1.0)["c"]  # 물에 비친 하늘·구름 (반사 광선은 물 위 점에서 출발)
    cosI = b.math("MAXIMUM", b.math("MULTIPLY", vz_, -1), 0)
    fres = b.math("ADD", 0.03, b.math("MULTIPLY", 0.97, b.math("POWER", b.math("SUBTRACT", 1, cosI), 5)))
    glint = b.math("POWER", b.math("MAXIMUM", b.vec("DOT_PRODUCT", R, L), 0), shot.get("glint_power", 220))
    glint = b.math("MULTIPLY", b.math("MULTIPLY", glint, cs), sun.get("glint", 6))
    wf = b.math("MULTIPLY", fres, shot.get("water_reflect", 0.8))
    wadd = b.vec("ADD", b.cmul(refl, wf), b.cmul(b.rgb(SUN_DISC), b.math("MULTIPLY", glint, 0.02)))
    # 물은 반사된 만큼 제 색이 줄어든다
    col = b.vec("ADD", b.cmul(lit, b.math("SUBTRACT", 1, b.math("MULTIPLY", water, wf))), b.cmul(wadd, water))
    # 공기 원근(안개): 거리 × 고도에 따라 짙기가 줄어드는 대기
    camz = b.sep(rigo["cam"])[2]
    havg = b.math("MAXIMUM", b.math("MULTIPLY", b.math("ADD", camz, pz), 0.5), 0)
    od = b.math("MULTIPLY", b.math("DIVIDE", dist, haze.get("distance_km", 70)),
                b.math("EXPONENT", b.math("DIVIDE", havg, -haze.get("scale_height_km", 2.5))))
    od = b.math("MULTIPLY", od, haze.get("strength", 1.0))
    fog = b.math("SUBTRACT", 1, b.math("EXPONENT", b.math("MULTIPLY", od, -1)))
    # 지형 가장자리는 안개로 녹인다
    ux, uy, _ = b.sep(uv)
    edge = b.math("MINIMUM", b.math("MINIMUM", ux, b.math("SUBTRACT", 1, ux)), b.math("MINIMUM", uy, b.math("SUBTRACT", 1, uy)))
    fog = b.math("MAXIMUM", fog, b.smooth(0.05, 0.0, edge))
    fogc = b.group(hg, v=V)["c"]
    final = b.mix(col, fogc, fog)
    em = b.node("ShaderNodeEmission")
    b._in(em.inputs["Color"], final)
    em.inputs["Strength"].default_value = 1.0
    b._in(out.inputs["Surface"], em.outputs[0])
    return mat


terrain.data.materials.append(make_material("terrain"))
if near_ob:
    near_ob.data.materials.append(make_material("near", is_near=True))

# ── 7. 하늘 (월드) ──
world = bpy.data.worlds.new("sky")
scene.world = world
world.use_nodes = True
b = NB(world.node_tree)
b.n.clear()
wout = b.node("ShaderNodeOutputWorld")
tc = b.node("ShaderNodeTexCoord")
rigo = b.group(rig)
wv = b.vec("NORMALIZE", tc.outputs["Generated"])
skc = b.group(sg, v=wv, cam=rigo["cam"], time=rigo["time"], clouds=1.0)["c"]
bg = b.node("ShaderNodeBackground")
b._in(bg.inputs["Color"], skc)
b._in(wout.inputs["Surface"], bg.outputs[0])

# ── 8. 카메라 길 (키 사이를 부드러운 3차 곡선으로, 전체 시간은 살짝 느리게 시작·끝) ──
keys = sorted(shot["camera"], key=lambda k: k["t"])
kt = np.array([k["t"] for k in keys], float)
kx, ky = geo.fwd(np.array([k["lon"] for k in keys]), np.array([k["lat"] for k in keys]), lon0, lat0)
kagl = np.array([k.get("agl", 800) for k in keys], float)
khead = np.array([k["heading"] + geo.north_angle(k["lon"], k["lat"], lon0, lat0) for k in keys], float)
khead = np.degrees(np.unwrap(np.radians(khead)))
kpitch = np.array([k.get("pitch", -5) for k in keys], float)
kroll = np.array([k.get("roll", 0) for k in keys], float)
klens = np.array([k.get("lens", shot.get("lens", 32)) for k in keys], float)
chans = np.stack([kx, ky, kagl, khead, kpitch, kroll, klens], 1)


def hermite(t):
    if len(kt) == 1:
        return chans[0]
    i = int(np.clip(np.searchsorted(kt, t, side="right") - 1, 0, len(kt) - 2))
    t0, t1 = kt[i], kt[i + 1]
    s = (t - t0) / (t1 - t0)

    def tan(j):
        a, b_ = max(j - 1, 0), min(j + 1, len(kt) - 1)
        return (chans[b_] - chans[a]) / (kt[b_] - kt[a]) * (t1 - t0)

    m0, m1 = tan(i), tan(i + 1)
    h00, h10, h01, h11 = 2 * s ** 3 - 3 * s ** 2 + 1, s ** 3 - 2 * s ** 2 + s, -2 * s ** 3 + 3 * s ** 2, s ** 3 - s ** 2
    return h00 * chans[i] + h10 * m0 + h01 * chans[i + 1] + h11 * m1


ease = shot.get("ease", 0.5)


def timewarp(x):
    return (1 - ease) * x + ease * (x * x * (3 - 2 * x))


cam_data = bpy.data.cameras.new("cam")
cam_data.sensor_width = 36
cam_data.clip_start = 0.01
cam_data.clip_end = max(W, H) * 1.6
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
scene.frame_start, scene.frame_end = 0, NFRAMES - 1
cleared = []
for f in range(NFRAMES):
    u = timewarp(f / max(1, NFRAMES - 1))
    x, y, agl, hd, pt, rl, lens = hermite(kt[0] + u * (kt[-1] - kt[0]))
    ground = float(geo.sample(clear, meta, x, y)) * EX / 1000
    z = ground + agl / 1000 - float(geo.drop(x, y))
    cam.location = (x, y, z)
    rot = Matrix.Rotation(math.radians(-hd), 4, "Z") @ Matrix.Rotation(math.radians(90 + pt), 4, "X") @ Matrix.Rotation(math.radians(rl), 4, "Z")
    cam.rotation_euler = rot.to_euler("XYZ")
    cam_data.lens = lens
    cam.keyframe_insert("location", frame=f)
    cam.keyframe_insert("rotation_euler", frame=f)
    cam_data.keyframe_insert("lens", frame=f)
    for i in range(3):
        rig_cam.inputs[i].default_value = (x, y, z)[i]
        rig_cam.inputs[i].keyframe_insert("default_value", frame=f)
    rig_time.outputs[0].default_value = f / 30
    rig_time.outputs[0].keyframe_insert("default_value", frame=f)
    cleared.append((x, y, z * 1000))
log(f"카메라 {NFRAMES}프레임, 높이 {min(c[2] for c in cleared):.0f}~{max(c[2] for c in cleared):.0f} m(장면)")

# ── 9. 렌더 ──
OUT.mkdir(parents=True, exist_ok=True)
TMP = OUT / ".exr"
shutil.rmtree(TMP, ignore_errors=True)
TMP.mkdir()
frames = ONLY if ONLY is not None else list(range(NFRAMES))
if ONLY is None:
    for old in OUT.glob("*.jpg"):
        old.unlink()
times = []
for f in frames:
    t = time.time()
    scene.frame_set(f)
    scene.render.filepath = str(TMP / f"{f:05d}.exr")
    bpy.ops.render.render(write_still=True)
    times.append(time.time() - t)
    if f == frames[0] or len(times) % 30 == 0 or f == frames[-1]:
        log(f"프레임 {f} ({len(times)}/{len(frames)}) {times[-1]:.2f}s, 평균 {sum(times) / len(times):.2f}s")
log(f"렌더 평균 {sum(times) / len(times):.2f}s/프레임 (첫 프레임 {times[0]:.1f}s)")

# ── 10. 필름 마감 → JPEG ──
env = dict(os.environ, OPENCV_IO_ENABLE_OPENEXR="1")
subprocess.run([PY, "-I", str(HERE / "post.py"), str(TMP), str(OUT), json.dumps(shot.get("grade", {})),
                str(SCALE)], check=True, env=env)
shutil.rmtree(TMP, ignore_errors=True)
log(f"끝: {OUT} ({len(frames)}장)")
