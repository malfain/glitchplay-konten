import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

// "Glitchy": the GlitchPlay mascot, a little handheld game console with a screen face.
// Talks in sync with the narration (mouth opens on every spoken word), blinks, bounces, waves during the hook,
// looks surprised at numbers, and smiles at the end. Lime for Instagram, sunny yellow for the kids channel.
type Word = { text: string; start: number; end: number };

const LOOK = {
  glitch: { body: "#c6f02c", shade: "#9cc21a", screen: "#0d1120", glow: "#c6f02c", pad: "#0d1120", btnA: "#ff3a6e", btnB: "#2ad4f0", cheek: null },
  kids: { body: "#ffd23f", shade: "#e8b820", screen: "#1d2b53", glow: "#8fe3ff", pad: "#1d2b53", btnA: "#ff7a59", btnB: "#29b6f6", cheek: "#ff9db0" },
} as const;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const Buddy: React.FC<{ theme: "glitch" | "kids"; words: Word[]; hookEnd: number; total: number }> = ({ theme, words, hookEnd, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const c = LOOK[theme];

  const cur = words.find((w) => t >= w.start && t <= w.end + 0.04);
  const talking = !!cur;
  const mouthOpen = talking ? 0.35 + 0.65 * Math.abs(Math.sin((t - cur!.start) * 22)) : 0;
  const excited = !!cur && /\d/.test(cur.text);
  const surprised = t < hookEnd;
  const happy = t > total - 2.4;

  // blink every ~3.2 s (eyes close for 0.12 s)
  const blink = (t % 3.2) > 3.08 ? 0.1 : 1;
  // bounce with squash & stretch, faster while talking
  const beat = Math.sin(t * (talking ? 9 : 4));
  const hop = Math.max(0, beat) * (talking ? 12 : 6);
  const squash = 1 + beat * 0.03;
  // enter: drop in after the hook card
  const enter = interpolate(t, [hookEnd - 0.2, hookEnd + 0.35], [260, 0], { ...clamp, easing: Easing.out(Easing.back(1.5)) });
  const wave = surprised || happy ? Math.sin(t * 14) * 28 : Math.sin(t * 3) * 8;
  const tilt = excited ? Math.sin(t * 20) * 4 : Math.sin(t * 1.6) * 3;

  const eye = (cx: number) =>
    happy ? (
      <path d={`M ${cx - 18} 132 Q ${cx} 112 ${cx + 18} 132`} stroke={c.glow} strokeWidth={9} fill="none" strokeLinecap="round" />
    ) : (
      <rect x={cx - 15} y={surprised || excited ? 104 : 112} width={30} height={(surprised || excited ? 40 : 30) * blink} rx={8}
        fill={c.glow} transform={`translate(0 ${(1 - blink) * 14})`} />
    );

  return (
    <div style={{ position: "absolute", right: 120, top: 1000, width: 300, height: 380, translate: `0 ${enter - hop}px`, rotate: `${tilt}deg`,
      transformOrigin: "bottom center", filter: "drop-shadow(0 16px 18px rgba(0,0,0,.45))" }}>
      <svg viewBox="0 0 300 380" width="100%" height="100%" style={{ scale: `${2 - squash} ${squash}`, transformOrigin: "bottom center" }}>
        {/* legs */}
        <rect x={98} y={318} width={26} height={46} rx={12} fill={c.pad} />
        <rect x={176} y={318} width={26} height={46} rx={12} fill={c.pad} />
        {/* arms: left waves */}
        <g transform={`rotate(${-20 - wave} 58 200)`}>
          <rect x={6} y={190} width={56} height={22} rx={11} fill={c.shade} />
          <circle cx={10} cy={201} r={16} fill={c.body} />
        </g>
        <g transform={`rotate(${12 + Math.sin(t * 2) * 6} 242 210)`}>
          <rect x={238} y={200} width={56} height={22} rx={11} fill={c.shade} />
          <circle cx={290} cy={211} r={16} fill={c.body} />
        </g>
        {/* body */}
        <rect x={52} y={36} width={196} height={292} rx={34} fill={c.body} />
        <rect x={52} y={300} width={196} height={28} rx={14} fill={c.shade} />
        {/* screen face */}
        <rect x={74} y={60} width={152} height={130} rx={18} fill={c.screen} />
        <rect x={74} y={60} width={152} height={130} rx={18} fill="none" stroke={c.shade} strokeWidth={6} />
        {eye(118)}
        {eye(182)}
        {c.cheek ? (
          <>
            <ellipse cx={96} cy={160} rx={12} ry={7} fill={c.cheek} opacity={0.8} />
            <ellipse cx={204} cy={160} rx={12} ry={7} fill={c.cheek} opacity={0.8} />
          </>
        ) : null}
        {/* mouth: talking oval, surprised O, happy grin, idle line */}
        {happy ? (
          <path d="M 128 158 Q 150 182 172 158 Z" fill={c.glow} />
        ) : surprised ? (
          <ellipse cx={150} cy={165} rx={12} ry={14} fill={c.glow} />
        ) : talking ? (
          <ellipse cx={150} cy={163} rx={18} ry={3 + mouthOpen * 13} fill={c.glow} />
        ) : (
          <rect x={136} y={162} width={28} height={6} rx={3} fill={c.glow} />
        )}
        {/* d-pad and buttons */}
        <rect x={86} y={232} width={18} height={54} rx={4} fill={c.pad} />
        <rect x={68} y={250} width={54} height={18} rx={4} fill={c.pad} />
        <circle cx={204} cy={244} r={14} fill={c.btnA} />
        <circle cx={182} cy={272} r={14} fill={c.btnB} />
        {/* antenna with a blinking light */}
        <rect x={146} y={6} width={8} height={32} rx={4} fill={c.shade} />
        <circle cx={150} cy={8} r={10} fill={c.btnA} opacity={0.5 + 0.5 * Math.abs(Math.sin(t * 4))} />
      </svg>
    </div>
  );
};
