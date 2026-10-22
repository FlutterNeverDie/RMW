// 채널 상징: 먹선 기마 궁수 (캐릭터 그림체 A - 흔들리는 먹선, 바랜 물감 색, 2단 그림자, 종이 질감)
// 오른쪽으로 내달리며 앞으로 활을 당긴다. viewBox 400×300, 배경 없음
import { useId } from "react";

export const INK = "#2b1d14";

type Colors = { horse: string; mane: string; coat: string; trim: string; hat: string; fur: string; skin: string };
export const ARCHER: Colors = { horse: "#a7743f", mane: "#3b2a1e", coat: "#8b3a2b", trim: "#d9b45a", hat: "#8b3a2b", fur: "#6b4a2e", skin: "#e2b48a" };

export const HorseArcher = ({ c = ARCHER, mono, dust = true, style }: { c?: Colors; mono?: string; dust?: boolean; style?: React.CSSProperties }) => {
  const id = useId().replace(/:/g, "");
  // mono: 한 가지 색 실루엣(도장·워터마크용)
  const k = mono ? { horse: mono, mane: mono, coat: mono, trim: mono, hat: mono, fur: mono, skin: mono } : c;
  const dark = mono ? mono : shade(c.horse, 0.72);
  const coatDark = mono ? mono : shade(c.coat, 0.7);
  const line = mono ?? INK;
  return (
    <svg viewBox="0 0 400 300" style={style}>
      <defs>
        <filter id={`ink${id}`} filterUnits="userSpaceOnUse" x={0} y={0} width={400} height={300}>
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" />
        </filter>
        <filter id={`paper${id}`} filterUnits="userSpaceOnUse" x={0} y={0} width={400} height={300}>
          <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="3" seed="7" result="t" />
          <feColorMatrix in="t" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.33  0 0 0 0 0.2  0 0 0 0.45 0" result="tc" />
          <feComposite in="tc" in2="SourceAlpha" operator="in" result="tx" />
          <feBlend in="SourceGraphic" in2="tx" mode="multiply" />
        </filter>
      </defs>
      {dust && !mono && (
        <g fill="#c9b48a" opacity={0.55}>
          <ellipse cx={74} cy={232} rx={30} ry={11} />
          <ellipse cx={42} cy={222} rx={20} ry={9} />
          <ellipse cx={110} cy={240} rx={20} ry={7} />
        </g>
      )}
      {!mono && <ellipse cx={200} cy={242} rx={130} ry={9} fill={INK} opacity={0.18} />}
      <g filter={mono ? undefined : `url(#paper${id})`}>
        <g filter={`url(#ink${id})`} stroke={line} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round">
          {/* 꼬리 (바람에 뒤로) */}
          <path d="M 130 148 C 108 136 84 142 60 128 C 70 146 62 160 44 166 C 74 172 102 168 128 164 Z" fill={k.mane} />
          {/* 먼 쪽 다리 (어둡게): 앞다리는 접고 뒷다리는 몸 아래로 */}
          <path d="M 244 176 C 262 194 272 204 280 214 L 270 228 L 276 236 L 264 238 L 258 228 L 266 214 C 256 204 244 194 234 186 Z" fill={dark} />
          <path d="M 152 184 C 152 204 160 216 172 224 L 184 228 L 186 236 L 172 237 L 162 231 C 146 221 138 205 140 188 Z" fill={dark} />
          {/* 가까운 쪽 다리: 앞다리는 앞으로 뻗고 뒷다리는 뒤로 차냄 (몸통보다 먼저 - 몸 테두리가 다리 뿌리를 덮게) */}
          <path d="M 252 168 C 268 178 280 186 290 194 C 300 200 312 202 324 204 L 334 207 L 330 215 L 320 213 C 306 212 294 210 284 204 C 270 196 258 190 242 186 Z" fill={k.horse} />
          <path d="M 156 168 C 140 182 128 192 118 196 C 104 200 92 206 80 211 L 68 214 L 67 222 L 79 221 C 92 218 106 212 120 208 C 136 202 152 194 168 186 Z" fill={k.horse} />
          <path d="M 330 206 L 340 209 L 336 218 L 328 215 Z M 68 213 L 58 214 L 58 223 L 67 222 Z M 266 230 L 278 236 L 274 242 L 262 240 Z M 174 230 L 188 234 L 188 242 L 172 240 Z" fill={mono ? mono : "#3b2a1e"} />
          {/* 몸통 */}
          <path d="M 128 150 C 136 128 180 124 218 128 C 246 130 266 140 274 158 C 280 176 270 192 248 196 C 214 202 170 202 146 194 C 126 186 120 166 128 150 Z" fill={k.horse} />
          {/* 배 그늘 (2단) */}
          <path d="M 144 186 C 178 198 222 198 254 188 C 246 196 214 202 176 200 C 160 198 150 194 144 186 Z" fill={dark} stroke="none" />
          {/* 목 */}
          <path d="M 234 138 C 242 112 258 92 278 78 L 300 86 C 296 106 290 128 280 158 C 264 158 246 150 234 138 Z" fill={k.horse} />
          {/* 머리 */}
          <path d="M 276 78 C 284 66 300 62 310 68 C 322 76 334 88 342 98 C 346 106 340 112 330 110 L 312 106 C 302 104 294 98 288 92 Z" fill={k.horse} />
          <path d="M 284 70 L 284 50 L 297 64 Z" fill={k.horse} />
          <circle cx={306} cy={80} r={2.8} fill={line} stroke="none" />
          <path d="M 334 100 l 4 2" fill="none" strokeWidth={3} />
          {/* 갈기 */}
          <path d="M 280 76 C 268 90 258 104 250 118 C 244 128 238 136 236 140 C 230 126 240 108 250 96 C 260 84 270 78 280 76 Z" fill={k.mane} />
          {/* 고삐 */}
          <path d="M 320 100 C 292 100 262 96 234 100" fill="none" strokeWidth={3} />
          {/* 안장 담요 */}
          <path d="M 170 132 C 190 126 226 126 238 134 L 232 160 C 214 166 186 166 172 160 Z" fill={k.trim} />
          {/* 화살통 (엉덩이 쪽) */}
          <g transform="rotate(-24 160 150)">
            <path d="M 150 120 L 172 120 L 168 172 L 154 172 Z" fill={mono ? mono : "#6b4423"} />
            <path d="M 156 120 L 152 104 M 162 120 L 160 102 M 168 120 L 170 104" fill="none" strokeWidth={4} />
          </g>
          {/* 기수 다리 */}
          <path d="M 196 134 C 206 146 212 160 208 178 L 196 182 C 196 166 190 152 184 142 Z" fill={coatDark} />
          <path d="M 196 180 L 214 180 L 216 190 L 194 190 Z" fill={mono ? mono : "#3b2a1e"} />
          {/* 델 (몸통 + 치마) */}
          <path d="M 178 138 C 172 108 182 84 202 80 C 220 82 226 104 222 138 Z" fill={k.coat} />
          <path d="M 170 144 C 176 130 222 130 230 146 L 222 158 L 178 158 Z" fill={k.coat} />
          <path d="M 202 82 C 206 104 206 124 200 140" fill="none" stroke={k.trim} strokeWidth={5} />
          <path d="M 176 136 L 224 136" fill="none" stroke={k.trim} strokeWidth={6} />
          {/* 활 (몽골 복합궁: 끝이 앞으로 젖힘) + 시위 + 화살 */}
          <path d="M 262 122 C 276 118 280 108 272 100 C 264 92 266 60 270 44 C 272 36 268 28 278 22" fill="none" stroke={mono ? mono : "#6b4423"} strokeWidth={8} />
          <path d="M 262 122 L 196 72 L 278 22" fill="none" stroke={mono ? mono : "#efe2c4"} strokeWidth={2} />
          <path d="M 192 72 L 292 70" fill="none" strokeWidth={3} />
          <path d="M 292 70 l -9 -6 l 0 12 Z" fill={line} />
          {/* 팔: 앞팔은 활을 밀고 뒷팔은 볼까지 당김 */}
          <path d="M 214 92 C 232 86 252 78 268 74" fill="none" stroke={line} strokeWidth={16} />
          <path d="M 214 92 C 232 86 252 78 268 74" fill="none" stroke={k.coat} strokeWidth={9} />
          <path d="M 200 94 C 186 92 178 84 194 74" fill="none" stroke={line} strokeWidth={16} />
          <path d="M 200 94 C 186 92 178 84 194 74" fill="none" stroke={coatDark} strokeWidth={9} />
          <circle cx={270} cy={73} r={7} fill={k.skin} strokeWidth={4} />
          <circle cx={196} cy={73} r={7} fill={k.skin} strokeWidth={4} />
          {/* 머리 + 털모자 */}
          <circle cx={208} cy={62} r={15} fill={k.skin} />
          <path d="M 214 60 L 222 62" fill="none" strokeWidth={3} />
          <path d="M 190 54 C 188 32 226 30 226 52 Z" fill={k.hat} />
          <path d="M 186 56 C 192 46 222 46 230 56 C 224 62 194 62 186 56 Z" fill={k.fur} />
          <path d="M 190 56 C 184 64 180 76 184 84 C 190 78 192 68 196 60 Z" fill={k.fur} />
        </g>
      </g>
    </svg>
  );
};

export function shade(hex: string, k: number) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const f = (v: number) => (k < 1 ? v * k : v + (255 - v) * (k - 1));
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, f(v)))).toString(16).padStart(2, "0")).join("");
}
