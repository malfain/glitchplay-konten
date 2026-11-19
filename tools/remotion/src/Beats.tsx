import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Beat } from "./schema";
import { C, F, SAFE } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// One spoken sentence = one beat. Frame 0 here is the start of the sentence (each beat lives in its own <Sequence>).
export const BeatScene: React.FC<{ beat: Beat; index: number; handle: string }> = ({ beat, index, handle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = (beat.end - beat.start) * fps;
  const exit = interpolate(frame, [dur - 0.22 * fps, dur], [0, 1], clamp);

  return (
    <div style={{ position: "absolute", inset: 0, opacity: 1 - exit, translate: `0px ${-40 * exit}px` }}>
      <div style={{ position: "absolute", left: SAFE.left, top: 400, width: SAFE.right - SAFE.left }}>
        {beat.type === "hook" ? <Pill text={beat.pill ?? ""} /> : <Kicker text={beat.kicker} />}
        {beat.type === "cta" ? null : <Headline text={beat.head} size={beat.type === "number" || beat.type === "chips" ? 96 : 118} />}
        {beat.type === "number" ? <NumberCard beat={beat} dur={dur} /> : null}
        {beat.type === "chips" ? <Chips items={beat.chips ?? []} /> : null}
        {beat.type === "cta" ? <FollowNote tag={beat.tag ?? ""} head={beat.head} handle={handle} /> : null}
      </div>
      {beat.sticker ? <Sticker text={beat.sticker} left={index % 2 ? 380 : 90} top={beat.type === "cta" ? 1080 : 1250} /> : null}
    </div>
  );
};

const Kicker: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        font: `400 30px/1.35 ${F.mono}`, color: C.kicker, marginBottom: 26, maxWidth: 760,
        opacity: interpolate(frame, [0, 0.3 * fps], [0, 1], clamp),
        translate: `${interpolate(frame, [0, 0.3 * fps], [-40, 0], { ...clamp, easing: Easing.out(Easing.cubic) })}px 0px`,
      }}
    >
      {text}
    </div>
  );
};

const Pill: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        display: "inline-block", font: `700 28px ${F.mono}`, border: `3px solid ${C.line}`, borderRadius: 999, padding: "6px 22px",
        background: C.card, color: C.text, marginBottom: 26,
        opacity: interpolate(frame, [0, 0.25 * fps], [0, 1], clamp),
        scale: String(interpolate(frame, [0, 0.35 * fps], [0.8, 1], { ...clamp, easing: Easing.spring({ damping: 10 }) })),
      }}
    >
      {text}
    </div>
  );
};

// Words pop up one after another; the last word(s) land in an olive highlight block that wipes in.
const Headline: React.FC<{ text: string; size: number }> = ({ text, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(/\s+/).filter(Boolean);
  const n = words.length <= 5 ? 1 : 2;
  const plain = words.slice(0, words.length - n);
  const hl = words.slice(words.length - n).join(" ");
  const pop = (i: number) => spring({ frame: frame - 0.08 * fps - i * 0.07 * fps, fps, config: { damping: 11, stiffness: 160 } });
  const wipe = interpolate(frame, [(0.25 + words.length * 0.05) * fps, (0.6 + words.length * 0.05) * fps], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const wordStyle = (i: number): React.CSSProperties => ({
    display: "inline-block", marginRight: 22,
    opacity: interpolate(frame, [0.08 * fps + i * 0.07 * fps, 0.2 * fps + i * 0.07 * fps], [0, 1], clamp),
    translate: `0px ${(1 - pop(i)) * 60}px`,
  });
  return (
    <div style={{ fontFamily: F.sans, fontWeight: 800, fontSize: size, lineHeight: 1.04, letterSpacing: F.headTracking, color: C.text }}>
      {plain.map((w, i) => (
        <span key={i} style={wordStyle(i)}>{w}</span>
      ))}
      <br />
      <span style={{ ...wordStyle(plain.length), position: "relative", color: C.hlText, padding: "0 18px 8px", margin: "6px 0" }}>
        <span style={{ position: "absolute", inset: 0, background: C.hl, borderRadius: 10, transformOrigin: "left", scale: `${wipe} 1` }} />
        <span style={{ position: "relative" }}>{hl}</span>
      </span>
    </div>
  );
};

const cardStyle = (frame: number, fps: number, delay: number): React.CSSProperties => {
  const k = spring({ frame: frame - delay * fps, fps, config: { damping: 12 } });
  return {
    marginTop: 48, border: `4px solid ${C.line}`, borderRadius: 26, background: C.card, boxShadow: `0 10px 0 ${C.shadow}`, color: C.text,
    padding: "34px 38px", width: 780,
    opacity: interpolate(frame, [delay * fps, (delay + 0.15) * fps], [0, 1], clamp),
    translate: `0px ${(1 - k) * 80}px`, rotate: `${(1 - k) * -2}deg`,
  };
};

const Tag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ display: "inline-block", background: C.lime, color: C.limeText, font: `700 26px ${F.mono}`, borderRadius: 8, padding: "4px 14px" }}>{children}</span>
);

const NumberCard: React.FC<{ beat: Beat; dur: number }> = ({ beat, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = interpolate(frame, [0.45 * fps, 0.45 * fps + Math.max(0.6 * fps, dur * 0.55)], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const v = (beat.value ?? 0) * k;
  const dec = beat.decimals ?? 0;
  const shown = dec ? v.toFixed(dec).replace(".", ",") : Math.round(v).toLocaleString("id-ID");
  return (
    <div style={cardStyle(frame, fps, 0.3)}>
      <Tag>{beat.tag}</Tag>
      <div style={{ fontFamily: F.sans, fontWeight: 800, fontSize: 210, lineHeight: 1, letterSpacing: -8, color: C.number, marginTop: 18, whiteSpace: "nowrap" }}>
        {beat.prefix ? <small style={{ fontSize: 80, letterSpacing: -2, color: C.text, marginRight: 8 }}>{beat.prefix}</small> : null}
        {shown}
        <small style={{ fontSize: 80, letterSpacing: -2, color: C.text, marginLeft: 10 }}>{beat.suffix}</small>
      </div>
      <div style={{ marginTop: 22, height: 30, border: `4px solid ${C.line}`, borderRadius: 999, overflow: "hidden", background: C.bg }}>
        <div style={{ height: "100%", width: `${k * 100}%`, background: C.lime, borderRight: `4px solid ${C.line}` }} />
      </div>
    </div>
  );
};

const Chips: React.FC<{ items: string[] }> = ({ items }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bg = [C.lime, C.card, C.pink];
  const fg = [C.limeText, C.text, C.hlText];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 30, width: 790 }}>
      {items.map((c, i) => {
        const k = spring({ frame: frame - (0.35 + i * 0.12) * fps, fps, config: { damping: 10, stiffness: 170 } });
        return (
          <span
            key={i}
            style={{
              fontFamily: F.sans, fontWeight: 800, fontSize: 46, border: `4px solid ${C.line}`, borderRadius: 999, padding: "10px 30px",
              background: bg[i % 3], color: fg[i % 3], boxShadow: `0 7px 0 ${C.cyan}`, scale: String(k), opacity: k > 0.02 ? 1 : 0,
            }}
          >
            {c}
          </span>
        );
      })}
    </div>
  );
};

const FollowNote: React.FC<{ tag: string; head: string; handle: string }> = ({ tag, head, handle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mark = interpolate(frame, [0.7 * fps, 1.1 * fps], [0, 100], clamp);
  return (
    <div style={{ ...cardStyle(frame, fps, 0.15), padding: "30px 34px 30px 92px", position: "relative", width: 790 }}>
      <div
        style={{
          position: "absolute", left: 30, top: 26, bottom: 26, width: 30,
          background: `radial-gradient(circle, transparent 7px, ${C.line} 8px, ${C.line} 11px, transparent 12px) 0 0 / 30px 62px repeat-y`,
        }}
      />
      <Tag>{tag}</Tag>
      <div style={{ fontFamily: F.sans, fontWeight: 800, fontSize: 86, lineHeight: 1.05, letterSpacing: -3, marginTop: 18, color: C.text }}>
        {head}
        <br />
        <span style={{ color: C.hlText, background: `linear-gradient(90deg, ${C.hl} ${mark}%, transparent ${mark}%) 0 60% / 100% 70% no-repeat`, padding: "0 8px" }}>{handle}</span>
      </div>
    </div>
  );
};

const Sticker: React.FC<{ text: string; left: number; top: number }> = ({ text, left, top }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = spring({ frame: frame - 0.55 * fps, fps, config: { damping: 8, stiffness: 180 } });
  return (
    <div
      style={{
        position: "absolute", left, top, fontFamily: F.sans, fontWeight: 800, fontSize: 50, padding: "12px 34px", border: `4px solid ${C.ink}`,
        borderRadius: 999, background: C.lime, boxShadow: `0 8px 0 ${C.pink}`, whiteSpace: "nowrap", color: C.ink,
        scale: String(k), opacity: k > 0.02 ? 1 : 0, rotate: `${-8 + 3 * Math.sin((frame / fps) * 3)}deg`,
      }}
    >
      {text}
    </div>
  );
};
