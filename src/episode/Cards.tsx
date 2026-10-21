// 장 카드·최종 화면 (2026-10-21 글자 없는 판): 한 화면을 모든 언어 더빙이 같이 쓰니 낱말 없이 숫자·기호만
// 바랜 종이 + 먹선 지도 실루엣(scripts/title-art.py) + 시리즈 상징(몽골 = 툭, 말꼬리 깃대)이 먹으로 그려지고 연도·편 번호가 붓으로 써진다
import { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

type V3 = [number, number, number];
const INK = "#2b1d14";
const SERIF = "Baskerville, 'Big Caslon', 'Hoefler Text', serif";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.33, 0, 0.2, 1);

// 시리즈마다 지도(땅 먹선·제국 영역 public/series/<id>/)와 번지기 시작점(제국 고향), 물감 색, 10년 단위 제국 영역이 있는 해
type Series = { dir: string; decades: number[]; center: [number, number]; focus: V3; wash: string; edge: string; Emblem: (p: { f: number; size: number }) => JSX.Element };
const SERIES: Record<string, Series> = {
  mongol: { dir: "series/mongol", decades: [1200, 1210, 1220, 1230, 1240, 1250, 1260, 1270, 1280], center: [0.578, 0.424], focus: [0.5, 0.42, 1.3], wash: "#9a3a26", edge: "#6e2414", Emblem: (p) => <Tug {...p} /> },
};
// 연도 → 가장 가까운 10년의 제국 영역, 연도가 없으면 가장 넓을 때(empire.png)
const empireOf = (sr: Series, year?: string) => {
  const y = Number(year);
  if (!year || !Number.isFinite(y)) return `${sr.dir}/empire.png`;
  const d = sr.decades.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
  return `${sr.dir}/empire-${d}.png`;
};

// SVG <image>는 Remotion이 로딩을 기다리지 않으니 직접 기다린다 (안 그러면 첫 프레임에 지도가 빠짐 = 깜빡임)
const loaded = new Set<string>();
const usePreload = (srcs: string[]) => {
  const key = srcs.join("|");
  const [handle] = useState(() => (srcs.every((s) => loaded.has(s)) ? null : delayRender(`card ${key}`)));
  useEffect(() => {
    if (handle === null) return;
    Promise.all(
      srcs.map(
        (s) =>
          new Promise<void>((ok) => {
            const im = new Image();
            im.onload = im.onerror = () => (loaded.add(s), ok());
            im.src = staticFile(s);
          }),
      ),
    ).then(() => continueRender(handle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, handle]);
};
const seriesOf = (id?: string) => SERIES[id ?? "mongol"] ?? SERIES.mongol;

const ROMAN: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
export const roman = (n: number) => {
  let out = "";
  for (const [v, r] of ROMAN) while (n >= v) (out += r), (n -= v);
  return out;
};

// 예전 장면표 호환: 낱말은 버리고 숫자만 (title "1219" → 연도, "PART 2" → 편 번호)
export const titleNumbers = (s: { title?: string; sub?: string; year?: number | string; part?: number }) => {
  const txt = `${s.title ?? ""} ${s.sub ?? ""}`;
  const year = s.year ?? (s.title?.trim().match(/^\d{3,4}$/) ? s.title.trim() : undefined);
  const pm = txt.match(/PART\s+(\d+)/i);
  return { year: year === undefined ? undefined : String(year), part: s.part ?? (pm ? Number(pm[1]) : undefined) };
};

// 먹선 흔들림·종이 결 (한 화면에 한 번만 깔고 id로 씀)
const Defs = ({ f }: { f: number }) => (
  <svg width={0} height={0} style={{ position: "absolute" }}>
    <defs>
      <filter id="card-ink" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={3} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={5} />
      </filter>
      {/* 붓 자국: 가장자리가 거칠게 */}
      <filter id="card-brush" x="-5%" y="-20%" width="110%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.09 0.6" numOctaves={3} seed={11} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={9} />
      </filter>
      {/* 필름 알갱이 - 프레임마다 조금씩 바뀜 */}
      <filter id="card-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={f % 8} />
        <feColorMatrix values="0 0 0 0 0.25  0 0 0 0 0.18  0 0 0 0 0.1  0 0 0 0.55 0" />
      </filter>
      <filter id="card-paper">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves={4} seed={21} />
        <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.32  0 0 0 0 0.18  0 0 0 0.35 0" />
      </filter>
    </defs>
  </svg>
);

// 바랜 종이: 얼룩 + 탄 가장자리 + 알갱이
const Paper = ({ children }: { children?: React.ReactNode }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#e6d6b2", overflow: "hidden" }}>
      <Defs f={f} />
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <rect width="100%" height="100%" filter="url(#card-paper)" />
      </svg>
      {children}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, mixBlendMode: "multiply", opacity: 0.5 }}>
        <rect width="100%" height="100%" filter="url(#card-grain)" />
      </svg>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 72% 68% at 50% 48%, rgba(0,0,0,0) 52%, rgba(74,44,20,0.42) 82%, rgba(30,16,6,0.82) 100%)" }} />
    </AbsoluteFill>
  );
};

// 지도 실루엣 + 제국 영역이 고향에서 물감 번지듯 물듦 (reveal 0→1): 옅은 바탕 + 얼룩 + 가장자리에 고인 진한 물감
const SeriesMap = ({ sr, empire, box, reveal, wash = 1 }: { sr: Series; empire: string; box: React.CSSProperties; reveal: number; wash?: number }) => {
  usePreload([`${sr.dir}/land.png`, empire]);
  const [cx, cy] = sr.center;
  const id = `wash-${empire.replace(/\W/g, "")}`;
  const r = 60 + reveal * 1900;
  return (
    <svg viewBox="0 0 2560 1440" preserveAspectRatio="none" style={box}>
      <defs>
        <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feFlood floodColor={sr.wash} result="c" />
          <feComposite in="c" in2="SourceAlpha" operator="in" result="fill" />
          <feTurbulence type="fractalNoise" baseFrequency="0.005" numOctaves={3} seed={5} result="t" />
          <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.8 -0.55" result="ta" />
          <feComposite in="fill" in2="ta" operator="in" result="blot" />
          <feMorphology in="SourceAlpha" operator="erode" radius={6} result="er" />
          <feComposite in="SourceAlpha" in2="er" operator="out" result="e0" />
          <feGaussianBlur in="e0" stdDeviation={2.5} result="e1" />
          <feFlood floodColor={sr.edge} result="d" />
          <feComposite in="d" in2="e1" operator="in" result="edge" />
          <feComponentTransfer in="fill" result="base"><feFuncA type="linear" slope={0.34 * wash} /></feComponentTransfer>
          <feComponentTransfer in="blot" result="blot2"><feFuncA type="linear" slope={0.28 * wash} /></feComponentTransfer>
          <feComponentTransfer in="edge" result="edge2"><feFuncA type="linear" slope={0.75 * wash} /></feComponentTransfer>
          <feMerge>
            <feMergeNode in="base" />
            <feMergeNode in="blot2" />
            <feMergeNode in="edge2" />
          </feMerge>
        </filter>
        <radialGradient id={`${id}-g`}>
          <stop offset="0.82" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x={0} y={0} width={2560} height={1440}>
          <circle cx={cx * 2560} cy={cy * 1440} r={r} fill={`url(#${id}-g)`} />
        </mask>
      </defs>
      <image href={staticFile(`${sr.dir}/land.png`)} width={2560} height={1440} opacity={0.72} />
      <g mask={`url(#${id}-m)`}>
        <image href={staticFile(empire)} width={2560} height={1440} filter={`url(#${id})`} />
      </g>
    </svg>
  );
};

const zoomBox = (fx: number, fy: number, z: number): React.CSSProperties => ({
  position: "absolute",
  width: `${z * 100}%`,
  height: `${z * 100}%`,
  left: `${(0.5 - fx * z) * 100}%`,
  top: `${(0.5 - fy * z) * 100}%`,
});

// 0→1 사이 구간 진행도
const seg = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: ease });

// 몽골 툭(말꼬리 깃대): 깃대가 아래서 위로 그어지고 → 창날·원반이 맺히고 → 말꼬리 털이 흘러내려 바람에 흔들림
// size = 높이(px). 그림 판 240×560
export const Tug = ({ f, size }: { f: number; size: number }) => {
  const pole = seg(f, 0, 16);
  const tip = spring({ frame: f - 12, fps: 30, config: { damping: 11, stiffness: 180 } });
  const n = 28;
  const hair = Array.from({ length: n }, (_, i) => {
    const k = i / (n - 1) - 0.5; // -0.5~0.5
    const grow = seg(f, 18 + Math.abs(k) * 12, 40 + Math.abs(k) * 12);
    const wind = Math.sin(f / 19 + i * 0.6) * 6 + Math.sin(f / 8 + i * 1.3) * 2.5;
    const x0 = 120 + k * 20;
    const len = 240 + (1 - Math.abs(k) * 2) * 90 + ((i * 37) % 41);
    const x1 = 120 + k * 110 + 22 + wind * 1.8; // 바람에 오른쪽으로 살짝
    const d = `M ${x0} 122 C ${x0 + k * 44} 190 ${x1 - 12 - wind} ${122 + len * 0.6} ${x1} ${122 + len}`;
    return { d, grow, w: 3 + ((i * 13) % 4), o: 0.62 + ((i * 7) % 5) * 0.08 };
  });
  const sw = Math.sin(f / 19) * 8;
  const body = `M 112 124 C 92 190 80 280 ${84 + sw} 350 C 120 372 160 372 ${190 + sw} 360 C 176 280 150 190 128 124 Z`;
  return (
    <svg viewBox="0 0 240 560" width={(size * 240) / 560} height={size} style={{ overflow: "visible" }}>
      <g filter="url(#card-ink)" stroke={INK} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* 깃대 */}
        <path d="M 120 556 L 120 80" opacity={pole > 0.01 ? 1 : 0} strokeWidth={11} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - pole} />
        <path d="M 114 540 L 114 96" stroke="#7a5a3a" strokeWidth={3} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - pole} opacity={0.6} />
        {/* 털 덩어리(먹 번짐) + 털 가닥 */}
        <path d={body} fill={INK} stroke="none" opacity={0.42 * seg(f, 24, 46)} />
        {hair.map((h, i) => (
          <path key={i} d={h.d} strokeWidth={h.w} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - h.grow} opacity={h.grow > 0.01 ? h.o : 0} />
        ))}
        <g style={{ transform: `scale(${tip})`, transformOrigin: "120px 100px" }}>
          {/* 말꼬리를 묶은 고리 */}
          <path d="M 98 112 Q 120 100 142 112 L 140 128 Q 120 118 100 128 Z" fill="#c9a24e" strokeWidth={5} />
          {/* 원반 + 불꽃 모양 창날 + 양옆 갈래 */}
          <ellipse cx={120} cy={92} rx={40} ry={10} fill="#b8b6ac" strokeWidth={5} />
          <path d="M 120 0 C 140 30 144 62 120 88 C 96 62 100 30 120 0 Z" fill="#b8b6ac" strokeWidth={5} />
          <path d="M 120 16 L 120 74" strokeWidth={3} opacity={0.55} />
          <path d="M 92 86 C 76 68 76 48 84 34 M 148 86 C 164 68 164 48 156 34" strokeWidth={7} />
        </g>
      </g>
    </svg>
  );
};

// 붓으로 긋는 가로 획 (cx 가운데, p 진행)
const Brush = ({ p, width, cx, y }: { p: number; width: number; cx: number; y: number }) => (
  <svg width={width + 40} height={60} viewBox={`-20 0 ${width + 40} 60`} style={{ position: "absolute", left: cx - width / 2 - 20, top: y - 30, overflow: "visible", opacity: p > 0.01 ? 1 : 0 }}>
    <g filter="url(#card-brush)" fill="none" stroke={INK} strokeLinecap="round">
      <path d={`M 0 34 C ${width * 0.3} 22 ${width * 0.7} 26 ${width} 30`} strokeWidth={14} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
      <path d={`M ${width * 0.04} 40 C ${width * 0.35} 32 ${width * 0.6} 36 ${width * 0.9} 38`} strokeWidth={4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} opacity={0.6} />
    </g>
  </svg>
);

// 붓으로 그은 둥근 테 (편 번호를 감싸는 인장 느낌)
const Ring = ({ p, cx, cy, r }: { p: number; cx: number; cy: number; r: number }) => (
  <svg width={r * 2 + 60} height={r * 2 + 60} style={{ position: "absolute", left: cx - r - 30, top: cy - r - 30, overflow: "visible", opacity: p > 0.01 ? 1 : 0 }}>
    <g filter="url(#card-brush)" fill="none" stroke={INK} strokeLinecap="round" transform={`rotate(-80 ${r + 30} ${r + 30})`}>
      <circle cx={r + 30} cy={r + 30} r={r} strokeWidth={12} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p * 0.97} />
      <circle cx={r + 30} cy={r + 30} r={r - 16} strokeWidth={3} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} opacity={0.55} />
    </g>
  </svg>
);

// 숫자를 붓으로 쓰듯: 왼쪽에서 오른쪽으로 먹이 번지며 드러남 (cx 가운데, y 글자 위)
const InkText = ({ text, size, cx, y, at, f, spacing = 0.06 }: { text: string; size: number; cx: number; y: number; at: number; f: number; spacing?: number }) => {
  const k = seg(f, at, at + 20);
  const edge = k * 130 - 15;
  const mask = `linear-gradient(90deg, #000 ${edge}%, rgba(0,0,0,0) ${edge + 15}%)`;
  return (
    <div style={{ position: "absolute", left: cx - 900, width: 1800, top: y, textAlign: "center", lineHeight: 1, WebkitMaskImage: mask, maskImage: mask }}>
      <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: size, letterSpacing: `${spacing}em`, marginRight: `-${spacing}em`, color: INK, filter: "url(#card-ink)", fontVariantNumeric: "lining-nums", opacity: 0.92, textShadow: "0 0 1px rgba(43,29,20,0.6)", display: "inline-block", transform: `translateY(${(1 - k) * 10}px)` }}>{text}</span>
    </div>
  );
};

type TitleShow = { title?: string; sub?: string; year?: number | string; part?: number; years?: string; series?: string; focus?: V3 };
// 장 카드: 왼쪽에 시리즈 상징이 서고, 오른쪽에 연도(붓 밑줄) 또는 편 번호(붓 테). 연도·편 번호가 다 있으면 편 번호는 작은 테로 위에
export const TitleCard = ({ s, frames }: { s: TitleShow; frames: number }) => {
  const f = useCurrentFrame();
  const sr = seriesOf(s.series);
  const { year, part } = titleNumbers(s);
  const [fx, fy, z] = s.focus ?? sr.focus;
  const push = interpolate(f, [0, Math.max(frames, 60)], [0, 1], clamp);
  const reveal = seg(f, 2, 50);
  const cx = year || part ? 1150 : 960; // 숫자 가운데
  const emblemX = year || part ? 470 : 960;
  return (
    <Paper>
      <SeriesMap sr={sr} empire={empireOf(sr, year)} box={zoomBox(fx, fy, z * (1.03 + 0.05 * push))} reveal={reveal} />
      <div style={{ position: "absolute", left: emblemX - 200, width: 400, top: 120, height: 840, display: "flex", justifyContent: "center", transform: `translateY(${(1 - seg(f, 0, 20)) * 14}px)` }}>
        <sr.Emblem f={f} size={840} />
      </div>
      {year && (
        <>
          {part && (
            <>
              <Ring p={seg(f, 8, 30)} cx={cx} cy={250} r={88} />
              <InkText text={roman(part)} size={104} cx={cx} y={198} at={14} f={f} spacing={0.08} />
            </>
          )}
          <InkText text={year} size={260} cx={cx} y={part ? 380 : 330} at={16} f={f} spacing={0.05} />
          <Brush p={seg(f, 26, 44)} width={720} cx={cx} y={part ? 680 : 630} />
          {s.years && <InkText text={s.years} size={64} cx={cx} y={part ? 720 : 670} at={34} f={f} spacing={0.08} />}
        </>
      )}
      {!year && part && (
        <>
          <Ring p={seg(f, 8, 34)} cx={cx} cy={520} r={230} />
          <InkText text={roman(part)} size={250} cx={cx} y={398} at={16} f={f} spacing={0.08} />
          {s.years && <InkText text={s.years} size={64} cx={cx} y={800} at={34} f={f} spacing={0.08} />}
        </>
      )}
    </Paper>
  );
};

// 점선 칸 (유튜브가 실제 버튼을 얹는 자리) - 먹으로 그려지듯
const DashBox = ({ x, y, w, h, r, p }: { x: number; y: number; w: number; h: number; r: number; p: number }) => (
  <svg style={{ position: "absolute", left: x - 10, top: y - 10, overflow: "visible" }} width={w + 20} height={h + 20}>
    <rect x={10} y={10} width={w} height={h} rx={r} fill="rgba(43,29,20,0.06)" stroke={INK} strokeOpacity={0.55} strokeWidth={5} strokeDasharray="22 16" filter="url(#card-ink)" style={{ clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }} />
  </svg>
);

// 종 (구독 알림) 아이콘
const Bell = ({ p, f }: { p: number; f: number }) => {
  const ring = Math.sin(f / 3) * 10 * Math.max(0, Math.sin((f / 50) * Math.PI)) ** 8;
  return (
    <svg viewBox="0 0 100 100" width={110} height={110} style={{ transform: `scale(${p}) rotate(${ring}deg)`, transformOrigin: "50% 10%" }}>
      <g filter="url(#card-ink)" stroke={INK} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round">
        <path d="M 50 12 C 30 12 24 30 24 48 C 24 62 18 70 12 76 L 88 76 C 82 70 76 62 76 48 C 76 30 70 12 50 12 Z" fill="#c9a24e" />
        <path d="M 40 82 C 42 92 58 92 60 82" fill="none" />
        <circle cx={50} cy={8} r={4} fill={INK} />
      </g>
    </svg>
  );
};

// 다음 편: 재생 삼각형 + 편 번호 (로마 숫자)
const NextMark = ({ p, part }: { p: number; part?: number }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28, opacity: p, transform: `translateX(${(1 - p) * -30}px)` }}>
    <svg viewBox="0 0 100 100" width={86} height={86}>
      <g filter="url(#card-ink)" stroke={INK} strokeWidth={6} strokeLinejoin="round">
        <circle cx={50} cy={50} r={44} fill="none" />
        <path d="M 40 30 L 72 50 L 40 70 Z" fill="#9a3a26" />
      </g>
    </svg>
    {part && <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 92, letterSpacing: "0.12em", color: INK, lineHeight: 1, filter: "url(#card-ink)" }}>{roman(part)}</span>}
  </div>
);

// 유튜브 최종 화면(20초): 왼쪽 다음 영상 칸(150,330 900×506) · 오른쪽 구독 칸(원 300) 자리는 그대로, 낱말 없이 아이콘만
export const EndCardArt = ({ s }: { s: { next?: string; nextPart?: number; series?: string } }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sr = seriesOf(s.series);
  const nextPart = s.nextPart ?? (s.next?.match(/PART\s+(\d+)/i) ? Number(s.next.match(/PART\s+(\d+)/i)![1]) : undefined);
  const drift = interpolate(f, [0, 20 * fps], [0, 1], clamp);
  const p = (at: number) => spring({ frame: f - at, fps, config: { damping: 15, stiffness: 120 } });
  return (
    <Paper>
      <SeriesMap sr={sr} empire={empireOf(sr)} box={zoomBox(0.5 + 0.02 * drift, 0.44, 1.12 + 0.04 * drift)} reveal={1} wash={0.7} />
      <AbsoluteFill style={{ background: "rgba(230,214,178,0.4)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 40, display: "flex", justifyContent: "center" }}>
        <sr.Emblem f={f} size={270} />
      </div>
      <DashBox x={150} y={330} w={900} h={506} r={24} p={seg(f, 6, 30)} />
      <DashBox x={1310} y={430} w={300} h={300} r={150} p={seg(f, 14, 38)} />
      <div style={{ position: "absolute", left: 150, top: 862, width: 900 }}>
        <NextMark p={p(24)} part={nextPart} />
      </div>
      <div style={{ position: "absolute", left: 1310, top: 760, width: 300, display: "flex", justifyContent: "center" }}>
        <Bell p={p(32)} f={f} />
      </div>
    </Paper>
  );
};
