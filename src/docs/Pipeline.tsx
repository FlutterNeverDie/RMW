// 설명 영상: 우리 영상이 만들어지는 길 (내부용, 한국어). npx remotion render src/preview.tsx PipelineExplainer out/제작-구조.mp4
// 단계표 원본은 docs/guide/06-제작-단계.md - 단계가 바뀌면 STAGES도 같이
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, Easing } from "remotion";

const BG = "#0b0b0b";
const INK = "#f2f2f2";
const DIM = "#8a8a8a";
const WHO = { c: { name: "Claude", color: "#f2a65a" }, k: { name: "코드", color: "#5aa9f2" }, u: { name: "사용자", color: "#c6f432" } } as const;
const RED = "#e5484d";
const GREEN = "#57a86b";
const FONT = "-apple-system, 'Apple SD Gothic Neo', sans-serif";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.33, 0, 0.2, 1);

type W = keyof typeof WHO;
const STAGES: { n: string; t: string; s: string; w: W; g?: string }[] = [
  { n: "0", t: "기획", s: "잘된 영상 분석", w: "c" },
  { n: "1", t: "대본", s: "영어", w: "c" },
  { n: "2", t: "재미 보강", s: "훅 · 리듬", w: "c", g: "리듬" },
  { n: "✋", t: "확인 1", s: "대본", w: "u" },
  { n: "3", t: "화면 재료", s: "그림 · 지도", w: "k" },
  { n: "4", t: "화면 연출", s: "카메라", w: "c", g: "확대" },
  { n: "5", t: "나라별 언어", s: "한국어 · 스페인어", w: "c" },
  { n: "6", t: "언어 다듬기", s: "/localize", w: "c", g: "도장" },
  { n: "7", t: "길이 맞추기", s: "영어의 110%", w: "c", g: "길이" },
  { n: "8", t: "효과음 · 브금", s: "자리 정하기", w: "c" },
  { n: "9", t: "캐릭터", s: "설계 → 그림", w: "k" },
  { n: "✋", t: "확인 2", s: "캐릭터", w: "u" },
  { n: "10", t: "목소리", s: "TTS + Gemini", w: "k", g: "지지직" },
  { n: "11", t: "렌더", s: "1440p", w: "k", g: "깜빡임" },
  { n: "✋", t: "확인 3", s: "편집기", w: "u" },
  { n: "12", t: "썸네일 · 정보", s: "", w: "c" },
  { n: "13", t: "업로드", s: "API", w: "k" },
];

const Caption = ({ text, at = 0 }: { text: string; at?: number }) => {
  const f = useCurrentFrame();
  const p = interpolate(f - at, [0, 12], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 70, textAlign: "center", opacity: p, transform: `translateY(${(1 - p) * 14}px)` }}>
      <span style={{ fontFamily: FONT, fontSize: 40, color: INK, background: "rgba(0,0,0,.55)", padding: "10px 26px", borderRadius: 14 }}>{text}</span>
    </div>
  );
};

const Heading = ({ k, title }: { k: string; title: string }) => {
  const f = useCurrentFrame();
  const p = spring({ frame: f, fps: 30, config: { damping: 16 } });
  return (
    <div style={{ position: "absolute", left: 90, top: 70, fontFamily: FONT, opacity: p, transform: `translateX(${(1 - p) * -30}px)` }}>
      <div style={{ fontSize: 26, color: DIM, letterSpacing: 2 }}>{k}</div>
      <div style={{ fontSize: 60, fontWeight: 800, color: INK, marginTop: 4 }}>{title}</div>
    </div>
  );
};

const Node = ({ s, x, y, on = 1, hi = false, w = 250, h = 112 }: { s: (typeof STAGES)[number]; x: number; y: number; on?: number; hi?: boolean; w?: number; h?: number }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 18, background: "#161616", border: `3px solid ${hi ? WHO[s.w].color : "#2a2a2a"}`, opacity: on, transform: `scale(${0.85 + 0.15 * on})`, boxShadow: hi ? `0 0 40px ${WHO[s.w].color}55` : "none", fontFamily: FONT, padding: "14px 18px", boxSizing: "border-box" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 14, height: 14, borderRadius: 7, background: WHO[s.w].color }} />
      <span style={{ fontSize: 22, color: DIM }}>{s.n}</span>
      {s.g && <span style={{ marginLeft: "auto", fontSize: 18, color: BG, background: INK, borderRadius: 6, padding: "1px 8px" }}>검사</span>}
    </div>
    <div style={{ fontSize: 32, fontWeight: 700, color: INK, marginTop: 6 }}>{s.t}</div>
    {s.s && <div style={{ fontSize: 20, color: DIM, marginTop: 2 }}>{s.s}</div>}
  </div>
);

// 단계 17개를 뱀 모양 3줄로
const pos = (i: number) => {
  const row = i < 6 ? 0 : i < 12 ? 1 : 2;
  const col = row === 0 ? i : row === 1 ? 11 - i : i - 12;
  return { x: 110 + col * 290, y: 230 + row * 230 };
};

// 1. 전체 지도
const Overview = () => {
  const f = useCurrentFrame();
  const go = interpolate(f, [40, 300], [0, STAGES.length - 1], { ...clamp, easing: ease });
  const k = Math.floor(go);
  const a = pos(k), b = pos(Math.min(k + 1, STAGES.length - 1));
  const t = go - k;
  const dot = { x: a.x + (b.x - a.x) * t + 125, y: a.y + (b.y - a.y) * t + 56 };
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Heading k="전체" title="한 편이 만들어지는 길" />
      <div style={{ position: "absolute", right: 90, top: 92, display: "flex", gap: 30, fontFamily: FONT, fontSize: 26, color: INK }}>
        {(Object.keys(WHO) as W[]).map((w) => <span key={w} style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 20, height: 20, borderRadius: 10, background: WHO[w].color }} />{WHO[w].name}</span>)}
      </div>
      {STAGES.map((s, i) => {
        const p = spring({ frame: f - i * 2, fps: 30, config: { damping: 18 } });
        const { x, y } = pos(i);
        return <Node key={i} s={s} x={x} y={y} on={p} hi={i === Math.round(go) && f > 40} />;
      })}
      {f > 40 && <div style={{ position: "absolute", left: dot.x - 14, top: dot.y - 14, width: 28, height: 28, borderRadius: 14, background: INK, boxShadow: "0 0 30px #fff" }} />}
      <Caption text="메인은 Claude, 판단이 필요 없는 일은 코드, 사용자는 세 번 확인해요" at={20} />
    </AbsoluteFill>
  );
};

// 게이트: 빨강 X → 고침 → 초록 ✓
const Gate = ({ x, y, label, at, fixAt }: { x: number; y: number; label: string; at: number; fixAt: number }) => {
  const f = useCurrentFrame();
  const show = interpolate(f - at, [0, 10], [0, 1], clamp);
  const ok = f >= fixAt;
  const pop = spring({ frame: f - (ok ? fixAt : at), fps: 30, config: { damping: 10 } });
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: show, fontFamily: FONT, textAlign: "center", width: 220 }}>
      <div style={{ width: 120, height: 120, margin: "0 auto", borderRadius: 60, background: ok ? GREEN : RED, display: "grid", placeItems: "center", fontSize: 70, color: "#fff", transform: `scale(${0.7 + 0.3 * pop})` }}>{ok ? "✓" : "✕"}</div>
      <div style={{ fontSize: 26, color: INK, marginTop: 12 }}>{label}</div>
      <div style={{ fontSize: 20, color: DIM }}>{ok ? "통과" : "걸린 곳만 고침"}</div>
    </div>
  );
};

const Arrow = ({ x1, x2, y, at = 0 }: { x1: number; x2: number; y: number; at?: number }) => {
  const f = useCurrentFrame();
  const w = interpolate(f - at, [0, 14], [0, x2 - x1], clamp);
  return <div style={{ position: "absolute", left: x1, top: y, width: w, height: 4, background: "#444" }}><div style={{ position: "absolute", right: -2, top: -8, width: 0, height: 0, borderLeft: "14px solid #444", borderTop: "10px solid transparent", borderBottom: "10px solid transparent" }} /></div>;
};

const Doc = ({ x, y, lines, color, at = 0, title }: { x: number; y: number; lines: string[]; color: string; at?: number; title: string }) => {
  const f = useCurrentFrame();
  const p = spring({ frame: f - at, fps: 30, config: { damping: 16 } });
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 330, padding: 20, borderRadius: 16, background: "#161616", border: `3px solid ${color}`, fontFamily: FONT, opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
      <div style={{ fontSize: 24, color, fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {lines.map((l, i) => <div key={i} style={{ fontSize: 22, color: i < Math.floor((f - at) / 6) ? INK : "#333", marginTop: 6 }}>{l}</div>)}
    </div>
  );
};

// 2. 대본 구간
const ScriptPart = () => (
  <AbsoluteFill style={{ background: BG }}>
    <Heading k="0 ~ 2단계 + 확인 1" title="대본" />
    <Doc x={110} y={280} title="0 기획" color={WHO.c.color} lines={["잘된 영상 찾기", "구조 · 길이 · 훅", "→ plan.md"]} at={5} />
    <Arrow x1={460} x2={540} y={400} at={20} />
    <Doc x={560} y={280} title="1 대본 · 2 재미" color={WHO.c.color} lines={["영어 대본", "첫 5초 훅 · 빠른 줌아웃", "질문 · 반전 넣기"]} at={25} />
    <Arrow x1={910} x2={990} y={400} at={45} />
    <Gate x={1000} y={300} label="리듬 검사" at={50} fixAt={95} />
    <Arrow x1={1240} x2={1320} y={400} at={105} />
    <Doc x={1340} y={280} title="✋ 확인 1" color={WHO.u.color} lines={["한국어 요약 보고", "OK면 다음으로"]} at={110} />
    <Caption text="코드 검사가 걸린 곳을 찾아 주면, Claude는 거기만 고쳐요 (토큰 절약)" at={55} />
  </AbsoluteFill>
);

// 3. 화면 구간: 지도 확대 한도
const ScreenPart = () => {
  const f = useCurrentFrame();
  const z = interpolate(f, [20, 70, 110, 140], [1, 2.4, 2.4, 1], clamp);
  const over = z > 1.05;
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Heading k="3 ~ 4단계" title="화면 재료 · 연출" />
      <div style={{ position: "absolute", left: 110, top: 260, width: 900, height: 506, borderRadius: 16, overflow: "hidden", border: `4px solid ${over && f > 70 && f < 140 ? RED : "#2a2a2a"}` }}>
        <Img src={staticFile("clean/mg-wide/1260.png")} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${z})`, filter: over ? `blur(${(z - 1) * 1.6}px)` : "none" }} />
      </div>
      <div style={{ position: "absolute", left: 1080, top: 300, fontFamily: FONT, color: INK, width: 720 }}>
        <div style={{ fontSize: 34 }}>확대 <b style={{ color: over ? RED : GREEN }}>{z.toFixed(1)}배</b></div>
        <div style={{ fontSize: 26, color: DIM, marginTop: 16, lineHeight: 1.6 }}>지도 사진은 크기가 정해져 있어서<br />너무 당기면 흐려져요</div>
        <div style={{ fontSize: 26, marginTop: 30, lineHeight: 1.6, opacity: interpolate(f, [110, 125], [0, 1], clamp) }}>→ 더 당길 곳은 <b>확대해서 따로 캡처</b><br />→ 코드가 한도를 넘으면 멈춤</div>
      </div>
      <Caption text="그림은 위키미디어·오픈 이미지, 지도는 우리 사이트를 캡처해요" at={10} />
    </AbsoluteFill>
  );
};

// 4. 언어 구간
const LangPart = () => {
  const f = useCurrentFrame();
  const bar = (label: string, secs: number, color: string, y: number, at: number) => {
    const w = interpolate(f - at, [0, 18], [0, secs * 90], clamp);
    return (
      <div style={{ position: "absolute", left: 960, top: y, fontFamily: FONT, display: "flex", alignItems: "center", gap: 20 }}>
        <span style={{ width: 140, fontSize: 28, color: INK }}>{label}</span>
        <div style={{ width: w, height: 40, borderRadius: 8, background: color }} />
        <span style={{ fontSize: 26, color: DIM }}>{secs.toFixed(1)}초</span>
      </div>
    );
  };
  const shortened = f > 120;
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Heading k="5 ~ 7단계" title="나라별 언어" />
      <Doc x={110} y={280} title="5 번역 말고 현지화" color={WHO.c.color} lines={["그 나라 유튜버 말투로", "한국어: 해요체", "스페인어: 중남미 · tú"]} at={5} />
      <div style={{ position: "absolute", left: 110, top: 560, fontFamily: FONT }}>
        <div style={{ fontSize: 26, color: WHO.c.color, fontWeight: 700 }}>6 /localize - 언어마다 검토 도장</div>
        <div style={{ display: "flex", gap: 18, marginTop: 16 }}>
          {["한국어", "스페인어"].map((l, i) => {
            const p = spring({ frame: f - 40 - i * 10, fps: 30, config: { damping: 9 } });
            return <div key={l} style={{ width: 150, height: 150, borderRadius: 75, border: `5px solid ${GREEN}`, color: GREEN, display: "grid", placeItems: "center", fontSize: 26, fontWeight: 800, transform: `rotate(-12deg) scale(${p})`, textAlign: "center" }}>{l}<br />검토됨</div>;
          })}
        </div>
      </div>
      <div style={{ position: "absolute", left: 960, top: 250, fontFamily: FONT, fontSize: 28, color: INK }}>7 길이 맞추기 - 더빙 ≤ 영어의 110%</div>
      {bar("영어", 4.0, "#3b5b3f", 330, 60)}
      {bar("한국어", 4.2, GREEN, 400, 70)}
      {bar("스페인어", shortened ? 4.3 : 5.6, shortened ? GREEN : RED, 470, 80)}
      <div style={{ position: "absolute", left: 960, top: 560, fontFamily: FONT, fontSize: 26, color: DIM, width: 820, lineHeight: 1.6 }}>
        화면은 하나라 장면 길이 = 가장 긴 언어.<br />더빙이 길면 영어 원본이 말을 멈추고 기다려요 → {shortened ? <b style={{ color: GREEN }}>줄였어요</b> : <b style={{ color: RED }}>줄여야 해요</b>}
      </div>
      <Caption text="대사가 한 글자라도 바뀌면 도장이 풀려서 다시 검토해요" at={140} />
    </AbsoluteFill>
  );
};

// 5. 캐릭터 구간 (실제 캐릭터 그림)
const CharPart = () => {
  const f = useCurrentFrame();
  const poses = ["front", "side", "angry", "shocked", "sad", "happy"];
  const names = ["정면", "옆", "화남", "놀람", "슬픔", "기쁨"];
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Heading k="8 ~ 9단계 + 확인 2" title="효과음 · 브금 · 캐릭터" />
      <div style={{ position: "absolute", left: 110, top: 270, display: "flex", gap: 22 }}>
        {poses.map((p, i) => {
          const s = spring({ frame: f - 10 - i * 6, fps: 30, config: { damping: 12 } });
          return (
            <div key={p} style={{ width: 250, textAlign: "center", fontFamily: FONT, transform: `translateY(${(1 - s) * 80}px)`, opacity: s }}>
              <div style={{ position: "relative", width: 250, height: 300, background: "#161616", borderRadius: 16 }}>
                {["body", "head", "eyes0", "mouth0"].map((l) => <Img key={l} src={staticFile(`chars/genghis/${p}/${l}.svg`)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />)}
              </div>
              <div style={{ fontSize: 26, color: INK, marginTop: 10 }}>{names[i]}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 110, top: 690, fontFamily: FONT, fontSize: 28, color: DIM }}>
        Claude는 설계(색·모자·옷)만 쓰고, <b style={{ color: WHO.k.color }}>그림은 파이썬이 그려요 - 토큰 0</b>
      </div>
      <Caption text="확인 2: 편집기 인물 탭에서 보고, 모습은 직접 고칠 수 있어요" at={70} />
    </AbsoluteFill>
  );
};

// 6. 목소리 · 렌더
const VoicePart = () => {
  const f = useCurrentFrame();
  const cut = f > 70;
  const bars = Array.from({ length: 70 }, (_, i) => {
    const speech = i < 54 ? Math.abs(Math.sin(i * 0.7) * Math.sin(i * 0.23)) * 120 + 10 : 0;
    const noise = i >= 58 && i < 66 ? 30 + ((i * 37) % 25) : 0;
    return { h: speech || noise, noise: !!noise };
  });
  const render = interpolate(f, [100, 170], [0, 100], clamp);
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Heading k="10 ~ 11단계" title="목소리 · 렌더" />
      <div style={{ position: "absolute", left: 110, top: 290, display: "flex", alignItems: "center", gap: 6, height: 200 }}>
        {bars.map((b, i) => (
          <div key={i} style={{ width: 9, height: b.noise && cut ? 0 : b.h, background: b.noise ? RED : WHO.k.color, borderRadius: 3, transition: "none" }} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 110, top: 510, fontFamily: FONT, fontSize: 28, color: INK }}>
        말 끝 뒤 <b style={{ color: RED }}>지지직</b> → {cut ? <b style={{ color: GREEN }}>코드가 잘라내고 다시 검사</b> : "찾는 중"}
      </div>
      <div style={{ position: "absolute", left: 1000, top: 300, width: 800, fontFamily: FONT }}>
        <div style={{ fontSize: 28, color: INK }}>Gemini 연기 목소리 - 모델당 하루 10번</div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>{Array.from({ length: 10 }, (_, i) => <div key={i} style={{ width: 56, height: 56, borderRadius: 10, background: i < Math.min(10, Math.floor(f / 8)) ? WHO.c.color : "#222" }} />)}</div>
        <div style={{ fontSize: 22, color: DIM, marginTop: 10 }}>모자라면 Chirp가 대신 → 다음 날 남은 줄만 채움</div>
        <div style={{ fontSize: 28, color: INK, marginTop: 50 }}>렌더 1440p + 잘림 · 깜빡임 검사</div>
        <div style={{ width: 760, height: 26, background: "#222", borderRadius: 13, marginTop: 14, overflow: "hidden" }}><div style={{ width: `${render}%`, height: "100%", background: WHO.k.color }} /></div>
      </div>
      <Caption text="여기는 전부 코드라 토큰이 들지 않아요" at={20} />
    </AbsoluteFill>
  );
};

// 7. 편집기
const EditorPart = () => {
  const f = useCurrentFrame();
  const box = (x: number, y: number, w: number, h: number, label: string, at: number, color = "#2a2a2a") => {
    const p = spring({ frame: f - at, fps: 30, config: { damping: 16 } });
    return <div style={{ position: "absolute", left: x, top: y, width: w, height: h, border: `3px solid ${color}`, borderRadius: 12, background: "#141414", opacity: p, display: "grid", placeItems: "center", fontFamily: FONT, fontSize: 28, color: INK }}>{label}</div>;
  };
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Heading k="확인 3" title="편집기에서 다듬기" />
      {box(110, 250, 1500, 60, "편 고르기 · 되돌리기 · 내역 · 저장", 5)}
      {box(110, 330, 300, 360, "언어 타이밍 · 검사", 10)}
      {box(430, 330, 860, 360, "영상 (소리까지 재생)", 15, WHO.u.color)}
      {box(1310, 330, 300, 360, "대사 · 화면 · 소리 · 인물", 20)}
      {box(110, 710, 1500, 150, "트랙: 화면 · 인물 · 효과음 · 브금 · 언어별 대사", 25)}
      <div style={{ position: "absolute", left: 1650, top: 330, width: 230, fontFamily: FONT, fontSize: 24, color: DIM, lineHeight: 1.7 }}>
        효과음 끌어다 놓기<br />카메라 슬라이더<br />포즈 · 위치<br />더빙 대사<br /><span style={{ color: WHO.u.color }}>이름 붙여 저장</span><br />실수하면 내역에서 되돌리기
      </div>
      <Caption text="고친 뒤 저장하면 코드가 다시 렌더해요. AI 없이 내 맥에서만" at={35} />
    </AbsoluteFill>
  );
};

// 8. 도장 개념
const StampPart = () => {
  const f = useCurrentFrame();
  const changed = f > 60;
  const items = ["확인 1", "언어 도장", "길이", "목소리", "렌더"];
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Heading k="자동으로 어긋남을 막는 법" title="도장" />
      <div style={{ position: "absolute", left: 110, top: 300, width: 360, padding: 24, borderRadius: 16, border: `3px solid ${changed ? RED : "#2a2a2a"}`, background: "#161616", fontFamily: FONT }}>
        <div style={{ fontSize: 28, color: INK, fontWeight: 700 }}>대본</div>
        <div style={{ fontSize: 24, color: changed ? RED : DIM, marginTop: 10 }}>{changed ? "한 줄 고침!" : "그대로"}</div>
      </div>
      {items.map((t, i) => {
        const off = changed && f > 70 + i * 8;
        return (
          <div key={t} style={{ position: "absolute", left: 560 + i * 260, top: 300, width: 220, height: 160, borderRadius: 16, background: "#161616", border: `3px solid ${off ? "#333" : GREEN}`, fontFamily: FONT, display: "grid", placeItems: "center", textAlign: "center" }}>
            <div style={{ fontSize: 26, color: INK }}>{t}</div>
            <div style={{ fontSize: 22, color: off ? RED : GREEN }}>{off ? "도장 풀림" : "✓ 도장"}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 560, top: 520, fontFamily: FONT, fontSize: 28, color: DIM, width: 1250, lineHeight: 1.6, opacity: interpolate(f, [120, 135], [0, 1], clamp) }}>
        뒤 단계가 저절로 다시 해야 할 일이 돼요.<br /><b style={{ color: INK }}>/episode 편이름</b> 한 줄이면 다음 AI도 멈춘 곳부터 이어가요.
      </div>
      <Caption text="도장은 그 단계가 본 내용의 지문이에요" at={10} />
    </AbsoluteFill>
  );
};

// 9. 업로드 + 끝
const UploadPart = () => {
  const f = useCurrentFrame();
  const col = (x: number, title: string, color: string, lines: string[], at: number) => {
    const p = spring({ frame: f - at, fps: 30, config: { damping: 16 } });
    return (
      <div style={{ position: "absolute", left: x, top: 280, width: 760, padding: 30, borderRadius: 18, background: "#161616", border: `3px solid ${color}`, fontFamily: FONT, opacity: p }}>
        <div style={{ fontSize: 34, fontWeight: 800, color }}>{title}</div>
        {lines.map((l) => <div key={l} style={{ fontSize: 28, color: INK, marginTop: 14 }}>· {l}</div>)}
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Heading k="12 ~ 13단계" title="업로드" />
      {col(110, "API (코드)", WHO.k.color, ["영상 파일", "영어 제목 · 설명 · 태그"], 5)}
      {col(1050, "스튜디오 (사용자)", WHO.u.color, ["썸네일 3개", "언어별 제목 · 더빙 트랙 · 자막", "재생목록 · 최종 화면 · 카드"], 15)}
      <Caption text="API 감사를 통과하기 전엔 비공개로만 올라가요" at={30} />
    </AbsoluteFill>
  );
};

const Title = () => {
  const f = useCurrentFrame();
  const p = spring({ frame: f, fps: 30, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ background: BG, alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div style={{ fontSize: 30, color: DIM, letterSpacing: 6, opacity: p }}>RESTORY WORLDS MAP</div>
      <div style={{ fontSize: 96, fontWeight: 800, color: INK, marginTop: 10, transform: `scale(${0.9 + 0.1 * p})`, opacity: p }}>영상 만드는 구조</div>
      <div style={{ display: "flex", gap: 40, marginTop: 40, fontSize: 30, color: INK, opacity: interpolate(f, [20, 35], [0, 1], clamp) }}>
        {(Object.keys(WHO) as W[]).map((w) => <span key={w} style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ width: 24, height: 24, borderRadius: 12, background: WHO[w].color }} />{WHO[w].name}</span>)}
      </div>
    </AbsoluteFill>
  );
};

export const PARTS: [React.FC, number][] = [
  [Title, 75],
  [Overview, 330],
  [ScriptPart, 190],
  [ScreenPart, 170],
  [LangPart, 210],
  [CharPart, 170],
  [VoicePart, 190],
  [EditorPart, 170],
  [StampPart, 200],
  [UploadPart, 150],
];
export const PIPELINE_FRAMES = PARTS.reduce((a, [, n]) => a + n, 0);

export const PipelineExplainer = () => {
  const f = useCurrentFrame();
  let at = 0;
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Audio src={staticFile("bgm/main.wav")} volume={(fr) => 0.25 * interpolate(fr, [0, 20, PIPELINE_FRAMES - 40, PIPELINE_FRAMES], [0, 1, 1, 0], clamp)} />
      {PARTS.map(([C, n], i) => {
        const from = at;
        at += n;
        const fade = interpolate(f, [from, from + 10, from + n - 10, from + n], [0, 1, 1, 0], clamp);
        return (
          <Sequence key={i} from={from} durationInFrames={n}>
            <AbsoluteFill style={{ opacity: i === 0 ? Math.min(1, fade + (f < 10 ? 1 : 0)) : fade }}><C /></AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
