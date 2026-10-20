// 유튜브 쇼츠·틱톡용 세로(9:16) "같은 해, 다른 세계": 한 해(1492)를 네 지역 지도로 차례로 보여 주며 한 줄씩.
// 지도 = scripts/shorts.mjs (public/clean/<set>/<연도>.png). 문구·길이 = shorts.json의 sameyear
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import cfg from "../../shorts.json";
import { C, FONT, Pop, useFonts, usePop } from "../ui";

const S = cfg.sameyear;
const W = cfg.width;
const H = cfg.height;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const SAMEYEAR_SCENES_FROM = S.introFrames;
export const SAMEYEAR_END_FROM = S.introFrames + S.scenes.length * S.sceneFrames;
export const SAMEYEAR_FRAMES = SAMEYEAR_END_FROM + S.endFrames;

type Scene = (typeof S.scenes)[number];

const SceneView = ({ s, idx }: { s: Scene; idx: number }) => {
  const f = useCurrentFrame();
  const enter = usePop(0, 120);
  const textP = usePop(8, 140);
  // 천천히 다가가는 지도
  const zoom = interpolate(f, [0, S.sceneFrames], [1.08, 1], clamp);
  const fadeIn = interpolate(f, [0, 6], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <Img src={staticFile(`clean/${s.set}/${s.year}.png`)} style={{ position: "absolute", inset: 0, width: W, height: H, transform: `scale(${zoom})` }} />
      <AbsoluteFill style={{ background: "linear-gradient(rgba(250,246,236,0.85) 8%, rgba(250,246,236,0) 30%)" }} />
      <div style={{ position: "absolute", left: 60, right: 140, top: 250, fontFamily: FONT, color: C.ink }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 20, opacity: enter }}>
          <span style={{ fontSize: 120, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>{S.title}</span>
          <span style={{ fontSize: 40, fontWeight: 800, color: C.muted }}>
            {idx + 1}/{S.scenes.length}
          </span>
        </div>
        <div style={{ fontSize: 66, fontWeight: 800, color: C.accent, marginTop: 10, opacity: enter }}>{s.place}</div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 60,
          right: 140,
          bottom: 430,
          padding: "26px 32px",
          borderRadius: 26,
          background: "rgba(255,253,247,0.95)",
          boxShadow: "0 16px 40px -16px rgba(43,36,24,0.55)",
          fontFamily: FONT,
          fontSize: 54,
          fontWeight: 800,
          lineHeight: 1.25,
          color: C.ink,
          opacity: textP,
          transform: `translateY(${(1 - textP) * 30}px)`,
        }}
      >
        {s.text}
      </div>
    </AbsoluteFill>
  );
};

const Intro = () => {
  const p = usePop(0, 140);
  return (
    <AbsoluteFill style={{ background: C.paper, alignItems: "center", justifyContent: "center", fontFamily: FONT, color: C.ink, textAlign: "center" }}>
      <div style={{ transform: `scale(${p})`, fontSize: 260, fontWeight: 800, letterSpacing: -8, lineHeight: 1 }}>{S.title}</div>
      <div style={{ opacity: usePop(10, 120), marginTop: 30, fontSize: 70, fontWeight: 800, color: C.accent }}>One year.</div>
      <div style={{ opacity: usePop(18, 120), marginTop: 8, fontSize: 70, fontWeight: 800 }}>Four worlds.</div>
    </AbsoluteFill>
  );
};

const EndCard = () => (
  <AbsoluteFill style={{ background: C.paper, alignItems: "center", justifyContent: "center", fontFamily: FONT, color: C.ink, textAlign: "center", padding: "0 80px" }}>
    <Img src={staticFile("brand/icon.png")} style={{ width: 220, height: 220, borderRadius: 48, marginBottom: 50, opacity: usePop(0, 140) }} />
    <Pop delay={2}>
      <div style={{ fontSize: 74, fontWeight: 800, letterSpacing: -2, lineHeight: 1.2 }}>
        Pick any year.
        <br />
        See the whole world.
      </div>
    </Pop>
    <div style={{ opacity: usePop(10, 120), marginTop: 44, fontSize: 64, fontWeight: 800, color: C.accent }}>historymapworld.com</div>
  </AbsoluteFill>
);

export const SameYear = () => {
  useFonts();
  return (
    <AbsoluteFill style={{ background: C.ocean }}>
      <Audio src={staticFile("sfx/shorts-sameyear.wav")} />
      <Sequence durationInFrames={S.introFrames}>
        <Intro />
      </Sequence>
      {S.scenes.map((s, i) => (
        <Sequence key={i} from={SAMEYEAR_SCENES_FROM + i * S.sceneFrames} durationInFrames={S.sceneFrames}>
          <SceneView s={s} idx={i} />
        </Sequence>
      ))}
      <Sequence from={SAMEYEAR_END_FROM}>
        <EndCard />
      </Sequence>
      <div style={{ position: "absolute", left: 60, bottom: 390, fontFamily: FONT, fontSize: 22, fontWeight: 700, color: "rgba(43,36,24,0.55)" }}>
        historymapworld.com · Borders: Cliopatria (Seshat), CC BY 4.0
      </div>
    </AbsoluteFill>
  );
};
