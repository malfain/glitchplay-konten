import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, MONO } from "./theme";
import type { Beat } from "./schema";

// "Gepeci": original GlitchPlay mascot (backwards cap, headset). Bobs idly, hops on each new beat, talks while the voice speaks.
export const Mascot: React.FC<{ beats: Beat[] }> = ({ beats }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const cur = beats.find((b) => t >= b.start && t < b.end);
  const lt = cur ? t - cur.start : 0;
  const hop = cur ? Math.sin(interpolate(lt, [0, 0.35], [0, Math.PI], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })) * 26 : 0;
  const talking = cur ? lt < cur.speak : false;
  const mouth = talking ? 6 + Math.abs(Math.sin(t * 17)) * 14 : 6;
  const blink = t % 3.1 < 0.12;

  return (
    <>
      <div
        style={{
          position: "absolute", left: 640, top: 1420, width: 190, height: 34, borderRadius: "50%", background: "rgba(0,0,0,.45)",
          scale: String(1 - hop / 120),
        }}
      />
      <svg
        viewBox="0 0 270 290"
        style={{
          position: "absolute", left: 600, top: 1150, width: 270, height: 290,
          translate: `0px ${Math.sin(t * 2.4) * 6 - hop}px`,
          rotate: `${Math.sin(t * 1.3) * 2.5}deg`,
          scale: String(interpolate(frame, [0, 0.5 * fps], [0.6, 1], { extrapolateRight: "clamp", easing: Easing.spring({ damping: 12 }) })),
        }}
      >
        <path d="M70 250 q65 -60 130 0 v40 h-130z" fill="#2b2f24" stroke={C.ink} strokeWidth={6} />
        <path d="M118 236 h34 v22 h-34z" fill={C.lime} stroke={C.ink} strokeWidth={5} />
        <ellipse cx={135} cy={140} rx={98} ry={96} fill="#f3c9a4" stroke={C.ink} strokeWidth={7} />
        <path d="M44 118 q8 -82 92 -84 q84 2 92 84 q-92 -26 -184 0z" fill={C.pink} stroke={C.ink} strokeWidth={7} strokeLinejoin="round" />
        <path d="M200 92 q40 4 46 30 q-24 8 -40 -6z" fill={C.pink} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
        <rect x={112} y={58} width={46} height={26} rx={6} fill={C.cream} stroke={C.ink} strokeWidth={5} />
        <text x={135} y={78} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={17} fill={C.ink}>GPC</text>
        <path d="M34 150 q0 -40 22 -50" fill="none" stroke={C.ink} strokeWidth={10} strokeLinecap="round" />
        <rect x={22} y={132} width={30} height={48} rx={12} fill={C.cyan} stroke={C.ink} strokeWidth={6} />
        <path d="M40 178 q10 40 58 44" fill="none" stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
        <circle cx={100} cy={222} r={9} fill={C.lime} stroke={C.ink} strokeWidth={5} />
        <g transform={blink ? "translate(0 146) scale(1 .15) translate(0 -146)" : undefined}>
          <ellipse cx={104} cy={146} rx={11} ry={14} fill={C.ink} />
          <ellipse cx={170} cy={146} rx={11} ry={14} fill={C.ink} />
          <circle cx={108} cy={141} r={4} fill="#fff" />
          <circle cx={174} cy={141} r={4} fill="#fff" />
        </g>
        <path d="M90 124 q14 -8 28 0 M156 124 q14 -8 28 0" fill="none" stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
        <ellipse cx={86} cy={178} rx={13} ry={8} fill="#ff9aa9" opacity={0.7} />
        <ellipse cx={190} cy={178} rx={13} ry={8} fill="#ff9aa9" opacity={0.7} />
        <ellipse cx={137} cy={186} rx={20} ry={mouth} fill="#7a1f2b" stroke={C.ink} strokeWidth={5} />
      </svg>
    </>
  );
};
