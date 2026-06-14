import { useCallback, useState } from "react";

/** User-configurable settings, persisted to localStorage. */
export interface Settings {
  rememberLastPlayed: boolean; // restore last track + position on startup
  resumeStartupPage: boolean; // restore last mode + folder on startup
  followSong: boolean; // auto-scroll the list to the playing track
  volumeScrollStep: number; // percent the mouse wheel changes volume by
  // System tray (used in a later phase)
  trayIcon: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
}

const DEFAULTS: Settings = {
  rememberLastPlayed: true,
  resumeStartupPage: true,
  followSong: true,
  volumeScrollStep: 2,
  trayIcon: true,
  minimizeToTray: true,
  closeToTray: true,
};

const KEY = "meusic.settings";

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);

  const update = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    []
  );

  return { settings, update };
}
