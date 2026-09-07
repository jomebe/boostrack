import { defineConfig } from "vite";

export default defineConfig({
  server: { proxy: { '/api': 'http://127.0.0.1:8788' } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          physics: ["@dimforge/rapier3d-compat"],
          three: ["three"],
        },
      },
    },
  },
});
