// 해설 영상 한 편: audio/voice_episode.py가 만든 timeline.json(장면 + 목소리 + 길이)을 그대로 그린다
// 장면 종류는 episodes/<편>/*.json 머리말 참고. 화면은 장면마다 계속 움직인다(채널 규칙 8)
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { EndCardArt, TitleCard } from "./Cards";
import { Beat, Character, charForSpeaker, Enter, Exit, hasChar, useMouth } from "./Character";

const SERIF = "Baskerville, 'Big Caslon', 'Hoefler Text', serif";
const SANS = "-apple-system, 'Helvetica Neue', Arial, sans-serif";
const GOLD = "#e9c97f";
const ACCENT = "#c2410c";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.33, 0, 0.2, 1);

type V3 = [number, number, number];
type Label = { text: string; x: number; y: number; at?: number; big?: boolean; tone?: "accent" | "dark" };
type Show =
  | { type: "map"; img: string; from: V3; to: V3; labels?: Label[]; pins?: Label[]; grade?: "dark" }
  // parallax(깊이 효과 세기, 예: 0.06)를 주면 옛 그림 2.5D - scripts/parallax.py가 찍은 연속 그림(dir)을 쓴다
  | { type: "art"; img: string; from: V3; to: V3; name?: string; sub?: string; grade?: "dark"; parallax?: number; dir?: string }
  // 옛 그림을 찢은 종이처럼 오려 지도 위에 (2026-10-21 사용자: 캐릭터 A + 옛 그림 B 섞기). box = 화면 비율 [x, y, 너비, 높이]
  | { type: "cutout"; map: string; mapFrom: V3; mapTo: V3; img: string; from: V3; to: V3; box: [number, number, number, number]; rot?: number }
  | { type: "lapse"; set: string; years: number[] }
  // 사이트 장면 층으로 찍은 기울인 지도 + 부대 애니메이션 (scripts/map-scene.mjs → public/<dir>/00000.jpg…). dir은 voice_episode.py가 채운다
  | { type: "mapscene"; scene: string; dir?: string }
  // Blender 시네마틱(실제 지형 위를 날아가는 장면): blender/shots/<shot>.json → scripts/scene-frames.py가 찍음. dir은 voice_episode.py가 채운다
  | { type: "cinematic"; shot: string; dir?: string }
  // 장 카드 (2026-10-21 글자 없는 판): 시리즈 상징 + 연도(year) 또는 편 번호(part → 로마 숫자) + 시리즈 지도. 예전 title·sub 낱말은 그리지 않고 숫자만 뽑아 씀
  | { type: "title"; title?: string; sub?: string; seconds: number; year?: number | string; part?: number; years?: string; series?: string; focus?: V3 }
  | { type: "stamp"; text: string }
  | { type: "line" }
  | { type: "units" }
  // 최종 화면: 낱말 없이 아이콘만. nextPart(다음 편 번호)가 없으면 예전 next 글에서 "Part 3" 숫자만 뽑음
  | { type: "endcard"; seconds: number; next?: string; nextPart?: number; series?: string };
export type Scene = { role?: string; speaker?: string; text?: string; vo: string | null; vo_i18n?: Record<string, string>; frames: number; show: Show; music?: string; sfx?: string | null; char?: string; pose?: string; facing?: "left" | "right"; charAt?: "left" | "center" | "right"; gesture?: string; gestureAt?: number; enter?: Enter; exit?: Exit; beat?: Beat; beatAt?: number; cues?: Cue[]; hold?: number; dur?: Record<string, number>; i18n?: Record<string, string> };
// 장면 안 원하는 시점에 넣는 소리 (편집기에서 끌어다 놓음). src = public 아래 경로, at = 장면 시작부터 초, vol = 0~1
export type Cue = { src: string; at: number; vol?: number };
export type Timeline = { fps: number; bgm?: string; langs?: string[]; scenes: Scene[] };

export const timelineFrames = (t: Timeline) => t.scenes.reduce((a, s) => a + s.frames, 0) + 45;

// 글자 폭 어림(대문자·굵은 글씨 기준 글자당 0.68em + 자간) - 화면 폭을 넘지 않게 글자 크기를 줄인다
export const fitSize = (text: string, size: number, maxWidth: number, spacing = 0) =>
  Math.min(size, Math.floor(maxWidth / ([...text].length * (0.68 + spacing / size))));

// 0→1 진행도 (장면 안에서)
const useK = (frames: number) => {
  const f = useCurrentFrame();
  return interpolate(f, [0, frames], [0, 1], { ...clamp, easing: ease });
};
// 초점(fx,fy)을 화면 가운데에 두고 z배 키운 상자 - transform scale 대신 실제 크기로 배치한다
// (transform으로 2~3배 키우면 크롬이 그림을 3×3 타일로 깨뜨린 프레임을 찍었다)
const zoomBox = (fx: number, fy: number, z: number): React.CSSProperties => ({
  position: "absolute",
  width: `${z * 100}%`,
  height: `${z * 100}%`,
  left: `${(0.5 - fx * z) * 100}%`,
  top: `${(0.5 - fy * z) * 100}%`,
});

const lerp = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

const Vignette = ({ dark }: { dark?: boolean }) => (
  <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) ${dark ? 30 : 55}%, rgba(10,8,5,${dark ? 0.85 : 0.5}) 100%)` }} />
);

const Tag = ({ l, frames, z }: { l: Label; frames: number; z: number }) => {
  const f = useCurrentFrame();
  const start = (l.at ?? 0.08) * frames;
  const p = spring({ frame: f - start, fps: 30, config: { damping: 14, stiffness: 160 } });
  const bg = l.big ? "transparent" : l.tone === "dark" ? "rgba(30,26,20,0.88)" : l.tone === "accent" ? ACCENT : "rgba(255,253,247,0.94)";
  const color = l.big ? "#fff" : l.tone ? "#fff" : "#2b2418";
  return (
    <div
      style={{
        position: "absolute",
        left: `${l.x * 100}%`,
        top: `${l.y * 100}%`,
        transform: `translate(-50%, -50%) scale(${(1 / z) * (0.6 + 0.4 * p)})`,
        opacity: p,
        whiteSpace: "nowrap",
        fontFamily: l.big ? SERIF : SANS,
        fontWeight: 800,
        fontSize: l.big ? fitSize(l.text, 96, 1700, 6) : 34,
        letterSpacing: l.big ? 6 : 0.5,
        color,
        background: bg,
        padding: l.big ? 0 : "10px 20px",
        borderRadius: 12,
        textShadow: l.big ? "0 6px 24px rgba(0,0,0,0.75)" : "none",
        boxShadow: l.big ? "none" : "0 10px 28px -10px rgba(0,0,0,0.6)",
      }}
    >
      {l.text}
    </div>
  );
};

const Pin = ({ l, frames, z }: { l: Label; frames: number; z: number }) => {
  const f = useCurrentFrame();
  const start = (l.at ?? 0.05) * frames;
  const p = spring({ frame: f - start, fps: 30, config: { damping: 12, stiffness: 170 } });
  const pulse = 1 + 0.25 * Math.max(0, Math.sin((f - start) / 6));
  const dot = l.tone === "dark" ? "#1f2937" : ACCENT;
  return (
    <div style={{ position: "absolute", left: `${l.x * 100}%`, top: `${l.y * 100}%`, transform: `scale(${1 / z})`, transformOrigin: "0 0", opacity: p }}>
      <div style={{ position: "absolute", left: -14, top: -14, width: 28, height: 28, borderRadius: 14, background: dot, border: "4px solid #fff", boxShadow: "0 4px 14px rgba(0,0,0,0.5)", transform: `scale(${p * pulse})` }} />
      <div style={{ position: "absolute", left: 26, top: -24, whiteSpace: "nowrap", fontFamily: SANS, fontWeight: 800, fontSize: 32, color: "#fff", background: "rgba(30,26,20,0.88)", padding: "6px 16px", borderRadius: 10 }}>{l.text}</div>
    </div>
  );
};

const MapShot = ({ s, frames }: { s: Extract<Show, { type: "map" }>; frames: number }) => {
  const k = useK(frames);
  const [fx, fy, z] = lerp(s.from, s.to, k);
  return (
    <AbsoluteFill style={{ background: "#cfe6f2", overflow: "hidden" }}>
      <div style={zoomBox(fx, fy, z)}>
        <Img decoding="sync" src={staticFile(s.img)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", filter: s.grade === "dark" ? "brightness(0.7) saturate(0.8)" : "none" }} />
        {(s.labels ?? []).filter((l) => !l.big).map((l) => (
          <Tag key={l.text} l={l} frames={frames} z={1} />
        ))}
        {(s.pins ?? []).map((l) => (
          <Pin key={l.text} l={l} frames={frames} z={1} />
        ))}
      </div>
      <Vignette dark={s.grade === "dark"} />
      {(s.labels ?? []).filter((l) => l.big).map((l) => (
        <Tag key={l.text} l={l} frames={frames} z={1} />
      ))}
    </AbsoluteFill>
  );
};

const ArtShot = ({ s, frames }: { s: Extract<Show, { type: "art" }>; frames: number }) => {
  const k = useK(frames);
  const [fx, fy, z] = lerp(s.from, s.to, k);
  const f = useCurrentFrame();
  const nameP = spring({ frame: f - 8, fps: 30, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ background: "#120f0a", overflow: "hidden" }}>
      {/* 세로 그림이 화면을 다 못 채울 때 뒤를 흐린 같은 그림으로 */}
      <Img decoding="sync" src={staticFile(s.img)} style={{ position: "absolute", inset: -60, width: "calc(100% + 120px)", height: "calc(100% + 120px)", objectFit: "cover", filter: "blur(36px) brightness(0.45)" }} />
      <Img
        src={staticFile(s.img)}
        style={{
          ...zoomBox(fx, fy, z),
          // 맞춤 방식은 장면 내내 고정 (중간에 바꾸면 화면이 툭 튄다). 확대는 상자 크기로
          objectFit: "contain",
          filter: s.grade === "dark" ? "brightness(0.65) sepia(0.3)" : "sepia(0.12) contrast(1.05)",
        }}
      />
      <Vignette dark />
      {s.name && (
        <div style={{ position: "absolute", left: 110, bottom: 120, opacity: nameP, transform: `translateX(${(1 - nameP) * -40}px)` }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: fitSize(s.name, 92, 1600, 6), letterSpacing: 6, color: GOLD, textShadow: "0 6px 24px rgba(0,0,0,0.8)" }}>{s.name}</div>
          {s.sub && <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 34, color: "#eee6d4", marginTop: 4 }}>{s.sub}</div>}
          <div style={{ width: 160 * nameP, height: 4, background: ACCENT, marginTop: 14 }} />
        </div>
      )}
    </AbsoluteFill>
  );
};

// 찢은 종이 테두리 (같은 그림이면 같은 모양): clip-path polygon 퍼센트 점
const torn = (seed: number, j: number) => {
  let x = seed % 233280;
  const r = () => (x = (x * 9301 + 49297) % 233280) / 233280;
  const pts: string[] = [];
  const n = 26;
  for (let i = 0; i <= n; i++) pts.push(`${(i / n) * 100}% ${r() * j}%`);
  for (let i = 0; i <= n; i++) pts.push(`${100 - r() * j}% ${(i / n) * 100}%`);
  for (let i = n; i >= 0; i--) pts.push(`${(i / n) * 100}% ${100 - r() * j}%`);
  for (let i = n; i >= 0; i--) pts.push(`${r() * j}% ${(i / n) * 100}%`);
  return `polygon(${pts.join(",")})`;
};
const seedOf = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const Cutout = ({ s, frames }: { s: Extract<Show, { type: "cutout" }>; frames: number }) => {
  const k = useK(frames);
  const f = useCurrentFrame();
  const [mx, my, mz] = lerp(s.mapFrom, s.mapTo, k);
  const [fx, fy, z] = lerp(s.from, s.to, k);
  const p = spring({ frame: f - 4, fps: 30, config: { damping: 15, stiffness: 120 } });
  const [bx, by, bw, bh] = s.box;
  const seed = seedOf(s.img);
  return (
    <AbsoluteFill style={{ background: "#0d0b08", overflow: "hidden" }}>
      <div style={zoomBox(mx, my, mz)}>
        <Img decoding="sync" src={staticFile(s.map)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", filter: "sepia(0.45) saturate(0.75) brightness(0.6)" }} />
      </div>
      <Vignette dark />
      <div style={{ position: "absolute", left: `${bx * 100}%`, top: `${by * 100}%`, width: `${bw * 100}%`, height: `${bh * 100}%`, opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * 60}px) rotate(${(s.rot ?? -2) * p}deg) scale(${0.92 + 0.08 * p})`, filter: "drop-shadow(10px 18px 22px rgba(0,0,0,0.6))" }}>
        <div style={{ position: "absolute", inset: 0, background: "#efe2c4", clipPath: torn(seed, 2.2) }} />
        <div style={{ position: "absolute", inset: 12, overflow: "hidden", clipPath: torn(seed + 5, 1.6) }}>
          <Img decoding="sync" src={staticFile(s.img)} style={{ ...zoomBox(fx, fy, z), objectFit: "cover", filter: "sepia(0.25) saturate(0.9) contrast(1.05)" }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// 미리 찍어 둔 연속 그림 (기울인 지도 장면·옛 그림 2.5D) - 프레임 번호 = 그림 번호
const FrameSeq = ({ dir }: { dir?: string }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#0d0b08" }}>
      <Img decoding="sync" src={staticFile(`${dir}/${String(f).padStart(5, "0")}.jpg`)} style={{ width: "100%", height: "100%" }} />
      <Vignette dark />
    </AbsoluteFill>
  );
};
const MapScene = ({ s }: { s: Extract<Show, { type: "mapscene" }> }) => <FrameSeq dir={s.dir} />;

const Lapse = ({ s, frames }: { s: Extract<Show, { type: "lapse" }>; frames: number }) => {
  const f = useCurrentFrame();
  const per = frames / s.years.length;
  const i = Math.min(s.years.length - 1, Math.floor(f / per));
  const fade = interpolate(f - i * per, [0, 4], [0, 1], clamp);
  const z = interpolate(f, [0, frames], [1.08, 1.0], clamp);
  return (
    <AbsoluteFill style={{ background: "#cfe6f2", overflow: "hidden" }}>
      <div style={zoomBox(0.5, 0.5, z)}>
        {i > 0 && <Img decoding="sync" src={staticFile(`${s.set}/${s.years[i - 1]}.jpg`)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />}
        <Img decoding="sync" src={staticFile(`${s.set}/${s.years[i]}.jpg`)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: fade }} />
      </div>
      <Vignette />
      <div style={{ position: "absolute", left: 90, bottom: 80, fontFamily: SERIF, fontWeight: 700, fontSize: 130, color: "#fff", textShadow: "0 8px 30px rgba(0,0,0,0.7)", fontVariantNumeric: "tabular-nums" }}>
        {s.years[i]}
      </div>
    </AbsoluteFill>
  );
};

// 장 카드는 Cards.tsx (글자 없는 판: 시리즈 상징 + 연도·편 번호 + 지도 실루엣)
const Title = ({ s, frames }: { s: Extract<Show, { type: "title" }>; frames: number }) => <TitleCard s={s} frames={frames} />;

const Stamp = ({ s }: { s: Extract<Show, { type: "stamp" }> }) => {
  const f = useCurrentFrame();
  const p = spring({ frame: f, fps: 30, config: { damping: 9, stiffness: 260 } });
  return (
    <AbsoluteFill style={{ background: "#0b0907", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: fitSize(s.text, 210, 1500, 18), letterSpacing: 18, color: "#d9381e", border: "10px solid #d9381e", padding: "10px 60px", transform: `rotate(-6deg) scale(${2.2 - 1.2 * p})`, opacity: Math.min(1, p * 1.4) }}>{s.text}</div>
    </AbsoluteFill>
  );
};

// 인물 대사: 캐릭터 + 말하는 동안 움직이는 소리 막대. 화면은 모든 언어 더빙이 같이 쓰므로 대사·이름 글자는 넣지 않는다 (2026-10-21 사용자: 영어가 너무 많음)
const Line = ({ sc, frames, vo }: { sc: Scene; frames: number; vo?: string | null }) => {
  const f = useCurrentFrame();
  const p = spring({ frame: f, fps: 30, config: { damping: 14 } });
  const shake = Math.sin(f / 2) * Math.max(0, 1 - f / 10) * 6;
  const talking = f < frames - 8;
  const char = sc.char ?? charForSpeaker(sc.speaker);
  const mouth = useMouth(vo);
  const bars = (n: number, scale: number) => (
    <div style={{ display: "flex", gap: 10 * scale, justifyContent: "center", alignItems: "center", height: 90 * scale, marginTop: 30 * scale }}>
      {Array.from({ length: n }, (_, k) => {
        const h = talking ? 14 + 70 * Math.abs(Math.sin(f / 3 + k * 1.7) * Math.sin(f / 7 + k)) : 10;
        return <div key={k} style={{ width: 10 * scale, height: h * scale, borderRadius: 5, background: "#e2553a", opacity: 0.85 }} />;
      })}
    </div>
  );
  return (
    <AbsoluteFill style={{ background: "#0d0b08", alignItems: "center", justifyContent: "center" }}>
      {/* 뒤 지도는 이름 없는 판 (화면 글자 금지) */}
      <Img decoding="sync" src={staticFile("clean/banner3/1279-nonames.jpg")} style={{ ...zoomBox(0.56, 0.4, 1.8 + 0.1 * (f / frames)), filter: "sepia(0.8) brightness(0.3)" }} />
      <Vignette dark />
      {hasChar(char) ? (
        <>
          {/* 인물이 아래에서 올라와 말한다(등장·반응·손짓은 Character) + 오른쪽에 소리 막대 */}
          <div style={{ position: "absolute", left: 230, bottom: 0 }}>
            <div style={{ position: "absolute", left: "8%", right: "8%", bottom: 40, height: 120, borderRadius: "50%", background: "radial-gradient(rgba(233,201,127,0.35), transparent 70%)", opacity: p }} />
            <Character id={char!} talking={talking} mouth={mouth} height={760} pose={sc.pose} flip={sc.facing === "left"} {...motion(sc)} />
          </div>
          <div style={{ position: "absolute", left: 1000, right: 80, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", opacity: p, transform: `translateX(${(1 - p) * 40}px)` }}>
            <div style={{ fontFamily: SERIF, fontSize: 150, lineHeight: 0.6, color: "rgba(226,85,58,0.5)" }}>“</div>
            <div style={{ display: "flex" }}>{bars(13, 0.9)}</div>
          </div>
        </>
      ) : (
        <div style={{ transform: `translateX(${shake}px) scale(${0.9 + 0.1 * p})`, opacity: p, textAlign: "center" }}>
          <div style={{ fontFamily: SERIF, fontSize: 200, lineHeight: 0.6, color: "rgba(226,85,58,0.5)" }}>“</div>
          {bars(21, 1)}
        </div>
      )}
    </AbsoluteFill>
  );
};

// 장면표의 인물 움직임 필드 → Character 속성 (초 → 프레임)
const motion = (sc: Scene) => ({
  gesture: sc.gesture,
  gestureAt: sc.gestureAt === undefined ? undefined : Math.round(sc.gestureAt * 30),
  enter: sc.enter,
  exit: sc.exit,
  beat: sc.beat,
  beatAt: sc.beatAt === undefined ? undefined : Math.round(sc.beatAt * 30),
  frames: sc.frames,
});

// 지도·그림 장면에 인물을 세운다 (장면표 char: "<id>"). 아래에서 올라와(기본 enter "up") 숨쉬고 깜빡인다
const CharOverlay = ({ sc, flip, at = "right" }: { sc: Scene; flip?: boolean; at?: "left" | "center" | "right" }) => {
  const h = 620;
  const w = (h * 600) / 720;
  const x = at === "left" ? 90 : at === "center" ? (1920 - w) / 2 : 1920 - w - 90;
  return (
    <div style={{ position: "absolute", left: x, bottom: 0, width: w, height: h, filter: "drop-shadow(0 18px 30px rgba(0,0,0,0.55))" }}>
      <Character id={sc.char!} height={h} pose={sc.pose} flip={flip} delay={4} {...motion(sc)} />
    </div>
  );
};

// 십호·백호·천호·만호: 점이 10 → 100 → 1,000 → 10,000으로 불어난다
const Units = ({ frames }: { frames: number }) => {
  const f = useCurrentFrame();
  const steps = [
    { n: 10, label: "10 · ARBAN", dot: 26 },
    { n: 100, label: "100 · ZUUN", dot: 12 },
    { n: 1000, label: "1,000 · MINGGHAN", dot: 5 },
    { n: 10000, label: "10,000 · TUMEN", dot: 2 },
  ];
  const per = frames / steps.length;
  const i = Math.min(steps.length - 1, Math.floor(f / per));
  const st = steps[i];
  const p = spring({ frame: f - i * per, fps: 30, config: { damping: 15, stiffness: 140 } });
  const cols = Math.ceil(Math.sqrt(st.n * 1.8));
  const shown = Math.round(st.n * Math.min(1, p * 1.2));
  const tribes = ["#c2410c", "#2563eb", "#15803d", "#a16207", "#7c3aed"];
  return (
    <AbsoluteFill style={{ background: "#14110c", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${st.dot}px)`, gap: Math.max(1, st.dot / 3), maxWidth: 1500 }}>
        {Array.from({ length: shown }, (_, k) => (
          <div key={k} style={{ width: st.dot, height: st.dot, borderRadius: st.dot, background: tribes[(k * 7) % tribes.length] }} />
        ))}
      </div>
      <div style={{ position: "absolute", bottom: 90, fontFamily: SERIF, fontWeight: 700, fontSize: 84, letterSpacing: 6, color: GOLD, transform: `scale(${0.8 + 0.2 * p})` }}>{st.label}</div>
      <div style={{ position: "absolute", top: 70, fontFamily: SANS, fontWeight: 700, fontSize: 30, color: "#d6cdb8" }}>colors = old tribes, mixed on purpose</div>
    </AbsoluteFill>
  );
};

// 유튜브 최종 화면(20초): Cards.tsx - 칸 자리는 그대로, 낱말 없이 아이콘만 (다음 편 ▶ + 편 번호, 구독 종)
const EndCard = ({ s }: { s: Extract<Show, { type: "endcard" }> }) => <EndCardArt s={s} />;

const Shot = ({ sc, vo }: { sc: Scene; vo?: string | null }) => {
  const shot = <ShotOnly sc={sc} vo={vo} />;
  return sc.char && sc.show.type !== "line" && hasChar(sc.char) ? (
    <AbsoluteFill>
      {shot}
      {/* 오른쪽에 서면 기본으로 화면 안쪽(왼쪽)을 봄 */}
      <CharOverlay sc={sc} at={sc.charAt} flip={sc.facing ? sc.facing === "left" : (sc.charAt ?? "right") === "right"} />
    </AbsoluteFill>
  ) : (
    shot
  );
};

const ShotOnly = ({ sc, vo }: { sc: Scene; vo?: string | null }) => {
  const s = sc.show;
  if (s.type === "map") return <MapShot s={s} frames={sc.frames} />;
  if (s.type === "art" && s.parallax && s.dir) return <FrameSeq dir={s.dir} />;
  if (s.type === "art") return <ArtShot s={s} frames={sc.frames} />;
  if (s.type === "cutout") return <Cutout s={s} frames={sc.frames} />;
  if (s.type === "mapscene") return <MapScene s={s} />;
  if (s.type === "cinematic") return <FrameSeq dir={s.dir} />;
  if (s.type === "lapse") return <Lapse s={s} frames={sc.frames} />;
  if (s.type === "title") return <Title s={s} frames={sc.frames} />;
  if (s.type === "stamp") return <Stamp s={s} />;
  if (s.type === "units") return <Units frames={sc.frames} />;
  if (s.type === "endcard") return <EndCard s={s} />;
  return <Line sc={sc} frames={sc.frames} vo={vo} />;
};

// 화면 종류별 기본 효과음 (장면에 sfx: null을 주면 끔, sfx: "이름"을 주면 그 소리)
// 전환 효과음이 잦으면 거슬린다(2026-10-20·21 사용자) →
// 바람 소리는 장이 바뀐 뒤(제목 장면 다음) 첫 지도·그림에만 - 장소·시대가 크게 바뀌는 곳은 장면표에 sfx: "swish"로 직접
// 대사 카드 "탁"은 그 인물이 처음 나올 때만
export const SFX: Record<string, [string, number]> = {
  map: ["swish", 0.1],
  cutout: ["swish", 0.1],
  mapscene: ["swish", 0.1],
  cinematic: ["swish", 0.1],
  art: ["swish", 0.1],
  lapse: ["swish", 0.12],
  title: ["boom", 0.55],
  stamp: ["impact", 0.6],
  line: ["hit", 0.4],
  units: ["drum", 0.45],
};
const MOVE = new Set(["map", "art", "lapse", "cutout", "mapscene", "cinematic"]);

// 장면마다 실제로 낼 효과음 [이름, 크기] 또는 null
export const sceneSfx = (scenes: Scene[], _fps?: number) => {
  let chapter = false;
  const met = new Set<string>();
  return scenes.map((sc) => {
    const type = sc.show.type;
    const first = type === "line" && !met.has(sc.speaker ?? "");
    if (type === "line") met.add(sc.speaker ?? "");
    if (type === "title") chapter = true;
    if (sc.sfx === null) return null;
    if (sc.sfx) return [sc.sfx, 0.5] as [string, number];
    const d = SFX[type];
    if (!d) return null;
    if (MOVE.has(type)) {
      if (!chapter) return null;
      chapter = false;
      return d;
    }
    if (type === "line" && !first) return null;
    return d;
  });
};

// 브금 구간: 장면의 music이 바뀌는 곳마다 새 곡(반복 재생), 목소리가 나오는 동안은 줄인다
export const musicSegments = (t: Timeline, total: number) => {
  const segs: { track: string; from: number; to: number }[] = [];
  let at = 0;
  for (const sc of t.scenes) {
    if (sc.music && (!segs.length || segs[segs.length - 1].track !== sc.music)) {
      if (segs.length) segs[segs.length - 1].to = at;
      segs.push({ track: sc.music, from: at, to: total });
    }
    at += sc.frames;
  }
  if (!segs.length && t.bgm) segs.push({ track: t.bgm.replace(/^bgm\/|\.wav$/g, ""), from: 0, to: total });
  return segs;
};

export const Episode = ({ timeline, lang = "en" }: { timeline: Timeline; lang?: string }) => {
  const { durationInFrames, fps } = useVideoConfig();
  const f = useCurrentFrame();
  const sfx = sceneSfx(timeline.scenes, fps);
  let at = 0;
  const end = durationInFrames - 45;
  const outro = interpolate(f, [end, end + 30], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {(() => {
        // 목소리 구간(전체 프레임 기준)
        const voice: [number, number][] = [];
        let t = 0;
        for (const sc of timeline.scenes) {
          if (sc.vo) voice.push([t, t + sc.frames - 4]);
          t += sc.frames;
        }
        const duck = (g: number) => {
          // 목소리 앞뒤 8프레임에 걸쳐 부드럽게 0.3배로
          let k = 1;
          for (const [a, b] of voice) {
            const d = g < a ? a - g : g > b ? g - b : 0;
            k = Math.min(k, d >= 8 ? 1 : 0.3 + 0.7 * (d / 8));
          }
          return k;
        };
        return musicSegments(timeline, durationInFrames).map((m) => (
          <Sequence key={m.from} from={Math.max(0, m.from - 15)} durationInFrames={m.to - m.from + 30}>
            <Audio
              src={staticFile(`bgm/${m.track}.wav`)}
              loop
              volume={(fr) => {
                const g = fr + Math.max(0, m.from - 15);
                const xfade = interpolate(fr, [0, 15, m.to - m.from + 15, m.to - m.from + 30], [0, 1, 1, 0], clamp);
                return 0.32 * duck(g) * xfade * interpolate(g, [end, durationInFrames], [1, 0], clamp);
              }}
            />
          </Sequence>
        ));
      })()}
      {/* 장면에 넣은 효과음(cues)은 장면이 끝나도 끝까지 울린다 - 장면 안에 두면 장면 끝에서 잘렸다 (2026-10-21 사용자: 넣은 효과음이 안 들림) */}
      {(() => {
        let t = 0;
        return timeline.scenes.flatMap((sc, i) => {
          const from = t;
          t += sc.frames;
          return (sc.cues || []).map((c, k) => (
            <Sequence key={`cue${i}-${k}`} from={from + Math.max(0, Math.round(c.at * fps))}>
              <Audio src={staticFile(c.src)} volume={c.vol ?? 0.6} />
            </Sequence>
          ));
        });
      })()}
      <AbsoluteFill style={{ opacity: outro }}>
        {timeline.scenes.map((sc, i) => {
          const from = at;
          at += sc.frames;
          return (
            // 마지막 장면은 끝의 어두워지는 1.5초까지 남겨 둔다 (안 그러면 검은 화면으로 툭 바뀜)
            <Sequence key={i} from={from} durationInFrames={sc.frames + (i === timeline.scenes.length - 1 ? 45 : 0)}>
              <Shot sc={sc} vo={lang === "en" ? sc.vo : sc.vo_i18n?.[lang]} />
              {(() => {
                const vo = lang === "en" ? sc.vo : sc.vo_i18n?.[lang];
                return vo ? <Audio src={staticFile(vo)} /> : null;
              })()}
              {sfx[i] && <Audio src={staticFile(`sfx/ep/${sfx[i]![0]}.wav`)} volume={sfx[i]![1]} />}
            </Sequence>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
