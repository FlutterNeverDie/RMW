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
//   "borders": true,                      false면 국경 색칠 없이 해안선만. 국경은 Cliopatria 원본 정밀도(data/geo/borders/, 처음 찍을 때 만듦)
//   "coastFill": 30,                      해안에서 이 km 안의 나라 없는 땅은 이웃 나라 색으로(원본 국경이 해안 앞에서 끊김). 0이면 끔
//   "terrain": true,                      지형(산 음영·땅 색·10m 해안선·호수·강) - 처음 찍을 때 scripts/terrain.mjs가 data/geo/terrain/에 만든다
//                                         (지역은 카메라에서 저절로, {"bbox":[서,남,동,북]}로 직접도). 장면 카메라를 크게 바꾸면 그 폴더를 지우고 다시
//   "winter": {"cover":0.9 | [{"t":0.05,"n":0},{"t":0.6,"n":0.9}], "fall":0.6 | 시간표, "frozen":true, "wind":0.3}   눈과 겨울: cover = 눈 덮인 땅(0~1, 지형이면
//                                         큰 얼룩으로 덮여 가고 숲·가파른 바위는 덜), fall = 내리는 눈(겹 셋), wind = 옆으로 비낌(음수 왼쪽), frozen = 호수·강 얼음 색.
//                                         산꼭대기 만년설은 snowline으로 따로
//   "relief": 0.8,                        산 음영 세기 0~1. 산 장면은 0.5 안팎(진하면 그늘이 눈·초록을 덮는다), 평야는 0.8~0.9
//   "snowline": 3400,                     눈선(m). 겨울 장면은 낮춘다
//   "ground": "palette",                  "palette"(기본 - prep_terrain.py와 같은 식으로 토지 피복을 다시 칠함, 그늘 세피아·볕 크림) | "css"(예전 SVG판 색) | "raw"
//   "palette": {"steppe","steppe_dry","green","forest","water"}   blender/shots의 palette와 같은 이름·기본값(지도 거리에선 숲을 세이지와 반씩 섞음)
//   "grade": {"exposure","lift","white","contrast","saturation","vignette","grain","curve"}   blender/post.py와 같은 마감(curve = 필름 곡선 세기 0~1).
//                                         film 테마면 기본으로 켜지고 null이면 끔. 지금은 땅 층에만(부대·화살표는 7-3·7-4에서)
//   "unitScale": 1,                       부대 그림 크기 배율(1 = 키 약 22px@1280 폭 = 영상 44px, 원근에 따라 가까우면 크게)
//   "marks": {"turn": 0.55, "close": 0.72},
//   연도가 흐르는 타임랩스: "years": [{"t":0.05,"year":1190}, {"t":0.95,"year":1260, "flow":true, "every":5, "blend":0.35, "ease":"linear"}] - 앞 키에서 이 키까지
//       연도가 t에 따라 흐르고 every년마다 국경이 바뀜(바뀌기 전 blend 비율 동안 다음 해 국경이 녹아 넘어감, spread가 있으면 바로 바뀜). showYear 숫자는 1년씩
//       똑딱 굴러감. 구간의 every년마다 고정밀 국경을 만든다(every 1에 긴 구간이면 파일이 많음)
//   "camera": [{"t":0, "at":[35.1,47.8], "zoom":6, "tilt":30, "heading":0, "ease":"inOut"}, …]
//       부대 따라가기: {"t":0.2, "follow":"<unit id>", "zoom":40, "tilt":40, "heading":0, "lead":0.12, "ease":"inOut"} - 그 키를 쓰는 동안(넘어올 때·넘어갈 때 포함)
//       카메라 가운데가 부대 경로를 따라감(지난 0.04 평균이라 흔들림 없이 조금 늦게), lead = 가는 쪽 앞 여유(화면 가로 비율, 멈추면 0으로), at은 안 씀.
//       지형·국경 범위는 그 부대 path 점들로 잡는다
//       zoom = 사이트 배율(1~1000): 1이면 위도 전체(82°N~58°S)가 화면 높이. 16:9 화면 가로 폭 ≈ 450 / zoom 도
//       (zoom 6 → 75°, 30 → 15°, 90 → 5°, 150 → 3° - 전투 한 곳, 1000 → 0.45° - 진지 하나. 500을 넘으면 지형 자료(약 450 m 칸)가 뭉개진다). 세로는 가로의 9/16에 메르카토르라 고위도일수록 좁다(47°N에서 ×0.68).
//       기울이면 먼 쪽이 더 넓게 보인다. tilt 0~55(도, 눕히기), heading 아무 각도(+ = 시계 반대로 돌아 동쪽이 위로). 키 사이는 ease로 보간
//   "sides": {"mongol": {"color":"#7a2e22", "flag":"tug"}, "rus": {"color":"#3f5878", "flag":"cross", "armor":true},
//             "cuman": {"color":"#c29a46", "flag":"pennant", "horse":["#e8e0cc","#a07a52"]}}
//       flag: tug(말꼬리 깃대) | cross | pennant | banner | none - 무리마다 앞쪽에 크게 하나. armor: 몸통이 쇠갑옷(회청),
//       horse: 말 색(여럿이면 섞음) - 섞여 싸울 때 진영을 색 대비로 가른다.
//       team: 같은 team끼리는 서로 밀어내지 않고 지나간다(없으면 진영마다 따로 = 서로 적, 무리 몸통끼리 밀어냄). 칼카: rus·cuman에 "rus"
//   "units": [{"id":"m1", "side":"mongol", "kind":"cavalry", "count":5 또는 [{"t":0,"n":6},{"t":0.9,"n":2}],
//              "spread":0.25(도), "size":1, "path":[{"t":0,"at":[35.3,47.9],"state":"march"}, …], "show":[0,1], "fade":[0.9,1]}]
//       kind: cavalry | horse-archer | infantry | archer | camp | siege | ship | tank | artillery | plane
//       state(그 키부터 다음 키까지): march | charge(앞으로 기울고 먼지) | flee | hold. 줄어드는 수는 바깥 것부터 쓰러진다
//       대군: "swarm": {"n": 2000, "radius": 0.3(도)} - 작은 실루엣 n개가 앞이 넓은 무리로 흐른다(뒷줄은 경로를 조금 늦게 따라와
//       방향을 틀면 줄지어 휜다). charge = 앞줄이 늘어나며 쏠림, flee = 각자 흩어짐. count 시간표는 실제 수(2000 → 400)로, 정한
//       차례대로 쓰러져 자리에 남아 흐려진다. 그림 크기는 무리 안 간격에 맞춰져 멀리서는 점, 다가가면 실루엣(radius가 작으면 빽빽한 점)
//       swarm.shape: "host"(기본, 앞이 넓은 무리) | "mass"(둥근 덩어리 - 진 안의 병사) | "ring"(포위 고리 - path 자리가 고리 가운데,
//       radius = 바깥 반지름, "inner" = 안쪽 비율(기본 0.6), 각자 가운데를 봄, 밀어내기에서 빠짐). 패주는 가장 가까운 적의 반대쪽으로 짧게
//   "forts": [{"kind":"wagons", "side":"rus", "at":[37.0,47.55], "radius":0.09(도), "n":34, "show":[…], "fade":[…]}]
//       수레 n대 원진(안쪽은 밟힌 맨땅, 수레 크기는 대군 실루엣 키에 맞춤). 포위된 진 = forts + 같은 자리 그 진영 "mass"(radius ≈ 0.8×fort)
//       + 적 "ring"(radius 3~4×fort, inner 0.5). 버티는 날수는 count 시간표로 줄인다. radius가 곧 그리는 크기라 크게 쓰면 그게 과장
//   show·fade: show 시작부터 0.02 동안 서서히 나타나고 끝나기 전 0.02 동안 사라진다(0·1에 걸친 것은 바로) - 대사에 딱 맞출 곳은 0.02 앞당기기
//   카메라 마지막 키 "ease":"out"은 앞 키 직후 가장 빠르게 출발한다 - 줌·기울기가 크게 바뀌면 "inOut"
//   "spread": [{"polity": "Mongol Empire" | ["Mongol Khanate","Mongol Empire"], "from": [110.5,48.6], "keys": [{"t":0.08,"year":1206},{"t":0.48,"year":1227}],
//              "color": "#…"(선택), "rough": 1(선택)}]   영역 번지기: 그 시각에 그 연도 영역이 다 드러나고, 사이 구간은 앞 영역 가장자리에서 가까운 곳부터
//       먹이 스미듯 번짐. polity = 국경 원본 이름(연도마다 다르면 배열), from = 첫 연도에 영역이 없을 때 시작점. 잃은 땅은 구간 끝에 서서히 사라짐.
//       다른 나라는 years를 따르니 덮이는 모습을 보이려면 years를 keys와 같이 둔다. keys의 연도도 고정밀 국경으로 만든다
//   "focus": [{"polity":"Khwarezmid Empire"(또는 배열), "polygon":[[경도,위도],…](선택, 같이 주면 합침), "mode":"both|dim|glow", "strength":1(0~1.5), "show":[0.15,0.55]}]
//       지역 강조(글자 없이 "여기"): both(기본) = 바깥 어둡고 흐리고 채도 낮게 + 가장자리 크림 빛 띠 + 안쪽 살짝 밝게, dim = 바깥만 어둡게, glow = 빛만.
//       show 구간에 서서히(0.02) 들어오고 나감, 여럿이면 합침. 필름 마감 전이라 바깥의 부대·화살표도 같이 어두워짐
//   병력 숫자: units[].troops = 20000 | [{"t":0.3,"n":80000},{"t":0.8,"n":30000}] | {"n": 수 또는 시간표, "show":[0.2,0.9], "size":1} - 부대 오른쪽 옆을 따라다님,
//       시간표 사이는 계기판처럼 위 세 자리가 굴러가며 줄어듦. 천 단위 쉼표, 크림 글자 + 먹 테두리 + 진영 색 밑줄, 글자 높이 = 화면 높이 4.5% × size
//       (Baskerville - 윈도우는 Georgia로 대신 나옴)
//   함대: kind "ship" + "vessel":"galley|sail(기본)|junk(몽골·고려)|warship", "swarm":{"n":160,"radius":0.3}이면 함대 대형(배가 커서 radius 넉넉히).
//       움직이면 항적·물보라, 늘 물결에 흔들림, count가 줄면 불붙어 연기 → 고물부터 가라앉음
//   "storm": {"strength":0~1 | [{"t":0.35,"n":0},{"t":0.6,"n":1}], "lightning":true, "wind":0.6}   폭풍: 어둡고 채도 낮게 + 비껴 쏟아지는 비 + 너울·흰 물마루
//       + 배가 크게 흔들림. 번개는 화면 전체가 두 번 번쩍여 check-flicker.py에 걸릴 수 있음 - 그 구간은 검사에서 빼거나 "lightning":false
//   비행기: kind "plane" + "aircraft":"bomber(기본)|fighter", "altitude":110(그림 단위) - 땅 위 그림자 + 떠서 오르내림, swarm이면 편대, count가 줄면 불붙어
//       연기 꼬리를 끌며 떨어짐(진영 색 띠만, 표식 없음, 땅·물 판정 안 함)
//   markers 폭격 {"kind":"bombing","at":[…],"radius":0.05,"n":18,"show":[0.45,0.85],"altitude":150,"size":1} - n발이 떨어져 섬광·불덩이·연기·패인 자국,
//       대공포 {"kind":"flak","at":[…],"radius":0.09,"n":24,"show":[0.3,0.9],"altitude":150} - 공중에서 터져 검은 연기 꽃. 배율 300 넘게 가까이면 지형이 흐림
//   "arrows": [{"side":"mongol", "style":"advance|retreat|pincer", "path":[[…],[…]], "grow":[0.7,0.85], "width":1}]
//   "lines":  [{"style":"front|trench|river|line", "side":"rus", "path":[…], "grow":[…], "show":[…]}]
//   "areas":  [{"side":"mongol", "polygon":[…], "show":[0.8,1], "opacity":0.25}]
//   "markers":[{"kind":"battle|city|camp", "at":[…], "show":[0.85,1]}]   battle = 부대 위로 퍼지는 접전 먼지 구름
//       siege(= sack): 포위된 성벽 도시 {"kind":"siege", "at":[64.42,39.77], "side":"khwarazm", "show":[0,1], "burn":[0.3,0.7], "fall":[0.5,0.8],
//       "radius":0.045(땅 위 반지름 도, 기본 0.03 - 둘레 ring 대군과 맞춤), "size":1(멀리서 최소 크기 배율)}. 돔·첨탑·흉벽·성문 + side 색 깃발.
//       burn = 앞 25%에 불길이 커지고 잦아들어 잔불·연기·그을림이 남음, fall = 앞 40%에 성벽 금 → 무너져 폐허(깃발 쓰러짐). marks 이름 가능
//       face: 지점 위 인물 얼굴 메달 {"kind":"face", "at":[37.6,48.0], "char":"genghis", "mood":"front", "side":"mongol", "show":[0.45,0.85]}
//   인물 얼굴 메달(부대): units[].face = "subutai" 또는 {"char":"mstislav_kiev", "mood":"angry", "show":[0.2,0.8]} - 대군은 무리 위, 작은 부대는 그림 위에서
//       따라다님. mood = 표정 폴더(front 기본·angry·happy·sad·shocked), show 없으면 부대 show. 양피지 둥근 얼굴 + 진영 색 고리 + 먹 테두리 + 아래 꼬리,
//       나타날 때 살짝 튀고 사라질 때 작아짐. 얼굴은 public/chars/<char>/<mood>/의 body·head·eyes0·mouth0 겹(없으면 load 실패)
//       크기: 기본 지름 = 화면 높이 9.5%(1440p 약 137px), 멀어져도 그 아래로 안 줄고 가까우면 최대 1.3배. "size" 배율(기본 1)은 face 객체·markers face 둘 다,
//       테두리·고리 굵기도 같은 비율. 주인공 첫 등장은 size 1.5~2 (2026-10-22 사용자: 영상에서 너무 작지 않게)
//   화살표는 늘 부대 위에(반투명 0.85, 화면 기준 같은 굵기, 끝까지 촉 유지)
// }
// 화면 글자는 없다(나라 이름·지명·사건 끔). 출처는 영상 설명란에: 국경 Cliopatria(Seshat, CC BY 4.0 - 표기 필수),
// 지형은 퍼블릭 도메인 - NOAA NCEI ETOPO 2022(고도), Natural Earth(토지 피복·해안선·호수·강).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import * as tools from "./tools.mjs";
import { ANGLE, chrome } from "./tools.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = chrome(); // 맥 /Applications, 윈도우 Program Files (scripts/tools.mjs)

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

// 카메라 키마다 보이는 범위(가로 ≈ 450/zoom 도) - 지형 없는 장면의 국경 지역. scene-borders가 12° 여유를 더한다
// follow(부대 따라가기) 키는 at 대신 그 부대 path의 모든 점을 같은 zoom으로 본다
const cameraSpots = (sc) =>
  sc.camera.flatMap((c) => (c.follow ? (sc.units ?? []).find((u) => u.id === c.follow)?.path?.map((p) => ({ ...c, at: p.at })) ?? [] : [c]));
function cameraBbox(sc) {
  const camera = cameraSpots(sc);
  const xs = camera.flatMap((c) => [c.at[0] - 450 / c.zoom, c.at[0] + 450 / c.zoom]);
  const ys = camera.flatMap((c) => [c.at[1] - 250 / c.zoom, c.at[1] + 250 / c.zoom]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => Math.round(v * 100) / 100);
}
// Cliopatria 원본(CC BY 4.0, 약 46MB → 풀면 약 173MB)을 처음 한 번 data/geo/cliopatria/에 받는다. 판 이름(v021)이 바뀌어도 *.geojson으로 찾음
async function cliopatria() {
  const dir = join(ROOT, "data/geo/cliopatria");
  const find = () => (existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith(".geojson")) : null);
  if (!find()) {
    await mkdir(dir, { recursive: true });
    console.log("Cliopatria 국경 원본 받는 중… (약 46MB)");
    const res = await fetch("https://github.com/Seshat-Global-History-Databank/cliopatria/raw/main/cliopatria.geojson.zip");
    if (!res.ok) throw new Error(`Cliopatria ${res.status}`);
    const zip = join(dir, "cliopatria.geojson.zip");
    await writeFile(zip, Buffer.from(await res.arrayBuffer()));
    if (tools.WIN)
      execFileSync("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${dir}'`], { stdio: "inherit" });
    else execFileSync("unzip", ["-o", "-q", zip, "-d", dir], { stdio: "inherit" });
    await rm(zip);
  }
  if (!find()) throw new Error(`Cliopatria 압축을 풀었는데 ${dir}에 .geojson이 없음`);
  return join(dir, find());
}

const sceneHash = createHash("sha256")
  .update(JSON.stringify(scene) + JSON.stringify(marks))
  .digest("hex")
  .slice(0, 16);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 120000,
  args: [ANGLE, "--ignore-gpu-blocklist", "--hide-scrollbars"],
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
    if (!existsSync(join(dir, "height.png"))) // height.png 전에 만든 폴더도 다시
      execFileSync("node", [join(ROOT, "scripts/terrain.mjs"), "--scene", args.scene], { stdio: "inherit" });
    terrain = {
      ...JSON.parse(await readFile(join(dir, "terrain.json"), "utf8")),
      color: `/__terrain/${ep}-${name}/color.png`,
      shade: `/__terrain/${ep}-${name}/shade.png`,
      heightmap: `/__terrain/${ep}-${name}/height.png`, // 16비트, 고도 m = 값 × height.scale - height.offset
    };
  }
  // 고정밀 국경: Cliopatria 원본에서 장면 연도·지역만 잘라 data/geo/borders/<편>-<장면>/<연도>.geojson (사이트 국경은 20% 단순화라 10m 해안과 어긋남)
  let borders;
  if (scene.borders !== false) {
    // spread(영역 번지기) keys의 연도도 고정밀로 (없으면 사이트의 20년 단위 국경으로 대신함)
    const spreadYears = (scene.spread ?? []).flatMap((sp) => (sp.keys ?? []).map((k) => k.year));
    // flow(연도가 흐르는 구간)는 앞 키의 해부터 every년마다 (끝은 그 키의 해) - 크로노맵이 찾는 해와 같게
    const flowYears = (scene.years ?? []).flatMap((k, i, ys) => {
      if (!k.flow || i === 0) return [];
      const out = [];
      for (let y = ys[i - 1].year; y < k.year; y += k.every ?? 1) out.push(y);
      return [...out, k.year];
    });
    const years = [...new Set([scene.year, ...(scene.years ?? []).map((y) => y.year), ...spreadYears, ...flowYears].filter((y) => y != null))];
    const dir = join(ROOT, "data/geo/borders", `${ep}-${name}`);
    if (years.length && !years.every((y) => existsSync(join(dir, `${y}.geojson`)))) {
      const bbox = terrain?.bbox ?? scene.terrain?.bbox ?? cameraBbox(scene);
      execFileSync("node", ["scripts/scene-borders.mjs", "--raw", await cliopatria(), "--years", years.join(","), "--bbox", bbox.join(","), "--out", dir],
        { cwd: tools.chronomap(), stdio: "inherit" }); // chronomap의 d3-geo를 쓴다
    }
    borders = Object.fromEntries(years.map((y) => [y, `/__borders/${ep}-${name}/${y}.geojson`]));
  }
  // git 밖 자료는 이 페이지 요청을 가로채 파일로 준다
  await page.setRequestInterception(true);
  page.on("request", async (req) => {
    const path = new URL(req.url()).pathname;
    // 캐릭터 그림(인물 얼굴 메달): /__chars/<id>/<표정>/<겹>.svg → public/chars/… (이름은 [a-z0-9_]만 - 경로 밖으로 못 나가게)
    const ch = /\/__chars\/([a-z0-9_]+)\/([a-z0-9_]+)\/([a-z0-9_]+)\.svg$/.exec(path);
    if (ch) {
      const file = join(ROOT, "public/chars", ch[1], ch[2], `${ch[3]}.svg`);
      if (!existsSync(file)) return req.respond({ status: 404, body: "" });
      return req.respond({ status: 200, contentType: "image/svg+xml", body: await readFile(file) });
    }
    const m = /\/__(terrain|borders)\/([^/]+)\/((?:color|shade|height)\.png|\d+\.geojson)$/.exec(path);
    if (!m) return req.continue();
    req.respond({
      status: 200,
      contentType: m[3].endsWith(".png") ? "image/png" : "application/geo+json",
      body: await readFile(join(ROOT, "data/geo", m[1], m[2], m[3])),
    });
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("gaugeHint", "1");
    localStorage.setItem("viewHint", "1");
  });
  await page.goto(url, { waitUntil: "networkidle0", timeout: 120000 });
  await page.waitForFunction(() => !!window.__scene, { timeout: 60000 });
  await page.evaluate(
    (json, opts) => window.__scene.load(json, opts),
    scene,
    { frames: frames || 300, marks, terrain, borders },
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
