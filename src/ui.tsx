// 색·글꼴·움직임 부품. 색은 사이트 globals.css의 일반 테마 기준
import { CSSProperties, ReactNode, useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export const C = {
  paper: "#faf6ec",
  surface: "#fffdf7",
  ink: "#2b2418",
  muted: "#6f6450",
  line: "#e4dcc8",
  chip: "#efe7d4",
  accent: "#c2410c",
  ocean: "#cfe6f2",
};

// 인스타 단추가 덮는 자리 (위 250 · 아래 380 · 오른쪽 120)에는 글자를 두지 않는다
export const SAFE = { top: 250, bottom: 380, side: 80, right: 120 };

export const FONT = "Paperlogy";

export const useFonts = () => {
  const [handle] = useState(() => delayRender("폰트 불러오기"));
  useEffect(() => {
    const faces = [
      new FontFace(FONT, `url(${staticFile("fonts/Paperlogy-7Bold.woff2")})`, { weight: "700" }),
      new FontFace(FONT, `url(${staticFile("fonts/Paperlogy-8ExtraBold.woff2")})`, { weight: "800" }),
    ];
    Promise.all(faces.map((f) => f.load().then(() => document.fonts.add(f)))).then(() => continueRender(handle));
  }, [handle]);
};

// 0 → 1로 튀어 오르는 값. 0.3초 안에 자리 잡게
export const usePop = (delay: number, stiff = 180) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: stiff, mass: 0.6 } });
};

export const Pop = ({ delay, children, style }: { delay: number; children: ReactNode; style?: CSSProperties }) => {
  const p = usePop(delay);
  return <div style={{ transform: `scale(${p})`, opacity: Math.min(1, p * 2), ...style }}>{children}</div>;
};

export const Fly = ({ delay, children, style }: { delay: number; children: ReactNode; style?: CSSProperties }) => {
  const p = usePop(delay, 140);
  return (
    <div style={{ transform: `translateX(${(1 - p) * 700}px) rotate(${(1 - p) * 8}deg)`, opacity: Math.min(1, p * 1.5), ...style }}>
      {children}
    </div>
  );
};

// 종이 바탕 + 느리게 움직이는 위경도선
export const Background = () => {
  const frame = useCurrentFrame();
  const shift = (frame * 0.6) % 120;
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(rgba(60,110,150,0.10) 2px, transparent 2px), linear-gradient(90deg, rgba(60,110,150,0.10) 2px, transparent 2px)`,
          backgroundSize: "120px 120px",
          backgroundPosition: `${shift}px ${shift / 2}px`,
        }}
      />
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 55%, transparent 40%, rgba(194,65,12,0.08))` }} />
    </AbsoluteFill>
  );
};

// 휴대폰 틀. 화면 비율은 캡처(390×844)와 같다
export const PHONE_W = 600;
export const PHONE_H = Math.round((PHONE_W * 844) / 390);

export const Phone = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      width: PHONE_W + 28,
      height: PHONE_H + 28,
      padding: 14,
      borderRadius: 86,
      background: C.ink,
      boxShadow: "0 50px 90px -40px rgba(43,36,24,0.7)",
      ...style,
    }}
  >
    <div style={{ position: "relative", width: PHONE_W, height: PHONE_H, borderRadius: 72, overflow: "hidden", background: C.ocean }}>
      {children}
    </div>
  </div>
);
