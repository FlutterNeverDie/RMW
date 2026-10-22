// 유튜브 채널 배너 (2560×1440) - 2026-10-22 채널 ReStory Worlds (지도 정체성 뺌)
// 휴대폰에선 가운데 1546×423(y 508~931)만 보이므로 글자·그림은 전부 그 띠 안에
//   cine: 시네마틱 초원 위 시대의 행렬 실루엣 · ink: 종이 위 먹선 병사 행렬(군단병 → 기마 궁수 → 머스킷병 → 2차대전 보병 → 전차) · art: 고대~현대 옛 그림·사진을 찢은 종이처럼(퍼블릭 도메인)
// 고대부터 현대 전쟁까지 다루는 채널이라 한 시대에 묶이지 않게 (2026-10-22 사용자)
import { AbsoluteFill, Img, staticFile } from "remotion";
import { EraFigure } from "./EraFigures";
import { HorseArcher, INK, shade } from "./HorseArcher";

const SERIF = "Baskerville, 'Big Caslon', 'Hoefler Text', serif";
const CREAM = "#f6ecd6";

const SCALE_ART = 0.97;

export type BannerStyle = "cine" | "ink" | "art";

const Title = ({ color, sub, small, glow, size = 104 }: { color: string; sub: string; small: string; glow?: string; size?: number }) => (
  <div style={{ textAlign: "center", fontFamily: SERIF, whiteSpace: "nowrap", filter: glow ? `drop-shadow(0 3px 18px ${glow})` : undefined }}>
    <div style={{ color: small, fontSize: 24, letterSpacing: 10, fontWeight: 700 }}>EMPIRES · WARS · DYNASTIES</div>
    <div style={{ color, fontSize: size, fontWeight: 600, letterSpacing: 8, lineHeight: 1.1, margin: "8px 0 4px" }}>RESTORY WORLDS</div>
    <div style={{ color: sub, fontSize: 38, fontStyle: "italic" }}>World history, retold</div>
  </div>
);

// 종이 결
const Grain = ({ opacity = 0.16, id }: { opacity?: number; id: string }) => (
  <AbsoluteFill>
    <svg width="100%" height="100%">
      <filter id={id}>
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" seed="5" />
        <feColorMatrix values={`0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0 0.12  0 0 0 ${opacity} 0`} />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  </AbsoluteFill>
);

// 찢은 종이 가장자리 (위·아래가 들쭉날쭉한 다각형) - 같은 seed면 같은 모양
function torn(w: number, h: number, seed: number, jag = 16) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const top: string[] = [];
  const bot: string[] = [];
  for (let x = 0; x <= w; x += 22) top.push(`${x},${rnd() * jag}`);
  for (let x = w; x >= 0; x -= 22) bot.push(`${x},${h - rnd() * jag}`);
  return `polygon(${[...top, ...bot].map((p) => p.split(",").map((v) => `${v}px`).join(" ")).join(",")})`;
}

const ART: { src: string; w: number; pos: string; rot: number; color?: boolean }[] = [
  { src: "art/brand/alexander-mosaic.jpg", w: 520, pos: "35% 50%", rot: -2 },
  { src: "art/mongol/mongol-horde.jpg", w: 380, pos: "50% 55%", rot: 1.5 },
  { src: "art/mongol/homage-genghis.jpg", w: 520, pos: "50% 45%", rot: -1 },
  { src: "art/brand/napoleon-alps.jpg", w: 380, pos: "50% 35%", rot: 2 },
  { src: "art/brand/shermans-st-vith-1944.jpg", w: 520, pos: "62% 55%", rot: -1.5, color: true }, // 2차대전은 컬러 그대로 (1944~45 겨울 벌지 전투, 생비트 근처 셔먼 전차)
];


// 시대의 행렬: 왼쪽(고대)에서 오른쪽(현대)으로. 높이 h = 보병 키
const March = ({ left, bottom, h, gap, mono, opacity = 1 }: { left: number; bottom: number; h: number; gap: number; mono?: string; opacity?: number }) => {
  const w = h * (160 / 270);
  const items: { el: React.ReactNode; w: number }[] = [
    { el: <EraFigure era="legion" mono={mono} style={{ width: w }} />, w },
    { el: <HorseArcher dust={false} mono={mono} style={{ width: h * 1.55 }} />, w: h * 1.55 },
    { el: <EraFigure era="musket" mono={mono} style={{ width: w }} />, w },
    { el: <EraFigure era="ww2" mono={mono} style={{ width: w }} />, w },
    { el: <EraFigure era="tank" mono={mono} style={{ width: h * 1.5 }} />, w: h * 1.5 },
  ];
  return (
    <div style={{ position: "absolute", left, bottom, display: "flex", alignItems: "flex-end", gap, opacity }}>
      {items.map((it, i) => (
        <div key={i} style={{ width: it.w, display: "flex", alignItems: "flex-end" }}>{it.el}</div>
      ))}
    </div>
  );
};

export const Banner = ({ look = "cine" }: { look?: BannerStyle }) => {
  if (look === "ink")
    return (
      <AbsoluteFill style={{ background: "#ecdfc2" }}>
        {/* 붓으로 칠한 먼 산과 초원 (띠 안쪽 아래) */}
        <svg viewBox="0 0 2560 1440" style={{ position: "absolute", inset: 0 }}>
          <path d="M 0 860 L 220 800 L 380 835 L 600 770 L 820 830 L 1040 790 L 1300 840 L 1520 780 L 1760 835 L 1980 790 L 2220 840 L 2560 800 L 2560 1440 L 0 1440 Z" fill="#cdb98f" opacity={0.6} />
          <path d="M 0 900 C 600 870 1500 890 2560 868 L 2560 1440 L 0 1440 Z" fill="#d8c393" />
          <circle cx={2160} cy={600} r={64} fill="#d9653f" opacity={0.3} />
        </svg>
        <Grain id="g1" opacity={0.2} />
        {/* 시대의 행렬 (띠 아래쪽) */}
        <March left={730} bottom={1440 - 925} h={190} gap={46} />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 240 }}>
          <Title color={INK} sub="#6f5a3e" small="#9b2f22" />
        </AbsoluteFill>
        <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 80% at 50% 50%, rgba(0,0,0,0) 55%, rgba(70,45,20,0.35) 100%)" }} />
      </AbsoluteFill>
    );
  if (look === "art") {
    // 휴대폰 띠(가로 1546) 안에 다섯 시대가 다 보이게: 위에 제목 종이, 아래에 그림 다섯 장을 나란히
    const W1 = 340, H1 = 270, GAP = 24;
    const x0 = (2560 - (ART.length * W1 - (ART.length - 1) * GAP)) / 2;
    return (
      <AbsoluteFill style={{ background: "#e6d6b4" }}>
        <Grain id="g2" opacity={0.22} />
        {/* 제목 종이 + 그림 줄 묶음: 3% 줄이고 휴대폰 띠(y 508~931) 가운데로 (2026-10-22 사용자: 위아래가 살짝 잘림) */}
        <AbsoluteFill style={{ transform: `translateY(${720 - 709}px) scale(${SCALE_ART})`, transformOrigin: "50% 709px" }}>
        {ART.map((a, i) => (
          <div key={i} style={{ position: "absolute", left: x0 + i * (W1 - GAP), top: 662, width: W1, height: H1, transform: `rotate(${a.rot}deg)`, filter: "drop-shadow(0 8px 14px rgba(40,25,10,0.45))" }}>
            <div style={{ width: "100%", height: "100%", clipPath: torn(W1, H1, 17 + i * 31, 12), background: "#f3e7cc", padding: 9, boxSizing: "border-box" }}>
              <Img src={staticFile(a.src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: a.pos, filter: a.color ? "saturate(1.05) contrast(1.03)" : "sepia(0.35) saturate(0.85) contrast(1.05)" }} />
            </div>
          </div>
        ))}
        {/* 제목 종이 (그림 줄 위쪽에 살짝 겹침) */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 486, display: "flex", justifyContent: "center" }}>
          <div style={{ filter: "drop-shadow(0 10px 18px rgba(40,25,10,0.5))", transform: "rotate(-0.6deg)" }}>
            <div style={{ clipPath: torn(1080, 220, 99, 16), background: CREAM, width: 1080, height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Title color={INK} sub="#6f5a3e" small="#9b2f22" size={92} />
            </div>
          </div>
        </div>
        </AbsoluteFill>
        <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 80% at 50% 50%, rgba(0,0,0,0) 55%, rgba(60,40,15,0.4) 100%)" }} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: "#2a2018" }}>
      <Img src={staticFile("brand/steppe.jpg")} style={{ position: "absolute", width: 2560, height: 1440, objectFit: "cover", objectPosition: "50% 40%" }} />
      {/* 제목 뒤 하늘을 살짝 어둡게 + 가장자리 비네트 */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 900px 300px at 50% 50%, rgba(30,20,10,0.45), rgba(0,0,0,0) 100%)" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 80% at 50% 50%, rgba(0,0,0,0) 50%, rgba(20,12,5,0.55) 100%)" }} />
      <March left={798} bottom={1440 - 925} h={150} gap={60} mono="#2a1d12" opacity={0.82} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 140 }}>
        <Title color={CREAM} sub={shade(CREAM, 0.9)} small="#f0c27a" glow="rgba(0,0,0,0.6)" />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
