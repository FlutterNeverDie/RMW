// 인물 캐릭터: audio/characters.py가 만든 겹 SVG(public/chars/<id>/<포즈>/)를 쌓아서 움직인다
// 포즈: front·side·angry·shocked·sad·happy (장면표 "pose"), 방향: 장면표 "facing": "left"면 좌우 뒤집기
// 몸은 숨쉬기, 머리는 살짝 흔들림 + 말할 때 끄덕임, 눈은 3~4초마다 깜빡임,
// 입은 mouth.json이 있으면 그대로 - 발음 입 모양 X·A~H(Rhubarb, 2026-10-21) 또는 예전 크기 0·1·2. 없으면 말하는 동안 비슷하게 흉내
// 움직임(2026-10-21): 등장 enter(up 아래서 늘었다 줄며 올라옴 · pop 튀어나옴 · none), 퇴장 exit(down · pop, 장면 끝 12프레임),
//   반응 beat(jump 놀라 펄쩍 · shake 화나 부르르 · hop 기뻐 통통 · sink 슬퍼 가라앉음 · nod 끄덕 - 없으면 포즈 따라 자동),
//   손짓 gesture(point · fist · open - 아래에서 팔이 올라오고 말하는 동안 살짝 흔들림). 장면표 필드는 docs/guide/03
import { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import spec from "../../characters.json";

type Spec = { speakers?: string[]; names?: string[] };
const chars = spec.characters as Record<string, Spec>;

export const charForSpeaker = (speaker?: string) =>
  speaker ? Object.keys(chars).find((id) => chars[id].speakers?.some((s) => s.toUpperCase() === speaker.toUpperCase())) : undefined;

export const hasChar = (id?: string) => !!id && id in chars;
export const POSES = ["front", "side", "angry", "shocked", "sad", "happy"] as const;
export const POSE_NAME: Record<string, string> = { front: "정면", side: "옆", angry: "화남", shocked: "놀람", sad: "슬픔", happy: "기쁨" };
export const GESTURES = ["point", "fist", "open"] as const;
export const GESTURE_NAME: Record<string, string> = { point: "가리킴", fist: "주먹", open: "두 손" };
export type Enter = "up" | "pop" | "none";
export type Exit = "down" | "pop" | "none";
export type Beat = "jump" | "shake" | "hop" | "sink" | "nod" | "none";
// 포즈마다 기본 반응 (장면표 beat로 바꾸거나 "none"으로 끔)
const POSE_BEAT: Record<string, Beat> = { shocked: "jump", angry: "shake", happy: "hop", sad: "sink" };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// 반응 한 번: 몸 위치(x,y)·늘림(sx,sy)·머리(hy 아래로, hr 기울기). t = 반응 시작부터 프레임
const beatAt = (b: Beat, t: number) => {
  const r = { x: 0, y: 0, sx: 1, sy: 1, hy: 0, hr: 0 };
  if (t < 0 || b === "none") return r;
  if (b === "jump") {
    // 웅크림(0~3) → 뜸(3~11) → 착지 찌그러짐(11~17)
    if (t < 3) Object.assign(r, { y: 8 * (t / 3), sy: 1 - 0.07 * (t / 3), sx: 1 + 0.05 * (t / 3) });
    else if (t < 11) {
      const k = (t - 3) / 8;
      Object.assign(r, { y: -54 * Math.sin(Math.PI * k), sy: 1 + 0.06 * Math.cos(Math.PI * k * 0.5), sx: 1 - 0.04 * Math.cos(Math.PI * k * 0.5), hy: -6 * Math.sin(Math.PI * k) });
    } else if (t < 17) {
      const k = (t - 11) / 6;
      Object.assign(r, { sy: 1 - 0.07 * Math.sin(Math.PI * k), sx: 1 + 0.05 * Math.sin(Math.PI * k) });
    }
  } else if (b === "shake" && t < 18) {
    const d = 1 - t / 18;
    Object.assign(r, { x: Math.sin(t * 2.3) * 11 * d, hr: Math.sin(t * 2.3 + 1) * 2.2 * d, sy: 1 + 0.025 * d, y: -6 * d });
  } else if (b === "hop" && t < 22) {
    const d = 1 - t / 22;
    const k = Math.abs(Math.sin((Math.PI * t) / 11));
    Object.assign(r, { y: -18 * k * d, sy: 1 + 0.03 * k * d, sx: 1 - 0.02 * k * d });
  } else if (b === "sink") {
    const k = interpolate(t, [0, 24], [0, 1], { ...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1) });
    Object.assign(r, { y: 16 * k, sy: 1 - 0.02 * k, hy: 7 * k, hr: -1.5 * k });
  } else if (b === "nod" && t < 16) {
    Object.assign(r, { hy: Math.max(0, Math.sin((Math.PI * t) / 8)) * 9 });
  }
  return r;
};

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
  gesture,
  gestureAt,
  enter = "up",
  exit = "none",
  frames,
  beat,
  beatAt: beatFrame,
  delay = 0,
}: {
  id: string;
  pose?: string;
  talking?: boolean;
  mouth?: string | null;
  height?: number;
  flip?: boolean;
  gesture?: string;
  // 아래 프레임 값은 모두 장면 시작 기준
  gestureAt?: number;
  enter?: Enter;
  exit?: Exit;
  frames?: number; // 장면 길이 (퇴장에 필요)
  beat?: Beat;
  beatAt?: number;
  delay?: number; // 등장 시작
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seed = hash(id);
  // 입: 실제 목소리 크기 → 없으면 말하는 동안 음절처럼 열고 닫기(가끔 쉼)
  let m: number | string = 0;
  if (mouth) {
    const k = mouth[Math.min(f, mouth.length - 1)] ?? "0";
    m = /[0-9]/.test(k) ? Number(k) : k;
  }
  else if (talking) {
    const syl = Math.sin(f * 0.9 + seed) * Math.sin(f * 0.37 + seed * 0.1);
    const pause = Math.sin(f * 0.11 + seed) > 0.75;
    m = pause ? 0 : syl > 0.35 ? 2 : syl > -0.2 ? 1 : 0;
  }
  const p = (POSES as readonly string[]).includes(pose) ? pose : "front";
  // 등장: 스프링 진행도와 그 속도로 늘림·찌그러짐 (올라갈 땐 길쭉, 멈출 땐 납작)
  const cfg = enter === "pop" ? { damping: 9, stiffness: 190, mass: 0.8 } : { damping: 12, stiffness: 150, mass: 0.9 };
  const ep = (fr: number) => (enter === "none" ? 1 : spring({ frame: fr - delay, fps, config: cfg }));
  const e = ep(f);
  const v = e - ep(f - 1);
  const stretch = Math.max(-0.1, Math.min(0.1, v * (enter === "pop" ? 0.9 : 0.7)));
  let y = enter === "up" ? (1 - e) * height * 0.6 : 0;
  let sc = enter === "pop" ? Math.max(0, e) : 1;
  let rot = enter === "pop" ? (1 - Math.min(1, e)) * -8 : 0;
  // 퇴장: 장면 끝 12프레임 - 살짝 움츠렸다가 아래로 / 살짝 커졌다가 작아짐
  if (exit !== "none" && frames) {
    const k = interpolate(f, [frames - 12, frames - 1], [0, 1], clamp);
    if (exit === "down") y += k < 0.25 ? -10 * Math.sin((k / 0.25) * Math.PI * 0.5) : -10 + (height * 0.7 + 10) * Easing.in(Easing.cubic)((k - 0.25) / 0.75);
    else sc *= k < 0.3 ? 1 + 0.07 * (k / 0.3) : 1.07 * (1 - Easing.in(Easing.quad)((k - 0.3) / 0.7));
    if (exit === "pop") rot += k * 6;
  }
  // 반응: 등장이 거의 끝난 뒤 한 번 (기본 = 포즈에 맞는 반응)
  const b = beat ?? POSE_BEAT[p] ?? "none";
  const bt = beatAt(b, f - (beatFrame ?? delay + 9));
  // 눈: 3~4초마다 4프레임 감기 (놀란 순간엔 안 감음)
  const period = 95 + (seed % 35);
  const blink = (f + (seed % period)) % period < 4 && !(b === "jump" && f - (beatFrame ?? delay + 9) < 30);
  const breathe = Math.sin(f / 18 + seed);
  const sway = Math.sin(f / 41 + seed) * 1.6;
  const nod = m && m !== "X" && m !== "A" ? Math.sin(f / 3) * 1.2 : 0;
  const w = (height * 600) / 720;
  const u = height / 720; // 판 좌표 1 → 화면 px
  const layer = (name: string) => <Img src={staticFile(`chars/${id}/${p}/${name}.svg`)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
  // 손짓: 아래에서 팔이 올라옴(살짝 넘쳤다 자리 잡음), 말하는 동안 손이 조금씩 움직임
  const g = gesture && (GESTURES as readonly string[]).includes(gesture) ? gesture : null;
  const gp = g ? spring({ frame: f - (gestureAt ?? delay + 6), fps, config: { damping: 11, stiffness: 140 } }) : 0;
  const talkMove = talking ? Math.sin(f / 7 + seed) * 1.4 : 0;
  const sx = (1 - stretch * 0.6) * bt.sx;
  const sy = (1 + stretch) * bt.sy;
  return (
    <div style={{ position: "relative", width: w, height, transform: flip ? "scaleX(-1)" : undefined }}>
      <AbsoluteFill style={{ transform: `translate(${bt.x * u}px, ${y + bt.y * u}px) rotate(${rot}deg) scale(${sc * sx}, ${sc * sy})`, transformOrigin: "50% 100%" }}>
        <AbsoluteFill style={{ transform: `scaleY(${1 + breathe * 0.012})`, transformOrigin: "50% 100%" }}>{layer("body")}</AbsoluteFill>
        <AbsoluteFill style={{ transform: `translateY(${(breathe * -3 + nod + bt.hy) * u}px) rotate(${sway + bt.hr}deg)`, transformOrigin: "50% 62%" }}>
          {layer("head")}
          {layer(blink ? "eyes1" : "eyes0")}
          {layer(`mouth${m}`)}
        </AbsoluteFill>
        {g && gp > 0.01 && (
          <AbsoluteFill style={{ transform: `translateY(${((1 - gp) * 320 + breathe * -2) * u}px) rotate(${(1 - gp) * -14 + talkMove}deg)`, transformOrigin: g === "open" ? "50% 100%" : "72% 100%" }}>{layer(`arm_${g}`)}</AbsoluteFill>
        )}
      </AbsoluteFill>
    </div>
  );
};
