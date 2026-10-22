// 채널 상징 3안 (2026-10-22 프로필 다시 짬 - 고대부터 현대까지 한 그림에)
//   Helmet: 반은 로마 백인대장 투구(청동·가로 볏), 반은 현대 방탄 헬멧(위장 커버·야간투시경 마운트·고글) - 한 병사가 시대를 건넌다
//   Hourglass: 모래시계 뒤로 칼과 소총이 엇갈림 - 시간(역사) + 전쟁
//   WaxSeal: 붉은 밀랍 도장에 RW - 옛 문서·칙서의 봉인
// 모두 800×800 판(viewBox), 배경 없음. 먹선은 캐릭터 그림체와 같은 흔들림
import { useId } from "react";
import { INK } from "./HorseArcher";

const Ink = ({ id, scale = 3 }: { id: string; scale?: number }) => (
  <filter id={`ink${id}`} filterUnits="userSpaceOnUse" x={0} y={0} width={800} height={800}>
    <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="3" result="n" />
    <feDisplacementMap in="SourceGraphic" in2="n" scale={scale} />
  </filter>
);
const Paper = ({ id }: { id: string }) => (
  <filter id={`paper${id}`} filterUnits="userSpaceOnUse" x={0} y={0} width={800} height={800}>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="t" />
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.33  0 0 0 0 0.2  0 0 0 0.4 0" result="tc" />
    <feComposite in="tc" in2="SourceAlpha" operator="in" result="tx" />
    <feBlend in="SourceGraphic" in2="tx" mode="multiply" />
  </filter>
);

const BRONZE = "#b8863f";
const BRONZE_D = "#7f5a28";
const OLIVE = "#6f6d47";
const OLIVE_D = "#4f4e32";
const VOID = "#1d140d";

// 손으로 찍은 판화 느낌 (2026-10-22 사용자: "AI 느낌 빼기"): 그라데이션·광택·빛나는 선 없이
//   평평한 색 + 펜 빗금 그늘 + 흔들리는 먹선, 색 판과 선 판을 몇 px 어긋나게 찍음(손 인쇄), 볏은 붓질로
type Shape = { d: string; fill?: string; hatch?: boolean; side: "L" | "R" };
const H_SHAPES: Shape[] = [
  // 왼쪽: 백인대장 투구
  { side: "L", d: "M 404 172 C 298 168 236 236 232 336 C 228 412 238 474 252 522 C 266 570 294 606 334 630 C 360 646 386 652 404 654 Z", fill: "#c4924a" },
  { side: "L", d: "M 238 390 C 242 462 256 522 280 562 C 300 596 336 614 384 616 C 324 596 286 548 270 478 C 262 440 256 410 238 390 Z", hatch: true },
  { side: "L", d: "M 404 178 L 404 202 C 340 202 292 216 252 242 L 244 228 C 290 196 346 184 404 178 Z", fill: "#8a5a22" },
  { side: "L", d: "M 404 296 C 350 289 294 303 246 338 L 245 356 C 292 323 350 313 404 317 Z", fill: "#e3b56a" },
  { side: "L", d: "M 394 351 C 361 334 306 339 259 369 C 291 389 344 397 394 391 Z", fill: "#1f150d" },
  { side: "L", d: "M 404 500 L 387 500 C 381 560 371 610 361 642 L 404 656 Z", fill: "#1f150d" },
  // 오른쪽: 현대 방탄 헬멧
  { side: "R", d: "M 396 330 C 500 331 552 400 556 470 C 558 540 524 600 474 630 C 446 646 420 654 396 654 Z", fill: "#2a1d14" },
  { side: "R", d: "M 396 176 C 500 174 568 240 576 340 C 580 390 576 430 566 462 L 538 464 C 530 420 518 382 498 354 C 470 338 430 334 396 334 Z", fill: "#7d7652" },
  { side: "R", d: "M 520 206 C 562 246 580 320 578 410 L 566 460 L 540 462 C 540 400 536 330 506 262 Z", hatch: true },
];
// 위장무늬: 손으로 찍은 얼룩 (고정 모양)
const CAMO: [string, string][] = [
  ["M 410 206 C 430 192 462 196 470 210 C 458 226 430 230 412 222 Z", "#5d5a38"],
  ["M 488 214 C 512 206 536 220 538 240 C 520 252 494 246 486 232 Z", "#a08c62"],
  ["M 428 252 C 450 240 482 246 486 262 C 470 276 440 276 426 266 Z", "#6e5a3a"],
  ["M 510 272 C 534 264 556 282 558 304 C 540 316 514 306 508 290 Z", "#5d5a38"],
  ["M 452 296 C 474 288 500 296 502 312 C 486 322 460 320 450 310 Z", "#a08c62"],
  ["M 532 336 C 552 330 566 350 562 372 C 546 378 532 364 530 350 Z", "#6e5a3a"],
];

export const Helmet = ({ style, paper = true }: { style?: React.CSSProperties; paper?: boolean }) => {
  const id = useId().replace(/:/g, "");
  const u = (n: string) => `url(#${n}${id})`;
  const clip = (side: "L" | "R") => u(side);
  return (
    <svg viewBox="0 0 800 800" style={style}>
      <defs>
        {/* 먹선: 크게 흔들기 */}
        <filter id={`ink${id}`} filterUnits="userSpaceOnUse" x={0} y={0} width={800} height={800}>
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="9" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="5" />
        </filter>
        {/* 색 판: 가장자리를 조금 번지게 + 종이 결로 얼룩 */}
        <filter id={`print${id}`} filterUnits="userSpaceOnUse" x={0} y={0} width={800} height={800}>
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="7" result="d" />
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="12" result="t" />
          <feColorMatrix in="t" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -1.6 1.75" result="holes" />
          <feComposite in="d" in2="holes" operator="in" />
        </filter>
        <pattern id={`hatch${id}`} width={11} height={11} patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <path d="M 0 5 L 11 5" stroke={INK} strokeWidth={3.2} opacity={0.75} />
        </pattern>
        <clipPath id={`L${id}`}><path d="M 0 0 L 402 0 L 398 260 L 404 520 L 400 800 L 0 800 Z" /></clipPath>
        <clipPath id={`R${id}`}><path d="M 402 0 L 800 0 L 800 800 L 400 800 L 404 520 L 398 260 Z" /></clipPath>
      </defs>
      {/* ── 색 판 (선보다 오른쪽 아래로 4px 어긋남) ── */}
      <g filter={u("print")} transform="translate(4 3)">
        {/* 볏: 붉은 붓질 */}
        <g clipPath={clip("L")}>
          {Array.from({ length: 22 }, (_, k) => {
            const t = k / 21;
            const a = -Math.PI / 2 - t * Math.PI * 0.55;
            const len = 150 + ((k * 37) % 5) * 9;
            const x2 = 404 + Math.cos(a) * len * 1.1;
            const y2 = 214 + Math.sin(a) * len;
            return <path key={k} d={`M 404 ${212 - t * 8} Q ${404 + Math.cos(a + 0.18) * len * 0.6} ${214 + Math.sin(a + 0.18) * len * 0.6} ${x2} ${y2}`} fill="none" stroke={k % 3 === 0 ? "#8e2416" : "#b5382a"} strokeWidth={k % 2 ? 22 : 16} strokeLinecap="round" />;
          })}
        </g>
        {H_SHAPES.filter((x) => x.fill).map((x, k) => (
          <g key={k} clipPath={clip(x.side)}><path d={x.d} fill={x.fill} /></g>
        ))}
        <g clipPath={clip("R")}>
          {CAMO.map(([d, c], k) => <path key={k} d={d} fill={c} />)}
          {/* 고글 렌즈 */}
          <path d="M 400 346 C 450 340 500 344 540 360 C 544 380 536 396 520 400 C 480 404 440 400 400 396 Z" fill="#33424c" />
          <path d="M 396 250 L 446 250 L 456 262 L 456 316 L 444 326 L 396 326 Z" fill="#3a3a36" />
          <path d="M 534 360 L 566 352 L 578 440 L 548 446 Z" fill="#3a3a36" />
          <path d="M 396 290 C 460 286 530 298 572 328 L 572 344 C 530 314 460 304 396 308 Z" fill="#4a4434" />
        </g>
      </g>
      {/* ── 선 판 ── */}
      <g filter={u("ink")} fill="none" stroke={INK} strokeLinejoin="round" strokeLinecap="round">
        {/* 빗금 그늘 */}
        {H_SHAPES.filter((x) => x.hatch).map((x, k) => (
          <g key={k} clipPath={clip(x.side)}><path d={x.d} fill={u("hatch")} stroke="none" /></g>
        ))}
        <g clipPath={clip("L")} strokeWidth={9}>
          {/* 볏 몇 가닥만 먹으로 */}
          {[0.12, 0.38, 0.62, 0.88].map((t, k) => {
            const a = -Math.PI / 2 - t * Math.PI * 0.55;
            return <path key={k} d={`M 404 210 Q ${404 + Math.cos(a + 0.18) * 100} ${214 + Math.sin(a + 0.18) * 100} ${404 + Math.cos(a) * 170 * 1.1} ${214 + Math.sin(a) * 170}`} strokeWidth={4} />;
          })}
          <path d="M 404 172 C 298 168 236 236 232 336 C 228 412 238 474 252 522 C 266 570 294 606 334 630 C 360 646 386 652 404 654" strokeWidth={11} />
          <path d="M 404 178 L 404 202 C 340 202 292 216 252 242 L 244 228 C 290 196 346 184 404 178" strokeWidth={6} />
          <path d="M 404 296 C 350 289 294 303 246 338 M 245 356 C 292 323 350 313 404 317" strokeWidth={6} />
          <path d="M 394 351 C 361 334 306 339 259 369 C 291 389 344 397 394 391 Z" strokeWidth={8} />
          <path d="M 387 392 L 387 500 C 381 560 371 610 361 642" strokeWidth={7} />
          <path d="M 264 384 C 270 452 298 522 360 566" strokeWidth={4} />
          {[[264, 300], [254, 400], [262, 470], [280, 534], [312, 588], [352, 622]].map(([x, y], k) => <circle key={k} cx={x} cy={y} r={6} strokeWidth={4} />)}
          {/* 볕: 붓으로 크림 한 번 */}
          <path d="M 300 230 C 330 210 360 202 390 202" stroke="#f6ecd6" strokeWidth={9} />
        </g>
        <g clipPath={clip("R")} strokeWidth={9}>
          <path d="M 396 176 C 500 174 568 240 576 340 C 580 390 576 430 566 462 L 538 464 C 530 420 518 382 498 354 C 470 338 430 334 396 334" strokeWidth={11} />
          <path d="M 556 470 C 558 540 524 600 474 630 C 446 646 420 654 396 654" strokeWidth={11} />
          <path d="M 400 346 C 450 340 500 344 540 360 C 544 380 536 396 520 400 C 480 404 440 400 400 396" strokeWidth={12} />
          <path d="M 424 360 C 452 356 476 358 494 364" stroke="#cfe2ea" strokeWidth={5} />
          <path d="M 396 290 C 460 286 530 298 572 328 M 396 308 C 460 304 530 314 572 344" strokeWidth={6} />
          <path d="M 396 250 L 446 250 L 456 262 L 456 316 L 444 326 L 396 326" strokeWidth={7} />
          <circle cx={430} cy={276} r={6} strokeWidth={4} />
          <path d="M 534 360 L 566 352 L 578 440 L 548 446 Z" strokeWidth={7} />
          {[374, 394, 414, 432].map((y) => <path key={y} d={`M 546 ${y} L 572 ${y - 4}`} strokeWidth={4} />)}
          <path d="M 556 456 C 552 530 520 594 404 616" stroke="#4a4434" strokeWidth={14} />
          <path d="M 556 456 C 552 530 520 594 404 616" strokeWidth={3} />
          <path d="M 470 596 l 28 -8 l 6 18 l -28 8 Z" strokeWidth={5} />
        </g>
        {/* 가운데: 손으로 그은 먹선 한 줄 (빛 없음) */}
        <path d="M 402 170 L 398 260 L 404 520 L 400 656" strokeWidth={5} />
      </g>
      {paper && null}
    </svg>
  );
};

export const Hourglass = ({ style }: { style?: React.CSSProperties }) => {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 800 800" style={style}>
      <defs>
        <Ink id={id} />
        <Paper id={id} />
      </defs>
      <g filter={`url(#paper${id})`}>
        <g filter={`url(#ink${id})`} stroke={INK} strokeWidth={10} strokeLinejoin="round" strokeLinecap="round">
          {/* 소총 (왼쪽 아래 개머리판 → 오른쪽 위 총구) */}
          <path d="M 170 640 L 236 586 L 262 610 L 200 668 Z" fill="#6b4423" />
          <path d="M 236 586 L 560 260" fill="none" stroke={INK} strokeWidth={34} />
          <path d="M 236 586 L 560 260" fill="none" stroke="#7a5230" strokeWidth={20} />
          <path d="M 520 300 L 640 180" fill="none" stroke={INK} strokeWidth={18} />
          <path d="M 520 300 L 640 180" fill="none" stroke="#55565a" strokeWidth={8} />
          {/* 칼 (오른쪽 아래 손잡이 → 왼쪽 위 칼끝) */}
          <path d="M 560 560 L 196 196 L 168 150 L 214 178 L 578 542 Z" fill="#c9cbc6" />
          <path d="M 520 600 L 600 520" fill="none" stroke={INK} strokeWidth={30} />
          <path d="M 520 600 L 600 520" fill="none" stroke="#d9b45a" strokeWidth={16} />
          <path d="M 584 584 L 640 640" fill="none" stroke={INK} strokeWidth={30} />
          <path d="M 584 584 L 640 640" fill="none" stroke="#6b4423" strokeWidth={16} />
          <circle cx={648} cy={648} r={16} fill="#d9b45a" />
          {/* 모래시계 틀 */}
          <path d="M 286 180 L 514 180 L 520 226 L 280 226 Z" fill="#6b4423" />
          <path d="M 280 574 L 520 574 L 514 620 L 286 620 Z" fill="#6b4423" />
          <path d="M 306 226 L 306 574 M 494 226 L 494 574" fill="none" stroke={INK} strokeWidth={22} />
          <path d="M 306 226 L 306 574 M 494 226 L 494 574" fill="none" stroke="#8a5a30" strokeWidth={10} />
          {/* 유리 */}
          <path d="M 338 226 C 338 320 392 352 396 400 C 392 448 338 480 338 574 L 462 574 C 462 480 408 448 404 400 C 408 352 462 320 462 226 Z" fill="#f3ead6" />
          {/* 위 모래(줄어드는 중) + 떨어지는 줄기 + 아래 무더기 */}
          <path d="M 352 300 C 372 340 394 360 398 392 L 402 392 C 406 360 428 340 448 300 C 420 312 380 312 352 300 Z" fill="#d9a54a" strokeWidth={6} />
          <path d="M 400 396 L 400 520" fill="none" stroke="#d9a54a" strokeWidth={6} />
          <path d="M 346 572 C 360 520 384 504 400 500 C 416 504 440 520 454 572 Z" fill="#d9a54a" strokeWidth={6} />
          <path d="M 352 250 C 356 300 370 320 380 334" fill="none" stroke="#fffaf0" strokeWidth={8} opacity={0.8} />
        </g>
      </g>
    </svg>
  );
};

export const WaxSeal = ({ style }: { style?: React.CSSProperties }) => {
  const id = useId().replace(/:/g, "");
  // 밀랍 가장자리: 둥근 덩어리를 고르게 흔들기 (고정 값)
  const n = 28;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const r = 318 + [0, 14, -6, 20, 4, -10, 16, 2, -4, 22, 6, -8, 12, 0][i % 14];
    return [400 + Math.cos(a) * r, 400 + Math.sin(a) * r];
  });
  const blob = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    return `${i === 0 ? `M ${m[0]} ${m[1]}` : ""} Q ${q[0]} ${q[1]} ${(q[0] + pts[(i + 2) % n][0]) / 2} ${(q[1] + pts[(i + 2) % n][1]) / 2}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 800 800" style={style}>
      <defs>
        <Ink id={id} scale={2} />
        <radialGradient id={`wax${id}`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#c0452f" />
          <stop offset="60%" stopColor="#97281c" />
          <stop offset="100%" stopColor="#6a1810" />
        </radialGradient>
        <filter id={`emboss${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b" />
          <feSpecularLighting in="b" surfaceScale="5" specularConstant="0.32" specularExponent="26" lightingColor="#ffd6c0" result="s">
            <feDistantLight azimuth="235" elevation="40" />
          </feSpecularLighting>
          <feComposite in="s" in2="SourceAlpha" operator="in" result="sl" />
          <feComposite in="SourceGraphic" in2="sl" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
        </filter>
      </defs>
      <g filter={`url(#ink${id})`}>
        <path d={blob} fill={`url(#wax${id})`} stroke="#4e120b" strokeWidth={6} filter={`url(#emboss${id})`} />
        {/* 눌린 안쪽 원 + 점 테두리 */}
        <circle cx={400} cy={400} r={236} fill="#8a2318" stroke="#5e150d" strokeWidth={10} filter={`url(#emboss${id})`} />
        <circle cx={400} cy={400} r={206} fill="none" stroke="#c0503a" strokeWidth={4} opacity={0.7} />
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * Math.PI * 2;
          return <circle key={i} cx={400 + Math.cos(a) * 220} cy={400 + Math.sin(a) * 220} r={4.5} fill="#c0503a" opacity={0.8} />;
        })}
        {/* RW */}
        <text x={400} y={470} textAnchor="middle" fontFamily="Baskerville, 'Big Caslon', 'Hoefler Text', serif" fontSize={230} fontWeight={700} fill="#5a120b" stroke="#d0644c" strokeWidth={3} letterSpacing={-8} filter={`url(#emboss${id})`}>
          RW
        </text>
        {/* 칼과 소총이 엇갈린 작은 문양 (글자 아래) */}
        <path d="M 360 528 L 440 576 M 440 528 L 360 576" stroke="#c0503a" strokeWidth={8} strokeLinecap="round" />
      </g>
    </svg>
  );
};
