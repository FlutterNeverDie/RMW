// 쓰레드용 세로(4:5) 퀴즈 영상: 나라 이름을 지운 지도를 보여 주고 3초 세기 → 정답 공개(이름이 돌아오고 한 줄 설명)
// 지도 = scripts/clean.mjs (NAMES=off면 -nonames). 문제·보기·정답은 social.json의 quiz.rounds
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import cfg from "../../social.json";
import { C, FONT, Pop, useFonts, usePop } from "../ui";

const Q = cfg.quiz;
const ROUND = Q.askFrames + Q.revealFrames;
export const QUIZ_ROUNDS_FROM = Q.introFrames;
export const QUIZ_END_FROM = Q.introFrames + Q.rounds.length * ROUND;
export const QUIZ_FRAMES = QUIZ_END_FROM + Q.endFrames;
// 문제가 뜨고 0.5초 뒤부터 1초마다 3 → 2 → 1
export const COUNT_FROM = 15;
const GREEN = "#2f8f4e";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type Round = (typeof Q.rounds)[number];

const MapImg = ({ r, names, style }: { r: Round; names: boolean; style?: React.CSSProperties }) => (
  <Img
    src={staticFile(`clean/${r.set}/${r.year}${names ? "" : "-nonames"}.png`)}
    style={{ position: "absolute", inset: 0, width: Q.width, height: Q.height, ...style }}
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
        right: 48,
        top: 46,
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
      <AbsoluteFill style={{ background: "linear-gradient(rgba(250,246,236,0.85), rgba(250,246,236,0) 22%, rgba(250,246,236,0) 66%, rgba(250,246,236,0.9) 88%)" }} />
      <div style={{ position: "absolute", left: 48, top: 50, fontFamily: FONT, color: C.ink }}>
        <div style={{ fontSize: 34, fontWeight: 800, color: C.accent }}>
          ROUND {idx + 1}/{Q.rounds.length}
        </div>
        <div style={{ fontSize: 62, fontWeight: 800, letterSpacing: -1, marginTop: 4 }}>What decade is this?</div>
      </div>
      <Countdown f={f} />
      <div style={{ position: "absolute", left: 48, right: 48, bottom: 64, fontFamily: FONT }}>
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
        <div style={{ display: "flex", gap: 20 }}>
          {r.options.map((o, k) => {
            const right = k === r.answer;
            const p = usePop(4 + k * 4, 160);
            return (
              <div
                key={o}
                style={{
                  flex: 1,
                  height: 118,
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

export const Quiz = () => {
  useFonts();
  return (
    <AbsoluteFill style={{ background: C.ocean }}>
      <Audio src={staticFile("sfx/social-quiz.wav")} />
      <Sequence durationInFrames={Q.introFrames}>
        <Intro />
      </Sequence>
      {Q.rounds.map((r, i) => (
        <Sequence key={i} from={QUIZ_ROUNDS_FROM + i * ROUND} durationInFrames={ROUND}>
          <RoundScene r={r} idx={i} />
        </Sequence>
      ))}
      <Sequence from={QUIZ_END_FROM}>
        <EndCard />
      </Sequence>
      <div style={{ position: "absolute", right: 30, bottom: 16, fontFamily: FONT, fontSize: 18, fontWeight: 700, color: "rgba(43,36,24,0.5)" }}>
        Borders: Cliopatria (Seshat), CC BY 4.0
      </div>
    </AbsoluteFill>
  );
};
