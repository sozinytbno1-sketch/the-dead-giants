/**
 * Smart SFX selector for documentary scenes.
 *
 * Strategy (3 tiers, in order):
 *   1. Per-scene override (script.scenes[].sfx) — if author specifies → use it.
 *   2. Semantic match — keyword regex on voiceText → category → pick from category
 *   3. Template fallback — each template has a default category list
 *
 * Variety: within a category, deterministic round-robin based on sceneId hash.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type SfxIndex = Record<string, string[]>; // category → [filename1.mp3, ...]

export interface SfxPick {
  /** relative path within assets/sfx, e.g. "transition/whoosh.mp3" */
  relPath: string;
  /** which tier picked this */
  source: "override" | "semantic" | "template" | "fallback";
  /** keyword that triggered semantic match (for logging) */
  matchedKeyword?: string;
}

// ── Semantic keyword → SFX category mapping ─────────────────────────────────
// Vietnamese + English keywords. Order matters: first match wins.
export interface SemanticRule {
  keywords: RegExp;
  category: string;
}

export const SEMANTIC_RULES: SemanticRule[] = [
  { keywords: /\b(cảnh báo|nguy hiểm|rủi ro|đáng lo|alert|warning|sự cố)\b/i,         category: "alert" },
  { keywords: /\b(thất bại|sụp đổ|phá sản|sai lầm|crash|fail|wrong|incorrect)\b/i,    category: "fail" },
  { keywords: /\b(kỷ lục|đột phá|vượt|xuất sắc|success|breakthrough|achievement|đạt)\b/i, category: "success" },
  { keywords: /\b(ra mắt|công bố|hé lộ|launch|unveil|reveal|introduce|trình làng|tiết lộ)\b/i, category: "reveal" },
  { keywords: /\b(đỉnh cao|huy hoàng|vĩ đại|legendary|cinematic|epic)\b/i,            category: "cinematic" },
  { keywords: /\b(theo dõi|kết thúc|chia tay|outro|tạm biệt|subscribe)\b/i,           category: "outro" },
];

// ── Default category by template ─────────────────────────────────────────────
// Each template has a primary category; if empty, falls back to next.
export const TEMPLATE_TO_CATEGORY: Record<string, string[]> = {
  hook:           ["transition", "cinematic"],
  comparison:     ["transition", "emphasis"],
  "stat-hero":    ["emphasis", "success"],
  "feature-list": ["transition", "emphasis"],
  callout:        ["alert", "drumroll"],
  outro:          ["outro", "success"],
  // ── Documentary templates ──
  "timeline":     ["cinematic", "reveal"],
  "quote-card":   ["cinematic", "emphasis"],
  "chapter-title":["cinematic", "drumroll"],
  "brand-logo":   ["reveal", "cinematic"],
  "fact-card":    ["emphasis", "success"],
};

/**
 * Build a flat index of available SFX files: { category: [file1.mp3, file2.mp3] }
 */
export function indexSfxLibrary(sfxRoot: string): SfxIndex {
  const out: SfxIndex = {};
  let entries: string[] = [];
  try {
    entries = readdirSync(sfxRoot);
  } catch {
    return out;
  }
  for (const cat of entries) {
    const catPath = join(sfxRoot, cat);
    let st;
    try { st = statSync(catPath); } catch { continue; }
    if (!st.isDirectory()) continue;
    const files = readdirSync(catPath).filter((f) => f.endsWith(".mp3"));
    if (files.length > 0) out[cat] = files;
  }
  return out;
}

/**
 * Stable hash → index for deterministic variety per scene.
 */
function hashIdx(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % Math.max(mod, 1);
}

/**
 * Pick an SFX for a given scene.
 *
 * @returns SfxPick or null if no SFX available
 */
export function pickSfxForScene(args: {
  voiceText: string;
  templateName: string;
  sceneId: string;
  index: SfxIndex;
}): SfxPick | null {
  const { voiceText, templateName, sceneId, index } = args;

  // 2) Semantic match
  for (const rule of SEMANTIC_RULES) {
    const m = voiceText.match(rule.keywords);
    if (m && index[rule.category]?.length) {
      const files = index[rule.category];
      const file = files[hashIdx(sceneId, files.length)];
      return {
        relPath: `${rule.category}/${file}`,
        source: "semantic",
        matchedKeyword: m[0],
      };
    }
  }

  // 3) Template fallback (try primary, then secondary categories)
  const cats = TEMPLATE_TO_CATEGORY[templateName] ?? [];
  for (const cat of cats) {
    const files = index[cat];
    if (files?.length) {
      const file = files[hashIdx(sceneId, files.length)];
      return {
        relPath: `${cat}/${file}`,
        source: "template",
      };
    }
  }

  // 4) Last-ditch: any available SFX
  const allCats = Object.keys(index);
  for (const cat of allCats) {
    if (index[cat]?.length) {
      const file = index[cat][hashIdx(sceneId, index[cat].length)];
      return { relPath: `${cat}/${file}`, source: "fallback" };
    }
  }

  return null;
}

/**
 * Default playback params for an auto-picked SFX:
 *   - alert/fail → louder (0.5), no offset
 *   - cinematic/reveal/drumroll → can play *before* scene by 0.2s for impact
 *   - outro → at start, default volume
 *   - else → default volume 0.4, offset 0
 */
export function defaultPlayback(pick: SfxPick): { volume: number; offsetSec: number } {
  const cat = pick.relPath.split("/")[0];
  if (cat === "alert" || cat === "fail")           return { volume: 0.5, offsetSec: 0 };
  if (cat === "cinematic" || cat === "reveal" || cat === "drumroll") return { volume: 0.45, offsetSec: -0.15 };
  if (cat === "outro")                             return { volume: 0.4, offsetSec: 0 };
  return { volume: 0.4, offsetSec: 0 };
}
