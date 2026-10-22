// 시대별 병사 (채널 상징 - 고대부터 현대까지): 로마 군단병 · 머스킷병(나폴레옹 시대) · 2차대전 보병 · 전차
// 기마 궁수(HorseArcher)와 같은 그림체 - 흔들리는 먹선, 바랜 물감 색, 종이 질감. 모두 오른쪽으로 걷는다. 보병 viewBox 160×240(발 y 228), 전차 360×200
import { useId } from "react";
import { INK, shade } from "./HorseArcher";

export type Era = "legion" | "musket" | "ww2" | "tank";

const Look = ({ id }: { id: string }) => (
  <defs>
    <filter id={`ink${id}`} filterUnits="userSpaceOnUse" x={-20} y={-20} width={420} height={300}>
      <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="3" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" />
    </filter>
    <filter id={`paper${id}`} filterUnits="userSpaceOnUse" x={-20} y={-20} width={420} height={300}>
      <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="3" seed="7" result="t" />
      <feColorMatrix in="t" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.33  0 0 0 0 0.2  0 0 0 0.45 0" result="tc" />
      <feComposite in="tc" in2="SourceAlpha" operator="in" result="tx" />
      <feBlend in="SourceGraphic" in2="tx" mode="multiply" />
    </filter>
  </defs>
);

const SKIN = "#e2b48a";

// 걷는 다리 두 개 + 신발 (뒷다리 먼저, 어둡게)
const Legs = ({ pants, boot, mono }: { pants: string; boot: string; mono?: string }) => (
  <>
    <path d="M 72 150 L 60 196 L 52 220 L 66 222 L 76 198 L 88 152 Z" fill={mono ?? shade(pants, 0.75)} />
    <path d="M 48 216 L 70 216 L 72 228 L 42 228 Z" fill={mono ?? boot} />
    <path d="M 84 150 L 96 194 L 104 218 L 90 222 L 80 198 L 70 152 Z" fill={mono ?? pants} />
    <path d="M 88 216 L 110 214 L 116 228 L 88 228 Z" fill={mono ?? boot} />
  </>
);

const Head = ({ mono }: { mono?: string }) => (
  <>
    <circle cx={84} cy={66} r={20} fill={mono ?? SKIN} />
    {!mono && <circle cx={94} cy={64} r={2.4} fill={INK} stroke="none" />}
  </>
);

function body(era: Exclude<Era, "tank">, m?: string) {
  const c = (x: string) => m ?? x;
  if (era === "legion")
    return (
      <>
        {/* 투창(필룸) 뒤로 세움 */}
        <path d="M 112 228 L 120 18" fill="none" stroke={c("#6b4423")} strokeWidth={6} />
        <path d="M 120 18 L 116 34 L 124 34 Z" fill={c("#9a9c98")} />
        <Legs pants={SKIN} boot="#6b4423" mono={m} />
        {/* 붉은 튜닉 치마 + 미늘 갑옷 */}
        <path d="M 58 140 L 106 140 L 112 168 L 52 168 Z" fill={c("#9b3a2b")} />
        <path d="M 60 92 C 64 84 100 84 106 92 L 108 146 L 58 146 Z" fill={c("#a9aba6")} />
        {!m && <path d="M 60 104 L 106 104 M 60 116 L 107 116 M 59 128 L 107 128" fill="none" strokeWidth={3} />}
        <Head mono={m} />
        {/* 투구(갈레아) + 붉은 볏 */}
        <path d="M 62 58 C 60 34 106 32 106 54 L 104 58 L 64 62 Z" fill={c("#b08a4a")} />
        <path d="M 68 38 C 72 22 98 20 104 34 C 94 30 78 30 68 38 Z" fill={c("#9b2f22")} />
        <path d="M 66 60 L 66 84 L 74 80 L 72 60 Z" fill={c("#b08a4a")} />
        {/* 큰 방패(스쿠툼) 앞에 */}
        <path d="M 88 92 C 104 90 120 92 128 96 L 128 176 C 120 180 104 182 88 180 Z" fill={c("#9b3a2b")} />
        {!m && <path d="M 108 98 L 108 174 M 96 136 L 122 136" fill="none" stroke="#d9b45a" strokeWidth={5} />}
        {!m && <circle cx={108} cy={136} r={7} fill="#d9b45a" />}
      </>
    );
  if (era === "musket")
    return (
      <>
        {/* 어깨에 멘 머스킷 + 총검 */}
        <path d="M 112 150 L 70 4" fill="none" stroke={c("#6b4423")} strokeWidth={8} />
        <path d="M 70 4 L 62 -26" fill="none" stroke={c("#9a9c98")} strokeWidth={3} />
        <Legs pants="#e8dfcb" boot="#2b2018" mono={m} />
        {/* 푸른 군복 + 흰 엇맨 띠 */}
        <path d="M 58 96 C 62 86 102 86 106 96 L 110 160 L 92 150 L 74 150 L 56 160 Z" fill={c("#33466a")} />
        {!m && <path d="M 62 96 L 104 148 M 104 96 L 62 148" fill="none" stroke="#efe7d4" strokeWidth={6} />}
        <path d="M 56 154 L 70 150 L 66 168 L 54 166 Z M 110 154 L 96 150 L 100 168 L 112 166 Z" fill={c("#33466a")} />
        <Head mono={m} />
        {/* 샤코 모자 */}
        <path d="M 66 52 L 64 22 L 104 20 L 102 52 Z" fill={c("#2b2018")} />
        <path d="M 62 52 L 108 52 L 110 58 L 60 58 Z" fill={c("#2b2018")} />
        {!m && <circle cx={84} cy={30} r={5} fill="#d9b45a" />}
        {!m && <path d="M 82 20 C 80 10 88 4 86 0" fill="none" stroke="#9b2f22" strokeWidth={6} />}
        <path d="M 96 100 C 104 112 104 128 100 140" fill="none" stroke={m ?? INK} strokeWidth={14} />
        <path d="M 96 100 C 104 112 104 128 100 140" fill="none" stroke={c("#33466a")} strokeWidth={8} />
        <circle cx={100} cy={142} r={6} fill={c(SKIN)} strokeWidth={3} />
      </>
    );
  return (
    <>
      <Legs pants="#6b6a45" boot="#3b2a1e" mono={m} />
      {/* 배낭 */}
      <path d="M 50 96 L 62 92 L 64 140 L 50 142 Z" fill={c("#5a5a3a")} />
      {/* 올리브 군복 */}
      <path d="M 60 94 C 64 86 100 86 106 94 L 108 156 L 58 156 Z" fill={c("#7a7850")} />
      {!m && <path d="M 58 140 L 108 140" fill="none" stroke="#5a5034" strokeWidth={7} />}
      <Head mono={m} />
      {/* M1 철모 */}
      <path d="M 62 62 C 60 38 108 36 108 60 Z" fill={c("#6b6a45")} />
      <path d="M 56 62 C 70 58 100 58 114 62 L 112 68 L 58 68 Z" fill={c("#6b6a45")} />
      {!m && <path d="M 70 68 C 72 80 80 86 90 86" fill="none" strokeWidth={2.5} />}
      {/* 비스듬히 든 소총 */}
      <path d="M 58 150 L 134 66" fill="none" stroke={c("#6b4423")} strokeWidth={9} />
      <path d="M 108 96 L 142 58" fill="none" stroke={c("#4a4a48")} strokeWidth={5} />
      <path d="M 72 108 C 86 112 96 112 108 104" fill="none" stroke={m ?? INK} strokeWidth={14} />
      <path d="M 72 108 C 86 112 96 112 108 104" fill="none" stroke={c("#7a7850")} strokeWidth={8} />
      <circle cx={110} cy={102} r={6} fill={c(SKIN)} strokeWidth={3} />
    </>
  );
}

const Tank = ({ m }: { m?: string }) => {
  const c = (x: string) => m ?? x;
  return (
    <>
      {/* 궤도 */}
      <path d="M 40 150 C 30 150 26 176 44 184 L 300 184 C 318 176 316 150 304 150 Z" fill={c("#4a463a")} />
      {!m && [70, 110, 150, 190, 230, 270].map((x) => <circle key={x} cx={x} cy={168} r={13} fill="#7a765e" strokeWidth={4} />)}
      {/* 차체 */}
      <path d="M 30 150 L 50 112 L 300 112 L 322 150 Z" fill={c("#7a7850")} />
      {/* 포탑 + 포 */}
      <path d="M 120 112 C 124 82 150 70 186 70 C 222 70 240 84 242 112 Z" fill={c("#7a7850")} />
      <path d="M 238 88 L 346 82 L 346 94 L 240 100 Z" fill={c("#6b6a45")} />
      {!m && <path d="M 150 76 L 160 64 L 182 64 L 186 72" fill="#6b6a45" />}
      {!m && <path d="M 60 126 L 290 126" fill="none" strokeWidth={3} />}
      {!m && <circle cx={84} cy={136} r={5} fill="#d9d2b8" strokeWidth={2} />}
    </>
  );
};

export const EraFigure = ({ era, mono, style }: { era: Era; mono?: string; style?: React.CSSProperties }) => {
  const id = useId().replace(/:/g, "");
  const tank = era === "tank";
  return (
    <svg viewBox={tank ? "0 0 360 200" : "0 -30 160 270"} style={{ overflow: "visible", ...style }}>
      <Look id={id} />
      {!mono && (tank ? <ellipse cx={176} cy={190} rx={160} ry={8} fill={INK} opacity={0.18} /> : <ellipse cx={80} cy={230} rx={52} ry={6} fill={INK} opacity={0.18} />)}
      <g filter={mono ? undefined : `url(#paper${id})`}>
        <g filter={`url(#ink${id})`} stroke={mono ?? INK} strokeWidth={4.5} strokeLinejoin="round" strokeLinecap="round">
          {tank ? <Tank m={mono} /> : body(era, mono)}
        </g>
      </g>
    </svg>
  );
};
