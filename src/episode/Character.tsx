// 인물 캐릭터: audio/characters.py가 만든 겹 SVG(public/chars/<id>/<포즈>/)를 쌓아서 움직인다
// 포즈: front·side·angry·shocked·sad·happy (장면표 "pose"), 방향: 장면표 "facing": "left"면 좌우 뒤집기
// 몸은 숨쉬기, 머리는 살짝 흔들림 + 말할 때 끄덕임, 눈은 3~4초마다 깜빡임,
// 입은 mouth.json(목소리 크기 → 프레임별 0·1·2)이 있으면 그대로, 없으면 말하는 동안 비슷하게 흉내
import { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, Img, staticFile, useCurrentFrame } from "remotion";
import spec from "../../characters.json";

type Spec = { speakers?: string[]; names?: string[] };
const chars = spec.characters as Record<string, Spec>;

export const charForSpeaker = (speaker?: string) =>
  speaker ? Object.keys(chars).find((id) => chars[id].speakers?.some((s) => s.toUpperCase() === speaker.toUpperCase())) : undefined;

export const hasChar = (id?: string) => !!id && id in chars;
export const POSES = ["front", "side", "angry", "shocked", "sad", "happy"] as const;
export const POSE_NAME: Record<string, string> = { front: "정면", side: "옆", angry: "화남", shocked: "놀람", sad: "슬픔", happy: "기쁨" };

// 목소리 파일 옆 mouth.json (public/ep/<편>/<이름>/mouth.json). 없으면 null
const cache: Record<string, Record<string, string> | null> = {};
export const useMouth = (vo?: string | null) => {
  const base = vo?.includes("/vo/") ? vo.slice(0, vo.indexOf("/vo/")) + "/mouth.json" : null;
  const [data, setData] = useState(base ? cache[base] : null);
  const [handle] = useState(() => (base && !(base in cache) ? delayRender(`mouth ${base}`) : null));
  useEffect(() => {
    if (!base || handle === null) return;
    fetch(staticFile(base))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((j) => {
        cache[base] = j;
        setData(j);
        continueRender(handle);
      });
  }, [base, handle]);
  return vo && data ? data[vo] ?? null : null;
};

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export const Character = ({
  id,
  talking = false,
  mouth = null,
  height = 640,
  flip = false,
  pose = "front",
}: {
  id: string;
  pose?: string;
  talking?: boolean;
  mouth?: string | null;
  height?: number;
  flip?: boolean;
}) => {
  const f = useCurrentFrame();
  const seed = hash(id);
  // 입: 실제 목소리 크기 → 없으면 말하는 동안 음절처럼 열고 닫기(가끔 쉼)
  let m = 0;
  if (mouth) m = Number(mouth[Math.min(f, mouth.length - 1)] ?? 0);
  else if (talking) {
    const syl = Math.sin(f * 0.9 + seed) * Math.sin(f * 0.37 + seed * 0.1);
    const pause = Math.sin(f * 0.11 + seed) > 0.75;
    m = pause ? 0 : syl > 0.35 ? 2 : syl > -0.2 ? 1 : 0;
  }
  // 눈: 3~4초마다 4프레임 감기
  const period = 95 + (seed % 35);
  const blink = (f + (seed % period)) % period < 4;
  const breathe = Math.sin(f / 18 + seed);
  const sway = Math.sin(f / 41 + seed) * 1.6;
  const nod = m ? Math.sin(f / 3) * 1.2 : 0;
  const w = (height * 600) / 720;
  const p = (POSES as readonly string[]).includes(pose) ? pose : "front";
  const layer = (name: string) => <Img src={staticFile(`chars/${id}/${p}/${name}.svg`)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
  return (
    <div style={{ position: "relative", width: w, height, transform: flip ? "scaleX(-1)" : undefined }}>
      <AbsoluteFill style={{ transform: `scaleY(${1 + breathe * 0.012})`, transformOrigin: "50% 100%" }}>{layer("body")}</AbsoluteFill>
      <AbsoluteFill style={{ transform: `translateY(${breathe * -3 + nod}px) rotate(${sway}deg)`, transformOrigin: "50% 62%" }}>
        {layer("head")}
        {layer(blink ? "eyes1" : "eyes0")}
        {layer(`mouth${m}`)}
      </AbsoluteFill>
    </div>
  );
};
