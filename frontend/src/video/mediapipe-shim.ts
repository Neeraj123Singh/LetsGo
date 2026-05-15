// Shim for `@mediapipe/selfie_segmentation`.
//
// The upstream script is Google-Closure-compiled and only assigns its exports
// to the global object (window/self). When Vite bundles the
// `@tensorflow-models/body-segmentation` library, its
// `require("@mediapipe/selfie_segmentation")` is transformed into an ESM
// namespace import whose `module.exports` is never populated, producing the
// runtime error `X.SelfieSegmentation is not a constructor`.
//
// To fix this, `index.html` loads the real script via a blocking <script> tag,
// which populates `window.SelfieSegmentation` before any application module
// runs. `vite.config.ts` then aliases the bare `@mediapipe/selfie_segmentation`
// import to this file, so the body-segmentation library receives a real module
// shape with `SelfieSegmentation` on it.

declare global {
  interface Window {
    SelfieSegmentation?: unknown;
    VERSION?: string;
  }
}

const w = window as { SelfieSegmentation?: unknown; VERSION?: string };

if (!w.SelfieSegmentation) {
  console.error(
    "[letsgo:mediapipe-shim] window.SelfieSegmentation is undefined. " +
      "The <script> tag in index.html may have failed to load. " +
      "Check the Network panel for selfie_segmentation.js."
  );
}

export const SelfieSegmentation = w.SelfieSegmentation;
export const VERSION = w.VERSION;
// Some bundlers/consumers access the default export.
// eslint-disable-next-line import/no-default-export
export default { SelfieSegmentation: w.SelfieSegmentation, VERSION: w.VERSION };
