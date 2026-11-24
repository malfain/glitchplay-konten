import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { F } from "./theme";

// Channel logos as vectors so they stay sharp at any size and can animate:
//  - "clips": GlitchPlayClips (line-art "P" in a dark teal disc, GPC / GLITCHPLAYCLIPS)
//  - "sirah": Glitchplay kisah Nabi (gold eight-point star with a crescent)
// mode "badge" = small looping version for the corner; mode "outro" = big reveal that plays once.
export type LogoVariant = "clips" | "sirah";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// the stylised "P": one continuous line (stem, outer bowl, inner loop) like the profile picture
const P_PATH =
  "M 118 214 L 118 104 Q 118 76 146 76 L 172 76 Q 214 76 214 116 Q 214 156 172 156 L 146 156 Q 136 156 136 146 " +
  "L 136 118 Q 136 104 150 104 L 170 104 Q 186 104 186 116 Q 186 128 170 128 L 156 128";
const P_LEN = 760;

const ClipsMark: React.FC<{ draw: number; glitch: number; shine: number; text: number }> = ({ draw, glitch, shine, text }) => {
  const line = "#d9c7a6";
  const off = glitch * 6;
  const stroke = (color: string, dx: number) => (
    <path d={P_PATH} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round"
      strokeDasharray={P_LEN} strokeDashoffset={P_LEN * (1 - draw)} transform={`translate(${dx} 0)`} />
  );
  return (
    <svg viewBox="0 0 300 300" width="100%" height="100%">
      <defs>
        <clipPath id="disc"><circle cx={150} cy={150} r={146} /></clipPath>
        <linearGradient id="shine" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx={150} cy={150} r={146} fill="#24363e" />
      <circle cx={150} cy={150} r={146} fill="none" stroke="#3b5560" strokeWidth={3} />
      {off > 0.1 ? (
        <g opacity={0.8} style={{ mixBlendMode: "screen" }}>
          {stroke("#ff3a6e", -off)}
          {stroke("#2ad4f0", off)}
        </g>
      ) : null}
      {stroke(line, 0)}
      <g opacity={text} fill={line} textAnchor="middle" fontFamily={F.sans}>
        <text x={150} y={236} fontSize={30} fontWeight={700} letterSpacing={4}>GPC</text>
        <text x={150} y={262} fontSize={17} fontWeight={600} letterSpacing={3}>GLITCHPLAYCLIPS</text>
      </g>
      <g clipPath="url(#disc)">
        <rect x={-120 + shine * 540} y={-20} width={90} height={340} fill="url(#shine)" transform="rotate(18 150 150)" />
      </g>
    </svg>
  );
};

// eight-point star (two overlapping squares) with a crescent: drawn in gold
const SirahMark: React.FC<{ draw: number; spin: number; text: number; shine: number }> = ({ draw, spin, text, shine }) => {
  const gold = "#e9b949";
  const sq = 300;
  return (
    <svg viewBox="0 0 300 300" width="100%" height="100%">
      <defs>
        <mask id="cres">
          <circle cx={150} cy={128} r={44} fill="#fff" />
          <circle cx={168} cy={118} r={38} fill="#000" />
        </mask>
        <radialGradient id="glow"><stop offset="0" stopColor={gold} stopOpacity="0.35" /><stop offset="1" stopColor={gold} stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx={150} cy={128} r={120} fill="url(#glow)" opacity={0.6 + shine * 0.4} />
      <g transform={`rotate(${spin} 150 128)`} fill="none" stroke={gold} strokeWidth={5} strokeLinejoin="round">
        <rect x={88} y={66} width={124} height={124} strokeDasharray={sq * 1.66} strokeDashoffset={sq * 1.66 * (1 - draw)} />
        <rect x={88} y={66} width={124} height={124} transform="rotate(45 150 128)"
          strokeDasharray={sq * 1.66} strokeDashoffset={sq * 1.66 * (1 - draw)} />
      </g>
      <circle cx={150} cy={128} r={44} fill={gold} mask="url(#cres)" opacity={draw} />
      <g opacity={text} textAnchor="middle" fill={gold}>
        <text x={150} y={250} fontFamily="Georgia, 'Times New Roman', serif" fontSize={40} fontWeight={700} letterSpacing={1}>Glitchplay</text>
        <text x={150} y={278} fontFamily={F.sans} fontSize={16} fontWeight={600} letterSpacing={4} fill="#fbf3df">KISAH NABI ﷺ</text>
      </g>
    </svg>
  );
};

// Small corner version: always drawn, gentle life (glitch flicker / slow spin + shine).
export const LogoBadge: React.FC<{ variant: LogoVariant; size: number }> = ({ variant, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const cycle = t % 4;
  const shine = interpolate(cycle, [0, 1.2], [0, 1], clamp);
  const flick = Math.floor(t * 12);
  const glitch = cycle > 2.6 && cycle < 2.9 && random(`g${flick}`) > 0.4 ? 1 : 0;
  return (
    <div style={{ width: size, height: size, scale: String(1 + Math.sin(t * 3) * 0.03) }}>
      {variant === "clips" ? (
        <ClipsMark draw={1} glitch={glitch} shine={shine} text={1} />
      ) : (
        <SirahMark draw={1} spin={t * 12} text={0} shine={Math.abs(Math.sin(t * 1.5))} />
      )}
    </div>
  );
};

// Big end card (≈2 s): line draws itself, text fades in, a glitch hit (clips) or a slow spin (sirah), then a shine.
export const LogoOutro: React.FC<{ variant: LogoVariant }> = ({ variant }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const fade = interpolate(t, [0, 0.25], [0, 1], clamp);
  const draw = interpolate(t, [0.05, 1.0], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const text = interpolate(t, [0.85, 1.25], [0, 1], clamp);
  const pop = interpolate(t, [0, 0.4], [0.8, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
  const shine = interpolate(t, [1.2, 1.9], [0, 1], clamp);
  const glitch = t > 1.0 && t < 1.25 ? random(`o${Math.floor(t * 30)}`) : 0;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: `rgba(0,0,0,${0.6 * fade})`, opacity: fade }}>
      <div style={{ width: 640, height: 640, scale: String(pop), translate: `${glitch * 14 - 7 * Math.sign(glitch)}px 0` }}>
        {variant === "clips" ? (
          <ClipsMark draw={draw} glitch={glitch} shine={shine} text={text} />
        ) : (
          <SirahMark draw={draw} spin={interpolate(t, [0, 2], [-30, 0], clamp)} text={text} shine={shine} />
        )}
      </div>
    </AbsoluteFill>
  );
};
