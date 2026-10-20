// 유튜브 채널 배너 (2560×1440). 휴대폰에선 가운데 1546×423만 보이므로 글자는 전부 그 안에
// 배경 = 사이트 지도 1279년(몽골 제국 최대) 유라시아 - scripts/clean.mjs banner3
// 시안: color(사이트 지도 색 그대로) · night(밤바다 남색 + 금색) · parchment(밝은 양피지)
import { AbsoluteFill, Img, staticFile } from "remotion";

const W = 2560;
const H = 1440;
const SERIF = "Baskerville, 'Big Caslon', 'Hoefler Text', serif";

export type BannerStyle = "color" | "night" | "parchment";

const LOOK: Record<BannerStyle, { filter: string; edge: string; band: string; title: string; sub: string; small: string; shadow: string }> = {
  color: {
    filter: "saturate(1.15) contrast(1.05)",
    edge: "rgba(30,45,60,0.55)",
    band: "rgba(255,253,247,0.86)",
    title: "#2b2418",
    sub: "#6f6450",
    small: "#c2410c",
    shadow: "none",
  },
  night: {
    filter: "invert(1) hue-rotate(180deg) saturate(1.4) brightness(1.6) contrast(1.05)",
    edge: "rgba(5,10,22,0.85)",
    band: "rgba(8,14,28,0.55)",
    title: "linear-gradient(180deg, #fff4d6 0%, #f1d595 55%, #c99a48 100%)",
    sub: "#e8e1cf",
    small: "#e3c27a",
    shadow: "drop-shadow(0 4px 14px rgba(0,0,0,0.7))",
  },
  parchment: {
    filter: "sepia(0.55) saturate(1.1) contrast(1.15) brightness(0.98)",
    edge: "rgba(90,60,25,0.55)",
    band: "rgba(250,240,215,0.7)",
    title: "#3b2a14",
    sub: "#6b5232",
    small: "#9a3412",
    shadow: "none",
  },
};

export const Banner = ({ look = "night" }: { look?: BannerStyle }) => {
  const L = LOOK[look];
  const gradientTitle = L.title.startsWith("linear");
  return (
    <AbsoluteFill style={{ background: "#14110c" }}>
      <Img src={staticFile("clean/banner3/1279-nonames.png")} style={{ position: "absolute", inset: 0, width: W, height: H, filter: L.filter }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 65% 75% at 50% 50%, rgba(0,0,0,0) 45%, ${L.edge} 100%)` }} />
      {/* 글자 뒤 부드러운 띠 */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 760px 230px at 50% 50%, ${L.band}, rgba(0,0,0,0) 100%)` }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: SERIF }}>
        <div style={{ color: L.small, fontSize: 24, letterSpacing: 10, fontWeight: 700 }}>EMPIRES · WARS · DYNASTIES</div>
        <div
          style={{
            fontSize: 92,
            fontWeight: 600,
            letterSpacing: 6,
            lineHeight: 1.1,
            margin: "10px 0 6px",
            filter: L.shadow,
            ...(gradientTitle ? { background: L.title, WebkitBackgroundClip: "text", color: "transparent" } : { color: L.title }),
          }}
        >
          RESTORY WORLDS MAP
        </div>
        <div style={{ color: L.sub, fontSize: 38, fontStyle: "italic" }}>World history, told on the map</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
