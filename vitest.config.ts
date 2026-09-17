import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
