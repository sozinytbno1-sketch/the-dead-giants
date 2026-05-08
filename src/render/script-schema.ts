import { z } from "zod";

// ── Template data shapes (discriminated by template field) ─────────────────

const HookData = z.object({
  template: z.literal("hook"),
  headline: z.string().min(1).max(60),
  subhead: z.string().max(60).optional(),
  /** background image path (literal "$source.image" → substituted at pipeline level) */
  bgSrc: z.string().optional(),
  /** Ken Burns effect class */
  kenBurns: z.enum(["zoom-in", "zoom-out", "pan-left", "pan-right"]).default("zoom-in"),
});

const ComparisonSide = z.object({
  label: z.string().min(1).max(40),
  value: z.string().min(1).max(30),
  color: z.enum(["cyan", "purple", "gold", "amber"]),
});

const ComparisonData = z.object({
  template: z.literal("comparison"),
  left: ComparisonSide,
  right: ComparisonSide.extend({ winner: z.boolean().optional() }),
});

const StatHeroData = z.object({
  template: z.literal("stat-hero"),
  value: z.string().min(1).max(30),
  label: z.string().min(1).max(60),
  context: z.string().max(80).optional(),
});

const FeatureListData = z.object({
  template: z.literal("feature-list"),
  title: z.string().min(1).max(60),
  bullets: z.array(z.string().min(1).max(80)).min(1).max(5),
  icon: z.string().optional(),
});

const CalloutData = z.object({
  template: z.literal("callout"),
  statement: z.string().min(1).max(140),
  tag: z.string().max(30).optional(),
});

const OutroData = z.object({
  template: z.literal("outro"),
  ctaTop: z.string().min(1).max(40),
  channelName: z.string().min(1).max(40),
  source: z.string().min(1).max(60),
});

// ── NEW: Documentary templates ─────────────────────────────────────────────

const TimelineEvent = z.object({
  year: z.string().min(1).max(20),
  text: z.string().min(1).max(80),
});

const TimelineData = z.object({
  template: z.literal("timeline"),
  title: z.string().max(60).optional(),
  events: z.array(TimelineEvent).min(2).max(6),
});

const QuoteCardData = z.object({
  template: z.literal("quote-card"),
  quote: z.string().min(1).max(240),
  author: z.string().min(1).max(40),
  role: z.string().max(60).optional(),
});

const ChapterTitleData = z.object({
  template: z.literal("chapter-title"),
  /** Chapter number — rendered prominently above the title */
  chapterNumber: z.number().int().min(0).max(99),
  title: z.string().min(1).max(60),
  subtitle: z.string().max(80).optional(),
});

const BrandLogoData = z.object({
  template: z.literal("brand-logo"),
  brandName: z.string().min(1).max(40),
  founded: z.string().max(20).optional(),
  country: z.string().max(40).optional(),
  /** Background image path (literal "$source.image" works too) */
  bgSrc: z.string().optional(),
  kenBurns: z.enum(["zoom-in", "zoom-out", "pan-left", "pan-right"]).default("zoom-in"),
});

const FactCardData = z.object({
  template: z.literal("fact-card"),
  label: z.string().min(1).max(40),
  fact: z.string().min(1).max(200),
});

// ── Discriminated union ────────────────────────────────────────────────────

export const TemplateData = z.discriminatedUnion("template", [
  HookData,
  ComparisonData,
  StatHeroData,
  FeatureListData,
  CalloutData,
  OutroData,
  TimelineData,
  QuoteCardData,
  ChapterTitleData,
  BrandLogoData,
  FactCardData,
]);

export type TemplateDataType = z.infer<typeof TemplateData>;

// ── SFX schema ─────────────────────────────────────────────────────────────
/**
 * Per-scene sound effect override. If omitted, the pipeline picks a default
 * SFX based on the template type (see SKILL.md / sfx-selector).
 *
 * `name` examples: "transition/whoosh-soft", "emphasis/ding", "cinematic/rise"
 *   → resolves to assets/sfx/<name>.mp3
 * Set `name: "none"` to explicitly disable SFX for this scene.
 */
const SfxSpec = z.object({
  name: z.string().min(1),
  /** Volume 0–1, default 0.4 (so SFX doesn't drown the voice) */
  volume: z.number().min(0).max(1).default(0.4),
  /** Seconds offset from scene start (default 0). Negative = before scene. */
  startOffsetSec: z.number().default(0),
});

export type SfxSpecType = z.infer<typeof SfxSpec>;

// ── Scene schema ───────────────────────────────────────────────────────────

const Scene = z.object({
  id: z.string().min(1),
  type: z.enum(["hook", "body", "outro"]),
  voiceText: z.string().min(1),
  templateData: TemplateData,
  /** Optional sound effect override (else pipeline picks per template) */
  sfx: SfxSpec.optional(),
});

// ── Root schema ────────────────────────────────────────────────────────────

export const ScriptSchema = z.object({
  version: z.literal("1.0"),
  metadata: z.object({
    title: z.string().min(1),
    source: z.object({
      url: z.string(),
      domain: z.string(),
      image: z.string().url().nullable(),
    }),
    channel: z.string().min(1),
  }),
  voice: z.object({
    provider: z.literal("lucylab"),
    voiceId: z.string().min(1),
    speed: z.number().min(0.5).max(2.0),
  }),
  scenes: z
    .array(Scene)
    .min(15)
    .max(60, "scenes must have at most 60 items")
    .refine(
      (s) => s[0]?.type === "hook",
      { message: "scenes[0] must be type=hook" }
    )
    .refine(
      (s) => s[s.length - 1]?.type === "outro",
      { message: "last scene must be type=outro" }
    ),
});

export type Script = z.infer<typeof ScriptSchema>;
