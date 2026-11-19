import { loadFont as loadFredoka } from "@remotion/google-fonts/Fredoka";
import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadMono } from "@remotion/google-fonts/SpaceMono";

const { fontFamily: JAKARTA } = loadJakarta("normal", { weights: ["600", "800"], subsets: ["latin"] });
const { fontFamily: SPACE_MONO } = loadMono("normal", { weights: ["400", "700"], subsets: ["latin"] });
const { fontFamily: FREDOKA } = loadFredoka("normal", { weights: ["500", "700"], subsets: ["latin"] });

export type ThemeName = "glitch" | "kids";

type Palette = {
  bg: string; bgImage: string; bgSize: string; text: string; line: string; shadow: string; card: string; hl: string; hlText: string;
  lime: string; limeText: string; pink: string; cyan: string; kicker: string; muted: string; number: string; ink: string; cream: string;
};

const PALETTES: Record<ThemeName, Palette> = {
  // GlitchPlayClips brand on a dark grid (logo colours: lime, pink, cyan)
  glitch: {
    bg: "#0d1120",
    bgImage: "linear-gradient(#1a2136 2px, transparent 2px), linear-gradient(90deg, #1a2136 2px, transparent 2px)",
    bgSize: "54px 54px",
    text: "#f5f2e8", line: "#f5f2e8", shadow: "#c6f02c", card: "#161d31", hl: "#ff3a6e", hlText: "#ffffff",
    lime: "#c6f02c", limeText: "#0d1120", pink: "#ff3a6e", cyan: "#2ad4f0", kicker: "#a9b2cc", muted: "#6f7894",
    number: "#c6f02c", ink: "#0d1120", cream: "#fbf8ec",
  },
  // kids channel: bright sky, sunny yellow, coral; polka dots
  kids: {
    bg: "#bfe8ff",
    bgImage: "radial-gradient(#9fd8fb 9px, transparent 10px)",
    bgSize: "64px 64px",
    text: "#1d2b53", line: "#1d2b53", shadow: "#ff7a59", card: "#ffffff", hl: "#ff7a59", hlText: "#ffffff",
    lime: "#ffd23f", limeText: "#1d2b53", pink: "#ff6fb5", cyan: "#29b6f6", kicker: "#33427a", muted: "#4f6096",
    number: "#ff7a59", ink: "#1d2b53", cream: "#fffaf0",
  },
};

// Mutable on purpose: GlitchReel calls applyTheme() with its `theme` prop before any child renders, so every component
// can keep reading C / F without prop-drilling. Props are constant for a whole render, so frames stay deterministic.
export const C: Palette = { ...PALETTES.glitch };
export const F = { sans: JAKARTA, mono: SPACE_MONO, headTracking: -4 };

export const applyTheme = (name: ThemeName) => {
  Object.assign(C, PALETTES[name]);
  F.sans = name === "kids" ? FREDOKA : JAKARTA;
  F.mono = name === "kids" ? FREDOKA : SPACE_MONO;
  F.headTracking = name === "kids" ? -1 : -4;
};

// Reel safe zone (platform UI covers the right rail and the bottom caption area)
export const SAFE = { left: 70, right: 850, top: 230, bottom: 1440 };
