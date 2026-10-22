// 사이트 지도만 깨끗하게 캡처한다 (목록·슬라이더·제목 상자·사건 점을 숨김) - 레딧·쓰레드용 지도 영상 재료.
// 실행: node scripts/clean.mjs europe 1080x1080 -6^700,300 1700 1800 1914   → public/clean/europe/<연도>.png
// NAMES=off를 주면 나라 이름도 숨긴다(퀴즈 문제 화면) - 파일 이름 끝에 -nonames
// 셋째 인자(화면):
//   @경도,위도,배율[,기울기,방향] - 개발 서버(SITE=http://localhost:3000, npm run dev)의 window.__mapView로 정확히 맞춘다(2026-10-22~, WebGL 지도).
//     연도마다 똑같은 구도라 타임랩스(lapse)에 쓴다. 예: node scripts/clean.mjs mg-wide 2560x1440 @95,45,3.2 1200 1210 1220
//   휠 칸 수(음수 = 확대)^휠 중심 화면 좌표[@dx,dy] - 예전 방식(운영 사이트·SVG 지도). 헤드리스 WebGL에선 휠이 안 먹을 수 있다
// 사건 핀·+N 배지·말풍선은 data-pins="off"로 숨긴다(본 지도만, 2026-10-22 사이트 지원)
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { ANGLE, chrome } from "./tools.mjs";

const SITE = process.env.SITE ?? "https://historymapworld.com";
const CHROME = chrome(); // 맥 /Applications, 윈도우 Program Files (scripts/tools.mjs)
const [set, size, view, ...years] = process.argv.slice(2);
const [W, H] = size.split("x").map(Number);
const cam = view.startsWith("@") ? (([lon, lat, zoom, tilt = 0, heading = 0]) => ({ lon, lat, zoom, tilt, heading }))(view.slice(1).split(",").map(Number)) : null;
const [, steps, cx, cy, drag] = cam ? [] : view.match(/^(-?\d+)\^(\d+),(\d+)(?:@(-?\d+,-?\d+))?$/);
const dir = new URL(`../public/clean/${set}/`, import.meta.url);
await mkdir(dir, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 60000, args: [ANGLE, "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
// 시간대가 첫 화면 위치를 정한다: 런던 = 유럽이 가운데(기본), TZ_NAME=Asia/Seoul = 동아시아
await page.emulateTimezone(process.env.TZ_NAME ?? "Europe/London");
// 지도 아래 슬라이더 줄(약 92px)은 지도가 아니므로 창을 그만큼 키우고 위쪽 W×H만 자른다
await page.setViewport({ width: W, height: H + 100, deviceScaleFactor: 2 });
await page.evaluateOnNewDocument(() => localStorage.setItem("gaugeHint", "1"));

for (const y of years) {
  await page.goto(`${SITE}/en?y=${y}`, { waitUntil: "networkidle0", timeout: 60000 });
  if (cam) {
    // 개발 서버의 카메라 조종: 연도·화면을 맞추고 국경·해안선을 다 받을 때까지(ready) 기다린다
    await page.waitForFunction(() => !!window.__mapView, { timeout: 30000 }).catch(() => {
      throw new Error("window.__mapView 없음 - SITE=http://localhost:3000 (chronomap에서 npm run dev)로 찍을 것");
    });
    await page.evaluate((v) => window.__mapView.apply(v), { ...cam, year: Number(y) });
    await page.waitForFunction(() => window.__mapView.ready(), { timeout: 60000, polling: 50 });
  } else await new Promise((r) => setTimeout(r, 3000));
  // 먼저 지도(canvas·svg)와 그 조상만 남기고 화면 위 다른 것은 모두 숨긴다(목록 패널이 지도 가운데를 덮어 끌기·휠을 가로채므로), 지도 안의 사건 점(누를 수 있는 g)도
  await page.evaluate((names) => {
    // 지도 = WebGL 지도 canvas(2026-10-22~)가 든 묶음 통째로(canvas + 그 위 svg 층 - 이름은 data-names, 사건 점은 아래 style로 숨김).
    // canvas가 없는 예전 사이트면 가장 큰 svg
    const big = (sel) => [...document.querySelectorAll(sel)].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    const gl = big("canvas");
    const map = gl ? gl.parentElement : big("svg");
    for (let el = map; el && el !== document.body; el = el.parentElement)
      for (const sib of el.parentElement.children) if (sib !== el) sib.style.visibility = "hidden";
    const st = document.createElement("style");
    st.textContent = "g[data-event-id] { display: none }";
    document.head.append(st);
    if (names === "off") document.documentElement.dataset.names = "off";
    document.documentElement.dataset.pins = "off";
  }, process.env.NAMES);
  if (!cam && drag) {
    const [dx, dy] = drag.split(",").map(Number);
    await page.mouse.move(W / 2, H / 2);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(W / 2 + (dx * i) / 20, H / 2 + (dy * i) / 20);
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 800));
  }
  if (!cam) await page.mouse.move(Number(cx), Number(cy));
  for (let i = 0; !cam && i < Math.abs(Number(steps)); i++) {
    await page.mouse.wheel({ deltaY: Math.sign(Number(steps)) * 240 });
    await new Promise((r) => setTimeout(r, 120));
  }
  await new Promise((r) => setTimeout(r, cam ? 400 : 1500));
  await page.screenshot({ path: fileURLToPath(new URL(`${y}${process.env.NAMES === "off" ? "-nonames" : ""}.png`, dir)), clip: { x: 0, y: 0, width: W, height: H } });
  console.log(`${set} ${y}`);
}
await browser.close();
