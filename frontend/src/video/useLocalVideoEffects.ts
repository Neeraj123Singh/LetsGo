import { useEffect, useRef, useState } from "react";
import type { BodySegmenter } from "@tensorflow-models/body-segmentation";

export type VideoEffectMode = "none" | "blur" | "background";

// Structured, prefixed logger so all effect-related diagnostics are easy to
// filter in the browser console (filter on `[letsgo:effects]`).
const LOG = "[letsgo:effects]";
const linfo = (...a: unknown[]) => console.info(LOG, ...a);
const lwarn = (...a: unknown[]) => console.warn(LOG, ...a);
const lerr = (...a: unknown[]) => console.error(LOG, ...a);

// MediaPipe WASM runtime hosted on the official jsDelivr CDN. Pinned to the
// exact version that index.html's <script> tag loads, so the loader script and
// the wasm/tflite assets always come from a matching build.
const MEDIAPIPE_SOLUTION_PATH =
  "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747";

/**
 * Local camera: ML blur (bokeh) or still image behind the subject.
 *
 * Implementation notes
 * --------------------
 * - The selfie-segmentation mask returns ImageData where the person probability
 *   is encoded in the R/G/B channels and the alpha channel is always 255. That
 *   makes the mask unusable for `destination-in` compositing as-is — we rewrite
 *   the alpha channel ourselves so person pixels become opaque and background
 *   pixels become transparent.
 * - We use native `ctx.filter = "blur(...)"` for the blur background. It is far
 *   more reliable than `drawBokehEffect`, which has known issues with certain
 *   mask underlying types.
 * - The canvas-derived stream is only published to consumers (`setDisplayStream`)
 *   after the first frame is actually drawn, so the local tile never shows a
 *   blank/frozen canvas while the model is initialising.
 * - The rAF loop always reschedules in a `finally`, so a per-frame exception can
 *   never kill the loop and freeze the local tile or the remote peer stream.
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
  const outStreamRef = useRef<MediaStream | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const modeRef = useRef<VideoEffectMode>(mode);

  useEffect(() => {
    bgImageRef.current = backgroundImage;
    linfo("backgroundImage updated", {
      hasImage: !!backgroundImage,
      complete: backgroundImage?.complete,
      naturalWidth: backgroundImage?.naturalWidth,
      naturalHeight: backgroundImage?.naturalHeight,
    });
  }, [backgroundImage]);

  useEffect(() => {
    modeRef.current = mode;
    linfo("mode ref updated to", mode);
  }, [mode]);

  useEffect(() => {
    linfo("effect run", {
      mode,
      hasRawStream: !!rawStream,
      videoTracks: rawStream?.getVideoTracks().length ?? 0,
      audioTracks: rawStream?.getAudioTracks().length ?? 0,
    });

    setEffectError(null);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    segmenterRef.current?.dispose();
    segmenterRef.current = null;
    outStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
    outStreamRef.current = null;

    if (!rawStream) {
      linfo("no rawStream → displayStream=null");
      setDisplayStream(null);
      return;
    }

    if (mode === "none") {
      linfo("mode=none → passthrough rawStream");
      setDisplayStream(rawStream);
      return;
    }

    let cancelled = false;

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = rawStream;
    video.play().then(
      () => linfo("hidden video element playing", { w: video.videoWidth, h: video.videoHeight }),
      (err) => lwarn("hidden video element play() rejected", err)
    );

    const canvas = document.createElement("canvas");
    const offCanvas = document.createElement("canvas");
    const maskCanvas = document.createElement("canvas");

    // Show the raw camera immediately so the local tile is never blank while
    // the ML model loads (which can take several seconds on first run).
    linfo("publish rawStream as initial displayStream (model loading...)");
    setDisplayStream(rawStream);

    let publishedCanvasStream = false;
    let firstSegmentationLogged = false;
    let lastHadPerson: boolean | null = null;
    let frameCount = 0;
    let lastFrameErrorLogAt = 0;
    const t0 = performance.now();

    (async () => {
      try {
        // Sanity-check the index.html <script> tag actually loaded.
        const w = window as { SelfieSegmentation?: unknown };
        if (!w.SelfieSegmentation) {
          throw new Error(
            "window.SelfieSegmentation is undefined — the selfie_segmentation.js " +
              "script tag in index.html did not load (check Network panel / CSP)"
          );
        }
        const bodySegmentation = await import("@tensorflow-models/body-segmentation");
        linfo("loading MediaPipe selfie segmenter via", MEDIAPIPE_SOLUTION_PATH);
        const segmenter = await bodySegmentation.createSegmenter(
          bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
          {
            runtime: "mediapipe",
            modelType: "general",
            solutionPath: MEDIAPIPE_SOLUTION_PATH,
          }
        );
        if (cancelled) {
          linfo("cancelled before segmenter could be installed; disposing");
          segmenter.dispose();
          return;
        }
        segmenterRef.current = segmenter;
        linfo("segmenter ready", { elapsedMs: Math.round(performance.now() - t0) });
      } catch (e) {
        lerr("segmenter setup failed", e);
        if (!cancelled) {
          setEffectError(
            e instanceof Error
              ? `Could not load segmentation model: ${e.message}`
              : "Could not load segmentation model"
          );
          // Keep showing the raw camera — better than a frozen tile.
          setDisplayStream(rawStream);
        }
        return;
      }

      const out = canvas.captureStream(24);
      outStreamRef.current = out;
      linfo("canvas captureStream(24) created; will publish after first frame", {
        tracks: out.getTracks().length,
      });

      const tick = async () => {
        if (cancelled || !segmenterRef.current) return;

        try {
          if (video.readyState >= 2 && video.videoWidth >= 2 && video.videoHeight >= 2) {
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            if (canvas.width !== vw || canvas.height !== vh) {
              linfo("canvas size set", { vw, vh });
              canvas.width = vw;
              canvas.height = vh;
              offCanvas.width = vw;
              offCanvas.height = vh;
              maskCanvas.width = vw;
              maskCanvas.height = vh;
            }

            const ctx = canvas.getContext("2d")!;
            const offCtx = offCanvas.getContext("2d")!;
            const maskCtx = maskCanvas.getContext("2d")!;

            // Reset state that prior frames may have left in place.
            ctx.filter = "none";
            ctx.globalCompositeOperation = "source-over";

            const segs = await segmenterRef.current.segmentPeople(video);
            if (cancelled) return;

            if (!firstSegmentationLogged) {
              firstSegmentationLogged = true;
              const ut = segs[0]?.mask.getUnderlyingType?.();
              linfo("first segmentation completed", {
                count: segs.length,
                maskType: ut,
                elapsedMs: Math.round(performance.now() - t0),
              });
            }

            const hasPerson = segs.length > 0;
            if (lastHadPerson !== hasPerson) {
              linfo(
                hasPerson
                  ? `person detected (segs=${segs.length})`
                  : "no person detected — falling back to raw frame"
              );
              lastHadPerson = hasPerson;
            }

            const m = modeRef.current;
            if (!hasPerson) {
              // No person yet — show the raw frame so the canvas isn't blank.
              ctx.drawImage(video, 0, 0, vw, vh);
            } else {
              // The mask format differs by runtime:
              //   - MediaPipe runtime (`underlyingType === 'canvasimagesource'`):
              //       a canvas where alpha already encodes person probability.
              //   - TFJS runtime: ImageData with probability in R/G/B and alpha=255.
              // Handle both: prefer the canvas source path (cheaper, no per-pixel
              // JS loop); fall back to ImageData with alpha rewriting otherwise.
              const mask = segs[0].mask;
              const underlyingType = mask.getUnderlyingType?.();

              let maskSource: CanvasImageSource;
              if (underlyingType === "canvasimagesource") {
                maskSource = await mask.toCanvasImageSource();
                if (cancelled) return;
              } else {
                const maskData = await mask.toImageData();
                if (cancelled) return;
                const data = maskData.data;
                let personPixelCount = 0;
                for (let i = 0; i < data.length; i += 4) {
                  const isPerson = data[i] > 127; // R channel = person probability * 255
                  data[i + 3] = isPerson ? 255 : 0;
                  if (isPerson) {
                    data[i] = 255;
                    data[i + 1] = 255;
                    data[i + 2] = 255;
                    personPixelCount++;
                  }
                }
                if (frameCount % 120 === 0) {
                  const totalPixels = data.length / 4;
                  linfo("frame stats (tfjs path)", {
                    frame: frameCount,
                    mode: m,
                    personPx: personPixelCount,
                    totalPx: totalPixels,
                    personPct: ((personPixelCount / totalPixels) * 100).toFixed(1) + "%",
                  });
                }
                maskCtx.putImageData(maskData, 0, 0);
                maskSource = maskCanvas;
              }

              if (frameCount % 120 === 0 && underlyingType === "canvasimagesource") {
                linfo("frame stats (mediapipe path)", { frame: frameCount, mode: m });
              }

              // Isolate the person: video clipped by the mask, on transparency.
              offCtx.globalCompositeOperation = "source-over";
              offCtx.filter = "none";
              offCtx.clearRect(0, 0, vw, vh);
              offCtx.drawImage(video, 0, 0, vw, vh);
              offCtx.globalCompositeOperation = "destination-in";
              offCtx.drawImage(maskSource, 0, 0, vw, vh);
              offCtx.globalCompositeOperation = "source-over"; // reset for next frame

              // Render the background on the main canvas, then the person on top.
              if (m === "background") {
                const bg = bgImageRef.current;
                if (bg && bg.complete && bg.naturalWidth > 0) {
                  ctx.drawImage(bg, 0, 0, vw, vh);
                } else {
                  // No image picked yet — fall back to a blurred camera background.
                  if (frameCount % 120 === 0) {
                    linfo("background mode with no image → using blur fallback");
                  }
                  ctx.filter = "blur(14px)";
                  ctx.drawImage(video, 0, 0, vw, vh);
                  ctx.filter = "none";
                }
              } else {
                // Blur mode.
                ctx.filter = "blur(14px)";
                ctx.drawImage(video, 0, 0, vw, vh);
                ctx.filter = "none";
              }
              ctx.drawImage(offCanvas, 0, 0, vw, vh);
            }

            frameCount++;

            // Publish the canvas stream the first time we successfully draw a frame.
            // This guarantees the local <video> never shows an empty captureStream.
            if (!publishedCanvasStream) {
              publishedCanvasStream = true;
              linfo("publishing canvas stream as displayStream (first frame drawn)", {
                elapsedMs: Math.round(performance.now() - t0),
              });
              setDisplayStream(out);
            }
          } else if (frameCount === 0 && performance.now() - t0 > 5000) {
            // Surface the case where the hidden video element never reached HAVE_CURRENT_DATA.
            const now = performance.now();
            if (now - lastFrameErrorLogAt > 5000) {
              lastFrameErrorLogAt = now;
              lwarn("video element not ready after 5s", {
                readyState: video.readyState,
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight,
                paused: video.paused,
              });
            }
          }
        } catch (e) {
          // Per-frame failure: keep the previous canvas content and continue.
          // Don't rethrow — the rAF must always reschedule below or the local
          // tile and the remote peer video will both freeze permanently.
          const now = performance.now();
          if (now - lastFrameErrorLogAt > 1000) {
            lastFrameErrorLogAt = now;
            lwarn("per-frame error (will keep going)", e);
          }
        } finally {
          if (!cancelled) {
            rafRef.current = requestAnimationFrame(() => void tick());
          }
        }
      };
      void tick();
    })();

    return () => {
      linfo("cleanup", { mode, framesRendered: frameCount });
      cancelled = true;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      segmenterRef.current?.dispose();
      segmenterRef.current = null;
      // Only stop the canvas video track; the raw mic/camera tracks are owned
      // by `rawStream` and must keep flowing.
      outStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
      outStreamRef.current = null;
      video.srcObject = null;
    };
    // `backgroundImage` is intentionally excluded: it is read inside `tick()` via
    // `bgImageRef`. Including it would tear down and fully reload the TF.js
    // segmenter every time the user picks a new image (5+ second freeze).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawStream, mode]);

  return { displayStream, effectError };
}
