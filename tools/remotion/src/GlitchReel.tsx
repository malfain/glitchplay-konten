import { Audio } from "@remotion/media";
import { AbsoluteFill, Img, Sequence, staticFile, useVideoConfig } from "remotion";
import { BeatScene } from "./Beats";
import { Mascot } from "./Mascot";
import type { ReelProps } from "./schema";
import { C, F, applyTheme } from "./theme";

// GlitchPlay news reel: dark brand grid background, account badge, one animated scene per spoken sentence, mascot, voiceover.
export const GlitchReel: React.FC<ReelProps> = ({ theme, handle, sumber, avatar, audio, beats }) => {
  applyTheme(theme ?? "glitch");
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.bg,
        backgroundImage: C.bgImage,
        backgroundSize: C.bgSize,
        backgroundPosition: "-2px -2px",
        fontFamily: F.sans,
        color: C.text,
      }}
    >
      <HandleBadge handle={handle} avatar={avatar ?? null} />
      {beats.map((b, i) => (
        <Sequence
          key={i}
          name={`${i + 1}. ${b.type}`}
          from={Math.round(b.start * fps)}
          durationInFrames={Math.max(1, Math.round((b.end - b.start) * fps))}
        >
          <BeatScene beat={b} index={i} handle={handle} />
        </Sequence>
      ))}
      <Mascot beats={beats} />
      {sumber ? (
        <div style={{ position: "absolute", left: 70, top: 1452, font: `400 24px ${F.mono}`, color: C.muted }}>sumber: {sumber}</div>
      ) : null}
      {audio ? <Audio src={staticFile(audio)} /> : null}
      {/* light sound design: a soft whoosh on every scene change, a ding when a number card lands */}
      {beats.slice(1).map((b, i) => (
        <Audio key={`w${i}`} src={staticFile("sfx/whoosh.wav")} from={Math.round(b.start * fps)} volume={0.18} />
      ))}
      {beats.map((b, i) =>
        b.type === "number" ? <Audio key={`d${i}`} src={staticFile("sfx/ding.wav")} from={Math.round((b.start + 0.45) * fps)} volume={0.22} /> : null,
      )}
    </AbsoluteFill>
  );
};

// Small account badge (replaces the old browser-window header)
const HandleBadge: React.FC<{ handle: string; avatar: string | null }> = ({ handle, avatar }) => (
  <div
    style={{
      position: "absolute", left: 70, top: 250, display: "flex", alignItems: "center", gap: 14, font: `700 30px ${F.mono}`, color: C.text,
      border: `3px solid ${C.line}`, borderRadius: 999, padding: "6px 22px 6px 6px", background: C.card,
    }}
  >
    {avatar ? <Img src={staticFile(avatar)} style={{ width: 56, height: 56, borderRadius: "50%", border: `3px solid ${C.pink}` }} /> : null}
    {handle}
  </div>
);
