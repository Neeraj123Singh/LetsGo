import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "apple-touch-icon.png",
        "pwa-192.png",
        "pwa-512.png",
        "pwa-maskable-512.png",
      ],
      manifest: {
        id: "/",
        name: "Letsgo",
        short_name: "Letsgo",
        description:
          "Contacts, 1:1 chat, group mesh video calls, and invites — Letsgo.",
        theme_color: "#0f1419",
        background_color: "#0f1419",
        display: "standalone",
        orientation: "any",
        scope: "/",
        start_url: "/",
        categories: ["social", "communication"],
        icons: [
          {
            src: "pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "favicon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webp}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/meeting\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api") || url.pathname.startsWith("/meeting"),
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
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
