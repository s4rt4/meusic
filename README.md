# 🎵 meusic

A lightweight, **Amberol-inspired** local music player for Windows — built with
**Tauri v2** (Rust) + **React + TypeScript**. Native, low-memory, and crash-resistant,
with an adaptive gradient-blur UI whose colors flow from the album art of whatever
is playing.

## Features

- **Recursive folder scan** — point it at a folder and it finds every track in it
  and all subfolders.
- **Wide format support** — MP3, **FLAC**, M4A/AAC, OGG, Opus, WAV, AIFF, WMA.
- **Adaptive UI** — animated blurred gradient background derived from the current
  cover art's dominant colors (Amberol-style).
- **Cover art & metadata** — title, artist, album read from tags via `lofty`.
- **Transport** — play/pause, next/prev, seek, volume, shuffle, repeat (off/all/one).
- **6-band equalizer** with presets (Flat / Bass / Vocal / Treble).
- **Spectrum visualizer** powered by the Web Audio API.
- **Search** across title, artist, and album.

## Architecture

| Layer | Tech | Responsibility |
|-------|------|----------------|
| Backend | Rust (`lofty`, `walkdir`, `rayon`) | Recursive scan, tag + cover-art extraction (parallel) |
| Bridge | Tauri commands | `scan_folder`, `get_cover`; `convertFileSrc` for playback |
| Frontend | React + TS + Tailwind v4 | UI, state |
| Audio | Web Audio API | `<audio>` → EQ (BiquadFilter ×6) → Analyser → output |

Cover art is loaded **lazily** (only for the displayed/playing track) to keep large
libraries light on memory.

## Develop

```bash
pnpm install
pnpm tauri dev      # hot-reload dev window
```

## Build a release binary

```bash
pnpm tauri build    # outputs an installer under src-tauri/target/release/bundle/
```

## Project layout

```
src/
  audio/engine.ts        Web Audio graph (EQ + analyser), singleton
  hooks/usePlayer.ts     Playback state + queue
  lib/                   api.ts (Tauri calls), colors.ts (palette), format.ts
  components/            GradientBackground, Visualizer, Equalizer, Library,
                         NowPlaying, TransportBar, icons
  App.tsx                Orchestration
src-tauri/
  src/lib.rs             scan_folder + get_cover commands
  tauri.conf.json        window + asset-protocol config
```
