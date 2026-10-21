// 영상 편집기 (내 맥 브라우저에서, AI 없음): npm run editor → http://localhost:4600
// 캡컷처럼 가운데 영상(실제 렌더와 같은 Episode를 Remotion Player로), 아래 트랙(화면·인물·효과음·브금·언어별 대사), 오른쪽 장면 속성
// 화면은 editor/app.tsx를 esbuild로 묶어 보냄. 저장하면 ep.json에 바로 씀 (git으로 되돌릴 수 있음)
// 검사(편집 중인 장면표를 그대로 check-text·pacing·length·screen·voice에 넣음), 캐릭터 만들기(characters.py), 자막 파일(.srt)도 여기서
// 내 맥 브라우저 전용: 다른 사이트가 이 서버에 요청을 못 하게 Host·Origin을 확인
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, writeFile, readdir, mkdir, stat, rm } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { ffmpeg, ffmpegDir, python, sysPython } from "./tools.mjs"; // 외부 프로그램 위치 (맥·윈도우)

const CODE = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT || 4600);
const OUT = join(CODE, "out/editor");
const run = promisify(execFile);
const HOME = process.env.HWM ?? join(homedir(), "hwm"); // 산출물 폴더 (저장소 위치와 상관없이)
// 편의 영상 폴더 (meta.json video 경로의 폴더) + /편집. 없으면 영상/정리 안 됨/<편>/편집
const editDir = async (e) => {
  epId(e);
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
const epId = (e) => {
  if (!/^[\w-]+$/.test(e || "")) throw new Error("편 이름이 이상함");
  return e;
};
const epPath = (e) => join(CODE, "episodes", epId(e), "ep.json");
const timelineOf = async (e) => JSON.parse(await readFile(join(CODE, "public/ep", e, "ep/timeline.json"), "utf8").catch(() => "null"));
const list = async (dir, ext) => (await readdir(join(CODE, dir)).catch(() => [])).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)).sort();

// 검사기 하나 돌리기: 장면표를 표준 입력으로 넘기고 --json 결과를 받음. 검사기가 죽으면 "문제 없음"이 아니라 오류 한 줄로
const PY_VENV = python();
const checker = async (source, script, e, body, py = sysPython()) => {
  try {
    const p = run(py, ["-I", `scripts/${script}`, `episodes/${e}/ep.json`, "--stdin", "--json"], { cwd: CODE, maxBuffer: 64 << 20 });
    p.child.stdin.end(body);
    const r = await p;
    return JSON.parse(r.stdout);
  } catch (err) {
    const why = String(err.stderr || err.message || err).trim().split("\n").pop();
    return [{ scene: null, lang: null, field: null, rule: "crash", group: "검사기", level: "error", source, msg: `${script}가 멈춤: ${why}` }];
  }
};
// 목소리 검사는 wav를 다 읽어 느림 → timeline이 그대로고 영어 대사 순서가 같으면 앞 결과를 씀
const voiceCache = new Map();
const voiceCheck = async (e, body, ep) => {
  const tl = await stat(join(CODE, "public/ep", e, "ep/timeline.json")).catch(() => null);
  if (!tl || !(await stat(PY_VENV).catch(() => null))) return [];
  const key = tl.mtimeMs + ":" + createHash("sha1").update(JSON.stringify(ep.scenes.map((s) => s.text ?? null))).digest("hex");
  const hit = voiceCache.get(e);
  if (hit?.key === key) return hit.items;
  const items = await checker("voice", "check-voice.py", e, body, PY_VENV);
  if (!items.some((x) => x.rule === "crash")) voiceCache.set(e, { key, items });
  return items;
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
    const meta = JSON.parse(await readFile(join(CODE, "episodes", epId(q.e), "meta.json"), "utf8").catch(() => "{}"));
    if (meta.uploaded) {
      const fixed = (e) => JSON.stringify(e.scenes.map(({ i18n, sfx, music, cues, ...rest }) => rest));
      const old = JSON.parse(await readFile(epPath(q.e), "utf8"));
      if (fixed(old) !== fixed(ep)) throw new Error("업로드한 편은 화면·장면 순서·영어 대사를 바꿀 수 없음 (더빙 대사·효과음·브금만)");
    }
    // 저장 직전 파일을 내역에 남김 (실수로 망가져도 편집기 "내역"에서 되돌림). 최근 100개
    const prev = await readFile(epPath(q.e), "utf8");
    const next = JSON.stringify(ep, null, 1) + "\n";
    if (prev !== next) {
      const dir = join(CODE, "episodes", epId(q.e), ".history");
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
    if (!q.id || /[\/\\]/.test(q.id) || q.id.startsWith(".") || !q.id.endsWith(".json")) throw new Error("편집본 이름이 이상함");
    return JSON.parse(await readFile(join(HOME, await editDir(q.e), q.id), "utf8"));
  },
  // 내역: 저장할 때마다 남긴 "저장 직전" 장면표 목록 (새것부터)
  "GET /api/history": async (q) => {
    const dir = join(CODE, "episodes", epId(q.e), ".history");
    const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".json")).sort().reverse();
    return files.map((f) => {
      const [d, t] = f.replace(".json", "").split("T");
      return { id: f, time: `${d} ${t.replace(/-/g, ":")}` };
    });
  },
  "GET /api/history/one": async (q) => {
    if (!/^[\w.-]+\.json$/.test(q.id || "")) throw new Error("내역 이름이 이상함");
    return JSON.parse(await readFile(join(CODE, "episodes", epId(q.e), ".history", q.id), "utf8"));
  },
  // 현지화 검토 도장 상태 (scripts/locale-review.py)
  "GET /api/review": async (q) => {
    const r = await run(sysPython(), ["scripts/locale-review.py", "status", epPath(q.e), "--json"], { cwd: CODE }).catch(() => ({ stdout: "{}" }));
    return JSON.parse(r.stdout || "{}");
  },
  // 검사: 편집기가 지금 장면표(저장 안 한 것 포함)를 보내면 검사기들에 그대로 넣음. 몸통이 없으면 저장된 파일
  // 결과는 한 목록 [{scene, lang, field, rule, group, level, msg, span, match, suggest, source}] - 장면 번호는 보낸 장면표 기준
  "POST /api/check": async (q, body) => {
    epId(q.e);
    const text = body || (await readFile(epPath(q.e), "utf8"));
    const ep = JSON.parse(text);
    if (!Array.isArray(ep.scenes)) throw new Error("scenes가 없음");
    const parts = await Promise.all([
      checker("text", "check-text.py", q.e, text),
      checker("pacing", "check-pacing.py", q.e, text),
      checker("length", "check-length.py", q.e, text),
      checker("zoom", "check-screen.py", q.e, text),
      voiceCheck(q.e, text, ep),
      // 소리 섞임(효과음·브금이 목소리를 덮음): 목소리가 있어야 잼, 효과음을 넣고 빼면 바로 다시
      (async () => ((await stat(join(CODE, "public/ep", q.e, "ep/timeline.json")).catch(() => null)) ? checker("mix", "check-mix.py", q.e, text, PY_VENV) : []))(),
    ]);
    return { items: parts.flat() };
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
    // Remotion에 든 ffmpeg (맥 M칩·인텔, 윈도우 x64), 없으면 설치된 ffmpeg. 실패해도 임시 파일은 지움
    const ff = ffmpegDir() ?? "";
    try {
      await run(ffmpeg(), ["-y", "-loglevel", "error", "-i", tmp, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", join(dir, name + ".wav")], { env: { ...process.env, DYLD_LIBRARY_PATH: ff } });
    } finally {
      await rm(tmp, { force: true });
    }
    return { src: `${kind}/${name}.wav`, name };
  },
  // 이 줄 목소리 다시 만들기 (고친 대사 한 줄만, audio/revoice.py) - 업로드한 편의 영어는 잠김
  "POST /api/revoice": async (q, body) => {
    const req = JSON.parse(body);
    const meta = JSON.parse(await readFile(join(CODE, "episodes", q.e, "meta.json"), "utf8").catch(() => "{}"));
    if (meta.uploaded && req.lang === "en") throw new Error("업로드한 편의 영어 목소리는 바꿀 수 없음");
    if (!Number.isInteger(req.tl) || !/^[a-z]{2}$/.test(req.lang || "") || !req.text?.trim()) throw new Error("요청이 이상함");
    const out = await new Promise((resolve, reject) => {
      const p = spawn(PY_VENV, ["-I", join(CODE, "audio/revoice.py"), epPath(q.e)], { cwd: CODE });
      let so = "", se = "";
      p.stdout.on("data", (c) => (so += c));
      p.stderr.on("data", (c) => (se += c));
      p.on("close", (code) => (code === 0 ? resolve(so) : reject(new Error("목소리 만들기 실패: " + (se.trim().split("\n").pop() || code)))));
      p.stdin.end(JSON.stringify(req));
    });
    return JSON.parse(out.trim().split("\n").pop());
  },
  "GET /api/chars": async () => JSON.parse(await readFile(join(CODE, "characters.json"), "utf8")).characters,
  // 캐릭터 하나 저장(설계 → characters.json) + 그 인물만 다시 그림. 그리기가 실패하면 characters.json을 되돌림
  "POST /api/char": async (q, body) => {
    if (!/^[a-z0-9_]+$/.test(q.id || "")) throw new Error("id는 영어 소문자·숫자·_만");
    const file = join(CODE, "characters.json");
    const prev = await readFile(file, "utf8");
    const all = JSON.parse(prev);
    const spec = JSON.parse(body);
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error("설계가 이상함");
    all.characters[q.id] = spec;
    await writeFile(file, JSON.stringify(all, null, 1) + "\n");
    try {
      await run(sysPython(), ["audio/characters.py", "build", q.id], { cwd: CODE });
    } catch (err) {
      await writeFile(file, prev);
      throw new Error("그리기 실패: " + String(err.stderr || err.message).trim().split("\n").pop());
    }
    await buildApp(); // 말하는 사람 → 캐릭터 연결이 화면 코드에 들어 있음
    return { ok: true, v: Date.now() };
  },
  "GET /api/srt": async (q) => {
    // 유튜브 자막: scripts/subtitles.py (목소리의 실제 쉼에 문장 경계를 맞추고 긴 문장은 두 줄로, 편 폴더에도 복사)
    const ep = JSON.parse(await readFile(epPath(q.e), "utf8"));
    if (!(await timelineOf(q.e))) throw new Error("목소리를 먼저 만들어야 자막 시간을 앎 (timeline.json 없음)");
    const { stdout } = await run(PY_VENV, ["-I", join(CODE, "scripts/subtitles.py"), epPath(q.e)], { cwd: CODE });
    const files = [];
    for (const lang of ep.langs || ["en"]) {
      await writeFile(join(OUT, `${q.e}.${lang}.srt`), await readFile(join(CODE, "out", `${q.e}.${lang}.srt`)));
      files.push(`/out/${q.e}.${lang}.srt`);
    }
    const stale = (stdout.match(/^STALE (.*)$/m)?.[1] ?? "").split(",").filter(Boolean).map((x) => x.replace(":", " "));
    return { files, stale };
  },
};

// 이 서버에 올 수 있는 곳: 이 맥의 편집기 화면만 (다른 웹 페이지가 장면표를 덮어쓰거나 파이썬을 돌리지 못하게, DNS 바꿔치기도 막음)
const HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const ORIGINS = new Set([...HOSTS].map((h) => `http://${h}`));
const allowed = (req) =>
  HOSTS.has(req.headers.host || "") &&
  (!req.headers.origin || ORIGINS.has(req.headers.origin)) &&
  !["cross-site", "same-site"].includes(req.headers["sec-fetch-site"] || "");

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const q = Object.fromEntries(url.searchParams);
  const send = (code, body, type = "application/json") => {
    res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
    res.end(body);
  };
  if (!allowed(req)) return send(403, JSON.stringify({ error: "이 맥의 편집기 화면에서만" }));
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
}).listen(PORT, "127.0.0.1", () => console.log(`장면 편집기: http://localhost:${PORT}`));
