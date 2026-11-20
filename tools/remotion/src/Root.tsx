import { CalculateMetadataFunction, Composition } from "remotion";
import { GlitchReel } from "./GlitchReel";
import { PhotoReel, photoReelSchema, type PhotoReelProps } from "./PhotoReel";
import { reelSchema, type ReelProps } from "./schema";

// Duration follows the voiceover: tools/render_video.py measures each sentence and passes `total` in the props.
const calculateMetadata: CalculateMetadataFunction<ReelProps> = ({ props }) => ({
  durationInFrames: Math.max(30, Math.ceil(props.total * 30)),
});

const photoMetadata: CalculateMetadataFunction<PhotoReelProps> = ({ props }) => ({
  durationInFrames: Math.max(30, Math.ceil(props.total * 30)),
});

export const RemotionRoot: React.FC = () => {
  return (
    <>
    <Composition
      id="GlitchReel"
      component={GlitchReel}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      schema={reelSchema}
      calculateMetadata={calculateMetadata}
      defaultProps={{
        kategori: "Esports",
        handle: "@glitchplayclips",
        sumber: "Esports.id, Dot Esports",
        avatar: "profile.jpg",
        audio: null,
        total: 10.2,
        beats: [
          { type: "hook", start: 0, end: 2.6, speak: 2.2, kicker: "15 Desember, Indonesia jadi pusat esports dunia.", head: "15 desember, catat", pill: "berita game · 20 Nov 2026", sticker: "update!" },
          { type: "number", start: 2.6, end: 5.0, speak: 2.0, kicker: "Diikuti 101 negara.", head: "diikuti", tag: "fakta", value: 101, decimals: 0, prefix: "", suffix: "negara", sticker: "gokil!" },
          { type: "chips", start: 5.0, end: 7.8, speak: 2.4, kicker: "Ada Mobile Legends, PUBG Mobile, CS2, Dota 2, dan eFootball.", head: "game yang dilombakan", chips: ["Mobile Legends", "PUBG Mobile", "CS2", "Dota 2", "eFootball"] },
          { type: "cta", start: 7.8, end: 10.2, speak: 2.0, kicker: "Follow biar nggak ketinggalan jadwal tim Indonesia.", head: "follow", tag: "biar nggak ketinggalan", sticker: "follow!" },
        ],
      }}
    />
    <Composition
      id="PhotoReel"
      component={PhotoReel}
      durationInFrames={150}
      fps={30}
      width={1080}
      height={1920}
      schema={photoReelSchema}
      calculateMetadata={photoMetadata}
      defaultProps={{
        handle: "GlitchPlayClips",
        audio: null,
        avatar: "profile.jpg",
        total: 5,
        label: "Gambar dibuat dengan AI",
        scenes: [{ src: "profile.jpg", start: 0, end: 5 }],
        words: [
          { text: "Tahukah", start: 0.2, end: 0.7, chunk: 0 },
          { text: "kamu?", start: 0.7, end: 1.2, chunk: 0 },
          { text: "Gurita", start: 1.4, end: 1.9, chunk: 1 },
          { text: "punya", start: 1.9, end: 2.3, chunk: 1 },
          { text: "tiga", start: 2.5, end: 2.9, chunk: 2 },
          { text: "jantung!", start: 2.9, end: 3.6, chunk: 2 },
        ],
      }}
    />
    </>
  );
};