import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * Sound helpers for the global notification surface.
 *
 * - `start()` plays a repeating two-note ring tone until `stop()` is called.
 * - `ping()` plays a single short "bell" for a new chat message etc.
 *
 * Both are best-effort: if the AudioContext is suspended (a browser quirk
 * before any user gesture), we still try to `resume()` so the sound plays as
 * soon as the user clicks anywhere. We also gracefully no-op when the Web
 * Audio API is unavailable (e.g. during SSR or in some headless browsers).
 */
export function useCallRing() {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringingRef = useRef(false);

  const ensureCtx = useCallback((): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    ctxRef.current = ctx;
    return ctx;
  }, []);

  const tone = useCallback((freq: number, durationMs: number, volume = 0.08) => {
    const ctx = ensureCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => undefined);
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    // Quick fade-in/out so it doesn't pop on cheap speakers.
    const now = ctx.currentTime;
    const dur = durationMs / 1000;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.linearRampToValueAtTime(volume, now + dur - 0.04);
    gain.gain.linearRampToValueAtTime(0, now + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
  }, [ensureCtx]);

  const ringOnce = useCallback(() => {
    tone(880, 220);
    setTimeout(() => tone(660, 220), 260);
  }, [tone]);

  /**
   * Browsers often start AudioContext in "suspended" until a user gesture.
   * Call this after sign-in (we attach listeners in NotifyProvider) so an incoming ring can play immediately.
   */
  const unlock = useCallback(async () => {
    const ctx = ensureCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => undefined);
    }
  }, [ensureCtx]);

  const stop = useCallback(() => {
    ringingRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    stop();
    ringingRef.current = true;
    const ctx = ensureCtx();
    if (ctx?.state === "suspended") {
      await ctx.resume().catch(() => undefined);
    }
    ringOnce();
    intervalRef.current = setInterval(() => {
      if (!ringingRef.current) return;
      ringOnce();
    }, 1800);
  }, [ensureCtx, ringOnce, stop]);

  const ping = useCallback(() => {
    tone(1200, 120, 0.07);
  }, [tone]);

  useEffect(() => {
    return () => {
      stop();
      if (ctxRef.current) {
        void ctxRef.current.close().catch(() => undefined);
        ctxRef.current = null;
      }
    };
  }, [stop]);

  return useMemo(() => ({ start, stop, ping, unlock }), [start, stop, ping, unlock]);
}
