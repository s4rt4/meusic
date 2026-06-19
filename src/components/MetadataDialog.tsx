import { useEffect, useState } from "react";
import type { RGB, Track } from "../types";
import type { TrackEdit } from "../lib/api";
import { rgb } from "../lib/colors";

/**
 * Edit a track's tags (title / artist / album / album-artist / track no.). A
 * frosted form over the adaptive gradient, modeled on StationDialog. The actual
 * disk write + library refresh is the parent's job (`onSave`); this dialog only
 * collects the fields, shows a saving state, and surfaces any write error.
 * Closes on ✕, backdrop click, or Esc.
 */
export function MetadataDialog({
  open,
  track,
  accent,
  onClose,
  onSave,
}: {
  open: boolean;
  track: Track | null;
  accent: RGB;
  onClose: () => void;
  onSave: (path: string, edit: TrackEdit) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [albumArtist, setAlbumArtist] = useState("");
  const [trackNo, setTrackNo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from the target track whenever the dialog opens.
  useEffect(() => {
    if (open && track) {
      setTitle(track.title);
      setArtist(track.artist);
      setAlbum(track.album);
      setAlbumArtist(track.album_artist);
      setTrackNo(track.track_no > 0 ? String(track.track_no) : "");
      setError(null);
      setSaving(false);
    }
  }, [open, track]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !track) return null;
  const accentCss = rgb(accent, 1);
  const valid = title.trim().length > 0 && !saving;

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(track.path, {
        title: title.trim(),
        artist: artist.trim(),
        album: album.trim(),
        albumArtist: albumArtist.trim(),
        // Keep only digits; empty / 0 clears the field on the backend.
        trackNo: Math.max(0, parseInt(trackNo, 10) || 0),
      });
      onClose();
    } catch (e) {
      setError(typeof e === "string" ? e : (e as Error)?.message || "Gagal menyimpan");
      setSaving(false);
    }
  };

  const fieldCls =
    "mb-4 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none transition focus:border-white/40 disabled:opacity-50";
  const labelCls =
    "mb-1 block text-xs font-semibold uppercase tracking-wide text-white/45";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-8 backdrop-blur-md"
      onClick={onClose}
    >
      <form
        className="glass relative w-full max-w-md rounded-3xl p-7 shadow-2xl"
        style={{
          boxShadow: `0 24px 70px -20px ${rgb(accent, 0.7)}`,
          animation: "aboutPop 0.18s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <button
          type="button"
          onClick={onClose}
          title="Tutup"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white"
        >
          ✕
        </button>

        <h2 className="mb-1 text-lg font-bold tracking-tight text-white">
          Edit info lagu
        </h2>
        <p className="mb-5 truncate text-xs text-white/40" title={track.path}>
          {track.format} · {track.path.split(/[\\/]/).pop()}
        </p>

        <label className={labelCls}>Judul</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Judul lagu"
          className={fieldCls}
        />

        <label className={labelCls}>Artis</label>
        <input
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="Artis"
          className={fieldCls}
        />

        <label className={labelCls}>Album</label>
        <input
          value={album}
          onChange={(e) => setAlbum(e.target.value)}
          placeholder="Album"
          className={fieldCls}
        />

        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <label className={labelCls}>Album Artist</label>
            <input
              value={albumArtist}
              onChange={(e) => setAlbumArtist(e.target.value)}
              placeholder="Kosongkan = ikut artis"
              className={fieldCls}
            />
          </div>
          <div className="w-24 shrink-0">
            <label className={labelCls}>No. Track</label>
            <input
              value={trackNo}
              onChange={(e) => setTrackNo(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="—"
              className={fieldCls}
            />
          </div>
        </div>

        {error && (
          <p className="mb-3 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
            style={{ background: accentCss }}
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </form>
    </div>
  );
}
