import { defineConfig } from "vite";

export default defineConfig({
  root: "dashboard",
  build: {
    outDir: "../public",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    rolldownOptions: {
      input: ["dashboard/app/index.html"],
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  server: {
    port: 5173,
  },
});
