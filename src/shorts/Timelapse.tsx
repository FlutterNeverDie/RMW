// 유튜브 쇼츠·틱톡용 세로(9:16) 국경 변화 영상: 한 지역의 지도가 연도마다 바뀌고, 굵직한 시기에는 잠깐 머물며 한 줄 설명.
// 지도 = scripts/shorts.mjs로 찍은 사이트 지도(public/clean/<set>/<연도>.png, 1080×1920).
// 시각표 = audio/make_shorts.py가 계산한 src/shorts/schedule.json(소리와 같은 표). 문구 = shorts.json
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import cfg from "../../shorts.json";
import schedule from "./schedule.json";
import { C, FONT, Pop, useFonts, usePop } from "../ui";

const W = cfg.width;
const H = cfg.height;
const T = cfg.timelapse;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const FADE = 5;

type Video = (typeof T.videos)[number];
type Shot = { year: number; from: number; dur: number; note: string | null };

export const VIDEOS = T.videos;
export const framesOf = (id: string) => (schedule as Record<string, { total: number }>)[id].total;

/** 연도 표기: 기원전 "500 BC", 서기 1000년 전 "AD 125", 그 뒤는 숫자만 */
export const yearLabel = (y: number) => (y < 0 ? `${-y} BC` : y < 1000 ? `AD ${y}` : `${y}`);

const MapImg = ({ set, year, opacity }: { set: string; year: number; opacity: number }) => (
  <Img src={staticFile(`clean/${set}/${year}.png`)} style={{ position: "absolute", inset: 0, width: W, height: H, opacity }} />
);

// 위쪽(쇼츠 화면의 위 단추 아래)에 연도·설명·진행 막대. 오른쪽 단추 자리(120px)는 비운다
const Header = ({ shots, i }: { shots: Shot[]; i: number }) => {
  const frame = useCurrentFrame();
  const s = shots[i];
  const bump = interpolate(frame - s.from, [0, 3, 8], [1.1, 1.1, 1], clamp);
  const noteP = interpolate(frame - s.from, [2, 9], [0, 1], clamp);
  const k = interpolate(frame, [shots[0].from, shots[shots.length - 1].from], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", left: 60, right: 140, top: 230, fontFamily: FONT }}>
      <div style={{ height: 10, borderRadius: 5, background: "rgba(43,36,24,0.18)", marginBottom: 26 }}>
        <div style={{ width: `${k * 100}%`, height: "100%", borderRadius: 5, background: C.accent }} />
      </div>
      <div
        style={{
          width: "fit-content",
          padding: "10px 30px 14px",
          borderRadius: 22,
          background: "rgba(255,253,247,0.95)",
          boxShadow: "0 12px 34px -14px rgba(43,36,24,0.55)",
          fontSize: 120,
          fontWeight: 800,
          color: C.ink,
          letterSpacing: -3,
          lineHeight: 1,
          transform: `scale(${bump})`,
          transformOrigin: "left top",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {yearLabel(s.year)}
      </div>
      {s.note && (
        <div
          style={{
            display: "inline-block",
            marginTop: 18,
            padding: "14px 26px",
            borderRadius: 16,
            background: C.accent,
            color: "#fff",
            fontSize: 50,
            fontWeight: 800,
            lineHeight: 1.15,
            opacity: noteP,
            transform: `translateY(${(1 - noteP) * 14}px)`,
          }}
        >
          {s.note}
        </div>
      )}
    </div>
  );
};

const Intro = ({ v }: { v: Video }) => {
  const p = usePop(2, 140);
  const out = interpolate(useCurrentFrame(), [T.introFrames - 8, T.introFrames], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: `rgba(250,246,236,${0.8 * out})`, alignItems: "center", justifyContent: "center", fontFamily: FONT, color: C.ink, opacity: out }}>
      <div style={{ transform: `scale(${0.9 + 0.1 * p})`, opacity: p, textAlign: "center", padding: "0 70px" }}>
        <div style={{ fontSize: 112, fontWeight: 800, letterSpacing: -3, lineHeight: 1.05 }}>{v.title[0]}</div>
        <div style={{ fontSize: 80, fontWeight: 800, letterSpacing: -2, lineHeight: 1.1, color: C.accent, marginTop: 14 }}>{v.title[1]}</div>
        <div style={{ fontSize: 46, fontWeight: 700, color: C.muted, marginTop: 30 }}>{v.sub}</div>
      </div>
    </AbsoluteFill>
  );
};

const EndCard = () => (
  <AbsoluteFill style={{ background: C.paper, alignItems: "center", justifyContent: "center", fontFamily: FONT, color: C.ink, textAlign: "center", padding: "0 80px" }}>
    <Img src={staticFile("brand/icon.png")} style={{ width: 220, height: 220, borderRadius: 48, marginBottom: 50, opacity: usePop(0, 140) }} />
    <Pop delay={2}>
      <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1.2 }}>
        Drag to any year
        <br />
        on any continent
      </div>
    </Pop>
    <div style={{ opacity: usePop(10, 120), marginTop: 44, fontSize: 64, fontWeight: 800, color: C.accent }}>historymapworld.com</div>
    <div style={{ opacity: usePop(16, 120), marginTop: 26, fontSize: 38, fontWeight: 700, color: C.muted }}>Free · 3400 BC to today</div>
  </AbsoluteFill>
);

export const Timelapse = ({ id }: { id: string }) => {
  useFonts();
  const v = T.videos.find((x) => x.id === id)!;
  const sch = (schedule as Record<string, { shots: Shot[]; mapEnd: number }>)[id];
  const shots = sch.shots;
  const frame = useCurrentFrame();
  let i = 0;
  while (i < shots.length - 1 && frame >= shots[i + 1].from) i++;
  const s = shots[i];
  const k = i === 0 ? 1 : interpolate(frame - s.from, [0, FADE], [0, 1], clamp);
  const zoom = interpolate(frame, [0, sch.mapEnd], [1, 1.06], clamp);
  const end = interpolate(frame, [sch.mapEnd - 6, sch.mapEnd + 6], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: C.ocean }}>
      <Audio src={staticFile(`sfx/shorts-${id}.wav`)} />
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: "50% 55%" }}>
        {i > 0 && <MapImg set={v.set} year={shots[i - 1].year} opacity={1} />}
        <MapImg set={v.set} year={s.year} opacity={k} />
      </AbsoluteFill>
      {/* 위 연도·설명이 지도 글자와 겹쳐도 읽히게 위쪽을 살짝 밝게 */}
      <AbsoluteFill style={{ background: "linear-gradient(rgba(250,246,236,0.75), rgba(250,246,236,0) 34%)" }} />
      {frame >= T.introFrames && <Header shots={shots} i={i} />}
      {/* 출처·주소: 아래 자막·단추 자리(380px) 바로 위 */}
      <div
        style={{
          position: "absolute",
          left: 60,
          bottom: 400,
          padding: "10px 18px",
          borderRadius: 12,
          background: "rgba(255,253,247,0.88)",
          fontFamily: FONT,
          fontSize: 28,
          fontWeight: 700,
          color: "rgba(43,36,24,0.75)",
          lineHeight: 1.35,
        }}
      >
        historymapworld.com
        <br />
        <span style={{ fontSize: 22 }}>Borders: Cliopatria (Seshat), CC BY 4.0</span>
      </div>
      <Sequence durationInFrames={T.introFrames}>
        <Intro v={v} />
      </Sequence>
      <Sequence from={sch.mapEnd - 6}>
        <AbsoluteFill style={{ opacity: end }}>
          <EndCard />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
