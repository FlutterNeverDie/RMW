// 데스크톱 화면 녹화 (레딧·쓰레드 "I built this" 영상): 연도 슬라이더를 고대에서 1940년대까지 끌기 → 지도 점 클릭 → Details → 사건 페이지.
// 화면 전송(CDP screencast) 프레임은 public/desk/에, 마우스 자취(시각·좌표·누름)는 manifest.json에 (Remotion이 커서를 그린다)
// 실행: node scripts/desk.mjs   (SITE=http://localhost:3000 이면 로컬)
import { mkdir, rm, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const SITE = process.env.SITE ?? "https://historymapworld.com";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EVENT = "normandy-landings";
const W = 1440;
const H = 810;
const dir = new URL("../public/desk/", import.meta.url);
await rm(dir, { recursive: true, force: true });
await mkdir(dir, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 60000, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
await page.emulateTimezone("Europe/London");
// 1440×810 × 4/3 = 1920×1080
await page.setViewport({ width: W, height: H, deviceScaleFactor: 4 / 3 });
await page.evaluateOnNewDocument(() => localStorage.setItem("gaugeHint", "1"));
// 시대별 국경 파일을 처음 받을 땐 끄는 손잡이보다 지도가 늦게 따라오므로, 녹화 전에 한 번 끝까지 끌어 미리 받아 둔다
await page.goto(`${SITE}/en?y=-1000`, { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
{
  const b = await (await page.$('[aria-label="Select year"]')).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  for (let x = b.x + b.width / 2; x < W - 120; x += 6) {
    await page.mouse.move(x, b.y + b.height / 2);
    await new Promise((r) => setTimeout(r, 60));
  }
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 2000));
}
await page.goto(`${SITE}/en?y=-1000`, { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

const cdp = await page.createCDPSession();
const frames = [];
const cursor = [];
const clicks = [];
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
const start = () => cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
const now = () => (t0 ? Date.now() / 1000 - t0 : 0);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await start();
await page.evaluate(() => window.scrollBy(0, 0));
await wait(1200);
if (!t0) t0 = Date.now() / 1000 - 1.2;

// 커서: 부드럽게(ease-in-out) 옮기며 자취를 남긴다
let pos = { x: W * 0.42, y: H * 0.45 };
let down = false;
const log = () => cursor.push({ t: +now().toFixed(3), x: Math.round(pos.x), y: Math.round(pos.y), down });
log();
const moveTo = async (x, y, ms) => {
  const from = { ...pos };
  const steps = Math.max(1, Math.round(ms / 25));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    pos = { x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e };
    await page.mouse.move(pos.x, pos.y);
    log();
    await wait(25);
  }
};
const click = async () => {
  clicks.push({ t: +now().toFixed(3), x: Math.round(pos.x), y: Math.round(pos.y) });
  down = true;
  log();
  await page.mouse.down();
  await wait(90);
  await page.mouse.up();
  down = false;
  log();
};
const valuetext = () => page.$eval('[aria-label="Select year"]', (e) => e.getAttribute("aria-valuetext"));

// 1) 슬라이더 손잡이를 잡고 1940년대까지 천천히 끈다 (끄는 동안 국경이 실시간으로 바뀐다)
const thumb = await (await page.$('[aria-label="Select year"]')).boundingBox();
await wait(500);
await moveTo(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2, 900);
down = true;
await page.mouse.down();
log();
await wait(250);
// 사이트는 손잡이가 0.15초 멈춘 연도의 국경만 받으므로(useSettled), 조금 끌고 잠깐 멈추기를 되풀이한다
for (let i = 0; !/^1940s/.test(await valuetext()) && pos.x < W - 100; i++) {
  pos = { x: pos.x + 5, y: pos.y };
  await page.mouse.move(pos.x, pos.y);
  log();
  await wait(i % 7 === 6 ? 320 : 28);
}
await page.mouse.up();
down = false;
log();
await wait(1400);

// 2) 노르망디 상륙 점 클릭 → 지도가 그 점으로, 목록은 그 카드로
const pin = await (await page.$(`[data-event-id="${EVENT}"]`)).boundingBox();
await moveTo(pin.x + pin.width / 2, pin.y + pin.height / 2, 1000);
await wait(250);
await click();
await wait(2200);
// 지도가 움직였으면 커서도 점을 따라간 것처럼 그 자리에서 조금 비켜 둔다
await moveTo(pos.x + 40, pos.y + 70, 400);
await wait(400);

// 3) 카드의 Details → 사건 페이지
const more = await (await page.$(`#event-${EVENT} a[href*="/event/${EVENT}"]`)).boundingBox();
await moveTo(more.x + more.width / 2, more.y + more.height / 2, 900);
await wait(250);
await click();
await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => {});
await start().catch(() => {});
await page.evaluate(() => window.scrollBy(0, 1));
await wait(1000);
await moveTo(W * 0.5, H * 0.55, 600);
for (let i = 0; i < 30; i++) {
  await page.mouse.wheel({ deltaY: 16 });
  await wait(55);
}
await wait(1200);
log();
await cdp.send("Page.stopScreencast");
await Promise.all(pending);
await writeFile(new URL("manifest.json", dir), JSON.stringify({ viewport: [W, H], frames, cursor, clicks }, null, 1));
console.log(`desk: 프레임 ${frames.length}개, ${frames.at(-1).t}초, 클릭 ${clicks.length}번`);
await browser.close();
