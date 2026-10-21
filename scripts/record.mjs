// 실제 사이트 조작을 녹화한다: 지도의 사건 점 탭 → 목록 시트가 열림 → "자세히" 탭 → 사건 페이지 스크롤.
// Chrome 화면 전송(CDP screencast)으로 프레임을 받아 public/demo/<언어>/에 저장하고,
// 시각·탭 위치를 manifest.json에 적는다 (Remotion이 이 시각대로 프레임을 고르고 탭 표시를 그린다).
// 실행: node scripts/record.mjs en normandy-landings 1940
import { mkdir, rm, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { ANGLE, chrome } from "./tools.mjs";
import { SITE_PATH, TIMEZONE } from "./locales.mjs";

// SITE=http://localhost:3000 처럼 주면 로컬 개발 서버를 녹화한다 (배포 전 확인용)
const SITE = process.env.SITE ?? "https://historymapworld.com";
const CHROME = chrome(); // 맥 /Applications, 윈도우 Program Files (scripts/tools.mjs)
const [locale, eventId, year] = process.argv.slice(2);
const dir = new URL(`../public/demo/${locale}/`, import.meta.url);
await rm(dir, { recursive: true, force: true });
await mkdir(dir, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 60000, args: [ANGLE, "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
await page.emulateTimezone(TIMEZONE[locale]);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.setUserAgent(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
);
await page.evaluateOnNewDocument(() => localStorage.setItem("gaugeHint", "1"));

const base = SITE_PATH[locale];
await page.goto(`${SITE}${base || "/"}?y=${year}`, { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

const cdp = await page.createCDPSession();
const frames = [];
const taps = [];
let t0 = 0;
let n = 0;
const pending = [];
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  const t = metadata.timestamp;
  if (!t0) t0 = t;
  const file = `${String(n++).padStart(4, "0")}.jpg`;
  frames.push({ t: +(t - t0).toFixed(3), file });
  pending.push(writeFile(new URL(file, dir), Buffer.from(data, "base64")));
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
const start = () => cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: 1170, maxHeight: 2532, everyNthFrame: 1 });
const now = () => (t0 ? Date.now() / 1000 - t0 : 0);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 화면이 안 바뀌면 프레임이 안 오므로, 시작 시각을 맞추려 아주 작은 변화를 준다
await start();
await page.evaluate(() => window.scrollBy(0, 0));
await wait(1200);
if (!t0) t0 = Date.now() / 1000 - 1.2;

const tapAt = async (x, y, label) => {
  taps.push({ t: +now().toFixed(3), x, y, label });
  await page.touchscreen.tap(x, y);
};

// 1) 지도의 사건 점
const pin = await page.$(`[data-event-id="${eventId}"]`);
if (!pin) throw new Error(`지도에 ${eventId} 점이 없음`);
// 점이 겹치면 다른 사건이 눌리므로, 맨 위에 이 사건 점이 있는 자리를 찾는다
const findSpot = () => page.evaluate((id) => {
  const r = document.querySelector(`[data-event-id="${id}"]`).getBoundingClientRect();
  for (let s = 0; s <= 8; s++) {
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
      const x = r.x + r.width / 2 + (dx * s * r.width) / 18;
      const y = r.y + r.height / 2 + (dy * s * r.height) / 18;
      if (document.elementFromPoint(x, y)?.closest("[data-event-id]")?.getAttribute("data-event-id") === id) return { x, y };
    }
  }
  return null;
}, eventId);
let spot = await findSpot();
// 가려 있으면 그 자리를 두 번 탭해 확대한다 (사이트: 두 번 탭 = 한 단계 확대)
for (let i = 0; i < 3 && !spot; i++) {
  const r = await (await page.$(`[data-event-id="${eventId}"]`)).boundingBox();
  const x = r.x + r.width / 2;
  const y = r.y + r.height / 2;
  taps.push({ t: +now().toFixed(3), x, y, label: "zoom" });
  // 두 번 탭은 이 환경에서 터치 전송이 멈춰서, 같은 자리 휠 확대로 대신한다 (화면에는 탭 표시만 그린다)
  await page.mouse.move(x, y);
  for (let k = 0; k < 4; k++) {
    await page.mouse.wheel({ deltaY: -120 });
    await wait(60);
  }
  await wait(1300);
  spot = await findSpot();
}
if (!spot) throw new Error(`${eventId} 점이 다른 점에 가려 있음`);
await tapAt(spot.x, spot.y, "pin");
await wait(2200);

// 2) 열린 카드의 "자세히" 링크 (상세 페이지로)
const more = await page.$(`#event-${eventId} a[href*="/event/${eventId}"]`);
if (!more) throw new Error("자세히 링크를 못 찾음");
await more.scrollIntoViewIfNeeded();
await wait(400);
const mb = await more.boundingBox();
await tapAt(mb.x + mb.width / 2, mb.y + mb.height / 2, "more");
await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => {});
// 같은 탭 안 이동이면 화면 전송이 이어진다. 끊겼을 때만 다시 시작
await start().catch(() => {});
await page.evaluate(() => window.scrollBy(0, 1));
await wait(900);

// 3) 사건 페이지를 천천히 내려 읽는 모습
for (let i = 0; i < 24; i++) {
  await page.evaluate(() => window.scrollBy(0, 14));
  await wait(60);
}
await wait(800);
await cdp.send("Page.stopScreencast");
await Promise.all(pending);

await writeFile(new URL("manifest.json", dir), JSON.stringify({ viewport: [390, 844], frames, taps }, null, 1));
console.log(`${locale}: 프레임 ${frames.length}개, ${frames.at(-1).t}초, 탭 ${taps.length}번`);
await browser.close();
