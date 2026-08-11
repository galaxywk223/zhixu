// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("renderer input policy", () => {
  it("does not register application keyboard shortcuts", () => {
    const root = fileURLToPath(
      new URL("../src/renderer/src/", import.meta.url),
    );
    const rendererSource = readdirSync(root, { recursive: true })
      .map(String)
      .filter((path) => [".ts", ".tsx"].includes(extname(path)))
      .map((path) => readFileSync(join(root, path), "utf8"))
      .join("\n");
    expect(rendererSource).not.toMatch(
      /addEventListener\(["']key(?:down|up|press)["']|onKey(?:Down|Up|Press)=/,
    );
  });

  it("does not advertise removed shortcuts", () => {
    const shell = source("../src/renderer/src/components/Shell.tsx");
    const settings = source("../src/renderer/src/pages/SettingsPage.tsx");
    expect(`${shell}\n${settings}`).not.toMatch(/Ctrl\+|aria-keyshortcuts/);
  });
});
