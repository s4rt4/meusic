import { useCallback, useEffect, useRef, useState } from "react";
import { engine } from "../audio/engine";
import { trackUrl } from "../lib/api";
import type { RepeatMode, Track } from "../types";

/**
 * Central playback state + controls. Owns the queue and drives the singleton
 * AudioEngine. Mutable values the <audio> event handlers depend on are mirrored
 * into refs so the listeners (attached once) always read current values.
 */
export function usePlayer() {
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(-1);
  const [isPlaying, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [shuffle, setShuffle] = useState(false);

  const queueRef = useRef(queue);
  const indexRef = useRef(index);
  const repeatRef = useRef(repeat);
  const shuffleRef = useRef(shuffle);
  queueRef.current = queue;
  indexRef.current = index;
  repeatRef.current = repeat;
  shuffleRef.current = shuffle;

  const current = index >= 0 ? queue[index] ?? null : null;

  const playAt = useCallback((i: number) => {
    const q = queueRef.current;
    if (i < 0 || i >= q.length) return;
    engine.ensureGraph();
    engine.audio.src = trackUrl(q[i].path);
    engine.audio.play().catch(() => {});
    setIndex(i);
  }, []);

  /**
   * Replace the queue with `list` and start playing item `i`. Used when the
   * user plays a song from a specific view (a folder, album, or artist) so the
   * queue — and therefore next/prev — follows that list. We write the ref
   * synchronously because playAt reads queueRef before the state commit lands.
   */
  const playInList = useCallback((list: Track[], i: number) => {
    if (i < 0 || i >= list.length) return;
    queueRef.current = list;
    setQueue(list);
    engine.ensureGraph();
    engine.audio.src = trackUrl(list[i].path);
    engine.audio.play().catch(() => {});
    setIndex(i);
  }, []);

  /**
   * Load `list[i]` into the engine WITHOUT playing (paused), seeking to
   * `position` once metadata is ready. Used to restore the last session;
   * playback begins only when the user presses play.
   */
  const loadInList = useCallback((list: Track[], i: number, position: number) => {
    if (i < 0 || i >= list.length) return;
    queueRef.current = list;
    setQueue(list);
    const a = engine.audio;
    a.src = trackUrl(list[i].path);
    if (position > 0) {
      const seek = () => {
        a.currentTime = position;
        a.removeEventListener("loadedmetadata", seek);
      };
      a.addEventListener("loadedmetadata", seek);
    }
    setIndex(i);
    setPlaying(false);
  }, []);

  const next = useCallback(() => {
    const q = queueRef.current;
    if (!q.length) return;
    if (shuffleRef.current && q.length > 1) {
      let r = indexRef.current;
      while (r === indexRef.current) r = Math.floor(Math.random() * q.length);
      playAt(r);
      return;
    }
    const i = indexRef.current;
    if (i + 1 < q.length) playAt(i + 1);
    else if (repeatRef.current === "all") playAt(0);
    else {
      engine.audio.pause();
      setPlaying(false);
    }
  }, [playAt]);

  const prev = useCallback(() => {
    if (engine.audio.currentTime > 3 || indexRef.current <= 0) {
      engine.audio.currentTime = 0;
      return;
    }
    playAt(indexRef.current - 1);
  }, [playAt]);

  const toggle = useCallback(() => {
    if (indexRef.current < 0) {
      playAt(0);
      return;
    }
    if (engine.audio.paused) {
      engine.ensureGraph();
      engine.audio.play().catch(() => {});
    } else {
      engine.audio.pause();
    }
  }, [playAt]);

  const seek = useCallback((t: number) => {
    engine.audio.currentTime = t;
    setCurrentTime(t);
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  }, []);

  // Wire <audio> events exactly once.
  useEffect(() => {
    const a = engine.audio;
    const onTime = () => setCurrentTime(a.currentTime);
    const onMeta = () => setDuration(a.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => {
      if (repeatRef.current === "one") {
        a.currentTime = 0;
        a.play().catch(() => {});
        return;
      }
      next();
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnd);
    };
  }, [next]);

  useEffect(() => {
    engine.audio.volume = volume;
  }, [volume]);

  return {
    queue,
    setQueue,
    index,
    current,
    isPlaying,
    currentTime,
    duration,
    volume,
    repeat,
    shuffle,
    playAt,
    playInList,
    loadInList,
    next,
    prev,
    toggle,
    seek,
    setVolume,
    cycleRepeat,
    toggleShuffle: () => setShuffle((s) => !s),
  };
}
