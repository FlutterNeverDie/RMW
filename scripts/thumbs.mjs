// 언어별 썸네일: episodes/<편>/thumbs.json의 문구를 언어마다 찍어 편 폴더에 둔다
// node scripts/thumbs.mjs episodes/mongol-01/thumbs.json
//   thumbs.json: { "look": "red", "map": "...", "face": "...", "faceFocus": "50% 25%",
//                  "variants": [ { "en": {"top": "...", "big": "..."}, "ko": {...}, "es": {...} }, ... ] }  ← 1번이 기본, 2·3번은 "테스트 및 비교"
//   문구는 번역이 아니라 그 나라 유튜버 말투로 새로 쓴다 (02 현지화). 그림(map·face)은 언어 공통, 변형마다 바꾸고 싶으면 variant에 map·face를 넣는다
// → out/thumbs/<편>-<번호>-<언어>.png, ~/hwm/<meta.folder>/<이름>_썸네일 <번호> <언어>.png, meta.json의 thumbs(영어)·thumbs_i18n(언어별)
// 유튜브: 영어는 업로드 때 API로, 다른 언어는 스튜디오 → 언어 → 그 언어 줄의 썸네일 칸 (다국어 오디오가 있는 채널, 2026)
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const CODE = fileURLToPath(new URL("..", import.meta.url));
const HOME = process.env.HWM ?? join(homedir(), "hwm");
const LANG = { en: "영어", ko: "한국어", es: "스페인어" };

const path = process.argv[2];
const spec = JSON.parse(await readFile(path, "utf8"));
const epDir = dirname(path);
const ep = basename(epDir);
const metaPath = join(epDir, "meta.json");
const meta = JSON.parse(await readFile(metaPath, "utf8"));
await mkdir(join(CODE, "out/thumbs"), { recursive: true });
const thumbs = [];
const i18n = {};
for (const [k, v] of spec.variants.entries()) {
  for (const [lang, words] of Object.entries(v).filter(([l]) => l in LANG)) {
    const props = { look: spec.look ?? "red", map: v.map ?? spec.map, face: v.face ?? spec.face, faceFocus: v.faceFocus ?? spec.faceFocus, ...words };
    const out = join(CODE, "out/thumbs", `${ep}-${k + 1}-${lang}.png`);
    await run("npx", ["remotion", "still", "src/index.ts", "Thumb", out, `--props=${JSON.stringify(props)}`], { cwd: CODE });
    const rel = join(meta.folder, `${meta.name}_썸네일 ${k + 1} ${LANG[lang]}.png`);
    await mkdir(join(HOME, meta.folder), { recursive: true });
    await copyFile(out, join(HOME, rel));
    if (lang === "en") thumbs.push(rel);
    else (i18n[lang] ??= []).push(rel);
    console.log(`→ ${rel}`);
  }
}
meta.thumbs = thumbs;
meta.thumbs_i18n = i18n;
await writeFile(metaPath, JSON.stringify(meta, null, 1) + "\n");
console.log(`meta.json thumbs ${thumbs.length}개, 언어별 ${Object.keys(i18n).join("·")}`);
