// 유튜브 프로필 사진 (800×800, 동그랗게 잘림) + 영상 워터마크 (300×300, 배경 투명) - 2026-10-22 채널 ReStory Worlds
// 3판 (사용자: 앞 시안 "싹 다 맘에 안 든다"): 사람 여럿 대신 상징 하나를 크게 - 작게 봐도 한눈에
//   helmet: 반은 코린트 투구, 반은 M1 철모(어두운 바탕) · hourglass: 모래시계 + 엇갈린 칼과 소총(종이 바탕) · seal: 붉은 밀랍 봉인 RW(양피지 바탕)
import { AbsoluteFill } from "remotion";
import { Helmet, Hourglass, WaxSeal } from "./Emblems";

const CREAM = "#f6ecd6";

export type ProfileStyle = "helmet" | "hourglass" | "seal";

// 종이 결
const Grain = ({ a = 0.16 }: { a?: number }) => (
  <AbsoluteFill>
    <svg width="100%" height="100%">
      <filter id="pp">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="11" />
        <feColorMatrix values={`0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0 0.12  0 0 0 ${a} 0`} />
      </filter>
      <rect width="100%" height="100%" filter="url(#pp)" />
    </svg>
  </AbsoluteFill>
);

export const Profile = ({ look = "helmet", bg }: { look?: ProfileStyle; bg?: string }) => {
  if (look === "hourglass")
    return (
      <AbsoluteFill style={{ background: "#ead9b4" }}>
        <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 45%, #f6ead0 0%, #e2cd9f 70%, #c9ad78 100%)" }} />
        <Grain a={0.2} />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <Hourglass style={{ width: 720 }} />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  if (look === "seal")
    return (
      <AbsoluteFill style={{ background: "#e8d8b4" }}>
        <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 50%, #f4e7c8 0%, #dcc596 80%)" }} />
        <Grain a={0.22} />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", filter: "drop-shadow(0 14px 18px rgba(50,20,10,0.45))" }}>
          <WaxSeal style={{ width: 760 }} />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  return (
    <AbsoluteFill style={{ background: bg ?? "#e9dcbf" }}>
      {/* 종이 + 옅은 얼룩 (손 인쇄 느낌, 빛·원 테두리 없음). bg: 바탕색 시안(남색·먹색·청록) */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 50% at 30% 70%, rgba(150,110,60,0.12), rgba(0,0,0,0) 70%), radial-gradient(ellipse 50% 40% at 75% 25%, rgba(150,110,60,0.1), rgba(0,0,0,0) 70%)" }} />
      <Grain a={0.26} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Helmet style={{ width: 880, flexShrink: 0, marginTop: 90 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 워터마크 (오른쪽 아래 구독 버튼, 유튜브가 150×150으로 줄임) - 배경 투명, 프로필과 짝
export type WatermarkStyle = ProfileStyle;
export const Watermark = ({ look = "helmet" }: { look?: WatermarkStyle }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
    {look === "helmet" && <Helmet style={{ width: 300, marginTop: 10 }} />}
    {look === "hourglass" && (
      <div style={{ width: 280, height: 280, borderRadius: "50%", background: "#efe2c4", border: "8px solid #2b1d14", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <Hourglass style={{ width: 270 }} />
      </div>
    )}
    {look === "seal" && <WaxSeal style={{ width: 296 }} />}
  </AbsoluteFill>
);
