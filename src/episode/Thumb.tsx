// 긴 영상 썸네일 (1280×720). 작게 봐도 읽히게 글자는 2~4단어, 얼굴 하나, 지도 하나
import { AbsoluteFill, Img, staticFile } from "remotion";

const SERIF = "Baskerville, 'Big Caslon', 'Hoefler Text', serif";
const SANS = "-apple-system, 'Helvetica Neue', Arial, sans-serif";

export type ThumbProps = { map: string; face: string; faceFocus?: string; top: string; big: string; look: "red" | "gold" | "dark" | "mix" };

export const Thumb = ({ map, face, faceFocus = "50% 30%", top, big, look }: ThumbProps) => {
  const accent = look === "red" ? "#e5381f" : look === "gold" || look === "mix" ? "#f2c54b" : "#ffffff";
  return (
    <AbsoluteFill style={{ background: "#120f0a", overflow: "hidden" }}>
      <Img src={staticFile(map)} style={{ position: "absolute", left: -120, top: -40, width: 1100, height: 619, filter: look === "dark" ? "sepia(1) brightness(0.45) contrast(1.3)" : "saturate(1.3) contrast(1.1)" }} />
      {/* 오른쪽 얼굴 */}
      <div style={{ position: "absolute", right: -40, top: 0, width: 620, height: 720, overflow: "hidden", maskImage: "linear-gradient(90deg, transparent 0%, #000 22%)", WebkitMaskImage: "linear-gradient(90deg, transparent 0%, #000 22%)" }}>
        <Img src={staticFile(face)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: faceFocus, filter: "contrast(1.15) saturate(1.1)" }} />
      </div>
      <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(10,8,5,0.15) 0%, rgba(10,8,5,0) 40%), linear-gradient(0deg, rgba(10,8,5,0.85) 0%, rgba(10,8,5,0) 45%)" }} />
      <div style={{ position: "absolute", left: 44, bottom: 168, fontFamily: SANS, fontWeight: 900, fontSize: 52, color: "#fff", background: look === "red" || look === "mix" ? "#e5381f" : "#1d1a14", padding: "4px 18px", borderRadius: 8, textTransform: "uppercase" }}>{top}</div>
      <div style={{ position: "absolute", left: 40, bottom: 34, fontFamily: look === "dark" ? SERIF : SANS, fontWeight: 900, fontSize: Math.min(118, Math.round(1180 / (big.length * 0.74))), lineHeight: 1, whiteSpace: "nowrap", color: accent, WebkitTextStroke: "3px #000", paintOrder: "stroke fill", textShadow: "0 8px 24px rgba(0,0,0,0.8)", textTransform: "uppercase", letterSpacing: -1 }}>{big}</div>
    </AbsoluteFill>
  );
};
