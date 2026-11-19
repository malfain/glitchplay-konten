import { z } from "zod";

export const beatSchema = z.object({
  type: z.enum(["hook", "text", "number", "chips", "cta"]),
  start: z.number(),
  end: z.number(),
  speak: z.number(),
  kicker: z.string(),
  head: z.string(),
  pill: z.string().optional(),
  tag: z.string().optional(),
  value: z.number().optional(),
  decimals: z.number().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  chips: z.array(z.string()).optional(),
  sticker: z.string().nullable().optional(),
});

export const reelSchema = z.object({
  kategori: z.string(),
  handle: z.string(),
  sumber: z.string(),
  avatar: z.string().nullable().optional(),
  audio: z.string().nullable().optional(),
  total: z.number(),
  beats: z.array(beatSchema),
});

export type Beat = z.infer<typeof beatSchema>;
export type ReelProps = z.infer<typeof reelSchema>;
