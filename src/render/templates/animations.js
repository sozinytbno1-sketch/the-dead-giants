// ============================================================
// THE DEAD GIANTS — Cinematic Documentary Animations
// Per-scene GSAP timelines (16:9 1920x1080)
// ============================================================
//
// Scene HTML: <div class="scene" data-scene-id="..." data-layout="..." data-start="..." data-duration="...">
// Scene durations are passed via inline CSS var --scene-dur (e.g. "5.2s")
// ============================================================

(function () {
  if (typeof gsap === "undefined") {
    console.warn("GSAP not loaded — animations disabled");
    return;
  }

  // Sync GSAP master clock to HyperFrames clock if available.
  // Fallback: drive timelines off video.currentTime (when previewed in browser).
  const voiceEl = document.getElementById("voice");

  document.querySelectorAll(".scene").forEach((scene) => {
    const layout = scene.getAttribute("data-layout");
    const start = parseFloat(scene.getAttribute("data-start") || "0");
    const dur = parseFloat(scene.getAttribute("data-duration") || "5");

    const tl = gsap.timeline({ paused: true });
    buildTimeline(tl, scene, layout, dur);

    // Drive the timeline by the voice element's time (browser preview)
    // HyperFrames will use its own time controller in production render.
    if (voiceEl) {
      voiceEl.addEventListener("timeupdate", () => {
        const t = voiceEl.currentTime - start;
        if (t < 0) tl.progress(0).pause();
        else if (t > dur) tl.progress(1).pause();
        else tl.seek(t);
      });
    }
  });

  // ── Per-layout timelines ─────────────────────────────────────
  function buildTimeline(tl, scene, layout, dur) {
    switch (layout) {
      case "hook":          return hookTimeline(tl, scene, dur);
      case "comparison":    return comparisonTimeline(tl, scene, dur);
      case "stat-hero":     return statHeroTimeline(tl, scene, dur);
      case "feature-list":  return featureListTimeline(tl, scene, dur);
      case "callout":       return calloutTimeline(tl, scene, dur);
      case "outro":         return outroTimeline(tl, scene, dur);
      case "timeline":      return timelineTimeline(tl, scene, dur);
      case "quote-card":    return quoteCardTimeline(tl, scene, dur);
      case "chapter-title": return chapterTitleTimeline(tl, scene, dur);
      case "brand-logo":    return brandLogoTimeline(tl, scene, dur);
      case "fact-card":     return factCardTimeline(tl, scene, dur);
      default:
        console.warn("Unknown layout:", layout);
    }
  }

  // helper: query inside a scene
  function $(scene, sel) { return scene.querySelector(sel); }
  function $$(scene, sel) { return Array.from(scene.querySelectorAll(sel)); }

  function hookTimeline(tl, scene, dur) {
    const headline = $(scene, ".hook-headline");
    const subhead  = $(scene, ".hook-subhead");
    if (headline) tl.fromTo(headline, { opacity: 0, y: 60, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power3.out" }, 0.1);
    if (subhead)  tl.fromTo(subhead,  { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, 0.5);
    // Hold, then exit slightly before scene end
    tl.to([headline, subhead].filter(Boolean), { opacity: 0, duration: 0.4, ease: "power2.in" }, Math.max(dur - 0.4, 0.6));
  }

  function comparisonTimeline(tl, scene, dur) {
    const cards = $$(scene, ".cmp-card");
    const vs = $(scene, ".cmp-vs");
    if (cards[0]) tl.fromTo(cards[0], { opacity: 0, x: -120 }, { opacity: 1, x: 0, duration: 0.7, ease: "power3.out" }, 0.1);
    if (vs)        tl.fromTo(vs,        { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)" }, 0.5);
    if (cards[1]) tl.fromTo(cards[1], { opacity: 0, x:  120 }, { opacity: 1, x: 0, duration: 0.7, ease: "power3.out" }, 0.7);
    tl.to([...cards, vs].filter(Boolean), { opacity: 0, duration: 0.4 }, Math.max(dur - 0.4, 1));
  }

  function statHeroTimeline(tl, scene, dur) {
    const value   = $(scene, ".stat-value");
    const label   = $(scene, ".stat-label");
    const context = $(scene, ".stat-context");
    if (value)   tl.fromTo(value,   { opacity: 0, scale: 0.6, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.9, ease: "back.out(1.4)" }, 0.1);
    if (label)   tl.fromTo(label,   { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 0.6);
    if (context) tl.fromTo(context, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, 0.9);
    tl.to([value, label, context].filter(Boolean), { opacity: 0, duration: 0.4 }, Math.max(dur - 0.4, 1.4));
  }

  function featureListTimeline(tl, scene, dur) {
    const card    = $(scene, ".feat-card");
    const rule    = $(scene, ".feat-rule");
    const bullets = $$(scene, ".feat-bullet");
    if (card) tl.fromTo(card, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.1);
    if (rule) tl.fromTo(rule, { opacity: 0, scaleX: 0 }, { opacity: 1, scaleX: 1, duration: 0.5, ease: "power2.out" }, 0.4);
    bullets.forEach((b, i) => {
      tl.fromTo(b, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.45, ease: "power2.out" }, 0.6 + i * 0.18);
    });
    tl.to([card, rule, ...bullets].filter(Boolean), { opacity: 0, duration: 0.4 }, Math.max(dur - 0.4, 1.4));
  }

  function calloutTimeline(tl, scene, dur) {
    const card = $(scene, ".callout-card");
    if (card) tl.fromTo(card, { opacity: 0, scale: 0.94, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: 0.7, ease: "power3.out" }, 0.1);
    if (card) tl.to(card, { opacity: 0, duration: 0.4 }, Math.max(dur - 0.4, 1));
  }

  function outroTimeline(tl, scene, dur) {
    const cta = $(scene, ".out-cta-top");
    const ch  = $(scene, ".out-channel");
    const ul  = $(scene, ".out-underline");
    const src = $(scene, ".out-source");
    if (cta) tl.fromTo(cta, { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 0.1);
    if (ch)  tl.fromTo(ch,  { opacity: 0, y:  30 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 0.5);
    if (ul)  tl.fromTo(ul,  { width: 0 }, { width: 280, duration: 0.5, ease: "power2.out" }, 1.1);
    if (src) tl.fromTo(src, { opacity: 0 }, { opacity: 1, duration: 0.4 }, 1.4);

    // YouTube end-screen card
    const yt = document.getElementById("yt-card");
    if (yt) {
      tl.fromTo(yt, { y: 200, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "power3.out" }, 1.7);
      // Fake click → "Subscribed" state
      const sub = document.getElementById("yt-btn-subscribe");
      const subscribed = document.getElementById("yt-btn-subscribed");
      const btn = document.getElementById("yt-subscribe-btn");
      if (sub && subscribed && btn) {
        tl.to(btn, { scale: 0.94, duration: 0.12, ease: "power2.in" }, 2.6);
        tl.to(btn, { scale: 1.0,  duration: 0.18, ease: "back.out(2)" }, 2.72);
        tl.to(btn, { backgroundColor: "#2a2a2a", duration: 0.2 }, 2.8);
        tl.to(sub, { opacity: 0, duration: 0.18 }, 2.8);
        tl.to(subscribed, { opacity: 1, duration: 0.22 }, 2.95);
      }
    }
  }

  function timelineTimeline(tl, scene, dur) {
    const title = $(scene, ".timeline-title");
    const events = $$(scene, ".timeline-event");
    if (title) tl.fromTo(title, { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 0.1);
    // Reveal events left → right
    events.forEach((ev, i) => {
      tl.fromTo(ev, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out" }, 0.4 + i * 0.35);
    });
    tl.to([title, ...events].filter(Boolean), { opacity: 0, duration: 0.4 }, Math.max(dur - 0.4, 1.6));
  }

  function quoteCardTimeline(tl, scene, dur) {
    const mark = $(scene, ".quote-mark");
    const text = $(scene, ".quote-text");
    const author = $(scene, ".quote-author");
    const role = $(scene, ".quote-role");
    const div = $(scene, ".quote-divider");
    const card = $(scene, ".quote-card");
    if (card) tl.fromTo(card, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power2.out" }, 0.1);
    if (mark) tl.fromTo(mark, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.7, ease: "back.out(1.5)" }, 0.2);
    if (text) tl.fromTo(text, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1.1, ease: "power2.out" }, 0.6);
    if (div)  tl.fromTo(div,  { opacity: 0, scaleX: 0 }, { opacity: 0.6, scaleX: 1, duration: 0.5, ease: "power2.out" }, 1.4);
    if (author) {
      tl.fromTo(author, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 1.7);
      // gold highlight pulse on author
      tl.to(author, { textShadow: "0 0 30px rgba(201,169,97,0.8)", duration: 0.5, yoyo: true, repeat: 1 }, 2.1);
    }
    if (role) tl.fromTo(role, { opacity: 0 }, { opacity: 1, duration: 0.4 }, 1.95);
    tl.to(card, { opacity: 0, duration: 0.4 }, Math.max(dur - 0.4, 2.5));
  }

  function chapterTitleTimeline(tl, scene, dur) {
    const eyebrow = $(scene, ".chapter-eyebrow");
    const num = $(scene, ".chapter-number");
    const div = $(scene, ".chapter-divider");
    const title = $(scene, ".chapter-title");
    const sub = $(scene, ".chapter-subtitle");
    // Cinematic reveal: zoom out from blur
    if (num) tl.fromTo(num, { opacity: 0, scale: 1.4, filter: "blur(20px)" },
                            { opacity: 1, scale: 1, filter: "blur(0px)", duration: 1.0, ease: "power3.out" }, 0.1);
    if (eyebrow) tl.fromTo(eyebrow, { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 0.4);
    if (div) tl.fromTo(div, { opacity: 0, scaleX: 0 }, { opacity: 1, scaleX: 1, duration: 0.5, ease: "power2.out" }, 1.0);
    if (title) tl.fromTo(title, { opacity: 0, scale: 1.15, filter: "blur(10px)" },
                                  { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.9, ease: "power3.out" }, 1.2);
    if (sub) tl.fromTo(sub, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 }, 1.7);
    tl.to([eyebrow, num, div, title, sub].filter(Boolean), { opacity: 0, duration: 0.5 }, Math.max(dur - 0.5, 2.2));
  }

  function brandLogoTimeline(tl, scene, dur) {
    const card = $(scene, ".brand-card");
    const eyebrow = $(scene, ".brand-eyebrow");
    const name = $(scene, ".brand-card-name");
    const meta = $(scene, ".brand-meta");
    if (card) tl.fromTo(card, { opacity: 0, scale: 0.85, filter: "blur(8px)" },
                              { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.9, ease: "power3.out" }, 0.1);
    if (eyebrow) tl.fromTo(eyebrow, { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.6);
    if (name) tl.fromTo(name, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.7);
    if (meta) tl.fromTo(meta, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 1.2);
    tl.to(card, { opacity: 0, duration: 0.4 }, Math.max(dur - 0.4, 1.8));
  }

  function factCardTimeline(tl, scene, dur) {
    const card = $(scene, ".fact-card");
    const icon = $(scene, ".fact-icon");
    const label = $(scene, ".fact-label");
    const text = $(scene, ".fact-text");
    if (card) tl.fromTo(card, { opacity: 0, y: 40, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "back.out(1.4)" }, 0.1);
    if (icon) tl.fromTo(icon, { scale: 0, rotation: -45 }, { scale: 1, rotation: 0, duration: 0.5, ease: "back.out(2)" }, 0.4);
    if (label) tl.fromTo(label, { opacity: 0 }, { opacity: 1, duration: 0.35 }, 0.7);
    if (text) tl.fromTo(text, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.55, ease: "power2.out" }, 0.9);
    // emphasis pulse
    if (icon) tl.to(icon, { scale: 1.1, duration: 0.25, yoyo: true, repeat: 1, ease: "power2.inOut" }, 1.6);
    tl.to(card, { opacity: 0, duration: 0.4 }, Math.max(dur - 0.4, 2.0));
  }
})();
