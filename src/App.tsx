import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GradientBackground } from "./components/GradientBackground";
import { Library } from "./components/Library";
import { TopBar, type Mode } from "./components/TopBar";
import { BottomBar } from "./components/BottomBar";
import { NowPlayingOverlay } from "./components/NowPlayingOverlay";
import { FolderTree } from "./components/FolderTree";
import { GroupList } from "./components/GroupList";
import { Album, Artist } from "./components/icons";
import { usePlayer } from "./hooks/usePlayer";
import { engine } from "./audio/engine";
import { getCover, pickFolder, scanFolder } from "./lib/api";
import { extractPalette } from "./lib/colors";
import {
  buildFolderTree,
  groupByAlbum,
  groupByArtist,
  indexTree,
  type FolderNode,
} from "./lib/views";
import type { RGB, Track } from "./types";

const DEFAULT_PALETTE: RGB[] = [
  [108, 99, 196],
  [70, 120, 170],
  [150, 90, 160],
];

function App() {
  const player = usePlayer();

  // The full scanned library — independent of the playback queue, so browsing
  // never disturbs what's playing and vice-versa.
  const [library, setLibrary] = useState<Track[]>([]);
  const [rootPath, setRootPath] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("folders");
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [palette, setPalette] = useState<RGB[]>(DEFAULT_PALETTE);
  const [showEq, setShowEq] = useState(false);
  const [eqGains, setEqGains] = useState<number[]>(Array(6).fill(0));
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [windowActive, setWindowActive] = useState(true);

  // Per-mode selection.
  const [selFolder, setSelFolder] = useState("");
  const [selAlbum, setSelAlbum] = useState("");
  const [selArtist, setSelArtist] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const accent = palette[0] ?? DEFAULT_PALETTE[0];
  const reqId = useRef(0);
  const coverCache = useRef<Map<string, string | null>>(new Map());

  // Derived browse structures.
  const tree = useMemo(
    () => (rootPath ? buildFolderTree(library, rootPath) : null),
    [library, rootPath]
  );
  const treeIndex = useMemo(
    () => (tree ? indexTree(tree) : new Map<string, FolderNode>()),
    [tree]
  );
  const albums = useMemo(() => groupByAlbum(library), [library]);
  const artists = useMemo(() => groupByArtist(library), [library]);

  // Reset selections when a new library loads.
  useEffect(() => {
    if (tree) {
      setSelFolder(tree.path);
      setExpanded(new Set([tree.path]));
    }
  }, [tree]);
  useEffect(() => {
    if (albums.length && !albums.some((a) => a.key === selAlbum))
      setSelAlbum(albums[0].key);
  }, [albums, selAlbum]);
  useEffect(() => {
    if (artists.length && !artists.some((a) => a.key === selArtist))
      setSelArtist(artists[0].key);
  }, [artists, selArtist]);

  // Cover + adaptive palette for the playing track.
  const currentPath = player.current?.path;
  useEffect(() => {
    const id = ++reqId.current;
    if (!currentPath) {
      setCoverUrl(null);
      setPalette(DEFAULT_PALETTE);
      return;
    }
    const apply = async (cover: string | null) => {
      if (id !== reqId.current) return;
      setCoverUrl(cover);
      if (cover) {
        const pal = await extractPalette(cover, 4);
        if (id === reqId.current) setPalette(pal);
      } else {
        setPalette(DEFAULT_PALETTE);
      }
    };
    const cached = coverCache.current.get(currentPath);
    if (cached !== undefined) {
      void apply(cached);
      return;
    }
    (async () => {
      const cover = await getCover(currentPath).catch(() => null);
      if (id !== reqId.current) return;
      coverCache.current.set(currentPath, cover);
      void apply(cover);
    })();
  }, [currentPath]);

  const handlePickFolder = useCallback(async () => {
    const path = await pickFolder();
    if (!path) return;
    setScanning(true);
    try {
      const tracks = await scanFolder(path);
      setLibrary(tracks);
      setRootPath(path);
    } finally {
      setScanning(false);
    }
  }, []);

  const handleEqChange = useCallback((index: number, gainDb: number) => {
    engine.setEq(index, gainDb);
    setEqGains((g) => g.map((v, i) => (i === index ? gainDb : v)));
  }, []);

  const handleEqPreset = useCallback((gains: number[]) => {
    gains.forEach((g, i) => engine.setEq(i, g));
    setEqGains(gains);
  }, []);

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const selectFolder = useCallback((path: string) => {
    setSelFolder(path);
    setExpanded((prev) => new Set(prev).add(path));
  }, []);

  // Resolve the current view's tracks + title. A non-empty search overrides the
  // mode and searches the whole library.
  const searching = query.trim().length > 0;
  let viewTracks: Track[] = [];
  let viewTitle = "";
  if (searching) {
    viewTracks = library;
    viewTitle = `Pencarian "${query.trim()}"`;
  } else if (mode === "songs") {
    viewTracks = library;
    viewTitle = "Semua Lagu";
  } else if (mode === "folders") {
    const node = treeIndex.get(selFolder) ?? tree;
    viewTracks = node?.tracks ?? [];
    viewTitle = node?.name ?? "";
  } else if (mode === "albums") {
    const g = albums.find((a) => a.key === selAlbum);
    viewTracks = g?.tracks ?? [];
    viewTitle = g?.label ?? "";
  } else {
    const g = artists.find((a) => a.key === selArtist);
    viewTracks = g?.tracks ?? [];
    viewTitle = g?.label ?? "";
  }

  const onPlay = useCallback(
    (i: number) => player.playInList(viewTracks, i),
    [player, viewTracks]
  );

  // Pause heavy animations (gradient + visualizer) when the window is unfocused
  // or minimized, to spare GPU/CPU in the background.
  useEffect(() => {
    const onFocus = () => setWindowActive(true);
    const onBlur = () => setWindowActive(false);
    const onVis = () => setWindowActive(!document.hidden);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Animations run only while playing AND the window is in the foreground.
  const animationsActive = player.isPlaying && windowActive;

  // Folder (normalized path) that contains the currently-playing track.
  const playingFolderPath = currentPath
    ? currentPath.replace(/\\/g, "/").replace(/\/[^/]*$/, "")
    : null;

  const showSidebar = !searching && mode !== "songs";
  const hasLibrary = library.length > 0;

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden">
      <GradientBackground palette={palette} active={animationsActive} />

      <TopBar
        accent={accent}
        mode={mode}
        onMode={setMode}
        query={query}
        onQuery={setQuery}
        onPick={handlePickFolder}
        scanning={scanning}
      />

      <main className="min-h-0 flex-1 overflow-hidden px-6 pb-4 pt-1">
        {!hasLibrary ? (
          <div className="glass flex h-full flex-col items-center justify-center gap-3 rounded-2xl text-center text-white/45">
            <div className="text-5xl">🎵</div>
            <p className="text-sm">
              Belum ada lagu. Klik <b className="text-white/75">Buka Folder</b> untuk
              memindai koleksi musikmu (termasuk semua subfolder).
            </p>
          </div>
        ) : (
          <div className="flex h-full gap-5">
            {showSidebar && (
              <aside className="glass w-[300px] shrink-0 overflow-hidden rounded-2xl">
                <div className="h-full overflow-y-auto">
                  {mode === "folders" && tree && (
                    <FolderTree
                      root={tree}
                      selectedPath={selFolder}
                      playingPath={playingFolderPath}
                      accent={accent}
                      expanded={expanded}
                      onSelect={selectFolder}
                      onToggle={toggleExpand}
                    />
                  )}
                  {mode === "albums" && (
                    <GroupList
                      items={albums}
                      selectedKey={selAlbum}
                      onSelect={setSelAlbum}
                      icon={Album}
                    />
                  )}
                  {mode === "artists" && (
                    <GroupList
                      items={artists}
                      selectedKey={selArtist}
                      onSelect={setSelArtist}
                      icon={Artist}
                    />
                  )}
                </div>
              </aside>
            )}

            <section className="glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
              <header className="flex shrink-0 items-center gap-2 border-b border-white/8 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">
                    {viewTitle}
                  </div>
                  <div className="text-xs text-white/45">{viewTracks.length} lagu</div>
                </div>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <Library
                  tracks={viewTracks}
                  currentPath={currentPath}
                  isPlaying={player.isPlaying}
                  query={query}
                  onPlay={onPlay}
                  emptyMessage={
                    searching
                      ? "Tidak ada hasil."
                      : "Folder ini tidak punya lagu langsung — buka subfoldernya."
                  }
                />
              </div>
            </section>
          </div>
        )}
      </main>

      <BottomBar
        accent={accent}
        track={player.current}
        coverUrl={coverUrl}
        isPlaying={player.isPlaying}
        currentTime={player.currentTime}
        duration={player.duration}
        volume={player.volume}
        repeat={player.repeat}
        shuffle={player.shuffle}
        hasTrack={player.current !== null}
        showEq={showEq}
        eqGains={eqGains}
        onSeek={player.seek}
        onToggle={player.toggle}
        onNext={player.next}
        onPrev={player.prev}
        onVolume={player.setVolume}
        onCycleRepeat={player.cycleRepeat}
        onToggleShuffle={player.toggleShuffle}
        onToggleEq={() => setShowEq((s) => !s)}
        onEqChange={handleEqChange}
        onEqPreset={handleEqPreset}
        onExpand={() => setOverlayOpen(true)}
      />

      <NowPlayingOverlay
        open={overlayOpen}
        onClose={() => setOverlayOpen(false)}
        track={player.current}
        coverUrl={coverUrl}
        accent={accent}
        active={animationsActive}
      />
    </div>
  );
}

export default App;
