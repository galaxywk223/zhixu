import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, "../.."), "");
  return {
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
      define: {
        __SUPABASE_URL__: JSON.stringify(env.SUPABASE_URL ?? ""),
        __SUPABASE_ANON_KEY__: JSON.stringify(env.SUPABASE_ANON_KEY ?? ""),
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
  };
});
