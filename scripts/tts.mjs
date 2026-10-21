// 내레이션 목소리 만들기 (Google Cloud Text-to-Speech, 키는 secrets/tts_key.txt)
//
// node scripts/tts.mjs say "Hello" out.wav [목소리]   목소리 기본값 en-US-Chirp3-HD-Charon
// node scripts/tts.mjs usage                         이번 달 쓴 글자 수
// node scripts/tts.mjs savekey [gemini]              클립보드의 API 키를 secrets/tts_key.txt(또는 gemini_key.txt)에 저장
//
// 돈이 안 나가게 하는 장치
// - 무료 한도가 있는 목소리만 허용 (Gemini TTS·맞춤 음성은 무료가 없어서 막음)
// - 이번 달 글자 수를 audio/.tts-usage.json에 적고, 무료 한도의 80%에 닿으면 요청 자체를 안 보냄
// - 같은 문장·목소리·속도는 audio/.tts-cache에서 꺼내 씀 (다시 요청 안 함)
// 무료 한도(2026-10 공식 가격표): Chirp 3 HD 100만 · Neural2 100만 · Studio 100만 · WaveNet 400만 · Standard 400만 자/월
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const USAGE = new URL("audio/.tts-usage.json", ROOT);
const CACHE = new URL("audio/.tts-cache/", ROOT);
const SAFE = 0.8;
const FREE = { "Chirp3-HD": 1_000_000, Neural2: 1_000_000, Studio: 1_000_000, Wavenet: 4_000_000, Standard: 4_000_000 };

const family = (voice) => Object.keys(FREE).find((f) => voice.includes(`-${f}-`));
const month = () => new Date().toISOString().slice(0, 7);
const loadUsage = async () => JSON.parse(await readFile(USAGE, "utf8").catch(() => "{}"));

async function say(text, out, voice = "en-US-Chirp3-HD-Charon", rate = "1") {
  const fam = family(voice);
  if (!fam) throw new Error(`무료 한도가 없는 목소리라 막음: ${voice}`);
  const key = createHash("sha1").update(JSON.stringify([text, voice, rate, "24k-6dB"])).digest("hex");
  const cached = new URL(`${key}.wav`, CACHE);
  try {
    await copyFile(cached, out);
    console.log(`캐시: ${out}`);
    return;
  } catch {}

  const chars = [...text].length;
  const usage = await loadUsage();
  const m = (usage[month()] ??= {});
  const used = m[fam] ?? 0;
  if (used + chars > FREE[fam] * SAFE) throw new Error(`이번 달 ${fam} ${used}자 사용 - 무료 한도 ${FREE[fam]}의 ${SAFE * 100}%를 넘게 돼서 멈춤`);
  // 요청 전에 먼저 적어 둔다 (중간에 죽어도 적게 세지 않게)
  m[fam] = used + chars;
  await writeFile(USAGE, JSON.stringify(usage, null, 1));

  const apiKey = (await readFile(new URL("secrets/tts_key.txt", ROOT), "utf8")).trim();
  const res = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: voice.split("-").slice(0, 2).join("-"), name: voice },
      // 원래 음질(24kHz) 그대로, 6dB 작게 받아서 소리 끝이 깨지지(클리핑) 않게
      audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24000, speakingRate: Number(rate), volumeGainDb: -6 },
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    // 실패한 요청은 청구되지 않으니 센 것을 되돌린다
    m[fam] = used;
    await writeFile(USAGE, JSON.stringify(usage, null, 1));
    throw new Error(`TTS 실패: ${res.status} ${body.error?.message}`);
  }
  const wav = Buffer.from(body.audioContent, "base64");
  await mkdir(CACHE, { recursive: true });
  await writeFile(cached, wav);
  await writeFile(out, wav);
  console.log(`${out} (${chars}자, 이번 달 ${fam} ${m[fam]}자)`);
}

// 클립보드의 키를 검사해서 secrets/tts_key.txt에 저장 (키를 화면·대화에 안 남기려고)
async function savekey(name = "tts") {
  const { paste } = await import("./tools.mjs"); // 맥 pbpaste, 윈도우 Get-Clipboard
  const k = paste().trim();
  if (!/^(AIza[0-9A-Za-z_-]{35}|AQ\.[0-9A-Za-z_.-]{30,})$/.test(k)) throw new Error("클립보드에 API 키가 없음 - 콘솔에서 키 값을 복사한 직후에 실행하세요");
  await writeFile(new URL(`secrets/${name}_key.txt`, ROOT), k, { mode: 0o600 });
  console.log(`secrets/${name}_key.txt 저장`);
}

async function usage() {
  const m = (await loadUsage())[month()] ?? {};
  for (const [f, free] of Object.entries(FREE)) if (m[f]) console.log(`${f}: ${m[f]} / ${free}자 (멈추는 선 ${free * SAFE})`);
  if (!Object.keys(m).length) console.log("이번 달 사용 없음");
}

const [cmd, ...args] = process.argv.slice(2);
const run = { say, usage, savekey }[cmd];
if (!run) {
  console.log('사용법: node scripts/tts.mjs say "문장" out.wav [목소리] [속도] | usage');
  process.exit(1);
}
await run(...args);
