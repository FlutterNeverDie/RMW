// 지도 장면 지형(산 음영·땅 색·10m 해안선·호수·강)을 장면 지역만 만들어 둔다 - map-scene.mjs가 장면에 "terrain"이 있으면 읽어 넣는다.
// 실행: node scripts/terrain.mjs --scene episodes/<편>/maps/<장면>.json   → data/geo/terrain/<편>-<장면>/ (git 밖)
//   지역은 장면 카메라에서 저절로(보이는 범위 + 여유). 장면 JSON "terrain": {"bbox":[서,남,동,북]}로 직접 줄 수도 있다.
// 자료(모두 퍼블릭 도메인, 설명란 출처):
//   - 고도: NOAA NCEI ETOPO 2022 15 arc-second (15° 조각 GeoTIFF, data/geo/etopo15/에)
//   - 땅 색: Natural Earth I 토지 피복(NE1_HR_LC, 1/60°), 해안선·호수·강: Natural Earth 10m (data/geo/ne/, 처음 한 번 받아 둠)
// 결과: color.png(토지 피복 색, 메르카토르 격자), shade.png(산 음영, 회색 128 = 평지),
//   height.png(16비트 회색, 같은 격자, 고도 m = 값 × scale - offset, 바다 밑 깊이도 그대로), terrain.json({bbox, size, height, land, lakes, rivers})
import { existsSync } from "node:fs";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEO = join(ROOT, "data/geo");

const arg = (k) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? undefined : process.argv[i + 1];
};
const scenePath = join(ROOT, arg("scene") ?? "");
const scene = JSON.parse(await readFile(scenePath, "utf8"));
const ep = basename(dirname(dirname(scenePath)));
const name = basename(scenePath, ".json");
const out = join(GEO, "terrain", `${ep}-${name}`);

// ── 지역: 카메라 키마다 보이는 범위(가로 ≈ 450/zoom 도) + 여유(기울이면 먼 쪽 - 그 너머는 안개가 가린다) ──
function sceneBbox() {
  if (scene.terrain?.bbox) return scene.terrain.bbox;
  let [w, s, e, n] = [180, 90, -180, -90];
  // follow(부대 따라가기) 키는 at 대신 그 부대 path의 모든 점을 같은 zoom으로
  const spots = scene.camera.flatMap((c) => (c.follow ? (scene.units ?? []).find((u) => u.id === c.follow)?.path?.map((p) => ({ ...c, at: p.at })) ?? [] : [c]));
  for (const c of spots) {
    const half = (450 / c.zoom) * (c.tilt ? 1.0 : 0.6);
    const [lon, lat] = c.at;
    const cos = Math.cos((lat * Math.PI) / 180);
    w = Math.min(w, lon - half);
    e = Math.max(e, lon + half);
    s = Math.min(s, lat - half * cos);
    n = Math.max(n, lat + half * cos);
  }
  const r = (x) => Math.round(x * 4) / 4;
  return [r(w - 0.25), r(Math.max(-80, s - 0.25)), r(e + 0.25), r(Math.min(84, n + 0.25))];
}
const bbox = sceneBbox();
const [W, S, E, N] = bbox;
console.log("지역", bbox.join(", "));

// ── 고도(ETOPO 2022 15″ GeoTIFF 15°×15° 조각, NCEI에서 처음 한 번 받아 data/geo/etopo15/에) ──
// 조각 안은 256×256 블록마다 deflate + 부동소수 예측(predictor 3) - 필요한 블록만 풀어 캐시한다
const ETOPO_URL = "https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/15s/15s_surface_elev_gtif";
const tileName = (north, west) =>
  `${north >= 0 ? "N" : "S"}${String(Math.abs(north)).padStart(2, "0")}${west >= 0 ? "E" : "W"}${String(Math.abs(west)).padStart(3, "0")}`;
async function openTile(north, west) {
  const name = tileName(north, west);
  const file = join(GEO, "etopo15", `${name}.tif`);
  if (!existsSync(file)) {
    await mkdir(dirname(file), { recursive: true });
    console.log(`ETOPO ${name} 받는 중…`);
    const res = await fetch(`${ETOPO_URL}/ETOPO_2022_v1_15s_${name}_surface.tif`);
    if (!res.ok) throw new Error(`ETOPO ${name} ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  const buf = await readFile(file);
  const ifd = buf.readUInt32LE(4);
  const n = buf.readUInt16LE(ifd);
  const tag = {};
  for (let i = 0; i < n; i++) {
    const o = ifd + 2 + i * 12;
    const t = buf.readUInt16LE(o);
    const type = buf.readUInt16LE(o + 2);
    const cnt = buf.readUInt32LE(o + 4);
    const val = type === 3 && cnt === 1 ? buf.readUInt16LE(o + 8) : buf.readUInt32LE(o + 8);
    tag[t] = { cnt, val };
  }
  const size = tag[256].val;
  const tw = tag[322].val;
  const across = Math.ceil(size / tw);
  const offs = (k) => buf.readUInt32LE(tag[324].val + k * 4);
  const lens = (k) => buf.readUInt32LE(tag[325].val + k * 4);
  const blocks = new Map();
  const block = (k) => {
    let b = blocks.get(k);
    if (b) return b;
    const raw = zlib.inflateSync(buf.subarray(offs(k), offs(k) + lens(k)));
    // 부동소수 예측 되돌리기: 줄마다 바이트 누적합 → 4개 바이트 면(큰 자리부터)을 다시 모아 float
    b = new Float32Array(tw * tw);
    const row = Buffer.alloc(tw * 4);
    for (let r = 0; r < tw; r++) {
      const src = raw.subarray(r * tw * 4, (r + 1) * tw * 4);
      for (let i = 1; i < src.length; i++) src[i] = (src[i] + src[i - 1]) & 0xff;
      for (let c = 0; c < tw; c++) {
        row[c * 4] = src[c];
        row[c * 4 + 1] = src[tw + c];
        row[c * 4 + 2] = src[2 * tw + c];
        row[c * 4 + 3] = src[3 * tw + c];
        b[r * tw + c] = row.readFloatBE(c * 4);
      }
    }
    blocks.set(k, b);
    return b;
  };
  return (c, r) => block(Math.floor(r / tw) * across + Math.floor(c / tw))[(r % tw) * tw + (c % tw)];
}
async function etopo() {
  const RES = 240;
  const tiles = new Map();
  for (let north = Math.ceil(N / 15) * 15; north > S; north -= 15)
    for (let west = Math.floor(W / 15) * 15; west < E; west += 15)
      tiles.set(`${north},${west}`, await openTile(north, west));
  /** 전체 격자 한 칸: gc = floor(경도×240)(칸 서쪽 끝 = gc/240), gr = floor(-위도×240)(칸 북쪽 끝 = -gr/240) */
  const px = (gc, gr) => {
    const north = Math.ceil(-gr / RES / 15) * 15;
    const west = Math.floor(gc / (15 * RES)) * 15;
    const t = tiles.get(`${north},${west}`);
    if (!t) return 0;
    return t(gc - west * RES, north * RES + gr);
  };
  return {
    cellsize: 1 / RES,
    at(lon, lat) {
      const x = lon * RES - 0.5;
      const y = -lat * RES - 0.5;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      return (
        px(x0, y0) * (1 - fx) * (1 - fy) +
        px(x0 + 1, y0) * fx * (1 - fy) +
        px(x0, y0 + 1) * (1 - fx) * fy +
        px(x0 + 1, y0 + 1) * fx * fy
      );
    },
  };
}

// ── 땅 색(NE1_HR_LC: 압축 없는 RGB TIFF, 한 줄이 한 덩이, 1/60°) ──
async function landCover() {
  const tif = join(GEO, "ne/NE1_HR_LC/NE1_HR_LC.tif");
  const fh = await open(tif, "r");
  const read = async (pos, len) => {
    const b = Buffer.alloc(len);
    await fh.read(b, 0, len, pos);
    return b;
  };
  const h = await read(0, 8);
  const le = h.toString("latin1", 0, 2) === "II";
  const u16 = (b, o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
  const u32 = (b, o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  const ifd = u32(h, 4);
  const cnt = u16(await read(ifd, 2), 0);
  const tags = await read(ifd + 2, cnt * 12);
  let width = 0;
  let stripOffsets = 0;
  for (let i = 0; i < cnt; i++) {
    const tag = u16(tags, i * 12);
    if (tag === 256) width = u16(tags, i * 12 + 8);
    if (tag === 273) stripOffsets = u32(tags, i * 12 + 8);
  }
  const RES = 60; // 1/60°
  const r0 = Math.max(0, Math.floor((90 - N) * RES) - 1);
  const r1 = Math.min(10799, Math.ceil((90 - S) * RES) + 1);
  const c0 = Math.max(0, Math.floor((W + 180) * RES) - 1);
  const c1 = Math.min(width - 1, Math.ceil((E + 180) * RES) + 1);
  const offs = await read(stripOffsets + r0 * 4, (r1 - r0 + 1) * 4);
  const rows = [];
  for (let r = r0; r <= r1; r++) {
    const o = u32(offs, (r - r0) * 4);
    rows.push(await read(o + c0 * 3, (c1 - c0 + 1) * 3));
  }
  await fh.close();
  return (lon, lat) => {
    // 픽셀 가운데 기준
    const x = Math.min(c1 - c0 - 0.001, Math.max(0, (lon + 180) * RES - 0.5 - c0));
    const y = Math.min(r1 - r0 - 0.001, Math.max(0, (90 - lat) * RES - 0.5 - r0));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const px = (c, r, ch) => rows[r][c * 3 + ch];
    return [0, 1, 2].map(
      (ch) =>
        px(x0, y0, ch) * (1 - fx) * (1 - fy) +
        px(x0 + 1, y0, ch) * fx * (1 - fy) +
        px(x0, y0 + 1, ch) * (1 - fx) * fy +
        px(x0 + 1, y0 + 1, ch) * fx * fy,
    );
  };
}

// ── PNG 쓰기(zlib만, depth 16이면 data는 큰 자리 먼저 2바이트씩) ──
function png(w, h, channels, data, depth = 8) {
  const crcTable = (buf) => zlib.crc32(buf);
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type, "latin1"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crcTable(tb) >>> 0);
    return Buffer.concat([len, tb, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = depth;
  ihdr[9] = channels === 1 ? 0 : 2;
  const line = (w * channels * depth) / 8;
  const raw = Buffer.alloc((line + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (line + 1)] = 0;
    data.copy(raw, y * (line + 1) + 1, y * line, (y + 1) * line);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── 셰이프파일(다각형·선)과 속성 ──
async function shapefile(base) {
  const shp = await readFile(`${base}.shp`);
  const dbf = await readFile(`${base}.dbf`);
  const nRec = dbf.readUInt32LE(4);
  const headLen = dbf.readUInt16LE(8);
  const recLen = dbf.readUInt16LE(10);
  const fields = [];
  for (let o = 32; dbf[o] !== 0x0d; o += 32)
    fields.push({ name: dbf.toString("latin1", o, o + 11).replace(/\0.*$/, ""), len: dbf[o + 16] });
  const props = [];
  for (let r = 0; r < nRec; r++) {
    let o = headLen + r * recLen + 1;
    const p = {};
    for (const f of fields) {
      p[f.name] = dbf.toString("utf8", o, o + f.len).replace(/\0/g, "").trim();
      o += f.len;
    }
    props.push(p);
  }
  const shapes = [];
  let o = 100;
  while (o < shp.length) {
    const len = shp.readInt32BE(o + 4) * 2;
    const c = o + 8;
    const type = shp.readInt32LE(c);
    if (type === 3 || type === 5) {
      const box = [0, 1, 2, 3].map((i) => shp.readDoubleLE(c + 4 + i * 8));
      const nParts = shp.readInt32LE(c + 36);
      const nPts = shp.readInt32LE(c + 40);
      const parts = Array.from({ length: nParts }, (_, i) => shp.readInt32LE(c + 44 + i * 4));
      const p0 = c + 44 + nParts * 4;
      const rings = parts.map((start, i) => {
        const end = i + 1 < nParts ? parts[i + 1] : nPts;
        const ring = [];
        for (let j = start; j < end; j++)
          ring.push([shp.readDoubleLE(p0 + j * 16), shp.readDoubleLE(p0 + j * 16 + 8)]);
        return ring;
      });
      shapes.push({ box, rings });
    } else shapes.push(null);
    o = c + len;
  }
  return shapes.map((s, i) => s && { ...s, props: props[i] ?? {} });
}

const pad = 0.6;
const BX = [W - pad, S - pad, E + pad, N + pad];
const touches = (b) => b[0] <= BX[2] && b[2] >= BX[0] && b[1] <= BX[3] && b[3] >= BX[1];
const r4 = (p) => [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4];

/** 다각형 고리를 사각형으로 자른다(서덜랜드-호지먼) */
function clipRing(ring) {
  const edges = [
    (p) => p[0] >= BX[0],
    (p) => p[0] <= BX[2],
    (p) => p[1] >= BX[1],
    (p) => p[1] <= BX[3],
  ];
  const cross = [
    (a, b) => [BX[0], a[1] + ((b[1] - a[1]) * (BX[0] - a[0])) / (b[0] - a[0])],
    (a, b) => [BX[2], a[1] + ((b[1] - a[1]) * (BX[2] - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (BX[1] - a[1])) / (b[1] - a[1]), BX[1]],
    (a, b) => [a[0] + ((b[0] - a[0]) * (BX[3] - a[1])) / (b[1] - a[1]), BX[3]],
  ];
  let pts = ring;
  edges.forEach((inside, k) => {
    const res = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const ia = inside(a);
      const ib = inside(b);
      if (ia) res.push(a);
      if (ia !== ib) res.push(cross[k](a, b));
    }
    pts = res;
  });
  return pts.length >= 3 ? pts.map(r4) : null;
}
/** 선을 사각형 안쪽 토막들로 */
function clipLine(line) {
  const inside = (p) => p[0] >= BX[0] && p[0] <= BX[2] && p[1] >= BX[1] && p[1] <= BX[3];
  const outLines = [];
  let cur = [];
  for (const p of line) {
    if (inside(p)) cur.push(r4(p));
    else if (cur.length) {
      cur.push(r4(p));
      outLines.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) outLines.push(cur);
  return outLines.filter((l) => l.length > 1);
}

// 저수지·운하는 근대 이후(1930년 전 장면에서는 뺀다 - 칼카강 1223에 카호우카 저수지가 보였다)
const sceneYear = scene.year ?? scene.years?.[0]?.year ?? 2000;
const modern = sceneYear >= 1930;
// 호수 가운데선(Lake Centerline)도 뺀다 - 저수지를 빼고 나면 그 자리를 지나던 곧은 선만 남았다
const keep = (s) => modern || !/reservoir|canal|lake centerline/i.test(s.props.featurecla ?? "");

async function vectors() {
  const polys = async (base) =>
    (await shapefile(join(GEO, "ne", base, base)))
      .filter((s) => s && touches(s.box) && keep(s))
      .flatMap((s) => s.rings.map(clipRing).filter(Boolean));
  const land = await polys("ne_10m_land");
  const lakes = [...(await polys("ne_10m_lakes")), ...(await polys("ne_10m_lakes_europe"))];
  const rivers = [];
  for (const base of ["ne_10m_rivers_lake_centerlines", "ne_10m_rivers_europe"])
    for (const s of await shapefile(join(GEO, "ne", base, base))) {
      if (!s || !touches(s.box) || !keep(s)) continue;
      // 굵기: strokeweig(있으면) 또는 scalerank가 작을수록 큰 강
      const w = Number(s.props.strokeweig) || Math.max(0.3, 1.6 - Number(s.props.scalerank || 8) * 0.12);
      for (const ring of s.rings) for (const l of clipLine(ring)) rivers.push({ w: Math.round(w * 100) / 100, l });
    }
  return { land, lakes, rivers };
}

// ── 메르카토르 격자로 다시 뽑고 음영 ──
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const unmerc = (y) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;

const elev = await etopo();
const color = await landCover();
const step = elev.cellsize; // 도
const cols = Math.round((E - W) / step);
const yN = merc(N);
const yS = merc(S);
const stepY = (step * Math.PI) / 180; // 메르카토르 y(라디안)
const rows = Math.round((yN - yS) / stepY);
console.log(`격자 ${cols}×${rows}`);

const zs = new Float32Array(cols * rows);
// 고도 원본(바다 밑 포함) - 지도 장면이 골짜기 초록·능선 마름·바위 비탈·눈선을 칠할 때 쓴다(prep_terrain.py와 같은 식)
const HEIGHT = { offset: 11000, scale: 1 }; // ETOPO 범위 약 -10900~8850 m가 16비트에 1 m 단위로 들어간다
const height = Buffer.alloc(cols * rows * 2);
const rgb = Buffer.alloc(cols * rows * 3);
for (let r = 0; r < rows; r++) {
  const lat = unmerc(yN - (r + 0.5) * stepY);
  for (let c = 0; c < cols; c++) {
    const lon = W + (c + 0.5) * step;
    const z = elev.at(lon, lat);
    zs[r * cols + c] = Math.max(0, z); // 바다 밑은 평평하게(물은 10m 해안선이 덮는다)
    height.writeUInt16BE(Math.min(65535, Math.max(0, Math.round((z + HEIGHT.offset) / HEIGHT.scale))), (r * cols + c) * 2);
    let [R, G, B] = color(lon, lat);
    // 토지 피복 원본은 물이 흰색 - 해안선(10m)과 1.85km 격자가 어긋난 물가가 하얗게 비치지 않게, 물(흰색이고 고도 0 이하)은 왼쪽 땅 색으로
    if (Math.min(R, G, B) > 225 && elev.at(lon, lat) <= 1 && c > 0) {
      R = rgb[(r * cols + c - 1) * 3];
      G = rgb[(r * cols + c - 1) * 3 + 1];
      B = rgb[(r * cols + c - 1) * 3 + 2];
      if (Math.min(R, G, B) > 225) [R, G, B] = [222, 216, 170];
    }
    rgb[(r * cols + c) * 3] = R;
    rgb[(r * cols + c) * 3 + 1] = G;
    rgb[(r * cols + c) * 3 + 2] = B;
  }
}
// 음영: 북서(주) + 서·북 빛을 섞고, 낮은 기복도 보이게 높이를 2.5배. 평지 = 회색 128(overlay로 섞으면 그대로)
const shade = Buffer.alloc(cols * rows);
const lights = [
  [315, 0.55],
  [270, 0.2],
  [0, 0.25],
].map(([az, w]) => [((360 - az + 90) * Math.PI) / 180, w]);
const alt = (45 * Math.PI) / 180;
for (let r = 0; r < rows; r++) {
  const lat = unmerc(yN - (r + 0.5) * stepY);
  const cell = step * 111320 * Math.cos((lat * Math.PI) / 180); // 메르카토르라 가로·세로 같은 미터
  for (let c = 0; c < cols; c++) {
    const g = (cc, rr) =>
      zs[Math.min(rows - 1, Math.max(0, rr)) * cols + Math.min(cols - 1, Math.max(0, cc))] * 2.5;
    const dzdx = (g(c + 1, r - 1) + 2 * g(c + 1, r) + g(c + 1, r + 1) - g(c - 1, r - 1) - 2 * g(c - 1, r) - g(c - 1, r + 1)) / (8 * cell);
    const dzdy = (g(c - 1, r + 1) + 2 * g(c, r + 1) + g(c + 1, r + 1) - g(c - 1, r - 1) - 2 * g(c, r - 1) - g(c + 1, r - 1)) / (8 * cell);
    const slope = Math.atan(Math.hypot(dzdx, dzdy));
    const aspect = Math.atan2(dzdy, -dzdx);
    let hs = 0;
    for (const [az, w] of lights)
      hs += w * (Math.cos(Math.PI / 2 - alt) * Math.cos(slope) + Math.sin(Math.PI / 2 - alt) * Math.sin(slope) * Math.cos(az - aspect));
    const v = 0.5 + (hs - Math.sin(alt)) * 1.4;
    shade[r * cols + c] = Math.round(255 * Math.min(1, Math.max(0, v)));
  }
}

await mkdir(out, { recursive: true });
await writeFile(join(out, "color.png"), png(cols, rows, 3, rgb));
await writeFile(join(out, "shade.png"), png(cols, rows, 1, shade));
await writeFile(join(out, "height.png"), png(cols, rows, 1, height, 16));
const vec = await vectors();
await writeFile(join(out, "terrain.json"), JSON.stringify({ bbox, size: [cols, rows], height: HEIGHT, ...vec }));
console.log(`${out} (땅 ${vec.land.length}·호수 ${vec.lakes.length}·강 ${vec.rivers.length})`);
