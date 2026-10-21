// 해설 영상 한 편 만들기: 대본 검사(걸리면 멈춤) → 목소리(모든 언어) → 화면 잘림 검사(걸리면 멈춤) → 영상 렌더 → 언어별 더빙 트랙 → hwm/영상으로 복사
// node scripts/make-episode.mjs episodes/mongol-01/ep.json Mongol01 out/mongol-01.mp4 [--dry-run]   (맥은 scripts/make-episode.sh 도 같음)
// 장면표의 langs(예: ["en","ko"])마다 대사가 i18n에 있어야 함. 장면 길이는 가장 긴 언어 기준이라 더빙 트랙 = 영상 길이
// 맥·윈도우 같은 코드. 단계마다 종료 코드를 보고 실패하면 바로 멈춤 - 출력 줄이기(tail)는 이 안에서 해서 실패가 묻히지 않는다 (04 사고 기록: 깨진 2편 업로드)
// 경로는 저장소 기준 (예전 make-episode.sh가 저장소로 cd 한 것과 같음)
import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { basename, dirname } from "node:path";
import { node, python, remotion, CODE } from "./tools.mjs";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const [ep, comp, out] = argv.filter((a) => !a.startsWith("--"));
if (argv.includes("--help") || argv.includes("-h") || !ep || !comp || !out) {
  console.log(`쓰는 법: node scripts/make-episode.mjs <장면표> <컴포지션> <출력.mp4> [--dry-run]
  예: node scripts/make-episode.mjs episodes/mongol-01/ep.json Mongol01 out/mongol-01.mp4
  --dry-run  실제로 돌리지 않고 단계와 명령만 보여 줌
단계: 대본 검사 → 현지화 도장 → 목소리 → 목소리·소리 섞임·잘림 검사 → 입 모양 → 미리 찍는 장면 → AI 음성 검수 → 렌더 → 깜빡임 검사 → 더빙 트랙 → 자막 → deliver`);
  process.exit(argv.includes("--help") || argv.includes("-h") ? 0 : 1);
}
process.chdir(CODE);

const PY = python();
const py = (...a) => [PY, ["-I", ...a]];
const langs = JSON.parse(readFileSync(ep, "utf8")).langs ?? ["en"];
const TL = `public/ep/${basename(dirname(ep))}/${basename(ep, ".json")}/timeline.json`;
const stem = out.replace(/\.mp4$/, ""); // ${3%.mp4}

// 단계: cmd [실행 파일, 인자], tail = 표준 출력 끝 몇 줄만(실패하면 더 보여 줌), both = 오류 출력도 같이 모음,
// grep = 그 줄만 보여 줌, quiet = 오류 출력 버림, soft = 실패해도 이 글을 찍고 계속, fn = 명령 대신 할 일
const steps = [
  // 대본·화면 글자 검사 - 목소리 한도를 쓰기 전에 (말투 섞임, 이였, 화면 영어 낱말, 이름 표기)
  { name: "대본 검사", cmd: py("scripts/check-text.py", ep) },
  // 현지화 검토 도장 - 언어마다 Claude가 가이드(docs/guide/locales) 기준으로 검토했는지, 그 뒤 대사가 안 바뀌었는지
  { name: "현지화 도장", cmd: py("scripts/locale-review.py", "gate", ep) },
  { name: "목소리", cmd: py("audio/voice_episode.py", ep), tail: 3 },
  // 목소리 끝 지지직·뚝 끊김·깨짐 검사 - 걸리면 멈춤
  { name: "목소리 검사", cmd: py("scripts/check-voice.py", ep) },
  // 소리 섞임 검사 - 효과음·브금이 목소리를 덮으면 멈춤 (2026-10-21 사용자: 효과음에 내레이션이 묻힘)
  { name: "소리 섞임 검사", cmd: py("scripts/check-mix.py", ep) },
  { name: "잘림 검사", cmd: py("scripts/check-layout.py", ep) },
  // 캐릭터 입 모양 (목소리 크기 → 프레임별 0·1·2). 실패해도 렌더는 입을 흉내 내며 진행
  { name: "입 모양", cmd: py("audio/characters.py", "mouth", ep), soft: "입 모양 건너뜀" },
  // 미리 찍는 장면: 옛 그림 2.5D(art parallax)·기울인 지도(mapscene)·시네마틱 - 목소리로 정해진 길이만큼
  { name: "미리 찍는 장면", cmd: py("scripts/scene-frames.py", ep) },
  // 사람이 못 듣는 언어는 AI가 듣고 검수 (문제는 보고만 하고 멈추지 않음)
  ...langs.map((lang) => ({ name: `AI 음성 검수 ${lang}`, cmd: [node(), ["scripts/qa-voice.mjs", ep, lang]], grep: /^\[|문제/, quiet: true, soft: "" })),
  // 화면 배치는 1920×1080 그대로, 4/3배로 찍어 2560×1440(1440p)로 뽑는다 - 유튜브가 1440p 이상은 더 좋은 압축(VP9)을 줘서 1080p로 봐도 선명하다
  // 프레임 사진으로 렌더 → 깨진 프레임만 다시 찍기 → 소리 합치기 (긴 렌더에서 크롬이 가끔 화면을 3×3 타일로 깨뜨려서)
  { name: "렌더", cmd: py("scripts/render-checked.py", comp, TL, out) },
  // 깜빡임(빈 프레임·튐) 검사 - 걸리면 멈춤, 통과하면 업로드 허락 표시(.checked)
  { name: "깜빡임 검사", cmd: py("scripts/check-flicker.py", out, TL) },
  ...langs
    .filter((l) => l !== "en")
    .flatMap((lang) => [
      { name: `더빙 트랙 ${lang}`, cmd: remotion("render", "src/index.ts", comp, `${stem}.${lang}.raw.wav`, "--codec=wav", "--timeout=120000", "--concurrency=3", `--props=${JSON.stringify({ lang })}`), tail: 1, both: true },
      // 영상 소리와 같은 크기(-14 LUFS)로
      { name: `더빙 크기 ${lang}`, cmd: py("scripts/loudness.py", `${stem}.${lang}.raw.wav`, `${stem}.${lang}.wav`) },
      { name: `임시 파일 지움 ${lang}`, fn: () => rmSync(`${stem}.${lang}.raw.wav`), show: `rm ${stem}.${lang}.raw.wav` },
    ]),
  // 언어별 유튜브 자막(.srt) - 편 폴더에 같이
  { name: "자막", cmd: py("scripts/subtitles.py", ep) },
  { name: "deliver", cmd: [node(), ["scripts/deliver.mjs"]] },
];

const q = (s) => (/[\s"{}]/.test(s) ? JSON.stringify(s) : s); // 보여 주기용 따옴표
const line = (s) => s.show ?? [s.cmd[0], ...s.cmd[1]].map(q).join(" ");

const runStep = (s) =>
  new Promise((done) => {
    const [bin, args] = s.cmd;
    const pipeOut = s.tail || s.grep;
    const p = spawn(bin, args, { stdio: ["inherit", pipeOut ? "pipe" : "inherit", s.both ? "pipe" : s.quiet ? "ignore" : "inherit"] });
    const chunks = [];
    p.stdout?.on("data", (c) => chunks.push(c));
    p.stderr?.on("data", (c) => chunks.push(c));
    p.on("error", (err) => done({ code: 127, text: `실행 못 함: ${bin} (${err.message})` }));
    p.on("close", (code, sig) => done({ code: code ?? 1, sig, text: Buffer.concat(chunks).toString("utf8") }));
  });

for (const [i, s] of steps.entries()) {
  const head = `[${i + 1}/${steps.length}] ${s.name}`;
  if (DRY) {
    console.log(`${head}${s.soft !== undefined ? " (실패해도 계속)" : ""}\n    ${line(s)}`);
    continue;
  }
  console.log(`\n${head}`);
  let r;
  if (s.fn) {
    try {
      s.fn();
      r = { code: 0, text: "" };
    } catch (err) {
      r = { code: 1, text: String(err.message || err) };
    }
  } else r = await runStep(s);
  const lines = r.text.split(/\r?\n/).filter((l) => l.trim());
  if (r.code === 0) {
    const show = s.grep ? lines.filter((l) => s.grep.test(l)) : s.tail ? lines.slice(-s.tail) : lines;
    if (show.length) console.log(show.join("\n"));
    continue;
  }
  if (s.soft !== undefined) {
    if (s.grep) console.log(lines.filter((l) => s.grep.test(l)).join("\n"));
    if (s.soft) console.log(s.soft);
    continue;
  }
  // 실패: 모아 둔 출력의 끝을 보여 주고 그 종료 코드로 멈춤
  if (lines.length) console.error(lines.slice(-30).join("\n"));
  console.error(`\n멈춤 - ${s.name} 실패 (종료 코드 ${r.code}${r.sig ? `, ${r.sig}` : ""})\n    ${line(s)}`);
  process.exit(r.code || 1);
}
if (DRY) console.log("\n(--dry-run: 아무것도 안 돌림)");
