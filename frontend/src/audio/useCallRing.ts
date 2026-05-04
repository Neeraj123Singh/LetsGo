import { useCallback, useRef } from "react";

/**
 * Simple repeating ring tone (Web Audio) for incoming call modal.
 */
export function useCallRing() {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (ctxRef.current) {
      void ctxRef.current.close().catch(() => undefined);
      ctxRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    stop();
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      return;
    }
    const ctx = new Ctx();
    ctxRef.current = ctx;

    const beep = () => {
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      osc.start(now);
      osc.stop(now + 0.18);
    };
    beep();
    intervalRef.current = setInterval(beep, 1600);
  }, [stop]);

  return { start, stop };
}
