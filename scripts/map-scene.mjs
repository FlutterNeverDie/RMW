// 기울인 지도 장면(mapscene)을 한 장씩 찍는다 - 사이트(chronomap) 개발 서버의 장면 층(?scene, 운영 사이트에는 없음).
// 실행: node scripts/map-scene.mjs --scene episodes/<편>/maps/<장면>.json --frames N [--marks '{"turn":0.6}'] [--url http://localhost:3000/?scene] [--only 0,0.5,1]
//   → public/ep/<편>/maps/<장면>/00000.jpg … (2560×1440, JPEG 95) + meta.json {frames, fps, size, sceneHash}
//   먼저 chronomap에서 `npm run dev`(개발 서버 3000). --only는 시험용: 그 t들만 찍어 t0.50.jpg처럼 남긴다.
//
// ── 장면 JSON 형식 (주석 없는 순수 JSON, 설명은 "_설명" 같은 "_" 키에) ─────────────────────────────
// 시각 t는 모두 0~1(장면 길이는 목소리로 정해져 프레임 수만 바뀐다). 숫자 대신 marks 이름("turn")이나
// 이름 ± 수("turn+0.05")를 써도 된다 - t·show·grow·fade 어디든. 목소리를 다시 만들면 marks만 고친다(--marks로 덮어쓰기).
// 좌표는 [경도, 위도]. 같은 JSON이면 매번 같은 그림(무작위는 id로 씨앗 고정, seek(t)는 앞 프레임과 상관없다).
// {
//   "version": 1,
//   "year": 1223,                         국경 연도. 중간에 바뀌면 "years": [{"t":0,"year":1223},{"t":0.8,"year":1230}]
//   "theme": "film",                      "film"(바랜 영상 톤) | "light" | "dark"
//   "showYear": false,                    왼쪽 아래 연도 숫자
//   "borders": true,                      false면 국경 색칠 없이 해안선만
//   "terrain": true,                      지형(산 음영·땅 색·10m 해안선·호수·강) - 처음 찍을 때 scripts/terrain.mjs가 data/geo/terrain/에 만든다
//                                         (지역은 카메라에서 저절로, {"bbox":[서,남,동,북]}로 직접도). 장면 카메라를 크게 바꾸면 그 폴더를 지우고 다시
//   "relief": 0.8,                        산 음영 세기 0~1
//   "unitScale": 1,                       부대 그림 크기 배율(1 = 키 약 22px@1280 폭 = 영상 44px, 원근에 따라 가까우면 크게)
//   "marks": {"turn": 0.55, "close": 0.72},
//   "camera": [{"t":0, "at":[35.1,47.8], "zoom":6, "tilt":30, "heading":0, "ease":"inOut"}, …]
//       zoom = 사이트 배율(1~160): 1이면 위도 전체(82°N~58°S)가 화면 높이. 16:9 화면 가로 폭 ≈ 450 / zoom 도
//       (zoom 6 → 75°, 30 → 15°, 90 → 5°, 150 → 3° - 전투 한 곳). 세로는 가로의 9/16에 메르카토르라 고위도일수록 좁다(47°N에서 ×0.68).
//       기울이면 먼 쪽이 더 넓게 보인다. tilt 0~55(도, 눕히기), heading 아무 각도(+ = 시계 반대로 돌아 동쪽이 위로). 키 사이는 ease로 보간
//   "sides": {"mongol": {"color":"#7a2e22", "flag":"tug"}, "rus": {"color":"#3f5878", "flag":"cross", "armor":true},
//             "cuman": {"color":"#c29a46", "flag":"pennant", "horse":["#e8e0cc","#a07a52"]}}
//       flag: tug(말꼬리 깃대) | cross | pennant | banner | none - 무리마다 앞쪽에 크게 하나. armor: 몸통이 쇠갑옷(회청),
//       horse: 말 색(여럿이면 섞음) - 섞여 싸울 때 진영을 색 대비로 가른다
//   "units": [{"id":"m1", "side":"mongol", "kind":"cavalry", "count":5 또는 [{"t":0,"n":6},{"t":0.9,"n":2}],
//              "spread":0.25(도), "size":1, "path":[{"t":0,"at":[35.3,47.9],"state":"march"}, …], "show":[0,1], "fade":[0.9,1]}]
//       kind: cavalry | horse-archer | infantry | archer | camp | siege | ship | tank | artillery | plane
//       state(그 키부터 다음 키까지): march | charge(앞으로 기울고 먼지) | flee | hold. 줄어드는 수는 바깥 것부터 쓰러진다
//   "arrows": [{"side":"mongol", "style":"advance|retreat|pincer", "path":[[…],[…]], "grow":[0.7,0.85], "width":1}]
//   "lines":  [{"style":"front|trench|river|line", "side":"rus", "path":[…], "grow":[…], "show":[…]}]
//   "areas":  [{"side":"mongol", "polygon":[…], "show":[0.8,1], "opacity":0.25}]
//   "markers":[{"kind":"battle|city|camp", "at":[…], "show":[0.85,1]}]   battle = 부대 위로 퍼지는 접전 먼지 구름
//   화살표는 늘 부대 위에(반투명 0.85, 화면 기준 같은 굵기, 끝까지 촉 유지)
// }
// 화면 글자는 없다(나라 이름·지명·사건 끔). 출처는 영상 설명란에: 국경 Cliopatria(Seshat, CC BY 4.0 - 표기 필수),
// 지형은 퍼블릭 도메인 - NOAA NCEI ETOPO 2022(고도), Natural Earth(토지 피복·해안선·호수·강).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(" ")
    .split(/\s*--/)
    .filter(Boolean)
    .map((a) => {
      const i = a.indexOf(" ");
      return i < 0 ? [a, true] : [a.slice(0, i), a.slice(i + 1).trim()];
    }),
);
if (!args.scene || (!args.frames && !args.only)) {
  console.error("사용: node scripts/map-scene.mjs --scene episodes/<편>/maps/<장면>.json --frames N");
  process.exit(1);
}
const scenePath = join(ROOT, args.scene);
const scene = JSON.parse(await readFile(scenePath, "utf8"));
const marks = args.marks ? JSON.parse(args.marks) : {};
const frames = Number(args.frames ?? 0);
const only = args.only ? String(args.only).split(",").map(Number) : null;
// episodes/<편>/maps/<장면>.json → public/ep/<편>/maps/<장면>/
const ep = basename(dirname(dirname(scenePath)));
const name = basename(scenePath, ".json");
const out = join(ROOT, "public/ep", ep, "maps", name);
const url = args.url ?? "http://localhost:3000/?scene";

const sceneHash = createHash("sha256")
  .update(JSON.stringify(scene) + JSON.stringify(marks))
  .digest("hex")
  .slice(0, 16);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 120000,
  args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--hide-scrollbars"],
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("페이지 오류:", e.message));
  // 1280×720 CSS를 배율 2로 = 2560×1440 (선 굵기·그림 크기가 사이트 비율 그대로)
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  // 지형("terrain"): data/geo/terrain/<편>-<장면>/(없으면 terrain.mjs로 만든다). 그림은 이 페이지 요청을 가로채 파일로 준다(git 밖 자료라)
  let terrain;
  if (scene.terrain) {
    const dir = join(ROOT, "data/geo/terrain", `${ep}-${name}`);
    if (!existsSync(join(dir, "terrain.json")))
      execFileSync("node", [join(ROOT, "scripts/terrain.mjs"), "--scene", args.scene], { stdio: "inherit" });
    terrain = {
      ...JSON.parse(await readFile(join(dir, "terrain.json"), "utf8")),
      color: `/__terrain/${ep}-${name}/color.png`,
      shade: `/__terrain/${ep}-${name}/shade.png`,
    };
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
      const m = /\/__terrain\/([^/]+)\/(color|shade)\.png$/.exec(new URL(req.url()).pathname);
      if (!m) return req.continue();
      req.respond({
        status: 200,
        contentType: "image/png",
        body: await readFile(join(ROOT, "data/geo/terrain", m[1], `${m[2]}.png`)),
      });
    });
  }
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("gaugeHint", "1");
    localStorage.setItem("viewHint", "1");
  });
  await page.goto(url, { waitUntil: "networkidle0", timeout: 120000 });
  await page.waitForFunction(() => !!window.__scene, { timeout: 60000 });
  await page.evaluate(
    (json, opts) => window.__scene.load(json, opts),
    scene,
    { frames: frames || 300, marks, terrain },
  );

  if (only) {
    await mkdir(out, { recursive: true });
    for (const t of only) {
      await page.evaluate((t) => window.__scene.seek(t), t);
      const file = join(out, `t${t.toFixed(2)}.jpg`);
      await page.screenshot({ path: file, type: "jpeg", quality: 95 });
      console.log(file);
    }
  } else {
    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
    const started = Date.now();
    for (let i = 0; i < frames; i++) {
      const t = frames > 1 ? i / (frames - 1) : 0;
      await page.evaluate((t) => window.__scene.seek(t), t);
      await page.screenshot({
        path: join(out, `${String(i).padStart(5, "0")}.jpg`),
        type: "jpeg",
        quality: 95,
      });
      if (i % 30 === 29 || i === frames - 1) {
        const per = (Date.now() - started) / (i + 1);
        console.log(`${i + 1}/${frames} (${(per / 1000).toFixed(2)}초/장, 남은 ${Math.round(((frames - i - 1) * per) / 1000)}초)`);
      }
    }
    await writeFile(
      join(out, "meta.json"),
      JSON.stringify({ frames, fps: 30, size: [2560, 1440], sceneHash, marks }, null, 2) + "\n",
    );
    console.log(`${out} (${frames}장)`);
  }
} finally {
  await browser.close();
}
