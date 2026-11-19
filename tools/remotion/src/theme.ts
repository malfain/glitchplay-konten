import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadMono } from "@remotion/google-fonts/SpaceMono";

export const { fontFamily: SANS } = loadJakarta("normal", { weights: ["600", "800"], subsets: ["latin"] });
export const { fontFamily: MONO } = loadMono("normal", { weights: ["400", "700"], subsets: ["latin"] });

// GlitchPlayClips brand on a dark grid (logo colours: lime, pink, cyan)
export const C = {
  bg: "#0d1120",
  grid: "#1a2136",
  text: "#f5f2e8",
  line: "#f5f2e8", // card borders
  shadow: "#c6f02c", // hard offset shadow under cards
  card: "#161d31",
  hl: "#ff3a6e", // highlight block behind the key word
  hlText: "#ffffff",
  lime: "#c6f02c",
  limeText: "#0d1120",
  pink: "#ff3a6e",
  cyan: "#2ad4f0",
  kicker: "#a9b2cc",
  muted: "#6f7894",
  number: "#c6f02c",
  // mascot outline / dark ink
  ink: "#0d1120",
  cream: "#fbf8ec",
};

// Instagram reel safe zone (UI covers the right rail and the bottom caption area)
export const SAFE = { left: 70, right: 850, top: 230, bottom: 1440 };
