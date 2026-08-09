// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zhixuDarkTheme, zhixuLightTheme } from "../src/renderer/src/theme";

const styles = readFileSync(
  fileURLToPath(new URL("../src/renderer/src/styles.css", import.meta.url)),
  "utf8",
);
const formSources = [
  "../src/renderer/src/components/TaskEditor.tsx",
  "../src/renderer/src/pages/MemosPage.tsx",
  "../src/renderer/src/pages/CountdownsPage.tsx",
  "../src/renderer/src/pages/CalendarPage.tsx",
  "../src/renderer/src/pages/SleepPage.tsx",
  "../src/renderer/src/pages/SettingsPage.tsx",
].map((path) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8"),
);
const focusSource = readFileSync(
  fileURLToPath(
    new URL("../src/renderer/src/pages/FocusPage.tsx", import.meta.url),
  ),
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

  it("uses the shared Fluent date and time fields in editor dialogs", () => {
    for (const source of formSources) {
      expect(source).not.toMatch(/type="(?:date|time|datetime-local)"/);
    }
    expect(formSources.join("\n")).toContain("LocalDateField");
    expect(formSources.join("\n")).toContain("LocalTimeField");
    expect(styles).not.toContain("min-width: 520px");
    expect(styles).toMatch(
      /\.editor-dialog \.fui-DialogContent,[\s\S]*overflow-y: auto;/,
    );
  });

  it("keeps Fluent fields aligned without styling their internal inputs", () => {
    const fieldRule = styles.match(/\.form-grid \.fui-Field \{([^}]*)\}/s);
    expect(fieldRule?.[1]).not.toContain("display: flex");
    expect(styles).not.toContain(".form-row input");
    expect(styles).not.toContain(".form-grid input:focus-visible");
    expect(styles).toMatch(
      /\.form-grid \.fui-Field__label \{[^}]*white-space: nowrap;/s,
    );
    expect(styles).toMatch(
      /\.form-row\.two \{[^}]*repeat\(2, minmax\(0, 1fr\)\);/s,
    );
    expect(styles).toContain("@container editor-form (max-width: 620px)");
    expect(styles).toMatch(
      /\.form-grid \.fui-Input,[\s\S]*height: var\(--control-height\);/,
    );
  });

  it("applies the editor dialog contract to every editing form", () => {
    for (const source of formSources) {
      expect(source).toContain('DialogSurface className="editor-dialog"');
    }
  });

  it("renders the import preview as grouped records instead of a table", () => {
    expect(focusSource).toContain("import-preview-records");
    expect(focusSource).not.toContain("import-preview-table");
    expect(styles).toMatch(
      /\.import-preview-row \{[\s\S]*grid-template-columns: 64px minmax\(0, 1fr\) auto auto;/,
    );
  });
});
