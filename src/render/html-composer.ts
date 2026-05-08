import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Script } from "./script-schema.js";
import type { TemplateDataType } from "./script-schema.js";
import type { YoutubeConfig } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = join(__dirname, "templates");

const DEFAULT_YOUTUBE: YoutubeConfig = {
  channelName: "The Dead Giants",
  handle: "@thedeadgiantsHQ",
  subscribers: "10K subscribers",
};

export interface ComposeArgs {
  script: Script;
  /** per-scene voice durations (s) — needed to compute scene start times */
  sceneAudio: { id: string; durationSec: number }[];
  /** Gap between scenes (s) */
  gapSec: number;
  /** Background image relative path inside output dir, or null */
  bgImageRelPath: string | null;
  /** Audio relative path (e.g. "voice.mp3") */
  audioRelPath: string;
  /** YouTube channel branding (replaces TikTok config in v2) */
  youtube?: YoutubeConfig;
  /** Path to channel logo image relative to output dir (e.g. "youtube-logo.png") */
  youtubeLogoRelPath: string;
  /** Extra seconds the outro scene visually holds AFTER the voice ends */
  outroHoldSec?: number;
}

export async function composeHtml(args: ComposeArgs): Promise<string>;
export function composeHtml(args: ComposeArgs & { __sync: true }): string;
export function composeHtml(args: ComposeArgs | (ComposeArgs & { __sync: true })): any {
  if ("__sync" in args && args.__sync) return _composeHtmlSync(args);
  return _composeHtmlAsync(args);
}

async function _composeHtmlAsync(args: ComposeArgs): Promise<string> {
  const tpl = await readFile(join(TPL_DIR, "base.html.tmpl"), "utf8");
  return _composeWithTemplate(tpl, args);
}

function _composeHtmlSync(args: ComposeArgs): string {
  // Synchronous variant — for tests / re-render path that already has tpl in mem.
  // Falls back to a minimal inline template.
  const tpl = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=1920, height=1080">
<title>{{TITLE}}</title>
<link rel="stylesheet" href="styles.css">
</head><body>
<div id="stage" data-composition-id="dead-giants-doc" data-width="1920" data-height="1080" data-start="0" data-duration="{{TOTAL_DURATION}}">
{{SHELL}}
<audio id="voice" class="clip" data-start="0" data-duration="{{TOTAL_DURATION}}" data-track-index="0" src="voice.mp3"></audio>
{{SCENES}}
</div>
<script src="animations.js"></script>
</body></html>`;
  return _composeWithTemplate(tpl, args);
}

function _composeWithTemplate(tpl: string, args: ComposeArgs): string {
  const { script, sceneAudio, gapSec, bgImageRelPath, audioRelPath, outroHoldSec = 0 } = args;
  const youtube = args.youtube ?? DEFAULT_YOUTUBE;

  // Compute scene start times
  let cursor = 0;
  const starts: Record<string, number> = {};
  for (const a of sceneAudio) {
    starts[a.id] = cursor;
    cursor += a.durationSec + gapSec;
  }
  const totalDur = cursor + outroHoldSec;

  // Find outro id (last scene by definition is type=outro)
  const outroSceneId = script.scenes[script.scenes.length - 1]?.id;

  // Build scene HTML
  const sceneHtml = script.scenes
    .map((scene, idx) => {
      const start = starts[scene.id] ?? 0;
      const audioDur = sceneAudio.find((a) => a.id === scene.id)?.durationSec ?? 4;
      // Outro scene visual extends through outroHoldSec
      const sceneDur = scene.id === outroSceneId ? audioDur + outroHoldSec : audioDur;
      return renderScene(scene.id, scene.type, scene.templateData, start, sceneDur, bgImageRelPath, idx);
    })
    .join("\n\n");

  const shell = renderShell(script.metadata, youtube, args.youtubeLogoRelPath);

  return tpl
    .replace(/\{\{TITLE\}\}/g, escapeHtml(script.metadata.title))
    .replace(/\{\{TOTAL_DURATION\}\}/g, totalDur.toFixed(2))
    .replace(/\{\{SHELL\}\}/g, shell)
    .replace(/\{\{SCENES\}\}/g, sceneHtml)
    .replace(/voice\.mp3/g, audioRelPath);
}

function renderShell(metadata: Script["metadata"], youtube: YoutubeConfig, logoRelPath: string): string {
  const channelName = escapeHtml(youtube.channelName);
  const channelNameUpper = escapeHtml(youtube.channelName.toUpperCase());
  const handle = escapeHtml(youtube.handle);
  const subscribers = escapeHtml(youtube.subscribers);
  const domain = escapeHtml(metadata.source.domain);
  return `
<!-- Shell: persistent brand elements (no data-start → always visible) -->
<div class="shell-bg"></div>

<div class="brand-shell-header">
  <div class="brand-icon">DG</div>
  <div class="brand-text">
    <div class="brand-tag">${channelNameUpper}</div>
    <div class="brand-name">${handle}</div>
  </div>
</div>

<div class="brand-shell-handle">
  <span class="handle-music">♪</span>
  <span class="handle-text">${channelName}</span>
</div>

<div class="brand-shell-keyword"><span>HISTORY · BRANDS · STORIES</span></div>

<div id="grain-overlay">
  <div class="grain-texture"></div>
</div>

${renderYoutubeEndScreen(youtube, logoRelPath)}
<!-- (subscribers ${subscribers}, source ${domain} for reference) -->
`.trim();
}

// ── Per-template renderers ─────────────────────────────────────────────────

function renderScene(
  id: string,
  _type: string,
  data: TemplateDataType,
  startSec: number,
  durationSec: number,
  bgImageRelPath: string | null,
  _index: number
): string {
  const startAttr = startSec.toFixed(2);
  const durAttr = durationSec.toFixed(2);
  const cssDur = `${durationSec.toFixed(2)}s`;
  const layout = data.template;

  const inner = renderLayout(data, bgImageRelPath, durationSec);

  return `
<div class="scene"
     data-scene-id="${escapeHtml(id)}"
     data-layout="${escapeHtml(layout)}"
     data-start="${startAttr}"
     data-duration="${durAttr}"
     style="--scene-dur: ${cssDur};">
  ${inner}
</div>`.trim();
}

function renderLayout(data: TemplateDataType, bgImageRelPath: string | null, _durationSec: number): string {
  switch (data.template) {
    case "hook":          return renderHook(data, bgImageRelPath);
    case "comparison":    return renderComparison(data);
    case "stat-hero":     return renderStatHero(data);
    case "feature-list":  return renderFeatureList(data);
    case "callout":       return renderCallout(data);
    case "outro":         return renderOutro(data);
    case "timeline":      return renderTimeline(data);
    case "quote-card":    return renderQuoteCard(data);
    case "chapter-title": return renderChapterTitle(data);
    case "brand-logo":    return renderBrandLogo(data, bgImageRelPath);
    case "fact-card":     return renderFactCard(data);
  }
}

function bgFor(bgSrc: string | undefined, bgImageRelPath: string | null, kenBurns: string): string {
  if (bgSrc === "$source.image" && bgImageRelPath) {
    return `<div class="bg kb-${escapeHtml(kenBurns)}" style="background-image: url('${escapeHtml(bgImageRelPath)}');"></div>
            <div class="overlay" style="opacity: 0.55;"></div>`;
  }
  if (bgSrc && !bgSrc.startsWith("$") && !bgImageRelPath) {
    return `<div class="bg kb-${escapeHtml(kenBurns)}" style="background-image: url('${escapeHtml(bgSrc)}');"></div>
            <div class="overlay" style="opacity: 0.55;"></div>`;
  }
  if (bgImageRelPath) {
    return `<div class="bg kb-${escapeHtml(kenBurns)}" style="background-image: url('${escapeHtml(bgImageRelPath)}');"></div>
            <div class="overlay" style="opacity: 0.55;"></div>`;
  }
  return `<div class="bg gradient-doc-warm"></div>`;
}

function renderHook(d: Extract<TemplateDataType, { template: "hook" }>, bgImageRelPath: string | null): string {
  const headline = escapeHtml(d.headline);
  const subhead = d.subhead ? `<div class="hook-subhead">${escapeHtml(d.subhead)}</div>` : "";
  return `
${bgFor(d.bgSrc, bgImageRelPath, d.kenBurns)}
<div class="layout-hook">
  <h1 class="hook-headline">${headline}</h1>
  ${subhead}
</div>`.trim();
}

function renderComparison(d: Extract<TemplateDataType, { template: "comparison" }>): string {
  return `
<div class="bg gradient-news-dark"></div>
<div class="layout-comparison">
  <div class="cmp-card color-${escapeHtml(d.left.color)}">
    <div class="cmp-label">${escapeHtml(d.left.label)}</div>
    <div class="cmp-value">${escapeHtml(d.left.value)}</div>
  </div>
  <div class="cmp-vs">VS</div>
  <div class="cmp-card color-${escapeHtml(d.right.color)} ${d.right.winner ? "card-winner" : ""}">
    <div class="cmp-label">${escapeHtml(d.right.label)}</div>
    <div class="cmp-value">${escapeHtml(d.right.value)}</div>
    ${d.right.winner ? `<div class="cmp-winner-badge">★ Winner</div>` : ""}
  </div>
</div>`.trim();
}

function renderStatHero(d: Extract<TemplateDataType, { template: "stat-hero" }>): string {
  const ctx = d.context ? `<div class="stat-context">${escapeHtml(d.context)}</div>` : "";
  return `
<div class="bg gradient-news-dark"></div>
<div class="layout-stat-hero">
  <div class="stat-value">${escapeHtml(d.value)}</div>
  <div class="stat-label">${escapeHtml(d.label)}</div>
  ${ctx}
</div>`.trim();
}

function renderFeatureList(d: Extract<TemplateDataType, { template: "feature-list" }>): string {
  const bullets = d.bullets
    .map((b) => `<div class="feat-bullet"><span class="feat-dot"></span><span class="feat-text">${escapeHtml(b)}</span></div>`)
    .join("\n");
  return `
<div class="bg gradient-news-dark"></div>
<div class="layout-feature-list">
  <div class="feat-card">
    <div class="feat-title">${escapeHtml(d.title)}</div>
    <div class="feat-rule"></div>
    <div class="feat-bullets">
      ${bullets}
    </div>
  </div>
</div>`.trim();
}

function renderCallout(d: Extract<TemplateDataType, { template: "callout" }>): string {
  const tag = d.tag ? `<div class="callout-tag">${escapeHtml(d.tag)}</div>` : "";
  return `
<div class="bg gradient-news-dark"></div>
<div class="layout-callout">
  <div class="callout-card">
    ${tag}
    <div class="callout-statement">${escapeHtml(d.statement)}</div>
  </div>
</div>`.trim();
}

function renderOutro(d: Extract<TemplateDataType, { template: "outro" }>): string {
  return `
<div class="bg gradient-outro-purple"></div>
<div class="layout-outro">
  <div class="out-cta-top">${escapeHtml(d.ctaTop)}</div>
  <div class="out-channel">${escapeHtml(d.channelName)}</div>
  <div class="out-underline"></div>
  <div class="out-source">${escapeHtml(d.source)}</div>
</div>`.trim();
}

function renderTimeline(d: Extract<TemplateDataType, { template: "timeline" }>): string {
  const title = d.title ? `<div class="timeline-title">${escapeHtml(d.title)}</div>` : "";
  const events = d.events
    .map(
      (e) => `
    <div class="timeline-event">
      <div class="timeline-year">${escapeHtml(e.year)}</div>
      <div class="timeline-text">${escapeHtml(e.text)}</div>
    </div>`
    )
    .join("\n");
  return `
<div class="bg gradient-doc-warm"></div>
<div class="layout-timeline">
  ${title}
  <div class="timeline-track">
    ${events}
  </div>
</div>`.trim();
}

function renderQuoteCard(d: Extract<TemplateDataType, { template: "quote-card" }>): string {
  const role = d.role ? `<div class="quote-role">${escapeHtml(d.role)}</div>` : "";
  return `
<div class="bg gradient-doc-warm"></div>
<div class="layout-quote-card">
  <div class="quote-card">
    <span class="quote-mark">&ldquo;</span>
    <div class="quote-text">${escapeHtml(d.quote)}</div>
    <div class="quote-attribution">
      <div class="quote-divider"></div>
      <div class="quote-author">${escapeHtml(d.author)}</div>
      ${role}
    </div>
  </div>
</div>`.trim();
}

function renderChapterTitle(d: Extract<TemplateDataType, { template: "chapter-title" }>): string {
  const sub = d.subtitle ? `<div class="chapter-subtitle">${escapeHtml(d.subtitle)}</div>` : "";
  const padded = String(d.chapterNumber).padStart(2, "0");
  return `
<div class="bg gradient-doc-warm"></div>
<div class="layout-chapter-title">
  <div class="chapter-eyebrow">CHAPTER</div>
  <div class="chapter-number">${padded}</div>
  <div class="chapter-divider"></div>
  <div class="chapter-title">${escapeHtml(d.title)}</div>
  ${sub}
</div>`.trim();
}

function renderBrandLogo(d: Extract<TemplateDataType, { template: "brand-logo" }>, bgImageRelPath: string | null): string {
  const meta: string[] = [];
  if (d.founded) {
    meta.push(`<div class="brand-meta-item"><div class="brand-meta-label">FOUNDED</div><div class="brand-meta-value">${escapeHtml(d.founded)}</div></div>`);
  }
  if (d.country) {
    meta.push(`<div class="brand-meta-item"><div class="brand-meta-label">ORIGIN</div><div class="brand-meta-value">${escapeHtml(d.country)}</div></div>`);
  }
  const metaHtml = meta.length
    ? `<div class="brand-meta">${meta.join('<div class="brand-meta-divider"></div>')}</div>`
    : "";
  return `
${bgFor(d.bgSrc, bgImageRelPath, d.kenBurns)}
<div class="layout-brand-logo">
  <div class="brand-card">
    <div class="brand-eyebrow">THE DEAD GIANT</div>
    <div class="brand-card-name">${escapeHtml(d.brandName)}</div>
    ${metaHtml}
  </div>
</div>`.trim();
}

function renderFactCard(d: Extract<TemplateDataType, { template: "fact-card" }>): string {
  return `
<div class="bg gradient-doc-warm"></div>
<div class="layout-fact-card">
  <div class="fact-card">
    <div class="fact-icon">!</div>
    <div class="fact-label">${escapeHtml(d.label)}</div>
    <div class="fact-text">${escapeHtml(d.fact)}</div>
  </div>
</div>`.trim();
}

// ── YouTube end-screen card (replaces TikTok follow card) ──────────────────

function renderYoutubeEndScreen(youtube: YoutubeConfig, logoRelPath: string): string {
  const name = escapeHtml(youtube.channelName);
  const handle = escapeHtml(youtube.handle);
  const subs = escapeHtml(youtube.subscribers);
  return `
<div id="yt-card" class="yt-card">
  <div class="yt-channel-info">
    <img class="yt-logo" src="${escapeHtml(logoRelPath)}" alt="${name}" crossorigin="anonymous" />
    <div class="yt-channel-text">
      <div class="yt-channel-name">${name}</div>
      <div class="yt-handle">${handle}</div>
      <div class="yt-subscribers">${subs}</div>
    </div>
  </div>
  <div id="yt-subscribe-btn" class="yt-subscribe-btn">
    <span id="yt-btn-subscribe" class="yt-btn-text">Subscribe</span>
    <span id="yt-btn-subscribed" class="yt-btn-text yt-btn-text-subscribed">
      <span>Subscribed</span>
      <span class="yt-check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
    </span>
  </div>
  <div class="yt-watch-next">
    <div class="yt-watch-next-label">WATCH NEXT</div>
    <div class="yt-watch-next-title">More dead giants &raquo;</div>
  </div>
</div>`.trim();
}

// ── Utilities ──────────────────────────────────────────────────────────────

function escapeHtml(s: string | undefined | null): string {
  if (s === undefined || s === null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
