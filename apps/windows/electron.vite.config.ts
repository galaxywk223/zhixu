import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({ include: ["electron", "better-sqlite3"] }),
    ],
    build: {
      rollupOptions: {
        input: resolve("src/main/index.ts"),
        external: ["electron", "better-sqlite3"],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ include: ["electron"] })],
    build: {
      rollupOptions: {
        input: resolve("src/preload/index.ts"),
        external: ["electron"],
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    root: resolve("src/renderer"),
    publicDir: resolve("resources"),
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [react()],
  },
});
