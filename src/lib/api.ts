import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Track } from "../types";

/** Ask the user to pick a music folder. Returns the chosen path or null. */
export async function pickFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Choose your music folder",
  });
  return typeof selected === "string" ? selected : null;
}

/** Recursively scan a folder (and subfolders) for audio files + metadata. */
export async function scanFolder(path: string): Promise<Track[]> {
  return invoke<Track[]>("scan_folder", { path });
}

/** Lazily fetch a track's embedded cover art as a base64 data URI. */
export async function getCover(path: string): Promise<string | null> {
  return invoke<string | null>("get_cover", { path });
}

/** Editable tag fields written back into a file by {@link writeTags}. */
export interface TrackEdit {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  trackNo: number;
}

/** Write edited metadata into the file's tag (preserves cover art) and return
 *  the freshly re-read Track. Rejects if the backend write fails. */
export async function writeTags(path: string, edit: TrackEdit): Promise<Track> {
  return invoke<Track>("write_tags", { path, ...edit });
}

/** Turn an absolute file path into an asset URL the <audio> element can play. */
export function trackUrl(path: string): string {
  return convertFileSrc(path);
}

/** Show or hide the system-tray icon. */
export async function setTrayVisible(visible: boolean): Promise<void> {
  return invoke("set_tray_visible", { visible });
}

/** Read a file-backed store by name (null if it doesn't exist yet). */
export async function loadStore(name: string): Promise<string | null> {
  return invoke<string | null>("load_store", { name });
}

/** Write a file-backed store to disk immediately (survives OS shutdown). */
export async function saveStore(name: string, contents: string): Promise<void> {
  return invoke("save_store", { name, contents });
}

// The radio proxy port is fixed for the process lifetime — fetch it once.
let radioPortPromise: Promise<number> | null = null;

/** Warm the proxy-port lookup at startup so the first station plays without an
 *  await landing outside the user-gesture window (autoplay policy). */
export function prefetchRadioProxy(): void {
  if (!radioPortPromise) radioPortPromise = invoke<number>("radio_proxy_port");
}

/** Build a loopback proxy URL the <audio> element can stream a radio station
 *  from (same-origin/CORS-clean, so EQ + visualizer work; http streams ok). */
export async function radioProxyUrl(streamUrl: string): Promise<string> {
  if (!radioPortPromise) radioPortPromise = invoke<number>("radio_proxy_port");
  const port = await radioPortPromise;
  return `http://127.0.0.1:${port}/radio?url=${encodeURIComponent(streamUrl)}`;
}
