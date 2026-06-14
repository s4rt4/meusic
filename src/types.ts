/** A single audio track, mirrors the `Track` struct returned by the Rust backend. */
export interface Track {
  path: string;
  title: string;
  artist: string;
  album: string;
  album_artist: string;
  track_no: number;
  duration: number; // seconds
  has_cover: boolean;
  format: string; // e.g. "FLAC", "MP3"
  bitrate: number; // kbps, 0 if unknown
}

export type RepeatMode = "off" | "all" | "one";

/** An RGB color triple used for the adaptive gradient background. */
export type RGB = [number, number, number];

export interface Palette {
  /** Dominant colors extracted from the current cover art, brightest first. */
  colors: RGB[];
}
