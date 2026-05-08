/**
 * Context-bridge for the renderer. Exposes a small, typed `window.dg` API
 * — no `nodeIntegration` is enabled, so this is the only surface the
 * renderer can use to talk to Node / the OS.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

export type FolderInspect =
  | { ok: false; reason: "folder-not-found" | "missing-script-json" }
  | { ok: true; scriptPath: string; hasVoiceDir: boolean; voiceDir: string };

export interface PipelineDoneEvent {
  code: number | null;
  success: boolean;
  videoPath: string | null;
}

contextBridge.exposeInMainWorld("dg", {
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke("dialog:selectFolder"),
  inspectFolder: (folder: string): Promise<FolderInspect> =>
    ipcRenderer.invoke("folder:inspect", folder),
  runPipeline: (folder: string): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke("pipeline:run", folder),
  cancelPipeline: (): Promise<{ ok: boolean }> => ipcRenderer.invoke("pipeline:cancel"),
  openPath: (p: string): Promise<{ ok: boolean }> => ipcRenderer.invoke("shell:openPath", p),
  showItemInFolder: (p: string): Promise<null> =>
    ipcRenderer.invoke("shell:showItemInFolder", p),

  onLog: (cb: (chunk: string) => void) => {
    const listener = (_e: IpcRendererEvent, chunk: string) => cb(chunk);
    ipcRenderer.on("pipeline:log", listener);
    return () => ipcRenderer.removeListener("pipeline:log", listener);
  },
  onStarted: (cb: (info: { scriptPath: string; cliPath: string }) => void) => {
    const listener = (_e: IpcRendererEvent, info: { scriptPath: string; cliPath: string }) => cb(info);
    ipcRenderer.on("pipeline:started", listener);
    return () => ipcRenderer.removeListener("pipeline:started", listener);
  },
  onDone: (cb: (info: PipelineDoneEvent) => void) => {
    const listener = (_e: IpcRendererEvent, info: PipelineDoneEvent) => cb(info);
    ipcRenderer.on("pipeline:done", listener);
    return () => ipcRenderer.removeListener("pipeline:done", listener);
  },
});
