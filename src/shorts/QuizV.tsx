// 유튜브 쇼츠·틱톡용 세로(9:16) 퀴즈: 나라 이름을 지운 지도 → 3초 세기 → 정답 공개(이름이 돌아오고 한 줄 설명).
// src/social/Quiz.tsx(4:5)를 세로·쇼츠 화면(위 250·아래 380·오른쪽 120은 단추 자리)에 맞춘 것.
// 지도 = scripts/shorts.mjs (NAMES=off면 -nonames). 문제·보기·정답은 shorts.json의 quiz.rounds
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import cfg from "../../shorts.json";
import { C, FONT, Pop, useFonts, usePop } from "../ui";

const Q = cfg.quiz;
const W = cfg.width;
const H = cfg.height;
const ROUND = Q.askFrames + Q.revealFrames;
export const QV_ROUNDS_FROM = Q.introFrames;
export const QV_END_FROM = Q.introFrames + Q.rounds.length * ROUND;
export const QV_FRAMES = QV_END_FROM + Q.endFrames;
// 문제가 뜨고 0.5초 뒤부터 1초마다 3 → 2 → 1
const COUNT_FROM = 15;
const GREEN = "#2f8f4e";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type Round = (typeof Q.rounds)[number];

const MapImg = ({ r, names, style }: { r: Round; names: boolean; style?: React.CSSProperties }) => (
  <Img
    src={staticFile(`clean/${r.set}/${r.year}${names ? "" : "-nonames"}.png`)}
    style={{ position: "absolute", inset: 0, width: W, height: H, ...style }}
  />
);

const Countdown = ({ f }: { f: number }) => {
  const t = f - COUNT_FROM;
  if (t < 0 || t >= 90) return null;
  const n = 3 - Math.floor(t / 30);
  const local = (t % 30) / 30;
  return (
    <div
      style={{
        position: "absolute",
        right: 140,
        top: 260,
        width: 128,
        height: 128,
        borderRadius: 64,
        background: C.ink,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT,
        fontSize: 72,
        fontWeight: 800,
        transform: `scale(${interpolate(local, [0, 0.15, 0.3], [1.25, 1.25, 1], clamp)})`,
      }}
    >
      <svg width="128" height="128" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
        <circle cx="64" cy="64" r="56" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="8" />
        <circle cx="64" cy="64" r="56" fill="none" stroke={C.accent} strokeWidth="8" strokeDasharray={352} strokeDashoffset={352 * (t / 90)} />
      </svg>
      {n}
    </div>
  );
};

const RoundScene = ({ r, idx }: { r: Round; idx: number }) => {
  const f = useCurrentFrame();
  const reveal = interpolate(f, [Q.askFrames, Q.askFrames + 8], [0, 1], clamp);
  const enter = usePop(0, 140);
  return (
    <AbsoluteFill>
      <MapImg r={r} names={false} style={{ transform: `scale(${1.04 - 0.04 * enter})` }} />
      <MapImg r={r} names style={{ opacity: reveal }} />
      {/* 위·아래 글자가 잘 읽히게 바탕을 살짝 */}
      <AbsoluteFill style={{ background: "linear-gradient(rgba(250,246,236,0.85) 10%, rgba(250,246,236,0) 30%, rgba(250,246,236,0) 45%, rgba(250,246,236,0.9) 62%, rgba(250,246,236,0.9) 85%, rgba(250,246,236,0))" }} />
      <div style={{ position: "absolute", left: 60, top: 260, fontFamily: FONT, color: C.ink }}>
        <div style={{ fontSize: 42, fontWeight: 800, color: C.accent }}>
          ROUND {idx + 1}/{Q.rounds.length}
        </div>
        <div style={{ fontSize: 74, fontWeight: 800, letterSpacing: -1, marginTop: 6, lineHeight: 1.05 }}>What decade<br />is this?</div>
      </div>
      <Countdown f={f} />
      <div style={{ position: "absolute", left: 60, right: 140, bottom: 420, fontFamily: FONT }}>
        <div
          style={{
            textAlign: "center",
            fontSize: 44,
            fontWeight: 800,
            color: C.ink,
            marginBottom: 22,
            opacity: reveal,
            transform: `translateY(${(1 - reveal) * 16}px)`,
          }}
        >
          {r.note}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {r.options.map((o, k) => {
            const right = k === r.answer;
            const p = usePop(4 + k * 4, 160);
            return (
              <div
                key={o}
                style={{
                  height: 112,
                  borderRadius: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 14,
                  fontSize: 54,
                  fontWeight: 800,
                  background: right && reveal > 0 ? GREEN : "#fffdf7",
                  color: right && reveal > 0 ? "#fff" : C.ink,
                  border: `3px solid ${right && reveal > 0 ? GREEN : C.line}`,
                  boxShadow: "0 12px 30px -14px rgba(43,36,24,0.5)",
                  opacity: (right ? 1 : 1 - 0.6 * reveal) * Math.min(1, p * 1.5),
                  transform: `scale(${p * (right ? 1 + 0.06 * reveal : 1)})`,
                }}
              >
                <span style={{ fontSize: 34, opacity: 0.55 }}>{"ABC"[k]}</span>
                {o}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Intro = () => {
  const p = usePop(0, 140);
  return (
    <AbsoluteFill>
      <MapImg r={Q.rounds[0]} names={false} style={{ filter: "blur(10px)", transform: "scale(1.1)" }} />
      <AbsoluteFill style={{ background: "rgba(250,246,236,0.72)", alignItems: "center", justifyContent: "center", fontFamily: FONT, color: C.ink, textAlign: "center" }}>
        <div style={{ transform: `scale(${p})` }}>
          <div style={{ fontSize: 112, fontWeight: 800, letterSpacing: -3, lineHeight: 1.05 }}>
            Guess
            <br />
            the decade
          </div>
        </div>
        <div style={{ opacity: usePop(10, 120), marginTop: 36, fontSize: 42, fontWeight: 700, color: C.muted }}>
          {Q.rounds.length} maps · no country names · 3 seconds each
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const EndCard = () => (
  <AbsoluteFill style={{ background: C.paper, alignItems: "center", justifyContent: "center", fontFamily: FONT, color: C.ink, textAlign: "center" }}>
    <Pop delay={0}>
      <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2, lineHeight: 1.1 }}>
        How many
        <br />
        did you get?
      </div>
    </Pop>
    <div style={{ opacity: usePop(10, 120), marginTop: 44, fontSize: 40, fontWeight: 700, color: C.muted }}>Play with every decade yourself</div>
    <div style={{ opacity: usePop(14, 120), marginTop: 14, fontSize: 60, fontWeight: 800, color: C.accent }}>historymapworld.com</div>
  </AbsoluteFill>
);

export const QuizV = () => {
  useFonts();
  return (
    <AbsoluteFill style={{ background: C.ocean }}>
      <Audio src={staticFile("sfx/shorts-quiz.wav")} />
      <Sequence durationInFrames={Q.introFrames}>
        <Intro />
      </Sequence>
      {Q.rounds.map((r, i) => (
        <Sequence key={i} from={QV_ROUNDS_FROM + i * ROUND} durationInFrames={ROUND}>
          <RoundScene r={r} idx={i} />
        </Sequence>
      ))}
      <Sequence from={QV_END_FROM}>
        <EndCard />
      </Sequence>
      <div style={{ position: "absolute", left: 60, bottom: 390, fontFamily: FONT, fontSize: 22, fontWeight: 700, color: "rgba(43,36,24,0.55)" }}>
        historymapworld.com · Borders: Cliopatria (Seshat), CC BY 4.0
      </div>
    </AbsoluteFill>
  );
};
