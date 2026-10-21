// 세로 쇼츠(9:16)용 지도 캡처: 사이트 지도만 남기고 연도별로 찍는다 → public/clean/<set>/<연도>.png (1080×1920)
// 실행: node scripts/shorts.mjs <set> <시간대> <휠 칸(음수=확대)> <휠 중심 x,y> <확대 뒤 끌기 dx,dy(+x = 지도를 오른쪽으로 = 서쪽이 보임, +y = 북쪽이 보임)> <연도...>
//   예: node scripts/shorts.mjs east-asia Asia/Seoul -4 270,420 0,0 -1000 -221 1 ...
// 휴대폰 화면 크기(540×960 CSS px, 2배)로 찍어서 나라 이름 글자가 휴대폰에서 보던 크기 그대로다.
// 연도 단위는 5년(localStorage yearStep) - 서기는 5년 단위까지, 기원전은 세기 단위로 맞춰진다.
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { ANGLE, chrome } from "./tools.mjs";

const SITE = process.env.SITE ?? "https://historymapworld.com";
const LANG = process.env.LANG_PATH ?? "/en";
const CHROME = chrome(); // 맥 /Applications, 윈도우 Program Files (scripts/tools.mjs)
const [set, tz, steps, center, drag, ...years] = process.argv.slice(2);
const W = 540, H = 960;
const [cx, cy] = center.split(",").map(Number);
const [dx, dy] = drag.split(",").map(Number);
const dir = new URL(`../public/clean/${set}/`, import.meta.url);
await mkdir(dir, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 90000, args: [ANGLE, "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
await page.emulateTimezone(tz);
await page.setViewport({ width: W, height: H + 110, deviceScaleFactor: 2 });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem("gaugeHint", "1");
  localStorage.setItem("yearStep", "5");
});

for (const y of years) {
  await page.goto(`${SITE}${LANG}?y=${y}`, { waitUntil: "networkidle0", timeout: 90000 });
  await new Promise((r) => setTimeout(r, 2500));
  await page.evaluate((names) => {
    const svg = [...document.querySelectorAll("svg")].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    for (let el = svg; el && el !== document.body; el = el.parentElement)
      for (const sib of el.parentElement.children) if (sib !== el) sib.style.visibility = "hidden";
    const st = document.createElement("style");
    st.textContent = "g[data-event-id] { display: none }";
    document.head.append(st);
    if (names === "off") document.documentElement.dataset.names = "off";
  }, process.env.NAMES);
  await page.mouse.move(cx, cy);
  for (let i = 0; i < Math.abs(Number(steps)); i++) {
    await page.mouse.wheel({ deltaY: Math.sign(Number(steps)) * 240 });
    await new Promise((r) => setTimeout(r, 120));
  }
  if (dx || dy) {
    await page.mouse.move(W / 2, H / 2);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(W / 2 + (dx * i) / 20, H / 2 + (dy * i) / 20);
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 600));
  }
  await new Promise((r) => setTimeout(r, 1800));
  await page.screenshot({ path: fileURLToPath(new URL(`${y}${process.env.NAMES === "off" ? "-nonames" : ""}.png`, dir)), clip: { x: 0, y: 0, width: W, height: H } });
  console.log(`${set} ${y}`);
}
await browser.close();
