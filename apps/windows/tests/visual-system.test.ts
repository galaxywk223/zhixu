// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zhixuDarkTheme, zhixuLightTheme } from "../src/renderer/src/theme";

const styles = readFileSync(
  fileURLToPath(new URL("../src/renderer/src/styles.css", import.meta.url)),
  "utf8",
);

describe("visual system", () => {
  it("uses comfortable typography at the unchanged 100 percent scale", () => {
    expect(zhixuLightTheme.fontSizeBase300).toBe("15px");
    expect(zhixuDarkTheme.fontSizeBase300).toBe("15px");
    expect(styles).toContain("--font-body: 15px");
    expect(styles).toContain("--font-caption: 14px");
  });

  it("locks sidebar icons to one aligned slot", () => {
    expect(styles).toMatch(
      /\.nav-item svg \{[^}]*width: 24px;[^}]*height: 24px;[^}]*flex: 0 0 24px;/s,
    );
  });

  it("stretches the task workspace and uses a responsive memo grid", () => {
    expect(styles).toMatch(/\.tasks-page \{[^}]*display: flex;/s);
    expect(styles).toMatch(/\.task-workspace-layout \{[^}]*flex: 1;/s);
    expect(styles).toMatch(
      /\.memo-list \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s,
    );
  });
});
