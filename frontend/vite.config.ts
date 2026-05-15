import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // `@mediapipe/selfie_segmentation` is a Google-Closure-compiled script
      // that only mutates the global namespace and never sets `module.exports`.
      // Vite's CJS-to-ESM transform of the body-segmentation library's
      // `require(...)` call therefore returns an empty object, breaking
      // `new selfieSegmentation.SelfieSegmentation()`.
      //
      // We redirect the bare import to a shim that re-exports the global
      // `window.SelfieSegmentation` that `index.html` loads via <script>.
      // The regex anchors `$` so deep imports like
      // `@mediapipe/selfie_segmentation/selfie_segmentation.js` are NOT aliased.
      {
        find: /^@mediapipe\/selfie_segmentation$/,
        replacement: path.resolve(projectRoot, "src/video/mediapipe-shim.ts"),
      },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/meeting": {
        target: "http://localhost:8081",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
