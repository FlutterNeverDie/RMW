// 목소리 검수: 만든 대사 음성을 Gemini가 듣고 대본과 비교해 발음 실수·빠진 말·잡음을 찾는다 (사람이 못 듣는 언어용)
// node scripts/qa-voice.mjs episodes/mongol-01/ep.json ko   -> 문제 줄만 출력 + public/ep/<편>/<이름>/qa-<언어>.json
// 키: secrets/gemini_key.txt (결제 없는 무료 키). 대사 25줄씩 묶어 한 번에 보낸다
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";

const CODE = fileURLToPath(new URL("..", import.meta.url));
const [epPath, lang = "ko"] = process.argv.slice(2);
const ep = JSON.parse(await readFile(join(CODE, epPath), "utf8"));
const outDir = join(CODE, "public/ep", basename(dirname(epPath)), basename(epPath, ".json"));
const key = (await readFile(join(CODE, "secrets/gemini_key.txt"), "utf8")).trim();
const MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest"];
const LANG = { en: "English", ko: "Korean", es: "Spanish (Latin American)", ja: "Japanese", pt: "Brazilian Portuguese" };

const lines = [];
ep.scenes.forEach((s, i) => {
  if (!s.text) return;
  const text = lang === "en" ? s.text : s.i18n?.[lang];
  lines.push({ i, text, file: join(outDir, "vo", lang, `${String(i).padStart(2, "0")}.wav`) });
});

async function ask(batch) {
  const parts = [
    {
      text:
        `You are a strict native ${LANG[lang]} voice-over QA reviewer for a YouTube history documentary. ` +
        `For each numbered clip, compare the audio with its script. Report ONLY real problems a native viewer would notice: ` +
        `mispronounced words (say how it sounded), missing/extra words, wrong numbers or names, unnatural robotic intonation, audible noise/glitches. ` +
        `Ignore tiny pauses. Answer JSON: [{"clip": <number>, "problem": "<short, in Korean>", "severity": "high|low"}]. Empty array if all clips are fine.`,
    },
  ];
  for (const l of batch) {
    parts.push({ text: `Clip ${l.i}. Script: ${l.text}` });
    parts.push({ inlineData: { mimeType: "audio/wav", data: (await readFile(l.file)).toString("base64") } });
  }
  // 붐비면(503) 잠깐 쉬었다가 다음 모델, 한 바퀴 더
  for (const m of [...MODELS, ...MODELS]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
    });
    const b = await r.json();
    if (!r.ok) {
      console.error(`${m}: ${r.status} ${b.error?.message?.split("\n")[0]}`);
      await new Promise((ok) => setTimeout(ok, 8000));
      continue;
    }
    return { model: m, issues: JSON.parse(b.candidates[0].content.parts[0].text) };
  }
  throw new Error("검수 모델을 쓸 수 없음");
}

const report = [];
for (let k = 0; k < lines.length; k += 25) {
  const { model, issues } = await ask(lines.slice(k, k + 25));
  console.log(`대사 ${k + 1}~${Math.min(k + 25, lines.length)} 검수 (${model}): 문제 ${issues.length}개`);
  report.push(...issues);
}
for (const p of report) {
  const l = lines.find((x) => x.i === p.clip);
  console.log(`[${p.severity}] 장면 ${p.clip}: ${p.problem}\n    대본: ${l?.text}`);
}
await writeFile(join(outDir, `qa-${lang}.json`), JSON.stringify(report, null, 1));
console.log(report.length ? `문제 ${report.length}개` : "문제 없음");
