// 외부 프로그램 위치 - OS마다(맥·윈도우) 기본 자리, 환경 변수로 덮어쓰기. 파이썬 쪽은 scripts/tools.py (같은 규칙)
//   node scripts/tools.mjs              찾은 위치와 있는지 표 (새 PC 확인용)
//   node scripts/tools.mjs open <주소>   기본 브라우저·앱으로 열기 (맥 open, 윈도우 start)
// 환경 변수: HWM RMW_PYTHON CHROME BLENDER SFIZZ_RENDER RHUBARB FLUIDSYNTH CHRONOMAP
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const WIN = process.platform === "win32";
export const MAC = process.platform === "darwin";
export const CODE = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(homedir(), "src"); // 직접 받은·빌드한 도구 (setup.sh·setup.ps1)
const env = (k) => process.env[k] || null;
// 후보 중 있는 첫 자리, 없으면 첫 후보 (없다는 오류가 그 경로로 나오게)
const first = (...c) => c.filter(Boolean).find((p) => existsSync(p)) ?? c.filter(Boolean)[0] ?? null;
// PATH에서 찾기 (윈도우는 .exe 붙여서)
const which = (name) => {
  for (const d of (process.env.PATH || "").split(WIN ? ";" : ":")) {
    const p = join(d, WIN ? `${name}.exe` : name);
    if (d && existsSync(p)) return p;
  }
  return null;
};
// 윈도우 Program Files 아래 (64비트·32비트·사용자 설치)
const winRoots = () => [env("ProgramFiles"), env("ProgramFiles(x86)"), env("LOCALAPPDATA")].filter(Boolean);

export const hwmHome = () => env("HWM") ?? join(homedir(), "hwm"); // 산출물 폴더 (저장소 위치와 상관없이)
// 사이트 저장소 - 지도 장면(map-scene.mjs)이 개발 서버와 scripts/scene-borders.mjs(그 node_modules)를 쓴다
export const chronomap = () => env("CHRONOMAP") ?? join(homedir(), "Documents/GitHub/chronomap");
export const python = () => env("RMW_PYTHON") ?? join(CODE, WIN ? ".venv/Scripts/python.exe" : ".venv/bin/python");
// 검사기 등 표준 라이브러리만 쓰는 것: 맥은 그대로 python3, 윈도우는 python3가 스토어 바로가기라 .venv 파이썬
export const sysPython = () => (WIN ? python() : "python3");
export const node = () => process.execPath;
// npx remotion 대신 노드로 바로 (윈도우 npx.cmd는 cmd를 거쳐 --props의 따옴표·한글 경로가 깨짐) - [실행 파일, 인자]
export const remotion = (...args) => [process.execPath, [join(CODE, "node_modules/@remotion/cli/remotion-cli.js"), ...args]];

export const chrome = () =>
  env("CHROME") ??
  (WIN
    ? first(...winRoots().map((r) => join(r, "Google/Chrome/Application/chrome.exe")))
    : MAC
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : first("/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"));

// 크롬 그래픽 엔진 인자: 맥 metal(그대로), 윈도우 d3d11 (metal은 맥에만 있음)
export const ANGLE = `--use-angle=${MAC ? "metal" : WIN ? "d3d11" : "default"}`;

// 윈도우 Blender는 "Blender Foundation/Blender 4.5/blender.exe"처럼 버전 폴더 - 가장 새 것
const winBlender = () => {
  for (const r of winRoots()) {
    const base = join(r, "Blender Foundation");
    const dirs = existsSync(base) ? readdirSync(base).filter((d) => /^Blender/i.test(d)) : [];
    dirs.sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
    for (const d of dirs) if (existsSync(join(base, d, "blender.exe"))) return join(base, d, "blender.exe");
  }
  return which("blender") ?? join(env("ProgramFiles") ?? "C:/Program Files", "Blender Foundation/Blender/blender.exe");
};
export const blender = () => env("BLENDER") ?? (WIN ? winBlender() : MAC ? "/Applications/Blender.app/Contents/MacOS/Blender" : which("blender") ?? "blender");

// sfizz: 맥은 ~/src/sfizz 소스 빌드, 윈도우는 공식 릴리스 zip을 ~/src/sfizz 에 (bin/Release/sfizz_render.exe)
export const sfizzRender = () =>
  env("SFIZZ_RENDER") ??
  (WIN
    ? first(join(SRC, "sfizz/bin/Release/sfizz_render.exe"), join(SRC, "sfizz/build/library/bin/Release/sfizz_render.exe"), which("sfizz_render"))
    : join(SRC, "sfizz/build/library/bin/sfizz_render"));
export const rhubarb = () => env("RHUBARB") ?? join(SRC, "rhubarb", WIN ? "rhubarb.exe" : "rhubarb");
// fluidsynth: 맥은 Homebrew(PATH), 윈도우는 공식 릴리스 zip을 ~/src/fluidsynth 에, 없으면 PATH
export const fluidsynth = () => env("FLUIDSYNTH") ?? (WIN ? first(join(SRC, "fluidsynth/bin/fluidsynth.exe"), which("fluidsynth")) : "fluidsynth");

// Remotion에 든 ffmpeg (맥 M칩·인텔, 윈도우 x64) - 폴더 이름: compositor-darwin-arm64, compositor-win32-x64-msvc, compositor-linux-x64-gnu
export const ffmpegDir = () => {
  const base = join(CODE, "node_modules/@remotion");
  const pre = `compositor-${process.platform}-${process.arch}`;
  const d = existsSync(base) ? readdirSync(base).find((x) => x === pre || x.startsWith(pre + "-")) : null;
  return d ? join(base, d) : null;
};
export const ffmpeg = (tool = "ffmpeg") => {
  const d = ffmpegDir();
  const b = d && join(d, WIN ? `${tool}.exe` : tool);
  return b && existsSync(b) ? b : tool; // 없으면 설치된 ffmpeg
};

// 기본 앱으로 열기: 맥 open, 윈도우 start (cmd를 거치니 주소를 따옴표로 - & 같은 글자가 명령으로 안 읽히게), 리눅스 xdg-open
export const openPath = (target) => {
  const [cmd, args, opts] = WIN
    ? ["cmd.exe", ["/d", "/s", "/c", `"start "" "${target}""`], { windowsVerbatimArguments: true }]
    : [MAC ? "open" : "xdg-open", [target], {}];
  spawn(cmd, args, { ...opts, stdio: "ignore", detached: true }).unref();
};
// 클립보드 글 읽기: 맥 pbpaste, 윈도우 PowerShell Get-Clipboard
export const paste = () =>
  WIN ? execFileSync("powershell.exe", ["-NoProfile", "-Command", "Get-Clipboard"]).toString() : execFileSync("pbpaste").toString();

// 직접 실행하면 찾은 위치 표
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv[2] === "open") openPath(process.argv[3]);
  else {
    const rows = { hwmHome: hwmHome(), chronomap: chronomap(), python: python(), sysPython: sysPython(), node: node(), remotion: remotion()[1][0], chrome: chrome(), blender: blender(), sfizzRender: sfizzRender(), rhubarb: rhubarb(), fluidsynth: fluidsynth(), ffmpeg: ffmpeg() };
    for (const [k, v] of Object.entries(rows)) {
      const ok = v && (existsSync(v) || which(v) || (k === "sysPython" && !WIN));
      console.log(`${ok ? "있음" : "없음"}  ${k.padEnd(12)} ${v}`);
    }
  }
}
