// 레딧(r/MapPorn 류)·쓰레드·쇼츠용 국경 변화 영상: 휴대폰 틀 없이 지도만 꽉 차게, 한 지역의 국경이 시대마다 바뀐다
// 지도 = scripts/clean.mjs로 찍은 사이트 지도(public/clean/<set>/<연도>.png). 굵직한 시기에는 잠깐 머물며 한 줄 설명
// 편마다 설정은 social.json의 같은 이름 칸 (borders = 유럽 1:1, bordersAsia = 동아시아 9:16)
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import cfg from "../../social.json";
import { C, FONT, Pop, useFonts, usePop } from "../ui";

export type BordersId = "borders" | "bordersAsia";
type Cfg = (typeof cfg)["borders"] & { notes: Record<string, string> };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const FADE = 4;

// 장면마다 시작 프레임과 머무는 길이 (설명이 붙은 해는 더 오래)
export const bordersTimeline = (id: BordersId) => {
  const B = cfg[id] as Cfg;
  const shots: { year: number; from: number; dur: number }[] = [];
  let at = B.introFrames;
  for (const year of B.years) {
    const dur = B.notes[year] ? B.hold : B.step;
    shots.push({ year, from: at, dur });
    at += dur;
  }
  const mapEnd = at + 20;
  return { B, shots, mapEnd, frames: mapEnd + B.endFrames };
};

// 10년 단위 지도는 "1810s", 그보다 성긴 지도는 "200 BC" · "AD 700" · "1300"
const yearLabel = (B: Cfg, y: number) =>
  B.label === "decade" ? `${y}s` : y < 0 ? `${-y} BC` : y < 1000 ? `AD ${y}` : `${y}`;

const MapImg = ({ B, year, opacity }: { B: Cfg; year: number; opacity: number }) => (
  <Img src={staticFile(`clean/${B.set}/${year}.png`)} style={{ position: "absolute", inset: 0, width: B.width, height: B.height, opacity }} />
);

const YearPill = ({ B, d }: { B: Cfg; d: { year: number; from: number } }) => {
  const frame = useCurrentFrame();
  // 바뀔 때마다 살짝 튄다
  const bump = interpolate(frame - d.from, [0, 3, 8], [1.12, 1.12, 1], clamp);
  const note = B.notes[d.year];
  const noteP = interpolate(frame - d.from, [2, 9], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", left: 44, bottom: B.safeBottom + 34, fontFamily: FONT }}>
      {note && (
        <div
          style={{
            display: "inline-block",
            marginBottom: 14,
            padding: "12px 22px",
            borderRadius: 14,
            background: C.accent,
            color: "#fff",
            fontSize: 38,
            fontWeight: 800,
            opacity: noteP,
            transform: `translateY(${(1 - noteP) * 12}px)`,
          }}
        >
          {note}
        </div>
      )}
      <div
        style={{
          width: "fit-content",
          padding: "8px 26px 10px",
          borderRadius: 18,
          background: "rgba(255,253,247,0.94)",
          boxShadow: "0 10px 30px -12px rgba(43,36,24,0.5)",
          fontSize: 92,
          fontWeight: 800,
          color: C.ink,
          letterSpacing: -2,
          transform: `scale(${bump})`,
          transformOrigin: "left bottom",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {yearLabel(B, d.year)}
      </div>
    </div>
  );
};

const Progress = ({ B, frame, from, to }: { B: Cfg; frame: number; from: number; to: number }) => {
  const k = interpolate(frame, [from, to], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", left: 44, right: 44, bottom: B.safeBottom, height: 8, borderRadius: 4, background: "rgba(43,36,24,0.18)" }}>
      <div style={{ width: `${k * 100}%`, height: "100%", borderRadius: 4, background: C.accent }} />
    </div>
  );
};

const Intro = ({ B }: { B: Cfg }) => {
  const p = usePop(2, 140);
  const out = interpolate(useCurrentFrame(), [B.introFrames - 8, B.introFrames], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: `rgba(250,246,236,${0.72 * out})`, alignItems: "center", justifyContent: "center", fontFamily: FONT, color: C.ink, opacity: out }}>
      <div style={{ transform: `scale(${0.9 + 0.1 * p})`, opacity: p, textAlign: "center" }}>
        <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2, lineHeight: 1.1 }}>{B.title[0]}</div>
        <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2, lineHeight: 1.1, color: C.accent }}>{B.title[1]}</div>
        <div style={{ fontSize: 40, fontWeight: 700, color: C.muted, marginTop: 22 }}>{B.sub}</div>
      </div>
    </AbsoluteFill>
  );
};

const EndCard = () => (
  <AbsoluteFill style={{ background: C.paper, alignItems: "center", justifyContent: "center", fontFamily: FONT, color: C.ink, textAlign: "center" }}>
    <Pop delay={0}>
      <div style={{ fontSize: 60, fontWeight: 800, letterSpacing: -1, lineHeight: 1.2 }}>
        Drag to any year
        <br />
        on any continent
      </div>
    </Pop>
    <div style={{ opacity: usePop(8, 120), marginTop: 34, fontSize: 58, fontWeight: 800, color: C.accent }}>historymapworld.com</div>
    <div style={{ opacity: usePop(14, 120), marginTop: 22, fontSize: 32, fontWeight: 700, color: C.muted }}>Free · 3400 BC to today</div>
  </AbsoluteFill>
);

export const Borders = ({ id }: { id: BordersId }) => {
  useFonts();
  const frame = useCurrentFrame();
  const { B, shots, mapEnd } = bordersTimeline(id);
  let i = 0;
  while (i < shots.length - 1 && frame >= shots[i + 1].from) i++;
  const d = shots[i];
  const k = i === 0 ? 1 : interpolate(frame - d.from, [0, FADE], [0, 1], clamp);
  const zoom = interpolate(frame, [0, mapEnd], [1, 1.07], clamp);
  const end = interpolate(frame, [mapEnd - 6, mapEnd + 6], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: C.ocean }}>
      <Audio src={staticFile(`sfx/social-${id}.wav`)} />
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: "52% 45%" }}>
        {i > 0 && <MapImg B={B} year={shots[i - 1].year} opacity={1} />}
        <MapImg B={B} year={d.year} opacity={k} />
      </AbsoluteFill>
      {/* 아래 연도·진행 막대가 지도 글자와 겹치지 않게 바탕을 살짝 */}
      <AbsoluteFill style={{ background: "linear-gradient(rgba(250,246,236,0) 70%, rgba(250,246,236,0.85))" }} />
      {frame >= B.introFrames && (
        <>
          <YearPill B={B} d={d} />
          <Progress B={B} frame={frame} from={shots[0].from} to={shots[shots.length - 1].from} />
        </>
      )}
      <div
        style={{
          position: "absolute",
          right: 24,
          top: B.safeTop,
          padding: "8px 14px",
          borderRadius: 10,
          background: "rgba(255,253,247,0.85)",
          fontFamily: FONT,
          fontSize: 20,
          fontWeight: 700,
          color: "rgba(43,36,24,0.7)",
          textAlign: "right",
        }}
      >
        historymapworld.com
        <br />
        Borders: Cliopatria (Seshat), CC BY 4.0
      </div>
      <Sequence durationInFrames={B.introFrames}>
        <Intro B={B} />
      </Sequence>
      <Sequence from={mapEnd - 6}>
        <AbsoluteFill style={{ opacity: end }}>
          <EndCard />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
