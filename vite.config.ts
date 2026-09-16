import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  build: {
    outDir: "../public",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
  },
  esbuild: {
    jsx: "automatic",
  },
  server: {
    port: 5173,
  },
});
