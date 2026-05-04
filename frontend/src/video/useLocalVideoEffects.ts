import { useEffect, useRef, useState } from "react";
import type { BodySegmenter } from "@tensorflow-models/body-segmentation";

export type VideoEffectMode = "none" | "blur" | "background";

/**
 * Local camera: ML blur (bokeh) or still image behind the subject.
 * Uses a ref for the background image so late-loaded images work inside the rAF loop.
 */
export function useLocalVideoEffects(
  rawStream: MediaStream | null,
  mode: VideoEffectMode,
  backgroundImage: HTMLImageElement | null
) {
  const [displayStream, setDisplayStream] = useState<MediaStream | null>(null);
  const [effectError, setEffectError] = useState<string | null>(null);
  const rafRef = useRef<number>(0);
  const segmenterRef = useRef<BodySegmenter | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const outStreamRef = useRef<MediaStream | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const modeRef = useRef<VideoEffectMode>(mode);

  useEffect(() => {
    bgImageRef.current = backgroundImage;
  }, [backgroundImage]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    setEffectError(null);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    segmenterRef.current?.dispose();
    segmenterRef.current = null;
    outStreamRef.current?.getTracks().forEach((t) => t.stop());
    outStreamRef.current = null;
    canvasRef.current = null;

    if (!rawStream) {
      setDisplayStream(null);
      return;
    }

    if (mode === "none") {
      setDisplayStream(rawStream);
      return;
    }

    let cancelled = false;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = rawStream;
    video.play().catch(() => undefined);

    const canvas = document.createElement("canvas");
    canvasRef.current = canvas;

    (async () => {
      try {
        await import("@tensorflow/tfjs-backend-webgl");
        const tf = await import("@tensorflow/tfjs");
        await tf.ready();
        const bodySegmentation = await import("@tensorflow-models/body-segmentation");
        const segmenter = await bodySegmentation.createSegmenter(
          bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
          { runtime: "tfjs" }
        );
        if (cancelled) {
          segmenter.dispose();
          return;
        }
        segmenterRef.current = segmenter;

        const out = canvas.captureStream(24);
        outStreamRef.current = out;
        setDisplayStream(out);

        const tick = async () => {
          if (cancelled || !segmenterRef.current) {
            return;
          }
          if (video.readyState < 2) {
            rafRef.current = requestAnimationFrame(() => void tick());
            return;
          }
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          if (vw < 2 || vh < 2) {
            rafRef.current = requestAnimationFrame(() => void tick());
            return;
          }
          if (canvas.width !== vw || canvas.height !== vh) {
            canvas.width = vw;
            canvas.height = vh;
          }
          const segs = await segmenterRef.current.segmentPeople(video);
          if (cancelled || segs.length === 0) {
            rafRef.current = requestAnimationFrame(() => void tick());
            return;
          }
          const m = modeRef.current;
          if (m === "blur") {
            await bodySegmentation.drawBokehEffect(canvas, video, segs, 0.5, 12, 4);
          } else if (m === "background") {
            const bg = bgImageRef.current;
            const ctx = canvas.getContext("2d");
            if (bg && bg.complete && ctx) {
              const bin = await bodySegmentation.toBinaryMask(segs[0], undefined, undefined, false, 0.5);
              const off = document.createElement("canvas");
              off.width = vw;
              off.height = vh;
              await bodySegmentation.drawMask(off, video, bin, 1, 4, false);
              ctx.clearRect(0, 0, vw, vh);
              ctx.drawImage(bg, 0, 0, vw, vh);
              ctx.drawImage(off, 0, 0, vw, vh);
            } else {
              await bodySegmentation.drawBokehEffect(canvas, video, segs, 0.5, 10, 3);
            }
          } else {
            await bodySegmentation.drawBokehEffect(canvas, video, segs, 0.5, 10, 3);
          }
          rafRef.current = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch (e) {
        if (!cancelled) {
          setEffectError(e instanceof Error ? e.message : "Could not load segmentation");
          setDisplayStream(rawStream);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      segmenterRef.current?.dispose();
      segmenterRef.current = null;
      outStreamRef.current?.getTracks().forEach((t) => t.stop());
      outStreamRef.current = null;
      video.srcObject = null;
    };
  }, [rawStream, mode, backgroundImage]);

  return { displayStream, effectError };
}
