import { Audio } from "@remotion/media";
import { AbsoluteFill, Easing, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { F, applyTheme } from "./theme";

// "Documentary" Shorts: full-bleed AI photos with a slow Ken Burns move, big word-by-word captions (active word yellow),
// voiceover. Scenes and caption words carry their own start/end seconds (computed by tools/render_video.py).

export const photoReelSchema = z.object({
  handle: z.string(),
  audio: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  total: z.number(),
  scenes: z.array(z.object({ src: z.string(), start: z.number(), end: z.number() })),
  words: z.array(z.object({ text: z.string(), start: z.number(), end: z.number(), chunk: z.number() })),
  label: z.string().optional(),
});
export type PhotoReelProps = z.infer<typeof photoReelSchema>;

const FADE = 0.45; // crossfade between photos (s)
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const PhotoReel: React.FC<PhotoReelProps> = ({ handle, audio, avatar, scenes, words, label }) => {
  applyTheme("kids");
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {scenes.map((s, i) => (
        <Sequence
          key={i}
          name={`foto ${i + 1}`}
          from={Math.round(s.start * fps)}
          durationInFrames={Math.max(1, Math.round((s.end - s.start + (i < scenes.length - 1 ? FADE : 0)) * fps))}
        >
          <KenBurns src={s.src} index={i} dur={s.end - s.start + FADE} fadeIn={i > 0} />
        </Sequence>
      ))}
      {/* legibility: soft dark band behind the captions, vignette at the bottom */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,0) 70%, rgba(0,0,0,.45) 100%)" }} />
      <Captions words={words} />
      <Badge handle={handle} avatar={avatar ?? null} />
      <div style={{ position: "absolute", left: 70, top: 1400, font: `600 26px ${F.sans}`, color: "rgba(255,255,255,.75)" }}>
        {label ?? "Gambar dibuat dengan AI"}
      </div>
      {audio ? <Audio src={staticFile(audio)} /> : null}
    </AbsoluteFill>
  );
};

const KenBurns: React.FC<{ src: string; index: number; dur: number; fadeIn: boolean }> = ({ src, index, dur, fadeIn }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dirs = [[-40, -20], [40, -30], [-30, 30], [30, 20]];
  const [dx, dy] = dirs[index % dirs.length];
  const zoomIn = index % 2 === 0;
  return (
    <AbsoluteFill style={{ opacity: fadeIn ? interpolate(frame, [0, FADE * fps], [0, 1], clamp) : 1 }}>
      <Img
        src={staticFile(src)}
        style={{
          width: "100%", height: "100%", objectFit: "cover",
          scale: String(interpolate(frame, [0, dur * fps], zoomIn ? [1.06, 1.2] : [1.2, 1.06], clamp)),
          translate: `${interpolate(frame, [0, dur * fps], [0, dx], clamp)}px ${interpolate(frame, [0, dur * fps], [0, dy], clamp)}px`,
        }}
      />
    </AbsoluteFill>
  );
};

// Shows one short chunk (2–3 words) at a time; the word being spoken is yellow and pops slightly.
const Captions: React.FC<{ words: PhotoReelProps["words"] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  let cur: PhotoReelProps["words"][number] | undefined;
  for (const w of words) if (w.start <= t + 0.02) cur = w;
  if (!cur || t > cur.end + 0.6) return null;
  const chunk = words.filter((w) => w.chunk === cur.chunk);
  const chunkStart = chunk[0].start;
  const pop = interpolate(t - chunkStart, [0, 0.18], [0.85, 1], { ...clamp, easing: Easing.out(Easing.back(2)) });
  return (
    <div style={{ position: "absolute", left: 70, right: 230, top: 330, textAlign: "center", scale: String(pop) }}>
      {chunk.map((w, i) => {
        const active = t >= w.start && t < w.end + 0.05;
        return (
          <span
            key={i}
            style={{
              display: "inline-block", margin: "0 12px", fontFamily: F.sans, fontWeight: 700, fontSize: 92, lineHeight: 1.1,
              textTransform: "uppercase", letterSpacing: 1, color: active ? "#ffd23f" : "#ffffff",
              WebkitTextStroke: "3px rgba(0,0,0,.85)", paintOrder: "stroke fill",
              textShadow: "0 6px 0 rgba(0,0,0,.55), 0 0 30px rgba(0,0,0,.5)",
              scale: active ? "1.06" : "1",
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};

const Badge: React.FC<{ handle: string; avatar: string | null }> = ({ handle, avatar }) => (
  <div
    style={{
      position: "absolute", left: 70, top: 240, display: "flex", alignItems: "center", gap: 12, padding: "6px 20px 6px 6px",
      borderRadius: 999, background: "rgba(0,0,0,.45)", border: "2px solid rgba(255,255,255,.35)", color: "#fff",
      font: `700 28px ${F.sans}`,
    }}
  >
    {avatar ? <Img src={staticFile(avatar)} style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid #ffd23f" }} /> : null}
    {handle}
  </div>
);
