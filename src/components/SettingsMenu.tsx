import type { Settings } from "../hooks/useSettings";
import type { RGB } from "../types";

const STEPS = [1, 2, 5, 10];

function Toggle({
  label,
  desc,
  value,
  accent,
  onChange,
}: {
  label: string;
  desc?: string;
  value: boolean;
  accent: RGB;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/5"
    >
      <div className="min-w-0">
        <div className="text-sm text-white/90">{label}</div>
        {desc && <div className="text-xs text-white/45">{desc}</div>}
      </div>
      <span
        className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
        style={{ background: value ? `rgb(${accent.join(",")})` : "rgba(255,255,255,0.15)" }}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            value ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">
        {title}
      </div>
      {children}
    </div>
  );
}

/** Settings panel rendered inside the top-bar menu dropdown. */
export function SettingsMenu({
  settings,
  onUpdate,
  accent,
}: {
  settings: Settings;
  onUpdate: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  accent: RGB;
}) {
  return (
    <div className="flex flex-col">
      <Section title="Pemutaran">
        <Toggle
          label="Lanjutkan lagu terakhir"
          desc="Ingat lagu & posisi pemutaran terakhir"
          value={settings.rememberLastPlayed}
          accent={accent}
          onChange={(v) => onUpdate("rememberLastPlayed", v)}
        />
        <Toggle
          label="Buka halaman terakhir"
          desc="Mode & folder terakhir saat dibuka"
          value={settings.resumeStartupPage}
          accent={accent}
          onChange={(v) => onUpdate("resumeStartupPage", v)}
        />
        <Toggle
          label="Ikuti lagu"
          desc="Gulir otomatis ke lagu yang diputar"
          value={settings.followSong}
          accent={accent}
          onChange={(v) => onUpdate("followSong", v)}
        />
      </Section>

      <Section title="Volume">
        <div className="flex items-center justify-between gap-3 px-2 py-2">
          <div className="text-sm text-white/90">Scroll mengubah volume</div>
          <select
            value={settings.volumeScrollStep}
            onChange={(e) => onUpdate("volumeScrollStep", Number(e.target.value))}
            className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-sm text-white outline-none"
          >
            {STEPS.map((s) => (
              <option key={s} value={s} className="bg-neutral-800">
                {s}%
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section title="Area notifikasi">
        <Toggle
          label="Tampilkan ikon di system tray"
          value={settings.trayIcon}
          accent={accent}
          onChange={(v) => onUpdate("trayIcon", v)}
        />
        <Toggle
          label="Minimize ke tray"
          value={settings.minimizeToTray}
          accent={accent}
          onChange={(v) => onUpdate("minimizeToTray", v)}
        />
        <Toggle
          label="Close ke tray"
          desc="Tutup window menyembunyikan ke tray, bukan keluar"
          value={settings.closeToTray}
          accent={accent}
          onChange={(v) => onUpdate("closeToTray", v)}
        />
      </Section>
    </div>
  );
}
