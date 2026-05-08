import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { ScriptSchema } from "./render/script-schema.js";
import { loadConfig } from "./config.js";
import { synthesizeVoice } from "./tts/tts-client.js";
import { fetchImage } from "./assets/image-fetcher.js";
import { getDurationSec, concatWithSilence, mixSfxOntoVoice, type SfxMixSpec } from "./assets/audio-tools.js";
import { indexSfxLibrary, pickSfxForScene, defaultPlayback } from "./assets/sfx-selector.js";
import { composeHtml } from "./render/html-composer.js";
import { renderWithHyperframes } from "./render/hyperframes-runner.js";
import { log } from "./utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL_DIR  = join(__dirname, "render", "templates");
const SFX_DIR  = join(__dirname, "..", "assets", "sfx");

const TOTAL_STEPS = 8;
const DURATION_MIN_SEC = 480;   // 8 minutes — minimum documentary length
const DURATION_MAX_SEC = 900;   // 15 minutes — maximum documentary length
const SCENE_GAP_SEC = 0.5;      // longer breaths between cinematic scenes
/**
 * Extra seconds added to the outro scene visual duration AFTER the voice ends.
 * Gives the YouTube end-screen card time to be read by the viewer (Subscribe
 * button + "Watch Next" preview).
 * Audio stays silent during this hold; visual stays on screen.
 */
const OUTRO_HOLD_SEC = 5;

const HYPERFRAMES_CONFIG = {
  $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
  registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
  paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
};

/**
 * Run the documentary video pipeline end-to-end:
 *   validate → TTS (idempotent) → fetch image (idempotent) → concat → SFX
 *   → compose HTML → render mp4
 *
 * `scriptPath` is the path to a script.json. The output directory is the
 * parent of `scriptPath`.
 */
export async function runPipeline(scriptPath: string): Promise<void> {
  const cfg = loadConfig();
  log.info(`TTS provider: ${cfg.ttsProvider}`);

  // ── Step 1: Validate script ──
  log.step(1, TOTAL_STEPS, "Validate script.json");
  const raw = JSON.parse(await readFile(scriptPath, "utf8"));
  // Auto-substitute voiceId placeholder from .env
  if (raw.voice?.voiceId === "${VIETNAMESE_VOICEID}" || raw.voice?.voiceId === "${VOICE_ID}") {
    raw.voice.voiceId = cfg.ttsProvider === "lucylab" ? cfg.lucylabVoiceId! : cfg.elevenlabsVoiceId!;
  }
  // Force provider field to match config
  if (raw.voice) raw.voice.provider = "lucylab"; // schema only declares lucylab

  const script = ScriptSchema.parse(raw);

  // Output dir is parent of script.json
  const outputDir = dirname(scriptPath);
  await mkdir(outputDir, { recursive: true });

  // ── Step 2: TTS per scene ──
  log.step(2, TOTAL_STEPS, `TTS ${script.scenes.length} scenes`);
  const voiceDir = join(outputDir, "voice");
  await mkdir(voiceDir, { recursive: true });

  const sceneAudio: { id: string; path: string; durationSec: number }[] = [];
  let skippedTts = 0;
  for (const scene of script.scenes) {
    const path = join(voiceDir, `scene-${scene.id}.mp3`);
    if (existsSync(path)) {
      log.info(`  scene ${scene.id}: skip TTS (file exists)`);
      skippedTts++;
    } else {
      await synthesizeVoice({
        cfg,
        text: scene.voiceText,
        voiceId: script.voice.voiceId,
        speed: script.voice.speed,
        outPath: path,
      });
    }
    const dur = await getDurationSec(path);
    log.info(`  scene ${scene.id}: ${dur.toFixed(2)}s`);
    sceneAudio.push({ id: scene.id, path, durationSec: dur });
  }
  if (skippedTts > 0) log.info(`  (skipped TTS for ${skippedTts}/${script.scenes.length} scenes — pre-placed mp3 files)`);

  // ── Step 3: Fetch hero image (idempotent: skip if already present) ──
  log.step(3, TOTAL_STEPS, "Fetch hero image");
  const imgDir = join(outputDir, "images");
  await mkdir(imgDir, { recursive: true });
  let bgImageRelPath: string | null = null;

  // Look for any user-pre-placed image in images/ (skip download)
  const candidates = ["bg.jpg", "bg.jpeg", "bg.png", "bg.webp"];
  for (const name of candidates) {
    if (existsSync(join(imgDir, name))) {
      bgImageRelPath = `images/${name}`;
      log.info(`  skip download (pre-placed: ${bgImageRelPath})`);
      break;
    }
  }
  if (!bgImageRelPath) {
    const target = join(imgDir, "bg.jpg");
    const r = await fetchImage(script.metadata.source.image, target);
    if (r.success) {
      bgImageRelPath = "images/bg.jpg";
      log.info(`  downloaded → ${bgImageRelPath}`);
    } else {
      log.warn(`  no image (${r.reason}) — using gradient fallback`);
    }
  }

  // ── Step 4: Concat per-scene voices with silence ──
  log.step(4, TOTAL_STEPS, "Concat voice tracks");
  const voiceRawMp3 = join(outputDir, "voice-raw.mp3");
  const voiceMp3    = join(outputDir, "voice.mp3");
  await concatWithSilence(sceneAudio.map((a) => a.path), SCENE_GAP_SEC, voiceRawMp3);

  // Compute scene start times
  let cursor = 0;
  const sceneStarts: Record<string, number> = {};
  for (const a of sceneAudio) {
    sceneStarts[a.id] = cursor;
    cursor += a.durationSec + SCENE_GAP_SEC;
  }
  // Total voice duration BEFORE outro hold; outro hold adds visual-only time.
  const voiceDur = await getDurationSec(voiceRawMp3);
  const totalDur = voiceDur + OUTRO_HOLD_SEC;

  // ── Step 5: Pick & mix SFX ──
  log.step(5, TOTAL_STEPS, "Mix SFX into voice track");
  const sfxIndex = indexSfxLibrary(SFX_DIR);
  const sfxList: SfxMixSpec[] = [];
  for (const scene of script.scenes) {
    const startSec = sceneStarts[scene.id];
    if (scene.sfx) {
      if (scene.sfx.name === "none") continue;
      const sfxPath = join(SFX_DIR, `${scene.sfx.name}.mp3`);
      if (existsSync(sfxPath)) {
        sfxList.push({ path: sfxPath, startSec: startSec + scene.sfx.startOffsetSec, volume: scene.sfx.volume });
        log.info(`  scene ${scene.id}: SFX override → ${scene.sfx.name}`);
      } else {
        log.warn(`  scene ${scene.id}: sfx override "${scene.sfx.name}.mp3" not found, skipping`);
      }
      continue;
    }
    const picked = pickSfxForScene({
      voiceText: scene.voiceText,
      templateName: scene.templateData.template,
      sceneId: scene.id,
      index: sfxIndex,
    });
    if (!picked) continue;
    const sfxPath = join(SFX_DIR, picked.relPath);
    const playback = defaultPlayback(picked);
    sfxList.push({ path: sfxPath, startSec: startSec + playback.offsetSec, volume: playback.volume });
    const why = picked.source === "semantic" ? `semantic "${picked.matchedKeyword}"` : picked.source;
    log.info(`  scene ${scene.id}: SFX → ${picked.relPath} (${why})`);
  }
  await mixSfxOntoVoice(voiceRawMp3, sfxList, voiceMp3);

  // ── Step 6: Validate total duration ──
  log.step(6, TOTAL_STEPS, "Validate duration");
  if (voiceDur < DURATION_MIN_SEC) {
    log.warn(`Total voice ${voiceDur.toFixed(1)}s < min ${DURATION_MIN_SEC}s — video will be short.`);
  }
  if (voiceDur > DURATION_MAX_SEC) {
    log.warn(`Total voice ${voiceDur.toFixed(1)}s > max ${DURATION_MAX_SEC}s — consider trimming script.`);
  }
  log.info(`  voice: ${voiceDur.toFixed(1)}s · with hold: ${totalDur.toFixed(1)}s`);

  // ── Step 7: Compose HTML composition ──
  log.step(7, TOTAL_STEPS, "Compose HTML");

  // Channel logo: prefer remote URL → fall back to bundled assets/avatar.{png,jpg,…}
  let logoSrcPath: string | null = null;
  let logoExt = "png";
  if (cfg.youtube.logoUrl) {
    const targetPath = join(outputDir, "youtube-logo.tmp");
    const r = await fetchImage(cfg.youtube.logoUrl, targetPath);
    if (r.success) {
      logoSrcPath = targetPath;
    } else {
      log.warn(`YouTube logo download failed (${r.reason}) — falling back to bundled avatar`);
    }
  }
  if (!logoSrcPath) {
    for (const ext of ["png", "jpg", "jpeg", "webp"]) {
      const p = join(__dirname, "..", "assets", `avatar.${ext}`);
      if (existsSync(p)) { logoSrcPath = p; logoExt = ext; break; }
    }
  }
  if (!logoSrcPath) {
    throw new Error("No channel logo found. Set YOUTUBE_LOGO_URL or bundle assets/avatar.{png,jpg,webp}");
  }
  const logoFile = `youtube-logo.${logoExt}`;
  await copyFile(logoSrcPath, join(outputDir, logoFile));

  const html = await composeHtml({
    script,
    sceneAudio: sceneAudio.map((a) => ({ id: a.id, durationSec: a.durationSec })),
    gapSec: SCENE_GAP_SEC,
    bgImageRelPath,
    audioRelPath: "voice.mp3",
    youtube: cfg.youtube,
    youtubeLogoRelPath: logoFile,
    outroHoldSec: OUTRO_HOLD_SEC,
  });
  await writeFile(join(outputDir, "index.html"), html);
  await writeFile(join(outputDir, "hyperframes.json"), JSON.stringify(HYPERFRAMES_CONFIG, null, 2));
  await writeFile(join(outputDir, "meta.json"), JSON.stringify({
    id: basename(outputDir),
    name: script.metadata.title,
    createdAt: new Date().toISOString(),
  }, null, 2));
  await copyFile(join(TPL_DIR, "styles.css"),    join(outputDir, "styles.css"));
  await copyFile(join(TPL_DIR, "animations.js"), join(outputDir, "animations.js"));

  // ── Step 8: Render video ──
  log.step(8, TOTAL_STEPS, "Render video.mp4 (this may take several minutes)");
  const videoPath = join(outputDir, "video.mp4");
  await renderWithHyperframes({ compositionDir: outputDir, outputPath: videoPath });

  log.info(`Done: ${videoPath}`);
  log.info(`Duration ~${totalDur.toFixed(1)}s, ${script.scenes.length} scenes`);
}
