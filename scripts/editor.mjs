// 영상 편집기 (내 맥 브라우저에서, AI 없음): npm run editor → http://localhost:4600
// 캡컷처럼 가운데 영상(실제 렌더와 같은 Episode를 Remotion Player로), 아래 트랙(화면·인물·효과음·브금·언어별 대사), 오른쪽 장면 속성
// 화면은 editor/app.tsx를 esbuild로 묶어 보냄. 저장하면 ep.json에 바로 씀 (git으로 되돌릴 수 있음)
// 대본 검사(check-text.py), 캐릭터 만들기(characters.py), 자막 파일(.srt), 장면 그림·영상 뽑기(/api/still·/api/clip)도 여기서
import { createServer } from "node:http";
import { readFile, writeFile, readdir, mkdir, stat, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, renderMedia, selectComposition } from "@remotion/renderer";
import { build } from "esbuild";

const CODE = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT || 4600);
const OUT = join(CODE, "out/editor");
const run = promisify(execFile);
const HOME = join(CODE, ".."); // ~/hwm (산출물 폴더)
// 편의 영상 폴더 (meta.json video 경로의 폴더) + /편집. 없으면 영상/정리 안 됨/<편>/편집
const editDir = async (e) => {
  const meta = JSON.parse(await readFile(join(CODE, "episodes", e, "meta.json"), "utf8").catch(() => "{}"));
  const parts = (meta.video || "").split("/");
  return (parts.length > 2 ? parts.slice(0, -1).join("/") : `영상/정리 안 됨/${e}`) + "/편집";
};
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".wav": "audio/wav", ".mp4": "video/mp4", ".srt": "text/plain; charset=utf-8" };

await mkdir(OUT, { recursive: true });
const buildApp = () =>
  build({
    entryPoints: [join(CODE, "editor/app.tsx")],
    bundle: true,
    outfile: join(OUT, "app.js"),
    jsx: "automatic",
    format: "iife",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "error",
  });
await buildApp();

// wav 길이(초) - 헤더만 읽음
const wavSecs = async (file) => {
  const b = await readFile(file).catch(() => null);
  if (!b || b.toString("ascii", 0, 4) !== "RIFF") return null;
  let off = 12, byteRate = 0;
  while (off + 8 <= b.length) {
    const id = b.toString("ascii", off, off + 4), size = b.readUInt32LE(off + 4);
    if (id === "fmt ") byteRate = b.readUInt32LE(off + 16);
    if (id === "data") return byteRate ? Math.round((Math.min(size, b.length - off - 8) / byteRate) * 1000) / 1000 : null;
    off += 8 + size + (size % 2);
  }
  return null;
};
let serveUrl = null;
let bundling = null;
const getBundle = (fresh = false) => {
  if (fresh) serveUrl = null;
  if (serveUrl) return Promise.resolve(serveUrl);
  bundling ??= bundle({ entryPoint: join(CODE, "src/preview.tsx"), publicDir: join(CODE, "public") }).then((u) => ((serveUrl = u), (bundling = null), u));
  return bundling;
};

const epPath = (e) => {
  if (!/^[\w-]+$/.test(e)) throw new Error("편 이름이 이상함");
  return join(CODE, "episodes", e, "ep.json");
};
const timelineOf = async (e) => JSON.parse(await readFile(join(CODE, "public/ep", e, "ep/timeline.json"), "utf8").catch(() => "null"));
const list = async (dir, ext) => (await readdir(join(CODE, dir)).catch(() => [])).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)).sort();

// 장면 하나 미리보기용: 실제 timeline.json이 있으면 그 길이·목소리, 없으면 대사 길이로 어림
const sceneForRender = async (e, i, lang) => {
  const ep = JSON.parse(await readFile(epPath(e), "utf8"));
  const tl = await timelineOf(e);
  const sc = ep.scenes[i];
  const real = tl?.scenes?.[i];
  const words = (sc.text || "").split(/\s+/).length;
  const frames = real?.frames ?? Math.max(60, Math.round((words / 2.6) * 30) + 20);
  const vo = real ? (lang === "en" ? real.vo : real.vo_i18n?.[lang]) ?? null : null;
  return { scene: { ...sc, vo }, frames };
};

const api = {
  // 재생목록 > 편 (meta.json의 video 경로 "영상/<재생목록>/<N편 - 부제>/..." 기준, 없으면 "정리 안 됨")
  "GET /api/episodes": async () => {
    const dirs = (await readdir(join(CODE, "episodes"), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    const out = [];
    for (const id of dirs) {
      if (!(await stat(join(CODE, "episodes", id, "ep.json")).catch(() => null))) continue;
      const meta = JSON.parse(await readFile(join(CODE, "episodes", id, "meta.json"), "utf8").catch(() => "{}"));
      const [, playlist, title] = (meta.video || "").split("/");
      out.push({ id, playlist: playlist || "정리 안 됨", title: title || meta.name || id });
    }
    return out;
  },
  "GET /api/ep": async (q) => {
    const ep = JSON.parse(await readFile(epPath(q.e), "utf8"));
    const tl = await timelineOf(q.e);
    const cast = JSON.parse(await readFile(join(CODE, "cast.json"), "utf8")).roles;
    const chars = JSON.parse(await readFile(join(CODE, "characters.json"), "utf8")).characters;
    // 언어별 실제 목소리 길이: timeline.json의 dur, 없으면(예전 timeline) wav 헤더로
    const durs = tl
      ? await Promise.all(
          tl.scenes.map(async (s) => {
            if (s.dur && Object.keys(s.dur).length) return s.dur;
            const out = {};
            for (const [l, p] of Object.entries({ en: s.vo, ...(s.vo_i18n || {}) })) if (p) out[l] = await wavSecs(join(CODE, "public", p));
            return out;
          }),
        )
      : null;
    // 업로드한 편(meta.json "uploaded")은 화면이 유튜브에 올라가 고정 → 편집기가 화면·인물 배치·장면 순서·영어를 잠근다
    const meta = JSON.parse(await readFile(join(CODE, "episodes", q.e, "meta.json"), "utf8").catch(() => "{}"));
    return {
      ep,
      locked: meta.uploaded || null,
      tl: tl?.scenes?.map((s) => ({ text: s.text, i18n: s.i18n, vo: s.vo, vo_i18n: s.vo_i18n, frames: s.frames })) ?? null,
      durs,
      bgm: await list("public/bgm", ".wav"),
      sfx: await list("public/sfx/ep", ".wav"),
      roles: Object.fromEntries(Object.entries(cast).map(([k, v]) => [k, v.ko])),
      chars: Object.fromEntries(Object.entries(chars).map(([k, v]) => [k, v.speakers?.[0] || v.names?.[0] || k])),
    };
  },
  "POST /api/ep": async (q, body) => {
    const ep = JSON.parse(body);
    if (!Array.isArray(ep.scenes)) throw new Error("scenes가 없음");
    // 업로드한 편: 더빙 대사(i18n)·효과음·브금만 바뀌었는지 서버에서도 확인
    const meta = JSON.parse(await readFile(join(CODE, "episodes", q.e, "meta.json"), "utf8").catch(() => "{}"));
    if (meta.uploaded) {
      const fixed = (e) => JSON.stringify(e.scenes.map(({ i18n, sfx, music, cues, ...rest }) => rest));
      const old = JSON.parse(await readFile(epPath(q.e), "utf8"));
      if (fixed(old) !== fixed(ep)) throw new Error("업로드한 편은 화면·장면 순서·영어 대사를 바꿀 수 없음 (더빙 대사·효과음·브금만)");
    }
    // 저장 직전 파일을 내역에 남김 (실수로 망가져도 편집기 "내역"에서 되돌림). 최근 100개
    const prev = await readFile(epPath(q.e), "utf8");
    const next = JSON.stringify(ep, null, 1) + "\n";
    if (prev !== next) {
      const dir = join(CODE, "episodes", q.e, ".history");
      await mkdir(dir, { recursive: true });
      const n = new Date(), z = (x) => String(x).padStart(2, "0");
      const stamp = `${n.getFullYear()}-${z(n.getMonth() + 1)}-${z(n.getDate())}T${z(n.getHours())}-${z(n.getMinutes())}-${z(n.getSeconds())}`;
      await writeFile(join(dir, `${stamp}.json`), prev);
      const old = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
      for (const f of old.slice(0, Math.max(0, old.length - 100))) await rm(join(dir, f));
    }
    await writeFile(epPath(q.e), next);
    // 이름을 붙이면 영상 폴더의 "편집"에 편집본을 남김: 영상/<재생목록>/<편>/편집/MMDDhhmm-이름.json
    if (q.name) {
      const n = new Date(), z = (x) => String(x).padStart(2, "0");
      const name = q.name.replace(/[\/\\:*?"<>|]/g, "").trim().slice(0, 60) || "편집";
      const file = `${z(n.getMonth() + 1)}${z(n.getDate())}${z(n.getHours())}${z(n.getMinutes())}-${name}.json`;
      const dir = await editDir(q.e);
      await mkdir(join(HOME, dir), { recursive: true });
      await writeFile(join(HOME, dir, file), next);
      return { saved: true, file: `${dir}/${file}` };
    }
    return { saved: true };
  },
  // 이름 붙여 저장한 편집본 목록 (새것부터)
  "GET /api/edits": async (q) => {
    const dir = await editDir(q.e);
    const files = (await readdir(join(HOME, dir)).catch(() => [])).filter((f) => f.endsWith(".json")).sort().reverse();
    return { dir, list: files.map((f) => { const m = f.match(/^(\d{2})(\d{2})(\d{2})(\d{2})-(.*)\.json$/); return { id: f, name: m ? m[5] : f, time: m ? `${m[1]}-${m[2]} ${m[3]}:${m[4]}` : "" }; }) };
  },
  "GET /api/edits/one": async (q) => {
    if (/[\/\\]/.test(q.id || "") || !q.id.endsWith(".json")) throw new Error("편집본 이름이 이상함");
    return JSON.parse(await readFile(join(HOME, await editDir(q.e), q.id), "utf8"));
  },
  // 내역: 저장할 때마다 남긴 "저장 직전" 장면표 목록 (새것부터)
  "GET /api/history": async (q) => {
    const dir = join(CODE, "episodes", q.e, ".history");
    const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".json")).sort().reverse();
    return files.map((f) => {
      const [d, t] = f.replace(".json", "").split("T");
      return { id: f, time: `${d} ${t.replace(/-/g, ":")}` };
    });
  },
  "GET /api/history/one": async (q) => {
    if (!/^[\w.-]+\.json$/.test(q.id || "")) throw new Error("내역 이름이 이상함");
    return JSON.parse(await readFile(join(CODE, "episodes", q.e, ".history", q.id), "utf8"));
  },
  "GET /api/check": async (q) => {
    const r = await run("python3", ["scripts/check-text.py", epPath(q.e)], { cwd: CODE }).catch((err) => err);
    const text = r.stdout || "";
    const byScene = {};
    const general = [];
    let kind = "";
    const lines = text.split("\n");
    for (let k = 0; k < lines.length; k++) {
      const h = lines[k].match(/^\[(오류|경고)/);
      if (h) kind = h[1];
      const m = lines[k].match(/^  #(\d+) /);
      if (m) (byScene[m[1]] ??= []).push({ kind, msg: lines[k + 1]?.trim() });
      else if (/^  \S/.test(lines[k]) && !/^    /.test(lines[k])) general.push({ kind, msg: lines[k].trim() });
    }
    return { summary: lines.filter(Boolean).pop(), byScene, general };
  },
  "GET /api/still": async (q) => {
    const { scene, frames } = await sceneForRender(q.e, Number(q.i), q.lang || "en");
    const serve = await getBundle();
    const inputProps = { scene, frames };
    const composition = await selectComposition({ serveUrl: serve, id: "Scene", inputProps });
    const file = join(OUT, `${q.e}-${q.i}.png`);
    await renderStill({ composition, serveUrl: serve, output: file, inputProps, frame: Math.min(frames - 1, Number(q.f ?? Math.round(frames * 0.6))), scale: 0.5 });
    return { url: `/out/${q.e}-${q.i}.png?t=${Date.now()}`, frames };
  },
  "GET /api/clip": async (q) => {
    const lang = q.lang || "en";
    const { scene, frames } = await sceneForRender(q.e, Number(q.i), lang);
    const serve = await getBundle();
    const inputProps = { scene, frames };
    const composition = await selectComposition({ serveUrl: serve, id: "Scene", inputProps });
    const file = join(OUT, `${q.e}-${q.i}-${lang}.mp4`);
    await renderMedia({ composition, serveUrl: serve, codec: "h264", outputLocation: file, inputProps, scale: 0.5, concurrency: 4 });
    return { url: `/out/${q.e}-${q.i}-${lang}.mp4?t=${Date.now()}`, frames };
  },
  // 소리 모음: 채널 효과음(sfx/ep) + 내 소리(sfx/my, 끌어다 넣은 것) + 브금(bgm)
  "GET /api/sounds": async () => {
    const group = async (dir, label) =>
      Promise.all(
        (await readdir(join(CODE, "public", dir)).catch(() => []))
          .filter((f) => f.endsWith(".wav"))
          .sort()
          .map(async (f) => ({ src: `${dir}/${f}`, name: f.slice(0, -4), group: label, secs: await wavSecs(join(CODE, "public", dir, f)) })),
      );
    return { sfx: [...(await group("sfx/my", "내 소리")), ...(await group("sfx/ep", "채널"))], bgm: await group("bgm", "브금") };
  },
  // 파일 끌어다 넣기: 어떤 소리 파일이든 wav(48kHz 스테레오)로 바꿔 저장 (Remotion에 든 ffmpeg 사용)
  "POST /api/upload": async (q, body, raw) => {
    const kind = q.kind === "bgm" ? "bgm" : "sfx/my";
    const base = (q.name || "sound").replace(/\.[^.]+$/, "").replace(/[^\w가-힣 -]/g, "").trim().replace(/\s+/g, "-") || "sound";
    const dir = join(CODE, "public", kind);
    await mkdir(dir, { recursive: true });
    let name = base;
    for (let k = 2; await stat(join(dir, name + ".wav")).catch(() => null); k++) name = `${base}-${k}`;
    const tmp = join(OUT, "upload-" + Date.now());
    await writeFile(tmp, raw);
    // Remotion에 든 ffmpeg (맥 M칩·인텔 모두), 없으면 설치된 ffmpeg
    const ff = join(CODE, `node_modules/@remotion/compositor-${process.platform}-${process.arch}`);
    const bin = (await stat(join(ff, "ffmpeg")).catch(() => null)) ? join(ff, "ffmpeg") : "ffmpeg";
    await run(bin, ["-y", "-loglevel", "error", "-i", tmp, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", join(dir, name + ".wav")], { env: { ...process.env, DYLD_LIBRARY_PATH: ff } });
    await rm(tmp);
    return { src: `${kind}/${name}.wav`, name };
  },
  "GET /api/chars": async () => JSON.parse(await readFile(join(CODE, "characters.json"), "utf8")).characters,
  "POST /api/rebundle": async () => (await buildApp(), await getBundle(true), { ok: true }),
  // 캐릭터 하나 저장(설계 → characters.json) + 그 인물만 다시 그림. body가 {"_delete": true}면 지움
  "POST /api/char": async (q, body) => {
    if (!/^[a-z0-9_]+$/.test(q.id || "")) throw new Error("id는 영어 소문자·숫자·_만");
    const file = join(CODE, "characters.json");
    const all = JSON.parse(await readFile(file, "utf8"));
    const spec = JSON.parse(body);
    if (spec._delete) {
      delete all.characters[q.id];
      await rm(join(CODE, "public/chars", q.id), { recursive: true, force: true });
    } else all.characters[q.id] = spec;
    await writeFile(file, JSON.stringify(all, null, 1) + "\n");
    if (!spec._delete) await run("python3", ["audio/characters.py", "build", q.id], { cwd: CODE });
    serveUrl = null; // 그림·영상 뽑기용 묶음은 다음에 다시
    await buildApp(); // 말하는 사람 → 캐릭터 연결이 화면 코드에 들어 있음
    return { ok: true, v: Date.now() };
  },
  "GET /api/srt": async (q) => {
    // 유튜브 자막: 장면마다 그 언어 목소리 길이를 문장 글자 수 비율로 나눠 문장 하나씩 (실제 길이는 timeline.json)
    const ep = JSON.parse(await readFile(epPath(q.e), "utf8"));
    const tl = await timelineOf(q.e);
    if (!tl) throw new Error("목소리를 먼저 만들어야 자막 시간을 앎 (timeline.json 없음)");
    const ts = (sec) => {
      const ms = Math.max(0, Math.round(sec * 1000));
      const p = (n, w = 2) => String(n).padStart(w, "0");
      return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
    };
    const files = [];
    const stale = [];
    for (const lang of ep.langs || ["en"]) {
      let at = 0;
      let n = 0;
      const rows = [];
      for (const [i, sc] of ep.scenes.entries()) {
        const t = tl.scenes[i];
        const sceneSecs = (t?.frames ?? 0) / tl.fps;
        const text = lang === "en" ? sc.text : sc.i18n?.[lang];
        const voiced = lang === "en" ? t?.text : t?.i18n?.[lang];
        if (text && voiced !== text) stale.push(`${i} ${lang}`); // 목소리 만든 뒤 대사가 바뀜 → 시간이 어긋남
        if (text) {
          const dur = Math.min(sceneSecs, t?.dur?.[lang] ?? (await wavSecs(join(CODE, "public", (lang === "en" ? t?.vo : t?.vo_i18n?.[lang]) || "x"))) ?? sceneSecs);
          const sents = text.split(/(?<=[.!?…。？！])\s+/).map((x) => x.trim()).filter(Boolean);
          const weight = sents.map((x) => x.replace(/\s/g, "").length || 1);
          const sum = weight.reduce((a, b) => a + b, 0);
          let s0 = at;
          sents.forEach((line, k) => {
            const len = (dur * weight[k]) / sum;
            const end = k === sents.length - 1 ? at + Math.max(dur, 0.8) : s0 + len;
            rows.push(`${++n}\n${ts(s0)} --> ${ts(Math.min(end, at + sceneSecs - 0.05))}\n${line}\n`);
            s0 = end;
          });
        }
        at += sceneSecs;
      }
      await writeFile(join(OUT, `${q.e}.${lang}.srt`), rows.join("\n"));
      files.push(`/out/${q.e}.${lang}.srt`);
    }
    return { files, stale };
  },
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const q = Object.fromEntries(url.searchParams);
  const send = (code, body, type = "application/json") => {
    res.writeHead(code, { "content-type": type });
    res.end(body);
  };
  try {
    const h = api[`${req.method} ${url.pathname}`];
    if (h) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks);
      return send(200, JSON.stringify(await h(q, raw.toString("utf8"), raw)));
    }
    // 파일: / → 편집기 화면, /out/* → 미리보기 결과, 나머지 → public/*
    const p = decodeURIComponent(url.pathname);
    const file = p === "/" ? join(CODE, "editor/index.html") : p === "/app.js" ? join(OUT, "app.js") : p.startsWith("/out/") ? join(OUT, p.slice(5)) : join(CODE, "public", p);
    const base = p.startsWith("/out/") || p === "/app.js" ? OUT : p === "/" ? join(CODE, "editor") : join(CODE, "public");
    if (!normalize(file).startsWith(base)) return send(403, "no");
    await stat(file);
    send(200, await readFile(file), TYPES[extname(file)] || "application/octet-stream");
  } catch (err) {
    send(err.code === "ENOENT" ? 404 : 500, JSON.stringify({ error: String(err.message || err) }));
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`장면 편집기: http://localhost:${PORT}`);
  getBundle().then(() => console.log("미리보기 준비 끝"));
});
