import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { composeHtml } from "./html-composer.js";
import { ScriptSchema, type Script } from "./script-schema.js";
import type { YoutubeConfig } from "../config.js";

const YT: YoutubeConfig = {
  channelName: "The Dead Giants",
  handle: "@thedeadgiantsHQ",
  subscribers: "10K subscribers",
};

const loadScript = (name: string): Script =>
  ScriptSchema.parse(JSON.parse(readFileSync(`tests/fixtures/${name}`, "utf8")));

describe("composeHtml", () => {
  it("produces well-formed 16:9 HTML for documentary script with image", () => {
    const script = loadScript("sample-doc-with-image.json");
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 4.0 }));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.5,
      bgImageRelPath: "images/bg.jpg",
      audioRelPath: "voice.mp3",
      youtube: YT,
      youtubeLogoRelPath: "youtube-logo.png",
      outroHoldSec: 5,
      __sync: true,
    });

    // ── HyperFrames structural requirements (landscape 1920×1080) ─────────
    expect(html).toContain('id="stage"');
    expect(html).toContain('data-composition-id="dead-giants-doc"');
    expect(html).toContain('data-width="1920"');
    expect(html).toContain('data-height="1080"');
    expect(html).not.toContain('data-width="1080"');
    expect(html).not.toContain('data-height="1920"');

    expect(html).toContain('id="voice"');

    // ── New brand shell ───────────────────────────────────────────────────
    expect(html).toContain("THE DEAD GIANTS");
    expect(html).toContain("@thedeadgiantsHQ");
    // Old TikTok branding must NOT appear
    expect(html).not.toContain("Công nghệ 24h");
    expect(html).not.toContain("@congnghe24h");
    expect(html).not.toContain("TIN CÔNG NGHỆ");

    // ── YouTube end-screen card ────────────────────────────────────────────
    expect(html).toContain('id="yt-card"');
    expect(html).toContain('class="yt-subscribe-btn"');
    expect(html).toContain("Subscribe");
    expect(html).toContain("Subscribed");
    expect(html).toContain("WATCH NEXT");
    expect(html).toContain("youtube-logo.png");
    // Old TikTok follow card must NOT appear
    expect(html).not.toContain('data-composition-id="tiktok-follow"');
    expect(html).not.toContain("Following");

    // ── Hook scene ────────────────────────────────────────────────────────
    expect(html).toContain('data-layout="hook"');

    // Image background present
    expect(html).toContain('class="bg kb-zoom-in"');
    expect(html).toContain("background-image: url('images/bg.jpg')");

    // ── New documentary templates render ─────────────────────────────────
    expect(html).toContain('data-layout="brand-logo"');
    expect(html).toContain('class="brand-card-name"');

    expect(html).toContain('data-layout="chapter-title"');
    expect(html).toContain('class="chapter-number"');
    expect(html).toContain('class="chapter-title"');
    expect(html).toMatch(/<div class="chapter-number">0[1-4]<\/div>/);

    expect(html).toContain('data-layout="timeline"');
    expect(html).toContain('class="timeline-track"');
    expect(html).toContain('class="timeline-event"');
    expect(html).toContain('class="timeline-year"');

    expect(html).toContain('data-layout="quote-card"');
    expect(html).toContain('class="quote-text"');
    expect(html).toContain('class="quote-author"');
    expect(html).toContain("Ray Kroc");

    expect(html).toContain('data-layout="fact-card"');
    expect(html).toContain('class="fact-label"');
    expect(html).toContain('class="fact-text"');

    // ── Existing templates still work ─────────────────────────────────────
    expect(html).toContain('data-layout="stat-hero"');
    expect(html).toContain('data-layout="feature-list"');
    expect(html).toContain('data-layout="comparison"');
    expect(html).toContain('data-layout="callout"');

    // ── Outro ─────────────────────────────────────────────────────────────
    expect(html).toContain('data-layout="outro"');
    expect(html).toContain("The Dead Giants");

    // Audio src
    expect(html).toContain('src="voice.mp3"');
    expect(html).toMatch(/data-duration="[\d.]+"/);
  });

  it("emits <video> tag for mp4 background instead of <div background-image>", () => {
    const script = loadScript("sample-doc-with-image.json");
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 4 }));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.5,
      bgImageRelPath: "images/bg.mp4",
      audioRelPath: "voice.mp3",
      youtube: YT,
      youtubeLogoRelPath: "youtube-logo.png",
      __sync: true,
    });
    // Video element with playback attributes for headless rendering
    expect(html).toContain('<video class="bg kb-zoom-in"');
    expect(html).toContain("autoplay");
    expect(html).toContain("loop");
    expect(html).toContain("muted");
    expect(html).toContain("playsinline");
    expect(html).toContain('src="images/bg.mp4"');
    // Should NOT use background-image for mp4
    expect(html).not.toContain("background-image: url('images/bg.mp4')");
  });

  it("emits <video> tag for webm and mov backgrounds too", () => {
    const script = loadScript("sample-doc-with-image.json");
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 4 }));
    for (const ext of ["webm", "mov", "m4v"]) {
      const html = composeHtml({
        script,
        sceneAudio,
        gapSec: 0.5,
        bgImageRelPath: `images/bg.${ext}`,
        audioRelPath: "voice.mp3",
        youtube: YT,
        youtubeLogoRelPath: "youtube-logo.png",
        __sync: true,
      });
      expect(html).toContain(`src="images/bg.${ext}"`);
      expect(html).toContain('<video class="bg kb-');
    }
  });

  it("still uses background-image for image extensions (jpg/png/webp)", () => {
    const script = loadScript("sample-doc-with-image.json");
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 4 }));
    for (const ext of ["jpg", "png", "webp"]) {
      const html = composeHtml({
        script,
        sceneAudio,
        gapSec: 0.5,
        bgImageRelPath: `images/bg.${ext}`,
        audioRelPath: "voice.mp3",
        youtube: YT,
        youtubeLogoRelPath: "youtube-logo.png",
        __sync: true,
      });
      expect(html).toContain(`background-image: url('images/bg.${ext}')`);
      expect(html).not.toContain("<video class=\"bg");
    }
  });

  it("falls back to gradient when bgImageRelPath is null", () => {
    const script = loadScript("sample-doc-no-image.json");
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 4 }));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.5,
      bgImageRelPath: null,
      audioRelPath: "voice.mp3",
      youtube: YT,
      youtubeLogoRelPath: "youtube-logo.png",
      __sync: true,
    });
    // Documentary gradient fallback (no warm/dark image)
    expect(html).toContain('class="bg gradient-doc-warm"');
    expect(html).not.toContain("background-image: url");
  });

  it("uses provided YouTube channel branding (overrides default)", () => {
    const script = loadScript("sample-doc-no-image.json");
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 4 }));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.5,
      bgImageRelPath: null,
      audioRelPath: "voice.mp3",
      youtube: {
        channelName: "Brand Stories",
        handle: "@brandstories",
        subscribers: "1.2M subscribers",
      },
      youtubeLogoRelPath: "youtube-logo.png",
      __sync: true,
    });
    expect(html).toContain("Brand Stories");
    expect(html).toContain("@brandstories");
    expect(html).toContain("1.2M subscribers");
  });

  it("computes scene start times accumulating with gap and adds outroHoldSec to total", () => {
    const script = loadScript("sample-doc-no-image.json");
    const sceneAudio = script.scenes.map((s, i) => ({ id: s.id, durationSec: 3 + i * 0.1 }));
    const gap = 0.5;
    const hold = 5;
    const sumVoice = sceneAudio.reduce((a, s) => a + s.durationSec, 0);
    const expectedTotal = sumVoice + gap * sceneAudio.length + hold;

    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: gap,
      bgImageRelPath: null,
      audioRelPath: "voice.mp3",
      youtube: YT,
      youtubeLogoRelPath: "youtube-logo.png",
      outroHoldSec: hold,
      __sync: true,
    });
    const m = html.match(/data-duration="([\d.]+)"/);
    expect(m).not.toBeNull();
    const total = parseFloat(m![1]);
    expect(total).toBeCloseTo(expectedTotal, 0);
  });
});
