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

/** Turn an absolute file path into an asset URL the <audio> element can play. */
export function trackUrl(path: string): string {
  return convertFileSrc(path);
}
