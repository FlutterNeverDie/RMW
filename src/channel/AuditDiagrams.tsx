// YouTube API 감사 신청서(섹션 6)에 올리는 그림 2장: 구조도 · 사용 흐름도 (1600×900)
import { AbsoluteFill } from "remotion";

const FONT = "-apple-system, 'Helvetica Neue', Arial, sans-serif";
const INK = "#1f2937";
const LINE = "#94a3b8";

const Box = ({ x, y, w, h, title, lines, fill = "#ffffff", stroke = INK }: { x: number; y: number; w: number; h: number; title: string; lines: string[]; fill?: string; stroke?: string }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, height: h, border: `3px solid ${stroke}`, borderRadius: 16, background: fill, padding: "18px 22px", boxSizing: "border-box" }}>
    <div style={{ fontSize: 26, fontWeight: 700, color: INK, marginBottom: 8 }}>{title}</div>
    {lines.map((l) => (
      <div key={l} style={{ fontSize: 19, color: "#475569", lineHeight: 1.45 }}>
        {l}
      </div>
    ))}
  </div>
);

const Arrow = ({ x1, y1, x2, y2, label }: { x1: number; y1: number; x2: number; y2: number; label?: string }) => {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const hx = x2 - 16 * Math.cos(a);
  const hy = y2 - 16 * Math.sin(a);
  return (
    <>
      <svg width={1600} height={900} style={{ position: "absolute", inset: 0 }}>
        <line x1={x1} y1={y1} x2={hx} y2={hy} stroke={LINE} strokeWidth={4} />
        <polygon points={`${x2},${y2} ${hx - 10 * Math.sin(a)},${hy + 10 * Math.cos(a)} ${hx + 10 * Math.sin(a)},${hy - 10 * Math.cos(a)}`} fill={LINE} />
      </svg>
      {label && (
        <div style={{ position: "absolute", left: (x1 + x2) / 2 - 170, top: (y1 + y2) / 2 - 42, width: 340, textAlign: "center", fontSize: 17, color: "#334155", background: "rgba(248,250,252,0.95)", borderRadius: 8, padding: "4px 6px" }}>{label}</div>
      )}
    </>
  );
};

const Frame = ({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) => (
  <AbsoluteFill style={{ background: "#f8fafc", fontFamily: FONT }}>
    <div style={{ position: "absolute", left: 60, top: 40, fontSize: 38, fontWeight: 800, color: INK }}>{title}</div>
    <div style={{ position: "absolute", left: 60, top: 92, fontSize: 21, color: "#64748b" }}>{sub}</div>
    {children}
  </AbsoluteFill>
);

export const Architecture = () => (
  <Frame title="HMW Uploader - Architecture" sub="Internal command-line tool run only by the owner of the ReStory Worlds Map channel. Single user, no server, no third-party data.">
    <Box x={60} y={190} w={430} h={300} title="Owner's computer (macOS)" lines={["Node.js script: scripts/youtube.mjs", "Reads finished MP4 + metadata JSON", "(title, description, tags, publishAt)", "OAuth refresh token stored locally,", "file permission 600 (owner only)"]} fill="#eef2ff" />
    <Box x={600} y={190} w={400} h={300} title="Google OAuth 2.0" lines={["Desktop client, loopback redirect", "(http://127.0.0.1)", "Scopes:", "youtube.upload", "youtube.readonly"]} fill="#ecfeff" />
    <Box x={1110} y={190} w={430} h={300} title="YouTube Data API v3" lines={["videos.insert (resumable upload)", "channels.list (mine=true)", "", "Target: the owner's own channel", "ReStory Worlds Map (UCGZi-DrIm6w5hF2_K69fWvQ)"]} fill="#fef2f2" />
    <Arrow x1={490} y1={340} x2={600} y2={340} />
    <Arrow x1={1000} y1={340} x2={1110} y2={340} />
    <div style={{ position: "absolute", left: 420, top: 150, width: 260, textAlign: "center", fontSize: 18, color: "#334155" }}>1. sign in / refresh token</div>
    <div style={{ position: "absolute", left: 950, top: 150, width: 210, textAlign: "center", fontSize: 18, color: "#334155" }}>2. access token</div>
    {/* 3번: 상자 아래로 돌아서 */}
    <svg width={1600} height={900} style={{ position: "absolute", inset: 0 }}>
      <polyline points="275,490 275,545 1325,545 1325,506" fill="none" stroke={LINE} strokeWidth={4} />
      <polygon points="1325,490 1315,508 1335,508" fill={LINE} />
    </svg>
    <div style={{ position: "absolute", left: 500, top: 552, width: 600, textAlign: "center", fontSize: 18, color: "#334155" }}>3. upload video + metadata to the owner's own channel</div>
    <Box x={60} y={620} w={1480} h={210} title="Data handling" lines={["- Stores nothing from the YouTube API except the owner's own OAuth refresh token, on the owner's machine.", "- Does not access, display, store or share any other user's data. No end users, no public interface.", "- Quota: about 2-5 uploads per week (default 10,000 units/day is sufficient)."]} fill="#ffffff" stroke={LINE} />
  </Frame>
);

export const UserFlow = () => (
  <Frame title="HMW Uploader - User flow" sub="The only user is the channel owner. Steps happen on the owner's own computer.">
    {[
      ["1. Make the video", ["Owner renders a history video", "(MP4) and writes metadata", "(title, description, tags)."]],
      ["2. One-time sign-in", ["Owner runs 'auth', approves", "in Google's consent screen.", "Refresh token saved locally."]],
      ["3. Upload", ["Owner runs 'upload' or 'queue'.", "Tool calls videos.insert,", "optional publishAt schedule."]],
      ["4. Confirm", ["Tool prints the video link.", "Owner checks it in", "YouTube Studio."]],
    ].map(([t, l], i) => (
      <Box key={t as string} x={60 + i * 380} y={240} w={330} h={260} title={t as string} lines={l as string[]} fill={["#eef2ff", "#ecfeff", "#fef2f2", "#f0fdf4"][i]} />
    ))}
    {[0, 1, 2].map((i) => (
      <Arrow key={i} x1={390 + i * 380} y1={370} x2={440 + i * 380} y2={370} />
    ))}
    <Box x={60} y={590} w={1480} h={200} title="No other users" lines={["The tool is not distributed or offered to anyone. It never reads other channels, comments or analytics,", "and it never shows YouTube data to anyone. It only uploads the owner's own videos to the owner's own channel."]} fill="#ffffff" stroke={LINE} />
  </Frame>
);
