/**
 * The Dead Giants — Electron main process.
 *
 * Hosts a single window that lets the user pick a documentary output folder
 * (containing `script.json` + `voice/scene-*.mp3`) and render it to
 * `video.mp4` via the existing pipeline.
 *
 * Pipeline execution: spawned as an Electron-as-Node child process running
 * the existing `src/cli.ts` entrypoint compiled to ESM JS in `dist/cli.js`.
 * stdout/stderr are streamed line-by-line back to the renderer via the
 * `pipeline:log` IPC channel.
 *
 * FFmpeg / FFprobe are bundled via `ffmpeg-static` / `ffprobe-static` and
 * exposed to the pipeline via the `FFMPEG_PATH` / `FFPROBE_PATH` env vars
 * that `src/assets/audio-tools.ts` honors.
 */
import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

const isPackaged = app.isPackaged;

/**
 * Resolve a path relative to the app root.
 *
 * - dev mode  : `app.getAppPath()` is the project root.
 * - packaged  : `app.getAppPath()` is the app.asar root; `process.resourcesPath`
 *               points at the resources dir for `extraResources` files.
 *
 * We try `extraResources` first (so SFX library + avatar resolve outside the
 * read-only asar archive when packaged), then fall back to the asar root /
 * project root.
 */
function resourcePath(rel: string): string {
  if (isPackaged) {
    const inResources = join(process.resourcesPath, rel);
    if (existsSync(inResources)) return inResources;
  }
  return join(app.getAppPath(), rel);
}

/**
 * Resolve the path to a binary published by `ffmpeg-static` / `ffprobe-static`.
 *
 * In dev mode, the package's default export is the absolute path on disk.
 * Inside an asar archive that path won't be runnable directly — electron-builder
 * already configures `asarUnpack` for these packages so the binary lives at
 * `<resources>/app.asar.unpacked/node_modules/<pkg>/...` — both `require.resolve`
 * and the `.path` export already point there at runtime.
 */
function resolveBundledBinary(name: "ffmpeg" | "ffprobe"): string | null {
  try {
    const pkg = name === "ffmpeg" ? "ffmpeg-static" : "ffprobe-static";
    const mod = require(pkg);
    const p: string | undefined = typeof mod === "string" ? mod : mod?.path;
    if (!p) return null;
    return p.replace("app.asar", "app.asar.unpacked");
  } catch {
    return null;
  }
}

let mainWindow: BrowserWindow | null = null;
let activeChild: ChildProcess | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 760,
    minHeight: 540,
    backgroundColor: "#0a0a0a",
    title: "The Dead Giants",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    autoHideMenuBar: true,
  });

  void mainWindow.loadFile(resourcePath(join("desktop", "index.html")));

  if (!isPackaged && process.env.OPEN_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Cancel any in-flight render before quitting.
  if (activeChild && !activeChild.killed) activeChild.kill();
  if (process.platform !== "darwin") app.quit();
});

// ── IPC ─────────────────────────────────────────────────────────────────────

ipcMain.handle("dialog:selectFolder", async () => {
  if (!mainWindow) return null;
  const r = await dialog.showOpenDialog(mainWindow, {
    title: "Chọn folder chứa script.json + voice/",
    properties: ["openDirectory"],
  });
  if (r.canceled || r.filePaths.length === 0) return null;
  return r.filePaths[0];
});

ipcMain.handle("folder:inspect", async (_evt, folder: string) => {
  if (!folder || !existsSync(folder)) {
    return { ok: false, reason: "folder-not-found" };
  }
  const scriptPath = join(folder, "script.json");
  if (!existsSync(scriptPath)) {
    return { ok: false, reason: "missing-script-json" };
  }
  const voiceDir = join(folder, "voice");
  const hasVoice = existsSync(voiceDir);
  return { ok: true, scriptPath, hasVoiceDir: hasVoice, voiceDir };
});

ipcMain.handle("shell:openPath", async (_evt, p: string) => {
  if (!p || !existsSync(p)) return { ok: false };
  await shell.openPath(p);
  return { ok: true };
});

ipcMain.handle("shell:showItemInFolder", (_evt, p: string) => {
  if (p && existsSync(p)) shell.showItemInFolder(p);
  return null;
});

ipcMain.handle("pipeline:run", (_evt, folder: string) => {
  if (!mainWindow) return { ok: false, reason: "no-window" };
  if (activeChild && !activeChild.killed) {
    return { ok: false, reason: "already-running" };
  }
  if (!folder || !existsSync(folder)) {
    return { ok: false, reason: "folder-not-found" };
  }
  const scriptPath = join(folder, "script.json");
  if (!existsSync(scriptPath)) {
    return { ok: false, reason: "missing-script-json" };
  }

  const cliPath = resourcePath(join("dist", "cli.js"));
  if (!existsSync(cliPath)) {
    mainWindow.webContents.send(
      "pipeline:log",
      `[ERROR] Could not locate compiled pipeline at ${cliPath}\n` +
        `Run \`npm run build\` to produce dist/ before launching.\n`,
    );
    return { ok: false, reason: "missing-dist" };
  }

  const ffmpegPath = resolveBundledBinary("ffmpeg") ?? process.env.FFMPEG_PATH ?? "";
  const ffprobePath = resolveBundledBinary("ffprobe") ?? process.env.FFPROBE_PATH ?? "";

  const child = spawn(process.execPath, [cliPath, scriptPath], {
    cwd: dirname(scriptPath),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      FFMPEG_PATH: ffmpegPath,
      FFPROBE_PATH: ffprobePath,
    },
  });
  activeChild = child;
  mainWindow.webContents.send("pipeline:started", { scriptPath, cliPath });

  const forward = (chunk: Buffer | string) => {
    const s = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    mainWindow?.webContents.send("pipeline:log", s);
  };
  child.stdout?.on("data", forward);
  child.stderr?.on("data", forward);
  child.on("close", (code) => {
    activeChild = null;
    const videoPath = join(folder, "video.mp4");
    const success = code === 0 && existsSync(videoPath);
    mainWindow?.webContents.send("pipeline:done", {
      code,
      success,
      videoPath: success ? videoPath : null,
    });
  });
  child.on("error", (err) => {
    activeChild = null;
    forward(`[ERROR] Failed to spawn pipeline: ${err.message}\n`);
    mainWindow?.webContents.send("pipeline:done", { code: -1, success: false, videoPath: null });
  });
  return { ok: true };
});

ipcMain.handle("pipeline:cancel", () => {
  if (activeChild && !activeChild.killed) {
    activeChild.kill("SIGTERM");
    return { ok: true };
  }
  return { ok: false };
});
