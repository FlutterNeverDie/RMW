// 완성본을 hwm/ 산출물 폴더(영상·쇼츠·배너·홍보·브금·tts)로 한글 이름 붙여 복사
// node scripts/deliver.mjs   (목록은 deliver.json, 원본이 더 새것일 때만 다시 복사)
// 영상은 { src, thumb, dir: "영상", name } - 영상과 썸네일이 같은 이름으로 짝지어진다
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CODE = fileURLToPath(new URL("..", import.meta.url));
const HOME = process.env.HWM ?? join(homedir(), "hwm"); // 산출물 폴더 (저장소 위치와 상관없이)
const { items } = JSON.parse(await readFile(join(CODE, "deliver.json"), "utf8"));

const day = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

async function put(src, dir, base) {
  const from = resolve(CODE, src);
  const s = await stat(from).catch(() => null);
  if (!s) return console.log(`없음: ${src}`);
  const to = join(HOME, dir, base + extname(from));
  const t = await stat(to).catch(() => null);
  if (t && t.mtimeMs >= s.mtimeMs) return;
  await mkdir(join(HOME, dir), { recursive: true });
  await copyFile(from, to);
  console.log(`→ ${join(dir, base + extname(from))}`);
  return s;
}

for (const it of items) {
  const s = await stat(resolve(CODE, it.src)).catch(() => null);
  const base = it.nodate || !s ? it.name : `${it.name}_${day(s.mtime)}`;
  await put(it.src, it.dir, base);
  if (it.thumb) await put(it.thumb, it.dir, `${base}_썸네일`);
}
