// 레딧·쓰레드용 가로(16:9) 영상: 데스크톱 화면 녹화(scripts/desk.mjs) 그대로 + 위쪽 한 줄 자막 + 마지막 사이트 카드
// 녹화 시각 → 영상 시각: 시작 앞부분은 자르고, 슬라이더를 끄는 구간만 dragSpeed배로 빠르게
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import cfg from "../../social.json";
import desk from "../../public/desk/manifest.json";
import { C, FONT, Pop, useFonts, usePop } from "../ui";

const S = cfg.scrub;
const FPS = cfg.fps;
const [VW, VH] = desk.viewport;

// 슬라이더를 누른 동안 = 끄는 구간
const downAt = desk.cursor.findIndex((c) => c.down);
const DRAG_FROM = desk.cursor[downAt].t;
const DRAG_TO = desk.cursor.slice(downAt).find((c) => !c.down)!.t;
const SEG1 = DRAG_FROM - S.start;
const SEG2 = (DRAG_TO - DRAG_FROM) / S.dragSpeed;
const SEG3 = S.cut - DRAG_TO;
export const SCRUB_REC_FRAMES = Math.round((SEG1 + SEG2 + SEG3) * FPS);
export const SCRUB_FRAMES = SCRUB_REC_FRAMES + S.endFrames;

/** 영상 시각(초) → 녹화 시각(초) */
export const recTime = (v: number) =>
  v < SEG1 ? S.start + v : v < SEG1 + SEG2 ? DRAG_FROM + (v - SEG1) * S.dragSpeed : DRAG_TO + (v - SEG1 - SEG2);
/** 녹화 시각 → 영상 시각 (소리 위치용) */
export const videoTime = (r: number) =>
  r < DRAG_FROM ? r - S.start : r < DRAG_TO ? SEG1 + (r - DRAG_FROM) / S.dragSpeed : SEG1 + SEG2 + (r - DRAG_TO);

const frameAt = (r: number) => {
  let lo = 0;
  for (let i = 0; i < desk.frames.length && desk.frames[i].t <= r; i++) lo = i;
  return desk.frames[lo].file;
};

const cursorAt = (r: number) => {
  const cs = desk.cursor;
  let i = 0;
  while (i < cs.length - 1 && cs[i + 1].t <= r) i++;
  const a = cs[i];
  const b = cs[Math.min(i + 1, cs.length - 1)];
  const k = b.t > a.t ? Math.min(1, Math.max(0, (r - a.t) / (b.t - a.t))) : 0;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, down: a.down };
};

// 창 배치: 위 자막 줄 아래에 브라우저 창
const WIN_W = 1600;
const WIN_H = (WIN_W * VH) / VW;
const BAR_H = 40;
const WIN_X = (S.width - WIN_W) / 2;
const WIN_Y = S.height - WIN_H - BAR_H - 28;
const K = WIN_W / VW;

const CAPTIONS = [
  { from: 0, text: "I built a world map you can scrub through 5,000 years of history" },
  { from: videoTime(DRAG_TO) + 0.3, text: "Every dot is an event - click one" },
  { from: videoTime(desk.clicks[1].t), text: "...and read what happened" },
];

const Arrow = ({ down }: { down: boolean }) => (
  <svg width="34" height="34" viewBox="0 0 24 24" style={{ transform: `scale(${down ? 0.85 : 1})`, transformOrigin: "4px 3px", filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.35))" }}>
    <path d="M4 3l14 7.5-6.2 1.6L9 18.4z" fill="#111" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

const Recording = ({ v }: { v: number }) => {
  const r = recTime(v);
  const c = cursorAt(r);
  return (
    <>
      <Img src={staticFile(`desk/${frameAt(r)}`)} style={{ position: "absolute", inset: 0, width: WIN_W, height: WIN_H }} />
      {desk.clicks.map((cl) => {
        const age = r - cl.t;
        if (age < 0 || age > 0.6) return null;
        const k = age / 0.6;
        return (
          <div
            key={cl.t}
            style={{
              position: "absolute",
              left: cl.x * K - 30,
              top: cl.y * K - 30,
              width: 60,
              height: 60,
              borderRadius: 30,
              border: `4px solid ${C.accent}`,
              transform: `scale(${0.4 + k * 1.4})`,
              opacity: 1 - k,
            }}
          />
        );
      })}
      <div style={{ position: "absolute", left: c.x * K - 4, top: c.y * K - 3 }}>
        <Arrow down={c.down} />
      </div>
    </>
  );
};

const Caption = ({ v }: { v: number }) => {
  const frame = useCurrentFrame();
  const i = CAPTIONS.reduce((at, c, k) => (v >= c.from ? k : at), 0);
  const startFrame = Math.round(CAPTIONS[i].from * FPS);
  const p = interpolate(frame - startFrame, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: WIN_Y,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: 50,
        color: C.ink,
        letterSpacing: -0.5,
        opacity: p,
        transform: `translateY(${(1 - p) * 14}px)`,
      }}
    >
      {CAPTIONS[i].text}
    </div>
  );
};

const EndCard = () => {
  const p = usePop(0, 120);
  return (
    <AbsoluteFill style={{ background: C.paper, alignItems: "center", justifyContent: "center", fontFamily: FONT, color: C.ink }}>
      <Pop delay={0}>
        <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2 }}>History Map World</div>
      </Pop>
      <div style={{ opacity: p, marginTop: 26, fontSize: 56, fontWeight: 800, color: C.accent }}>historymapworld.com</div>
      <div style={{ opacity: usePop(10, 120), marginTop: 30, fontSize: 38, fontWeight: 700, color: C.muted }}>
        Free · 602 events · 8 languages · works on your phone
      </div>
    </AbsoluteFill>
  );
};

export const Scrub = () => {
  useFonts();
  const frame = useCurrentFrame();
  const v = frame / FPS;
  const ending = frame >= SCRUB_REC_FRAMES;
  const end = interpolate(frame, [SCRUB_REC_FRAMES - 6, SCRUB_REC_FRAMES + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Audio src={staticFile("sfx/social-scrub.wav")} />
      {!ending && (
        <>
          <Caption v={v} />
          <div
            style={{
              position: "absolute",
              left: WIN_X,
              top: WIN_Y,
              width: WIN_W,
              height: WIN_H + BAR_H,
              borderRadius: 16,
              overflow: "hidden",
              background: "#fff",
              boxShadow: "0 40px 80px -30px rgba(43,36,24,0.55), 0 0 0 1px rgba(43,36,24,0.12)",
            }}
          >
            <div style={{ height: BAR_H, background: "#ece6d8", display: "flex", alignItems: "center", gap: 9, paddingLeft: 18 }}>
              {["#ff5f57", "#febc2e", "#28c840"].map((col) => (
                <div key={col} style={{ width: 13, height: 13, borderRadius: 7, background: col }} />
              ))}
              <div
                style={{
                  marginLeft: 22,
                  width: 420,
                  height: 26,
                  borderRadius: 7,
                  background: "#fffdf7",
                  fontFamily: "-apple-system, sans-serif",
                  fontSize: 15,
                  color: C.muted,
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 12,
                }}
              >
                historymapworld.com
              </div>
            </div>
            <div style={{ position: "relative", width: WIN_W, height: WIN_H, overflow: "hidden" }}>
              <Recording v={Math.min(v, SCRUB_REC_FRAMES / FPS - 1 / FPS)} />
            </div>
          </div>
        </>
      )}
      <Sequence from={SCRUB_REC_FRAMES - 6}>
        <AbsoluteFill style={{ opacity: end }}>
          <EndCard />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
