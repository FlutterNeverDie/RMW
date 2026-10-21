// 실제 사이트를 휴대폰 화면 크기로 연도별 캡처한다 (설치된 Chrome 사용).
// 실행: node scripts/shoot.mjs en -3000 1 1500   → public/shots/en/<연도>.png
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { ANGLE, chrome } from "./tools.mjs";
import { SITE_PATH, TIMEZONE } from "./locales.mjs";

const SITE = "https://historymapworld.com";
const CHROME = chrome(); // 맥 /Applications, 윈도우 Program Files (scripts/tools.mjs)

const [locale, ...years] = process.argv.slice(2);
const dir = new URL(`../public/shots/${locale}/`, import.meta.url);
await mkdir(dir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [ANGLE, "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.emulateTimezone(TIMEZONE[locale]);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.setUserAgent(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
);

// 처음 방문 안내 말풍선("Drag to travel in time")이 장면마다 뜨지 않게
await page.evaluateOnNewDocument(() => localStorage.setItem("gaugeHint", "1"));

// 인자가 숫자면 그 연도의 본 지도, 아니면 경로 (예: wars/world-war-ii)
// 끝에 @dx,dy를 붙이면 캡처 전에 지도를 그만큼 끈다 (예: wars/world-war-ii?battle=x@80,250)
// ~N을 붙이면 슬라이더 ▶를 N번 눌러 시간을 앞으로 보낸다 (예: maps/epidemics?item=black-death~3)
// %N을 붙이면 휠로 N칸 축소, %-N이면 확대한다 (항목을 골라 열면 그 자리로 크게 확대돼 있다)
// ^x,y를 붙이면 그 화면 좌표(390×844 기준)를 중심으로 휠을 굴린다 (예: 470%-8^245,360 = 한반도로 확대)
for (const raw of years) {
  const [, arg, drag, next, out, at] = raw.match(/^(.*?)(?:@(-?\d+,-?\d+))?(?:~(\d+))?(?:%(-?\d+))?(?:\^(\d+,\d+))?$/);
  const base = SITE_PATH[locale];
  const url = /^-?\d+$/.test(arg) ? `${SITE}${base || "/"}?y=${arg}` : `${SITE}${base}/${arg}`;
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  // 지도 타일·국경이 다 그려질 시간
  await new Promise((r) => setTimeout(r, 3500));
  // 전투·항목을 골라 열면 목록 패널이 지도를 가리므로 접는다 (패널 머리줄 버튼 "Battles · 20" = 접기/펼치기)
  if (/(battle|item)=/.test(arg)) {
    await page.evaluate(() =>
      [...document.querySelectorAll("button")].find((b) => /^[^·]{1,20}\s·\s*\d/.test(b.textContent.trim()))?.click(),
    );
    await new Promise((r) => setTimeout(r, 1200));
  }
  for (let i = 0; i < Number(next || 0); i++) {
    // 슬라이더 ▶ 버튼 이름: 주제 지도 "Next period"·"다음 기간"·"下一时期", 전쟁 지도 "Next item"·"다음 항목"·"下一项"
    await page.evaluate(() =>
      [...document.querySelectorAll("button[aria-label]")]
        .find((b) => /^(Next|다음|下一)/.test(b.getAttribute("aria-label")))
        ?.click(),
    );
    await new Promise((r) => setTimeout(r, 900));
  }
  if (out) {
    const [cx, cy] = at ? at.split(",").map(Number) : [195, 350];
    await page.mouse.move(cx, cy);
    for (let i = 0; i < Math.abs(Number(out)); i++) {
      await page.mouse.wheel({ deltaY: Math.sign(Number(out)) * 240 });
      await new Promise((r) => setTimeout(r, 120));
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (drag) {
    const [dx, dy] = drag.split(",").map(Number);
    await page.mouse.move(195, 400);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(195 + (dx * i) / 20, 400 + (dy * i) / 20);
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 1500));
  }
  await page.screenshot({ path: fileURLToPath(new URL(`${arg.replace(/[/?=&]/g, "_")}.png`, dir)) });
  console.log(`${locale} ${arg}`);
}
await browser.close();
