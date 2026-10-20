// 연기하는 목소리 (Gemini TTS, 키는 secrets/gemini_key.txt - 결제 없는 프로젝트의 무료 키라 청구될 수 없음)
// node scripts/gemini-tts.mjs say "<연기 지시>" "<대사>" out.wav [목소리] [모델]
//   연기 지시 예: "Speak as a terrifying villain: quiet, slow, cold."
// 같은 지시·대사·목소리·모델은 audio/.tts-cache에서 꺼내 씀
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const CACHE = new URL("audio/.tts-cache/", ROOT);
const MODELS = ["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];

// PCM(24kHz 16bit 모노) -> WAV
function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function call(model, direction, line, voice) {
  const key = (await readFile(new URL("secrets/gemini_key.txt", ROOT), "utf8")).trim();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      // 지시문까지 읽어 버리지 않게 "연출 노트 / 대본" 형식으로 나눠 준다
      contents: [{ parts: [{ text: `### DIRECTOR'S NOTES (do not read aloud)\n${direction}\n\n#### TRANSCRIPT (read only this, exactly)\n${line}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${model}: ${res.status} ${body.error?.message?.split("\n")[0]}`);
  const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error(`${model}: 소리 없음`);
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType)?.[1] ?? 24000);
  const pcm = Buffer.from(part.inlineData.data, "base64");
  // 대사 길이에 비해 너무 길면 지시문까지 읽었거나 늘어진 것 - 버린다 (1초에 7자보다 느리면)
  const seconds = pcm.length / 2 / rate;
  if (seconds > [...line].length / 7 + 1.5) throw new Error(`${model}: ${seconds.toFixed(1)}초 - 대사보다 너무 김`);
  return wav(pcm, rate);
}

// 하루 사용량 기록 (audio/.gemini-usage.json, 태평양 시간 기준 날짜 - 구글 한도가 그 기준으로 초기화)
const DAILY = 10;
const LEDGER = new URL("audio/.gemini-usage.json", ROOT);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const ledger = () => { try { const j = JSON.parse(readFileSync(LEDGER, "utf8")); return j.date === today() ? j : { date: today(), used: {} }; } catch { return { date: today(), used: {} }; } };
const used = (m) => ledger().used[m] ?? 0;
const count = (m, set) => { const j = ledger(); j.used[m] = set ?? (j.used[m] ?? 0) + 1; writeFileSync(LEDGER, JSON.stringify(j)); };

async function say(direction, line, out, voice = "Charon", model) {
  const id = createHash("sha1").update(JSON.stringify(["gemini2", direction, line, voice, model ?? "auto"])).digest("hex");
  const cached = new URL(`${id}.wav`, CACHE);
  try {
    await copyFile(cached, out);
    return console.log(`캐시: ${out}`);
  } catch {}
  const errors = [];
  for (const m of model ? [model] : MODELS) {
    // 무료 한도(모델당 하루 10번)를 다 쓴 모델은 부르지 않음 - 실패 호출로 시간 낭비 안 함
    if (used(m) >= DAILY) { errors.push(`${m}: 오늘 한도 ${DAILY}번 다 씀`); continue; }
    try {
      count(m);
      const w = await call(m, direction, line, voice);
      await mkdir(CACHE, { recursive: true });
      await writeFile(cached, w);
      await writeFile(out, w);
      return console.log(`${out} (${m})`);
    } catch (e) {
      if (/\b429\b|quota|RESOURCE_EXHAUSTED/i.test(e.message)) count(m, DAILY); // 한도 초과 응답 → 오늘은 그 모델 끝
      errors.push(e.message);
    }
  }
  throw new Error(errors.join("\n"));
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "quota") {
  const j = ledger();
  console.log(`오늘(${j.date}) Gemini 사용: ${MODELS.map((m) => `${m} ${used(m)}/${DAILY}`).join(", ")}`);
  process.exit(0);
}
if (cmd !== "say") {
  console.log('사용법: node scripts/gemini-tts.mjs say "<연기 지시>" "<대사>" out.wav [목소리] [모델]');
  process.exit(1);
}
await say(...args);
