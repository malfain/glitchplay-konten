import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, Easing, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { F, applyTheme } from "./theme";
import { SirahBackdrop } from "./SirahBackdrop";
import { LogoBadge, LogoOutro } from "./BrandLogo";
import { Mascot } from "./Mascot";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";

const { fontFamily: ANTON } = loadAnton("normal", { weights: ["400"], subsets: ["latin"] });
const NEWS_RED = "#e53935";
import type { Beat } from "./schema";
import { Kids3D, KIDS3D_KINDS, type Kids3DKind } from "./Kids3D";

// "Documentary" Shorts: full-bleed AI photos with a slow Ken Burns move, big word-by-word captions (active word yellow),
// voiceover. Scenes and caption words carry their own start/end seconds (computed by tools/render_video.py).

export const photoReelSchema = z.object({
  theme: z.enum(["kids", "glitch", "sirah"]).optional(),
  handle: z.string(),
  audio: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  total: z.number(),
  scenes: z.array(z.object({ src: z.string(), start: z.number(), end: z.number(), video: z.boolean().optional(), cut: z.boolean().optional(), light: z.boolean().optional(),
    heads: z.array(z.object({ x: z.number(), y: z.number(), r: z.number(), white: z.boolean().optional() })).optional(),
    vector: z.enum(["malam", "gurun", "kabah", "gua", "madinah", "luarangkasa", "bumi", "laut", "alam", "sains", "tatasurya", "gunungberapi", "dinosaurus"]).optional() })),
  words: z.array(z.object({ text: z.string(), start: z.number(), end: z.number(), chunk: z.number() })),
  label: z.string().optional(),
  hook: z.string().optional(),
  episode: z.number().optional(),
  // Instagram news cover (2 s opening, also the grid thumbnail): headline with *highlighted* words + round inset picture
  emphasis: z.array(z.string()).optional(), // words to show bigger + accent colour (storyboard "subtitle besar")
  cover: z.object({ title: z.string(), inset: z.string().optional(), tag: z.string().optional(), brand: z.string().optional(), hook: z.string().optional() }).optional(),
  // character drawn in OpenToonz, exported as a PNG sequence with transparency (tools/render_video.py fills this)
  maskot: z.object({ frames: z.array(z.string()), fps: z.number() }).optional(),
  // animated channel logo from OpenToonz (PNG sequence): loops in the corner badge, plays big as a 2 s outro
  logo: z.object({ frames: z.array(z.string()), fps: z.number() }).optional(),
});
export type PhotoReelProps = z.infer<typeof photoReelSchema>;

const FADE = 0.45; // crossfade between photos (s)
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// active-word colour and badge ring per channel
const ACCENT = { kids: "#ffd23f", glitch: "#c6f02c", sirah: "#e9b949" } as const;

const HOOK_END = 3.0; // the big hook card covers the first 3 s (the scroll-stopping moment)

export const PhotoReel: React.FC<PhotoReelProps> = ({ theme, handle, audio, avatar, total, scenes, words, label, hook, episode, maskot, logo, cover, emphasis }) => {
  const th = theme ?? "kids";
  applyTheme(th);
  const accent = ACCENT[th];
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
          {s.vector && KIDS3D_KINDS.includes(s.vector as Kids3DKind) ? (
            <Kids3D kind={s.vector as Kids3DKind} dur={s.end - s.start + FADE} />
          ) : s.vector ? (
            <SirahBackdrop kind={s.vector as "malam" | "gurun" | "kabah" | "gua" | "madinah"} index={i} dur={s.end - s.start + FADE} />
          ) : (
            <KenBurns src={s.src} index={i} dur={s.end - s.start + FADE} fadeIn={i > 0 && !s.cut} video={!!s.video} heads={s.heads} />
          )}
          {s.light ? <Nur /> : null}
        </Sequence>
      ))}
      {/* a soft whoosh on every picture change keeps the pace audible */}
      {scenes.slice(1).map((s, i) => (
        <Sequence key={`w${i}`} name={`whoosh ${i + 2}`} from={Math.max(0, Math.round(s.start * fps) - 4)} durationInFrames={Math.round(fps)}>
          <Audio src={staticFile("sfx/whoosh.wav")} volume={0.14} />
        </Sequence>
      ))}
      {/* legibility: soft dark band behind the captions, vignette at the bottom */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,0) 70%, rgba(0,0,0,.45) 100%)" }} />
      {cover ? (
        <Sequence name="cover berita" durationInFrames={Math.round(COVER_END * fps)}>
          <NewsCover {...cover} />
        </Sequence>
      ) : hook ? (
        <Sequence name="hook" durationInFrames={Math.round(HOOK_END * fps)}>
          <Hook text={hook} accent={accent} episode={episode} />
        </Sequence>
      ) : null}
      <Sequence name="teks" from={cover ? Math.round(COVER_END * fps) : hook ? Math.round(HOOK_END * fps) : 0}>
        <Captions words={words} accent={accent} offset={cover ? COVER_END : hook ? HOOK_END : 0} news={!!cover} emphasis={emphasis} />
      </Sequence>
      {cover ? <NewsFooter brand={cover.brand} /> : null}
      {maskot && maskot.frames.length ? (
        <Maskot frames={maskot.frames} fps={maskot.fps} />
      ) : th !== "sirah" ? (
        // with the news cover the mascot waits until the headline is gone
        <Sequence name="maskot" from={cover ? Math.round(COVER_END * fps) : 0}>
          <Mascot beats={beatsFromWords(words, total).map((b) => ({ ...b, start: b.start - (cover ? COVER_END : 0), end: b.end - (cover ? COVER_END : 0) }))} />
        </Sequence>
      ) : null}
      <Sequence name="outro logo" from={Math.max(0, Math.round((total - OUTRO) * fps))}>
        {logo && logo.frames.length ? <Outro frames={logo.frames} fps={logo.fps} /> : <LogoOutro variant={th === "sirah" ? "sirah" : "clips"} />}
      </Sequence>
      <Progress total={total} accent={accent} />
      <Badge handle={handle} avatar={avatar ?? null} accent={accent} episode={episode} logo={logo} variant={th === "sirah" ? "sirah" : "clips"} />
      <Sequence name="label gambar" from={cover ? Math.round(COVER_END * fps) : 0}>
        <div style={{ position: "absolute", left: 70, top: 1400, font: `600 26px ${F.sans}`, color: "rgba(255,255,255,.75)" }}>
          {label ?? "Gambar dibuat dengan AI"}
        </div>
      </Sequence>
      {audio ? <Audio src={staticFile(audio)} /> : null}
    </AbsoluteFill>
  );
};

// Photos get a slow Ken Burns move; trailer clips play muted (looped if the scene outlasts the clip) with a gentle push-in.
const KenBurns: React.FC<{ src: string; index: number; dur: number; fadeIn: boolean; video: boolean; heads?: { x: number; y: number; r: number }[] }> = ({ src, index, dur, fadeIn, video, heads }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dirs = [[-40, -20], [40, -30], [-30, 30], [30, 20]];
  const [dx, dy] = dirs[index % dirs.length];
  const zoomIn = index % 2 === 0;
  return (
    <AbsoluteFill style={{ opacity: fadeIn ? interpolate(frame, [0, FADE * fps], [0, 1], clamp) : 1 }}>
      {video ? (
        <Video
          src={staticFile(src)}
          muted
          loop
          style={{ width: "100%", height: "100%", objectFit: "cover", scale: String(interpolate(frame, [0, dur * fps], [1.0, 1.08], clamp)) }}
        />
      ) : (
      <div
        style={{
          position: "absolute", inset: 0,
          scale: String(interpolate(frame, [0, dur * fps], zoomIn ? [1.06, 1.2] : [1.2, 1.06], clamp)),
          translate: `${interpolate(frame, [0, dur * fps], [0, dx], clamp)}px ${interpolate(frame, [0, dur * fps], [0, dy], clamp)}px`,
        }}
      >
        <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {/* lights sit inside the moving layer so they stay exactly on the heads while the picture pans */}
        {(heads ?? []).map((h, k) => <HeadLight key={k} {...h} />)}
      </div>
      )}
    </AbsoluteFill>
  );
};

// Shows one short chunk (2–3 words) at a time; the word being spoken is yellow and pops slightly.
const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const Captions: React.FC<{ words: PhotoReelProps["words"]; accent: string; offset: number; news?: boolean; emphasis?: string[] }> = ({ words, accent, offset, news, emphasis }) => {
  const strong = new Set((emphasis ?? []).flatMap((e) => e.split(/\s+/)).map(norm).filter(Boolean));
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps + offset;
  let cur: PhotoReelProps["words"][number] | undefined;
  for (const w of words) if (w.start <= t + 0.02) cur = w;
  if (!cur || t > cur.end + 0.6) return null;
  const chunk = words.filter((w) => w.chunk === cur.chunk);
  const chunkStart = chunk[0].start;
  const pop = interpolate(t - chunkStart, [0, 0.18], [0.85, 1], { ...clamp, easing: Easing.out(Easing.back(2)) });
  if (news) { // news style: condensed uppercase, the spoken word sits in a red box
    return (
      <div style={{ position: "absolute", left: 60, right: 220, top: 330, textAlign: "center", scale: String(pop) }}>
        {chunk.map((w, i) => {
          const active = t >= w.start && t < w.end + 0.05;
          return (
            <span key={i} style={{ display: "inline-block", margin: "4px 8px", padding: active ? "0 14px" : "0 2px", fontFamily: ANTON, fontSize: 104,
              lineHeight: 1.08, textTransform: "uppercase", color: "#fff", background: active ? NEWS_RED : "transparent",
              textShadow: active ? "none" : "0 4px 0 rgba(0,0,0,.7), 0 0 24px rgba(0,0,0,.6)" }}>
              {w.text}
            </span>
          );
        })}
      </div>
    );
  }
  return (
    <div style={{ position: "absolute", left: 70, right: 230, top: 330, textAlign: "center", scale: String(pop) }}>
      {chunk.map((w, i) => {
        const active = t >= w.start && t < w.end + 0.05;
        const big = strong.has(norm(w.text));
        return (
          <span
            key={i}
            style={{
              display: "inline-block", margin: "0 12px", fontFamily: F.sans, fontWeight: 700, fontSize: big ? 112 : 92, lineHeight: 1.1,
              textTransform: "uppercase", letterSpacing: 1, color: active || big ? accent : "#ffffff",
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

const Badge: React.FC<{ handle: string; avatar: string | null; accent: string; episode?: number; logo?: PhotoReelProps["logo"]; variant: "clips" | "sirah" }> = ({ handle, avatar, accent, episode, logo, variant }) => (
  <div
    style={{
      position: "absolute", left: 70, top: 240, display: "flex", alignItems: "center", gap: 12, padding: "6px 20px 6px 6px",
      borderRadius: 999, background: "rgba(0,0,0,.45)", border: "2px solid rgba(255,255,255,.35)", color: "#fff",
      font: `700 28px ${F.sans}`,
    }}
  >
    {logo && logo.frames.length ? (
      <LogoLoop frames={logo.frames} fps={logo.fps} size={64} />
    ) : (
      <LogoBadge variant={variant} size={60} />
    )}
    {handle}
    {episode ? <span style={{ marginLeft: 4, padding: "2px 12px", borderRadius: 999, background: accent, color: "#111", fontSize: 24 }}>Eps {episode}</span> : null}
  </div>
);

// The opening card: huge words on a tilted accent band, slams in, then gets out of the way.
const Hook: React.FC<{ text: string; accent: string; episode?: number }> = ({ text, accent, episode }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const slam = interpolate(t, [0, 0.22], [1.6, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
  const out = interpolate(t, [HOOK_END - 0.25, HOOK_END], [1, 0], clamp);
  const shake = t < 0.35 ? Math.sin(frame * 2.2) * 6 * (1 - t / 0.35) : 0;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 34, opacity: out, background: "rgba(0,0,0,.35)" }}>
      {episode ? (
        <div style={{ font: `800 46px ${F.sans}`, letterSpacing: 8, color: "#fff", textShadow: "0 4px 0 rgba(0,0,0,.6)" }}>EPISODE {episode}</div>
      ) : null}
      <div
        style={{
          maxWidth: 940, padding: "26px 40px", background: accent, color: "#0b0b0f", rotate: "-3deg",
          translate: `${shake}px 0`, scale: String(slam), textAlign: "center", borderRadius: 18,
          font: `800 108px ${F.sans}`, lineHeight: 1.02, textTransform: "uppercase", letterSpacing: 1,
          boxShadow: "0 18px 0 rgba(0,0,0,.45), 0 0 80px rgba(0,0,0,.5)",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// Thin progress bar at the very top: viewers stay when they can see how little is left.
const Progress: React.FC<{ total: number; accent: string }> = ({ total, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const w = interpolate(frame / fps, [0, Math.max(1, total)], [0, 100], clamp);
  return <div style={{ position: "absolute", left: 0, top: 0, height: 10, width: `${w}%`, background: accent, opacity: 0.9 }} />;
};

// Scenes with the Prophet ﷺ: a bright white-gold light over the upper centre (where the prompt puts the figure's head),
// opaque at the core so no face can ever show, softly breathing with a few rays.
const Nur: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const breathe = 1 + Math.sin(t * 2.1) * 0.04;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute", left: 540 - 520, top: 640 - 520, width: 1040, height: 1040, borderRadius: "50%",
          rotate: `${t * 6}deg`, opacity: 0.55,
          background: "repeating-conic-gradient(from 0deg, rgba(255,240,200,.55) 0deg 4deg, rgba(255,240,200,0) 4deg 18deg)",
          maskImage: "radial-gradient(circle, #000 20%, transparent 68%)", WebkitMaskImage: "radial-gradient(circle, #000 20%, transparent 68%)",
        }}
      />
      <div
        style={{
          position: "absolute", left: 540 - 340, top: 640 - 340, width: 680, height: 680, borderRadius: "50%", scale: String(breathe),
          background: "radial-gradient(circle, #ffffff 0%, #fffdf3 26%, rgba(255,246,214,.92) 40%, rgba(255,226,150,.55) 58%, rgba(255,214,120,0) 72%)",
          filter: "blur(6px)",
        }}
      />
    </AbsoluteFill>
  );
};

// OpenToonz character: loops its own drawn frames at its own frame rate, pops in after the hook, bobs gently.
const Maskot: React.FC<{ frames: string[]; fps: number }> = ({ frames, fps: animFps }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const i = Math.floor(t * animFps) % frames.length;
  const pop = interpolate(t, [HOOK_END, HOOK_END + 0.35], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.8)) });
  return (
    <div
      style={{
        position: "absolute", right: 150, top: 1030, width: 360, height: 360, scale: String(pop),
        translate: `0 ${Math.sin(t * 2.4) * 10}px`, transformOrigin: "bottom center",
        filter: "drop-shadow(0 14px 18px rgba(0,0,0,.45))",
      }}
    >
      <Img src={staticFile(frames[i])} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
    </div>
  );
};

const OUTRO = 2; // seconds of big logo at the end

const LogoLoop: React.FC<{ frames: string[]; fps: number; size: number; once?: boolean }> = ({ frames, fps: animFps, size, once }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.floor((frame / fps) * animFps);
  const i = once ? Math.min(n, frames.length - 1) : n % frames.length;
  return <Img src={staticFile(frames[i])} style={{ width: size, height: size, objectFit: "contain" }} />;
};

// Outro: the channel logo animation plays once, big, over a darkened frame.
const Outro: React.FC<{ frames: string[]; fps: number }> = ({ frames, fps }) => {
  const frame = useCurrentFrame();
  const { fps: vfps } = useVideoConfig();
  const t = frame / vfps;
  const fade = interpolate(t, [0, 0.3], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: `rgba(0,0,0,${0.55 * fade})`, opacity: fade }}>
      <LogoLoop frames={frames} fps={fps} size={620} once />
    </AbsoluteFill>
  );
};

// The original "Gepeci" mascot (GlitchReel) expects beats: one per caption chunk; it hops on each and talks while spoken.
const beatsFromWords = (words: PhotoReelProps["words"], total: number): Beat[] => {
  const chunks = new Map<number, { start: number; end: number }>();
  for (const w of words) {
    const c = chunks.get(w.chunk);
    chunks.set(w.chunk, c ? { start: Math.min(c.start, w.start), end: Math.max(c.end, w.end) } : { start: w.start, end: w.end });
  }
  const list = [...chunks.values()].sort((a, b) => a.start - b.start);
  return list.map((c, i) => ({ start: c.start, end: i + 1 < list.length ? list[i + 1].start : total, speak: c.end - c.start }) as unknown as Beat);
};

// Opaque white-gold light over one head (sirah): solid core reaches ~1.25x the head radius, so no part of the head shows.
const HeadLight: React.FC<{ x: number; y: number; r: number }> = ({ x, y, r }) => {
  const frame = useCurrentFrame();
  const R = Math.max(r, 36) * 2.4;
  const breathe = 1 + Math.sin(frame / 9) * 0.03;
  return (
    <>
      <div style={{ position: "absolute", left: x - R * 1.6, top: y - R * 1.6, width: R * 3.2, height: R * 3.2, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,236,180,.55) 0%, rgba(255,226,150,.25) 35%, rgba(255,214,120,0) 70%)" }} />
      <div style={{ position: "absolute", left: x - R, top: y - R, width: R * 2, height: R * 2, borderRadius: "50%", scale: String(breathe),
        background: "radial-gradient(circle, #ffffff 0%, #fffdf5 40%, #fff6dc 52%, rgba(255,240,200,.85) 62%, rgba(255,226,150,0) 100%)" }} />
    </>
  );
};

const COVER_END = 3.0;

/** "*kata*" → highlighted (white on red), like the reference news covers */
const renderTitle = (title: string) =>
  title.split(/(\*[^*]+\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith("*") ? (
      <span key={i} style={{ background: NEWS_RED, padding: "0 12px", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>{part.slice(1, -1)}</span>
    ) : (
      <span key={i}>{part}</span>
    ));

// Opening news cover (also what the Instagram grid shows): dark bottom, small red tag, big condensed headline with red
// highlighted words, a round inset picture with a red ring.
const NewsCover: React.FC<{ title: string; inset?: string; tag?: string; hook?: string }> = ({ title, inset, tag, hook }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const rise = interpolate(t, [0, 0.35], [40, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  const fade = interpolate(t, [COVER_END - 0.25, COVER_END], [1, 0], clamp);
  const pop = interpolate(t, [0.1, 0.45], [0.6, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,.55) 55%, rgba(0,0,0,.92) 78%, #000 100%)" }} />
      {hook ? (
        // hook 3 lapis, layer 3 (on-screen text): a yellow punch sticker at the top that stops the scroll
        <div style={{ position: "absolute", left: 60, right: 60, top: 330, textAlign: "center", scale: String(pop), rotate: "-3deg" }}>
          <span style={{ display: "inline-block", background: "#ffd400", color: "#111", fontFamily: ANTON, fontSize: 96, lineHeight: 1.1,
            textTransform: "uppercase", padding: "10px 30px", borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,.45)" }}>{hook}</span>
        </div>
      ) : null}
      {inset ? (
        <div style={{ position: "absolute", right: 70, top: hook ? 540 : 420, width: 330, height: 330, borderRadius: "50%", overflow: "hidden",
          border: `10px solid ${NEWS_RED}`, boxShadow: "0 10px 40px rgba(0,0,0,.5)", scale: String(pop) }}>
          <Img src={staticFile(inset)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : null}
      <div style={{ position: "absolute", left: 50, right: 50, bottom: 240, textAlign: "center", translate: `0 ${rise}px` }}>
        <div style={{ display: "inline-block", background: NEWS_RED, color: "#fff", font: `800 26px ${F.sans}`, letterSpacing: 2,
          padding: "6px 16px", borderRadius: 4, marginBottom: 18 }}>{(tag || "TODAY HIGHLIGHT").toUpperCase()}</div>
        <div style={{ fontFamily: ANTON, fontSize: 108, lineHeight: 1.24, color: "#fff", textTransform: "uppercase",
          textShadow: "0 4px 0 rgba(0,0,0,.6)" }}>{renderTitle(title)}</div>
      </div>
    </AbsoluteFill>
  );
};

// Thin brand strip at the very bottom, like the reference ("community" left, "Swipe for More!" right)
const NewsFooter: React.FC<{ brand?: string }> = ({ brand }) => (
  <div style={{ position: "absolute", left: 50, right: 50, bottom: 150, display: "flex", justifyContent: "space-between", alignItems: "center",
    font: `700 24px ${F.sans}`, color: "rgba(255,255,255,.85)", letterSpacing: 1 }}>
    <span>{(brand || "GLITCHPLAYCLIPS · GAMER INDONESIA").toUpperCase()}</span>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><i style={{ width: 18, height: 18, borderRadius: "50%", background: NEWS_RED, display: "inline-block" }} />Follow for More!</span>
  </div>
);
