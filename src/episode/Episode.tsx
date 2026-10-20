// 해설 영상 한 편: audio/voice_episode.py가 만든 timeline.json(장면 + 목소리 + 길이)을 그대로 그린다
// 장면 종류는 episodes/<편>/*.json 머리말 참고. 화면은 장면마다 계속 움직인다(채널 규칙 8)
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { Character, charForSpeaker, hasChar, useMouth } from "./Character";

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
  | { type: "art"; img: string; from: V3; to: V3; name?: string; sub?: string; grade?: "dark" }
  | { type: "lapse"; set: string; years: number[] }
  | { type: "title"; title: string; sub: string; seconds: number }
  | { type: "stamp"; text: string }
  | { type: "line" }
  | { type: "units" }
  | { type: "endcard"; seconds: number; next?: string };
export type Scene = { role?: string; speaker?: string; text?: string; vo: string | null; vo_i18n?: Record<string, string>; frames: number; show: Show; music?: string; sfx?: string | null; char?: string; pose?: string; facing?: "left" | "right"; charAt?: "left" | "center" | "right"; cues?: Cue[]; hold?: number; dur?: Record<string, number>; i18n?: Record<string, string> };
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

const Title = ({ s }: { s: Extract<Show, { type: "title" }> }) => {
  const f = useCurrentFrame();
  const p = spring({ frame: f, fps: 30, config: { damping: 16, stiffness: 120 } });
  const sub = spring({ frame: f - 10, fps: 30, config: { damping: 16 } });
  return (
    <AbsoluteFill style={{ background: "#0d0b08", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <Img decoding="sync" src={staticFile("clean/mg-wide/1280.jpg")} style={{ ...zoomBox(0.5, 0.5, 1.1 - 0.05 * p), filter: "sepia(1) brightness(0.28) contrast(1.4)" }} />
      <Vignette dark />
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: fitSize(s.title, 140, 1700, 10), letterSpacing: 10, color: GOLD, transform: `scale(${1.15 - 0.15 * p})`, opacity: p, textShadow: "0 8px 30px rgba(0,0,0,0.8)" }}>{s.title}</div>
      <div style={{ fontFamily: SERIF, fontSize: 48, letterSpacing: 14, color: "#efe6d2", marginTop: 18, opacity: sub }}>{s.sub}</div>
    </AbsoluteFill>
  );
};

const Stamp = ({ s }: { s: Extract<Show, { type: "stamp" }> }) => {
  const f = useCurrentFrame();
  const p = spring({ frame: f, fps: 30, config: { damping: 9, stiffness: 260 } });
  return (
    <AbsoluteFill style={{ background: "#0b0907", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: fitSize(s.text, 210, 1500, 18), letterSpacing: 18, color: "#d9381e", border: "10px solid #d9381e", padding: "10px 60px", transform: `rotate(-6deg) scale(${2.2 - 1.2 * p})`, opacity: Math.min(1, p * 1.4) }}>{s.text}</div>
    </AbsoluteFill>
  );
};

// 인물 대사: 이름 + 말하는 동안 움직이는 소리 막대 (화면은 모든 언어 더빙이 같이 쓰므로 대사 글자는 넣지 않는다)
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
      <Img decoding="sync" src={staticFile("clean/mg-zoom/1160.jpg")} style={{ ...zoomBox(0.6, 0.43, 1.6 + 0.1 * (f / frames)), filter: "sepia(0.8) brightness(0.3)" }} />
      <Vignette dark />
      {hasChar(char) ? (
        <>
          {/* 인물이 아래에서 올라와 말한다 + 오른쪽에 이름 */}
          <div style={{ position: "absolute", left: 230, bottom: 0, transform: `translateY(${(1 - p) * 160}px)`, opacity: Math.min(1, p * 1.5) }}>
            <div style={{ position: "absolute", left: "8%", right: "8%", bottom: 40, height: 120, borderRadius: "50%", background: "radial-gradient(rgba(233,201,127,0.35), transparent 70%)" }} />
            <Character id={char!} talking={talking} mouth={mouth} height={760} pose={sc.pose} flip={sc.facing === "left"} />
          </div>
          <div style={{ position: "absolute", left: 1000, right: 80, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", opacity: p, transform: `translateX(${(1 - p) * 40}px)` }}>
            <div style={{ fontFamily: SERIF, fontSize: 150, lineHeight: 0.6, color: "rgba(226,85,58,0.5)" }}>“</div>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: fitSize(sc.speaker ?? "", 84, 820, 6), letterSpacing: 6, color: "#f1e6cf", textShadow: "0 8px 30px rgba(0,0,0,0.8)" }}>{sc.speaker}</div>
            <div style={{ display: "flex" }}>{bars(13, 0.7)}</div>
          </div>
        </>
      ) : (
        <div style={{ transform: `translateX(${shake}px) scale(${0.9 + 0.1 * p})`, opacity: p, textAlign: "center" }}>
          <div style={{ fontFamily: SERIF, fontSize: 200, lineHeight: 0.6, color: "rgba(226,85,58,0.5)" }}>“</div>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: fitSize(sc.speaker ?? "", 110, 1600, 8), letterSpacing: 8, color: "#f1e6cf", textShadow: "0 8px 30px rgba(0,0,0,0.8)" }}>{sc.speaker}</div>
          {bars(21, 1)}
        </div>
      )}
    </AbsoluteFill>
  );
};

// 지도·그림 장면에 인물을 세운다 (장면표 char: "<id>"). 오른쪽 아래에서 올라와 숨쉬고 깜빡인다
const CharOverlay = ({ id, pose, flip, at = "right" }: { id: string; pose?: string; flip?: boolean; at?: "left" | "center" | "right" }) => {
  const f = useCurrentFrame();
  const p = spring({ frame: f, fps: 30, config: { damping: 16, stiffness: 140 } });
  const h = 620;
  const w = (h * 600) / 720;
  const x = at === "left" ? 90 : at === "center" ? (1920 - w) / 2 : 1920 - w - 90;
  return (
    <div style={{ position: "absolute", left: x, bottom: 0, width: w, height: h, opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * 120}px)`, filter: "drop-shadow(0 18px 30px rgba(0,0,0,0.55))" }}>
      <Character id={id} height={h} pose={pose} flip={flip} />
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

// 유튜브 최종 화면(20초): 왼쪽 다음 영상 칸 · 오른쪽 구독 칸 자리는 비워 두고 안내만
const EndCard = ({ next }: { next?: string }) => {
  const f = useCurrentFrame();
  const p = spring({ frame: f, fps: 30, config: { damping: 16 } });
  const box = { position: "absolute" as const, border: "4px dashed rgba(233,201,127,0.55)", borderRadius: 24 };
  return (
    <AbsoluteFill style={{ background: "#0d0b08" }}>
      <Img decoding="sync" src={staticFile("clean/mg-wide/1280.jpg")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", filter: "sepia(1) brightness(0.25) contrast(1.4)" }} />
      <div style={{ position: "absolute", top: 110, width: "100%", textAlign: "center", fontFamily: SERIF, fontWeight: 700, fontSize: 84, letterSpacing: 6, color: GOLD, opacity: p }}>THANKS FOR WATCHING</div>
      <div style={{ ...box, left: 150, top: 330, width: 900, height: 506 }} />
      <div style={{ position: "absolute", left: 150, top: 860, width: 900, textAlign: "center", fontFamily: SANS, fontWeight: 700, fontSize: 34, color: "#e8dfcb" }}>{next ?? "Next: Part 2 · The First Clash with Europe"}</div>
      <div style={{ ...box, left: 1310, top: 430, width: 300, height: 300, borderRadius: 150 }} />
      <div style={{ position: "absolute", left: 1210, top: 760, width: 500, textAlign: "center", fontFamily: SANS, fontWeight: 700, fontSize: 34, color: "#e8dfcb" }}>Subscribe</div>
    </AbsoluteFill>
  );
};

const Shot = ({ sc, vo }: { sc: Scene; vo?: string | null }) => {
  const shot = <ShotOnly sc={sc} vo={vo} />;
  return sc.char && sc.show.type !== "line" && hasChar(sc.char) ? (
    <AbsoluteFill>
      {shot}
      {/* 오른쪽에 서면 기본으로 화면 안쪽(왼쪽)을 봄 */}
      <CharOverlay id={sc.char} pose={sc.pose} at={sc.charAt} flip={sc.facing ? sc.facing === "left" : (sc.charAt ?? "right") === "right"} />
    </AbsoluteFill>
  ) : (
    shot
  );
};

const ShotOnly = ({ sc, vo }: { sc: Scene; vo?: string | null }) => {
  const s = sc.show;
  if (s.type === "map") return <MapShot s={s} frames={sc.frames} />;
  if (s.type === "art") return <ArtShot s={s} frames={sc.frames} />;
  if (s.type === "lapse") return <Lapse s={s} frames={sc.frames} />;
  if (s.type === "title") return <Title s={s} />;
  if (s.type === "stamp") return <Stamp s={s} />;
  if (s.type === "units") return <Units frames={sc.frames} />;
  if (s.type === "endcard") return <EndCard next={s.next} />;
  return <Line sc={sc} frames={sc.frames} vo={vo} />;
};

// 화면 종류별 기본 효과음 (장면에 sfx: null을 주면 끔, sfx: "이름"을 주면 그 소리)
// 지도·그림·연도 넘김의 바람 소리는 매 장면마다 붙이면 거슬린다(2026-10-20 사용자) →
// 화면 종류가 바뀔 때만, 앞 바람 소리에서 MOVE_GAP초 넘게 지났을 때만, 작게
export const SFX: Record<string, [string, number]> = {
  map: ["swish", 0.1],
  art: ["swish", 0.1],
  lapse: ["swish", 0.12],
  title: ["boom", 0.55],
  stamp: ["impact", 0.6],
  line: ["hit", 0.4],
  units: ["drum", 0.45],
};
const MOVE = new Set(["map", "art", "lapse"]);
const MOVE_GAP = 20;

// 장면마다 실제로 낼 효과음 [이름, 크기] 또는 null
export const sceneSfx = (scenes: Scene[], fps: number) => {
  let at = 0;
  let lastMove = -Infinity;
  return scenes.map((sc, i) => {
    const from = at;
    at += sc.frames;
    if (sc.sfx === null) return null;
    if (sc.sfx) return [sc.sfx, 0.5] as [string, number];
    const d = SFX[sc.show.type];
    if (!d) return null;
    if (!MOVE.has(sc.show.type)) return d;
    const prev = scenes[i - 1]?.show.type;
    if (prev === sc.show.type || from - lastMove < MOVE_GAP * fps) return null;
    lastMove = from;
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
      <AbsoluteFill style={{ opacity: outro }}>
        {timeline.scenes.map((sc, i) => {
          const from = at;
          at += sc.frames;
          return (
            <Sequence key={i} from={from} durationInFrames={sc.frames}>
              <Shot sc={sc} vo={lang === "en" ? sc.vo : sc.vo_i18n?.[lang]} />
              {(() => {
                const vo = lang === "en" ? sc.vo : sc.vo_i18n?.[lang];
                return vo ? <Audio src={staticFile(vo)} /> : null;
              })()}
              {sfx[i] && <Audio src={staticFile(`sfx/ep/${sfx[i]![0]}.wav`)} volume={sfx[i]![1]} />}
              {sc.cues?.map((c, k) => (
                <Sequence key={`cue${k}`} from={Math.max(0, Math.round(c.at * fps))}>
                  <Audio src={staticFile(c.src)} volume={c.vol ?? 0.6} />
                </Sequence>
              ))}
            </Sequence>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
