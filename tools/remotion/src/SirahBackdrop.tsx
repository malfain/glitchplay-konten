import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";

// Hand-drawn (SVG) moving scenes for the Glitchplay sirah channel, used when no AI illustration is available.
// No people at all: sky, desert, the Kaaba, mountains, palms and caravans only.
export type BackdropKind = "malam" | "gurun" | "kabah" | "gua" | "madinah";

const W = 1080;
const H = 1920;

const SKY: Record<BackdropKind, [string, string, string]> = {
  malam: ["#070d1f", "#13224a", "#2b3f73"],
  gurun: ["#f3a64a", "#f7c873", "#fbe3a8"],
  kabah: ["#2a2f5c", "#c8735a", "#f4c27a"],
  gua: ["#0a0f22", "#1b2547", "#3a3f63"],
  madinah: ["#f6b26b", "#f9d59a", "#fdf0cf"],
};

const Stars: React.FC<{ count: number; seed: string }> = ({ count, seed }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const x = random(`${seed}x${i}`) * W;
        const y = random(`${seed}y${i}`) * H * 0.55;
        const r = 1.5 + random(`${seed}r${i}`) * 2.8;
        const tw = 0.45 + 0.55 * Math.abs(Math.sin(frame / (18 + random(`${seed}t${i}`) * 30) + i));
        return <circle key={i} cx={x} cy={y} r={r} fill="#fff8e1" opacity={tw} />;
      })}
    </>
  );
};

const Crescent: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g>
    <defs>
      <mask id="crescent">
        <circle cx={x} cy={y} r={92} fill="#fff" />
        <circle cx={x + 38} cy={y - 22} r={84} fill="#000" />
      </mask>
    </defs>
    <circle cx={x} cy={y} r={170} fill="#ffe9a8" opacity={0.08} />
    <circle cx={x} cy={y} r={92} fill="#fff1c4" mask="url(#crescent)" />
  </g>
);

// Flat-roofed old town with the Kaaba in the middle
const OldTown: React.FC<{ y: number; color: string; kaaba?: boolean }> = ({ y, color, kaaba }) => {
  const houses = [
    [0, 140, 210], [150, 120, 160], [260, 150, 240], [400, 110, 180], [640, 130, 200], [760, 160, 250], [910, 170, 190],
  ];
  return (
    <g>
      {houses.map(([x, w, h], i) => (
        <g key={i}>
          <rect x={x} y={y - h} width={w} height={h + 400} fill={color} />
          <rect x={x + w * 0.35} y={y - h + 40} width={22} height={34} fill="#ffcf73" opacity={i % 2 ? 0.85 : 0.35} />
        </g>
      ))}
      {kaaba ? (
        <g>
          <rect x={455} y={y - 190} width={170} height={190} fill="#111" />
          <rect x={455} y={y - 160} width={170} height={20} fill="#d4a63a" />
        </g>
      ) : null}
    </g>
  );
};

const Dunes: React.FC<{ shift: number }> = ({ shift }) => (
  <g>
    <path d={`M${-200 + shift * 0.3} 1380 C 200 1250, 520 1420, 900 1300 S 1500 1360, 1600 1330 L 1600 1920 L -200 1920 Z`} fill="#d9944a" />
    <path d={`M${-300 + shift * 0.6} 1520 C 150 1420, 600 1600, 1000 1470 S 1500 1520, 1700 1500 L 1700 1920 L -300 1920 Z`} fill="#c07a37" />
    <path d={`M${-300 + shift} 1680 C 200 1600, 700 1760, 1100 1640 S 1600 1700, 1800 1680 L 1800 1920 L -300 1920 Z`} fill="#a4652b" />
  </g>
);

const Camel: React.FC<{ x: number; y: number; s: number; step: number }> = ({ x, y, s, step }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill="#3b2412">
    <ellipse cx={0} cy={0} rx={70} ry={34} />
    <ellipse cx={-10} cy={-30} rx={30} ry={26} />
    <path d="M60 -10 Q 95 -40 100 -95 L 118 -95 Q 120 -30 75 10 Z" />
    <ellipse cx={122} cy={-100} rx={22} ry={12} />
    {[-45, -20, 30, 55].map((lx, i) => (
      <rect key={i} x={lx} y={20} width={9} height={78} transform={`rotate(${Math.sin(step + i * 1.6) * 12} ${lx + 4} 20)`} />
    ))}
  </g>
);

const Caravan: React.FC<{ y: number; speed: number }> = ({ y, speed }) => {
  const frame = useCurrentFrame();
  const x0 = 260 + frame * speed;
  return (
    <g>
      {[0, 1, 2, 3].map((i) => (
        <Camel key={i} x={x0 - i * 250} y={y} s={0.9} step={frame / 4 + i} />
      ))}
    </g>
  );
};

const Birds: React.FC<{ count: number }> = ({ count }) => {
  const frame = useCurrentFrame();
  return (
    <g stroke="#2b1a10" strokeWidth={5} fill="none" strokeLinecap="round">
      {Array.from({ length: count }).map((_, i) => {
        const x = ((random(`bx${i}`) * W + frame * (3 + random(`bs${i}`) * 3)) % (W + 200)) - 100;
        const y = 300 + random(`by${i}`) * 600 + Math.sin(frame / 10 + i) * 14;
        const flap = Math.sin(frame / 3 + i) * 10;
        return <path key={i} d={`M${x - 22} ${y - flap} Q ${x - 10} ${y - 12} ${x} ${y} Q ${x + 10} ${y - 12} ${x + 22} ${y - flap}`} />;
      })}
    </g>
  );
};

const Mountains: React.FC<{ color: string; y: number; cave?: boolean }> = ({ color, y, cave }) => (
  <g>
    <path d={`M-100 ${y + 300} L 180 ${y - 120} L 380 ${y + 60} L 600 ${y - 320} L 860 ${y + 40} L 1180 ${y - 80} L 1180 1920 L -100 1920 Z`} fill={color} />
    {cave ? (
      <g>
        <ellipse cx={600} cy={y + 20} rx={150} ry={90} fill="#ffd98a" opacity={0.18} />
        <path d={`M540 ${y + 60} Q 600 ${y - 40} 660 ${y + 60} Z`} fill="#ffcf73" opacity={0.9} />
      </g>
    ) : null}
  </g>
);

const Palm: React.FC<{ x: number; y: number; s: number; sway: number }> = ({ x, y, s, sway }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill="#3a2a14">
    <path d="M-8 0 Q 10 -200 0 -420 L 16 -420 Q 30 -200 12 0 Z" />
    {[-150, -105, -60, -15, 30, 75].map((a, i) => (
      <path key={i} d="M8 -420 Q 90 -470 190 -420 Q 100 -440 8 -410 Z" transform={`rotate(${a + sway} 8 -420)`} />
    ))}
  </g>
);

const Mosque: React.FC<{ y: number }> = ({ y }) => (
  <g fill="#4a3620">
    <rect x={330} y={y - 170} width={420} height={170} />
    <rect x={300} y={y - 190} width={480} height={24} />
    {[360, 450, 540, 630, 700].map((x) => (
      <rect key={x} x={x} y={y - 140} width={14} height={140} fill="#2e2214" />
    ))}
  </g>
);

export const SirahBackdrop: React.FC<{ kind: BackdropKind; index: number; dur: number }> = ({ kind, index, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = frame / (dur * fps);
  const drift = interpolate(p, [0, 1], [0, index % 2 ? -60 : 60]);
  const zoom = interpolate(p, [0, 1], [1.04, 1.14]);
  const [a, b, c] = SKY[kind];
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${a} 0%, ${b} 55%, ${c} 100%)` }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ scale: String(zoom), translate: `${drift}px 0` }}>
        {kind === "malam" && (
          <>
            <Stars count={140} seed={`m${index}`} />
            <Crescent x={780} y={420} />
            <OldTown y={1500} color="#0b1228" kaaba />
          </>
        )}
        {kind === "gurun" && (
          <>
            <circle cx={540} cy={820} r={210} fill="#fff4d0" opacity={0.95} />
            <circle cx={540} cy={820} r={330} fill="#fff4d0" opacity={0.18} />
            <Dunes shift={frame * 0.6} />
            <Caravan y={1370} speed={4} />
          </>
        )}
        {kind === "kabah" && (
          <>
            <circle cx={540} cy={1150} r={260} fill="#ffd98a" opacity={0.35} />
            <Mountains color="#3a2b3f" y={1250} />
            <OldTown y={1600} color="#2a2030" kaaba />
            <Birds count={16} />
          </>
        )}
        {kind === "gua" && (
          <>
            <Stars count={110} seed={`g${index}`} />
            <Mountains color="#151a30" y={1150} cave />
          </>
        )}
        {kind === "madinah" && (
          <>
            <circle cx={300} cy={700} r={170} fill="#fff7dc" opacity={0.95} />
            <path d="M-50 1500 Q 540 1420 1130 1500 L 1130 1920 L -50 1920 Z" fill="#c99a5b" />
            <Mosque y={1520} />
            <Palm x={150} y={1560} s={1.1} sway={Math.sin(frame / 25) * 4} />
            <Palm x={930} y={1580} s={1.25} sway={Math.sin(frame / 22 + 1) * 4} />
            <Palm x={820} y={1600} s={0.8} sway={Math.sin(frame / 28 + 2) * 4} />
          </>
        )}
      </svg>
    </AbsoluteFill>
  );
};
