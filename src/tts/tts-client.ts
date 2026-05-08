/**
 * Common TTS client interface.
 *
 * All providers (LucyLab, ElevenLabs) implement this so the pipeline
 * can swap providers without changing orchestration logic.
 */
export interface TtsClient {
  /**
   * Generate speech audio for `text` and write to `audioOutPath` (mp3 or wav).
   * If `srtOutPath` is provided AND the provider supports subtitles,
   * write the SRT to that path. Otherwise silently skip.
   */
  generate(text: string, audioOutPath: string, srtOutPath?: string): Promise<void>;
}

import type { Config } from "../config.js";
import { LucylabClient } from "./lucylab-client.js";
import { ElevenLabsClient } from "./elevenlabs-client.js";

export function createTtsClient(cfg: Config): TtsClient {
  switch (cfg.ttsProvider) {
    case "lucylab":
      return new LucylabClient({
        apiKey: cfg.lucylabApiKey!,
        voiceId: cfg.lucylabVoiceId!,
        endpoint: cfg.lucylabEndpoint,
        pollIntervalMs: cfg.lucylabPollIntervalMs,
        pollTimeoutMs: cfg.lucylabPollTimeoutMs,
      });
    case "elevenlabs":
      return new ElevenLabsClient({
        apiKey: cfg.elevenlabsApiKey!,
        voiceId: cfg.elevenlabsVoiceId!,
        modelId: cfg.elevenlabsModelId,
        endpoint: cfg.elevenlabsEndpoint,
      });
    default: {
      const _never: never = cfg.ttsProvider;
      throw new Error(`Unknown TTS provider: ${_never}`);
    }
  }
}

export interface SynthesizeArgs {
  cfg: Config;
  text: string;
  /** voice id from the script — currently informational; provider uses cfg's
   *  configured voice id. Reserved for future per-scene voice override. */
  voiceId: string;
  /** Playback speed (0.5–2.0). Currently informational — providers may not
   *  honor this; documentary tone is achieved at the script level. */
  speed: number;
  /** Output mp3 file path */
  outPath: string;
  /** Optional SRT subtitle path */
  srtOutPath?: string;
}

/**
 * High-level helper that selects the right TTS provider and writes the audio
 * (and optional SRT) to disk. Lazily caches a single client per process — fine
 * because the pipeline runs sequentially through scenes.
 */
let _cachedClient: TtsClient | null = null;
let _cachedProvider: string | null = null;

export async function synthesizeVoice(args: SynthesizeArgs): Promise<void> {
  const { cfg, text, outPath, srtOutPath } = args;
  if (!_cachedClient || _cachedProvider !== cfg.ttsProvider) {
    _cachedClient = createTtsClient(cfg);
    _cachedProvider = cfg.ttsProvider;
  }
  await _cachedClient.generate(text, outPath, srtOutPath);
}
