// 유튜브 프로필 사진 (800×800, 동그랗게 잘림 - 작게 보여도 읽히게 글자는 RWM 세 글자만)
// 배경 = 배너 B(사이트 지도색)와 같은 1279년 유라시아 지도
import { AbsoluteFill, Img, staticFile } from "remotion";

const SERIF = "Baskerville, 'Big Caslon', 'Hoefler Text', serif";
const INK = "#2b2418";
const CREAM = "#fffdf7";

export type ProfileStyle = "medal" | "bold" | "ring";

// 지도에서 유라시아 가운데를 정사각형으로 (원본 2560×1440 중 가로 crop px 폭)
const MapBg = ({ crop = 1150, cx = 1270, cy = 700 }: { crop?: number; cx?: number; cy?: number }) => {
  const k = 800 / crop;
  return (
    <Img
      src={staticFile("clean/banner3/1279-nonames.png")}
      style={{ position: "absolute", width: 2560 * k, height: 1440 * k, left: 400 - cx * k, top: 400 - cy * k, filter: "saturate(1.15) contrast(1.05)" }}
    />
  );
};

export const Profile = ({ look = "medal" }: { look?: ProfileStyle }) => (
  <AbsoluteFill style={{ background: "#cfe6f2", fontFamily: SERIF }}>
    <MapBg />
    {look === "medal" && (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: 430,
            height: 430,
            borderRadius: "50%",
            background: CREAM,
            border: `14px solid ${INK}`,
            boxShadow: "0 18px 40px rgba(43,36,24,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: INK,
            fontSize: 112,
            fontWeight: 700,
            letterSpacing: -1,
          }}
        >
          RWM
        </div>
      </AbsoluteFill>
    )}
    {look === "bold" && (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 50%, rgba(255,253,247,0.75) 30%, rgba(255,253,247,0) 70%)" }}>
        <div style={{ color: INK, fontSize: 230, fontWeight: 700, letterSpacing: -4, WebkitTextStroke: `6px ${CREAM}`, paintOrder: "stroke fill" }}>RWM</div>
      </AbsoluteFill>
    )}
    {look === "ring" && (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {/* 원 테두리 안쪽만 지도, 바깥은 크림 */}
        <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 300px, ${INK} 301px, ${INK} 322px, ${CREAM} 323px)` }} />
        <div style={{ background: CREAM, border: `8px solid ${INK}`, borderRadius: 24, padding: "6px 34px 10px", color: INK, fontSize: 130, fontWeight: 700, letterSpacing: -2, boxShadow: "0 14px 30px rgba(43,36,24,0.4)" }}>
          RWM
        </div>
      </AbsoluteFill>
    )}
  </AbsoluteFill>
);

// 영상 오른쪽 아래 워터마크(구독 버튼) - 프로필 A 메달을 배경 없이
export const Watermark = () => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: SERIF }}>
    <div
      style={{
        width: 280,
        height: 280,
        borderRadius: "50%",
        background: CREAM,
        border: `12px solid ${INK}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: INK,
        fontSize: 76,
        fontWeight: 700,
        letterSpacing: -1,
      }}
    >
      RWM
    </div>
  </AbsoluteFill>
);
