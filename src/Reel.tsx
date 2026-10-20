// 한 편 = 휴대폰 속 실제 사이트 화면 + 위쪽 큰 글자. 장면 경계·강조음 위치는 timeline.json
import { AbsoluteFill, Audio, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import tl from "../timeline.json";
import enDemo from "../public/demo/en/manifest.json";
import koDemo from "../public/demo/ko/manifest.json";
import jaDemo from "../public/demo/ja/manifest.json";
import zhDemo from "../public/demo/zh/manifest.json";
import { COPY, Locale, Shot } from "./copy";
import { Background, C, PHONE_H, PHONE_W, Phone, Pop, SAFE, usePop, useFonts } from "./ui";

const [, LAPSE, DEMO, MAPS, CTA] = tl.scenes;
const SHOT = tl.shotFrames;
const MAP = tl.mapFrames;
// 타임랩스는 휙 지나가므로 섞는 시간도 짧게
const FADE = 4;
const PHONE_TOP = 540;

// scripts/record.mjs가 남긴 녹화 프레임(시각별 jpg)과 탭 위치
type Demo = { viewport: number[]; frames: { t: number; file: string }[]; taps: { t: number; x: number; y: number; label: string }[] };
const DEMOS: Record<Locale, Demo> = { en: enDemo, ko: koDemo, ja: jaDemo, zh: zhDemo };

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const ShotImg = ({
  locale,
  file,
  opacity = 1,
  zoom = 1,
  x = 0,
  blur = 0,
}: {
  locale: Locale;
  file: string;
  opacity?: number;
  zoom?: number;
  x?: number;
  blur?: number;
}) => (
  <Img
    src={staticFile(`shots/${locale}/${file}.png`)}
    style={{
      position: "absolute",
      inset: 0,
      width: PHONE_W,
      height: PHONE_H,
      opacity,
      transform: `translateX(${x}px) scale(${zoom})`,
      filter: blur ? `blur(${blur}px)` : undefined,
    }}
  />
);

// 첫 장면 → 타임랩스 → (시연은 따로) → 지도 종류
const MapScreen = ({ locale, frame }: { locale: Locale; frame: number }) => {
  const c = COPY[locale];
  const peak: Shot = { file: c.peak, year: "" };
  if (frame < LAPSE.from) {
    // 1942년 지도에 천천히 다가간다
    return <ShotImg locale={locale} file={peak.file} zoom={1 + frame * 0.0015} />;
  }
  if (frame < DEMO.from) {
    // 바람에 밀려가듯: 새 지도가 오른쪽에서 흐릿하게 밀려 들어와 자리 잡는다
    const i = Math.min(c.shots.length - 1, Math.floor((frame - LAPSE.from) / SHOT));
    const local = frame - LAPSE.from - i * SHOT;
    const prev = i === 0 ? peak : c.shots[i - 1];
    const k = Math.min(1, local / FADE);
    // 바람이 가장 셀 때(가운데) 더 흐릿하게
    const gust = Math.sin(Math.PI * interpolate(frame, [LAPSE.from, DEMO.from], [0, 1], clamp));
    return (
      <>
        <ShotImg locale={locale} file={prev.file} x={-60 * k} blur={1 + 3 * gust * k} zoom={1.02} />
        <ShotImg locale={locale} file={c.shots[i].file} opacity={k} x={70 * (1 - k)} blur={(1 - k) * 6 + gust * 0.8} zoom={1.02} />
      </>
    );
  }
  // 지도 종류: 카드 넘기듯 옆으로 밀어 바꾼다
  const i = Math.min(c.maps.length - 1, Math.floor((frame - MAPS.from) / MAP));
  const local = frame - MAPS.from - i * MAP;
  const k = interpolate(local, [0, 8], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  const prev = i === 0 ? null : c.maps[i - 1].file;
  return (
    <>
      {prev && <ShotImg locale={locale} file={prev} x={-PHONE_W * k} />}
      <ShotImg locale={locale} file={c.maps[i].file} x={i === 0 ? 0 : PHONE_W * (1 - k)} opacity={i === 0 ? k : 1} zoom={1 + local * 0.001} />
    </>
  );
};

// 녹화 화면: 지금 시각 직전의 프레임을 보여 주고, 탭한 자리에 손가락 표시
const DemoScreen = ({ locale, frame }: { locale: Locale; frame: number }) => {
  const d = DEMOS[locale];
  const t = (frame - DEMO.from) / tl.fps;
  let cur = d.frames[0];
  for (const f of d.frames) {
    if (f.t > t) break;
    cur = f;
  }
  const scale = PHONE_W / d.viewport[0];
  return (
    <>
      <Img src={staticFile(`demo/${locale}/${cur.file}`)} style={{ position: "absolute", inset: 0, width: PHONE_W, height: PHONE_H }} />
      {d.taps.map((tap) => {
        const dt = t - tap.t;
        // 누르기 0.35초 전에 손가락이 나타나 누르고, 0.5초 동안 물결이 퍼진다
        if (dt < -0.35 || dt > 0.5) return null;
        const press = dt < 0 ? 1 + (-dt / 0.35) * 0.4 : 1;
        const ring = Math.max(0, dt) / 0.5;
        return (
          <div key={tap.t} style={{ position: "absolute", left: tap.x * scale, top: tap.y * scale }}>
            <div
              style={{
                position: "absolute",
                left: -60 * (0.4 + ring),
                top: -60 * (0.4 + ring),
                width: 120 * (0.4 + ring),
                height: 120 * (0.4 + ring),
                borderRadius: "50%",
                border: `6px solid ${C.accent}`,
                opacity: dt < 0 ? 0 : 1 - ring,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: -32,
                top: -32,
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(43,36,24,0.35)",
                border: "4px solid white",
                transform: `scale(${press})`,
                opacity: dt > 0.25 ? 1 - (dt - 0.25) / 0.25 : 1,
              }}
            />
          </div>
        );
      })}
    </>
  );
};

// 바람 줄기: 타임랩스 동안 화면을 가로지르는 가는 선과 먼지. 위치는 프레임으로만 정해 렌더마다 같다
const STREAKS = Array.from({ length: 26 }, (_, i) => ({
  y: (i * 733) % 1920,
  len: 180 + ((i * 97) % 420),
  speed: 70 + ((i * 53) % 90),
  offset: (i * 389) % 1600,
  thick: 2 + (i % 3),
}));

const Wind = ({ frame }: { frame: number }) => {
  const t = frame - LAPSE.from + 6;
  const strength = Math.sin(Math.PI * interpolate(frame, [LAPSE.from - 6, DEMO.from + 4], [0, 1], clamp));
  if (strength <= 0) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: strength }}>
      {STREAKS.map((s, i) => {
        const x = ((s.offset + t * s.speed) % 2400) - s.len - 300;
        const dark = i % 4 === 0;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: s.y + Math.sin((t + i * 7) / 9) * 30,
              width: s.len,
              height: s.thick,
              borderRadius: s.thick,
              background: dark
                ? `linear-gradient(90deg, transparent, rgba(194,65,12,0.45), transparent)`
                : `linear-gradient(90deg, transparent, rgba(111,100,80,0.5), transparent)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const Top = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      position: "absolute",
      top: SAFE.top + 20,
      left: SAFE.side,
      right: SAFE.side,
      height: PHONE_TOP - SAFE.top - 40,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
    }}
  >
    {children}
  </div>
);

const TwoLines = ({ a, b, delay, locale }: { a: string; b: string; delay: number; locale: Locale }) => (
  <Top>
    <Pop delay={delay}>
      <div style={{ color: C.ink, fontSize: 70, fontWeight: 800, letterSpacing: -1.5 }}>{a}</div>
    </Pop>
    <Pop delay={delay + 12} style={{ marginTop: 10 }}>
      <div style={{ color: C.accent, fontSize: locale === "en" ? 84 : 78, fontWeight: 800, letterSpacing: -2 }}>{b}</div>
    </Pop>
  </Top>
);

const YearText = ({ locale, frame }: { locale: Locale; frame: number }) => {
  const c = COPY[locale];
  const i = Math.min(c.shots.length - 1, Math.floor((frame - LAPSE.from) / SHOT));
  const local = frame - LAPSE.from - i * SHOT;
  const progress = interpolate(frame, [LAPSE.from, LAPSE.from + (c.shots.length - 1) * SHOT + FADE], [0, 1], clamp);
  return (
    <Top>
      {/* 연도도 바람에 밀려 들어온다 */}
      <div
        style={{
          color: C.ink,
          fontSize: locale === "en" ? 128 : 112,
          fontWeight: 800,
          letterSpacing: -3,
          lineHeight: 1,
          transform: `translateX(${Math.max(0, 1 - local / 3) * 50}px)`,
          opacity: Math.min(1, 0.4 + local / 3),
          filter: local < 2 ? "blur(3px)" : undefined,
        }}
      >
        {c.shots[i].year}
      </div>
      <div style={{ color: C.accent, fontSize: 46, fontWeight: 800, marginTop: 14, height: 56 }}>{c.timelapse}</div>
      {/* 사이트 하단 슬라이더를 닮은 진행 막대 */}
      <div style={{ position: "relative", width: 760, height: 12, borderRadius: 6, background: C.line, marginTop: 22 }}>
        <div style={{ width: 760 * progress, height: 12, borderRadius: 6, background: C.accent }} />
        <div
          style={{
            position: "absolute",
            left: 760 * progress - 20,
            top: -14,
            width: 40,
            height: 40,
            borderRadius: 20,
            background: C.surface,
            border: `6px solid ${C.accent}`,
            boxSizing: "border-box",
          }}
        />
      </div>
    </Top>
  );
};

// 시연 위 글자: "자세히" 탭 전후로 바뀐다
const DemoText = ({ locale, frame }: { locale: Locale; frame: number }) => {
  const [a, b] = COPY[locale].demo;
  const more = DEMOS[locale].taps.find((t) => t.label === "more")!;
  const switchAt = DEMO.from + Math.round(more.t * tl.fps);
  const before = frame < switchAt;
  const local = frame - (before ? DEMO.from : switchAt);
  return (
    <Top>
      <div
        style={{
          color: before ? C.ink : C.accent,
          fontSize: 92,
          fontWeight: 800,
          letterSpacing: -2,
          transform: `translateY(${Math.max(0, 1 - local / 8) * 40}px)`,
          opacity: Math.min(1, local / 6),
        }}
      >
        {before ? a : b}
      </div>
    </Top>
  );
};

// 지도 종류 위 글자: 지도가 바뀔 때마다 제목과 한 줄이 함께 바뀐다
const MapsText = ({ locale, frame }: { locale: Locale; frame: number }) => {
  const maps = COPY[locale].maps;
  const i = Math.min(maps.length - 1, Math.floor((frame - MAPS.from) / MAP));
  const local = frame - MAPS.from - i * MAP;
  const k = Math.min(1, local / 6);
  return (
    <Top>
      <div style={{ transform: `translateX(${(1 - k) * 80}px)`, opacity: k }}>
        <div style={{ color: C.ink, fontSize: 104, fontWeight: 800, letterSpacing: -2.5, lineHeight: 1.05 }}>{maps[i].title}</div>
        <div style={{ color: C.accent, fontSize: 48, fontWeight: 800, marginTop: 16 }}>{maps[i].sub}</div>
      </div>
    </Top>
  );
};

const Cta = ({ locale }: { locale: Locale }) => {
  const c = COPY[locale];
  const url = usePop(CTA.from + 42, 260);
  return (
    <div
      style={{
        position: "absolute",
        top: SAFE.top + 60,
        bottom: SAFE.bottom + 40,
        left: SAFE.side,
        right: SAFE.side,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <Pop delay={CTA.from + 8}>
        <Img src={staticFile("brand/icon.png")} style={{ width: 280, borderRadius: 64, boxShadow: "0 30px 60px -30px rgba(43,36,24,0.6)" }} />
      </Pop>
      <Pop delay={CTA.from + 18} style={{ marginTop: 50 }}>
        <div style={{ color: C.ink, fontSize: 92, fontWeight: 800, letterSpacing: -2 }}>{c.siteName}</div>
      </Pop>
      <div
        style={{
          marginTop: 40,
          transform: `scale(${1.5 - 0.5 * url})`,
          opacity: Math.min(1, url * 2),
          background: C.accent,
          color: "white",
          borderRadius: 999,
          padding: "26px 52px",
          fontSize: 66,
          fontWeight: 800,
          letterSpacing: -1,
        }}
      >
        {c.url}
      </div>
      <Pop delay={CTA.from + 60} style={{ marginTop: 44 }}>
        <div style={{ color: C.ink, fontSize: 50, fontWeight: 800 }}>{c.free}</div>
        <div style={{ color: C.muted, fontSize: 44, fontWeight: 700, marginTop: 16 }}>{c.cta}</div>
      </Pop>
    </div>
  );
};

export const Reel = ({ locale }: { locale: Locale }) => {
  useFonts();
  const frame = useCurrentFrame();
  const c = COPY[locale];
  // 휴대폰: 첫 프레임부터 1942년 지도가 꽉 차 있게 제자리에 두고, 마지막 장면에서 아래로 빠진다
  const out = interpolate(frame, [CTA.from, CTA.from + 14], [0, 1], clamp);
  // 타임랩스 동안은 바람에 흔들리듯 살짝 떤다
  const lapse = frame >= LAPSE.from && frame < DEMO.from;
  const shake = lapse ? Math.sin(frame * 1.7) * 3 : 0;
  const phoneY = out * 1400;
  const inDemo = frame >= DEMO.from && frame < MAPS.from;
  return (
    <AbsoluteFill style={{ fontFamily: c.font, wordBreak: "keep-all" }}>
      <Background />
      <div
        style={{
          position: "absolute",
          left: (1080 - PHONE_W - 28) / 2,
          top: PHONE_TOP,
          transform: `translate(${shake}px, ${phoneY}px) rotate(${out * 8 + shake * 0.08}deg)`,
        }}
      >
        <Phone>{inDemo ? <DemoScreen locale={locale} frame={frame} /> : <MapScreen locale={locale} frame={frame} />}</Phone>
      </div>
      <Wind frame={frame} />
      {frame < LAPSE.from && <TwoLines a={c.hook[0]} b={c.hook[1]} delay={0} locale={locale} />}
      {lapse && <YearText locale={locale} frame={frame} />}
      {inDemo && <DemoText locale={locale} frame={frame} />}
      {frame >= MAPS.from && frame < CTA.from && <MapsText locale={locale} frame={frame} />}
      {frame >= CTA.from && <Cta locale={locale} />}
      {/* 소리는 언어마다 따로(시연 탭 시각이 달라서) - audio/make_audio.py */}
      <Audio src={staticFile(`sfx/mix-${locale}.wav`)} />
    </AbsoluteFill>
  );
};
