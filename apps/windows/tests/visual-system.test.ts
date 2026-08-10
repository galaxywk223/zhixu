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
const calendarSource = readFileSync(
  fileURLToPath(
    new URL("../src/renderer/src/pages/CalendarPage.tsx", import.meta.url),
  ),
  "utf8",
);
const sleepSource = readFileSync(
  fileURLToPath(
    new URL("../src/renderer/src/pages/SleepPage.tsx", import.meta.url),
  ),
  "utf8",
);
const countdownSource = readFileSync(
  fileURLToPath(
    new URL("../src/renderer/src/pages/CountdownsPage.tsx", import.meta.url),
  ),
  "utf8",
);
const settingsSource = readFileSync(
  fileURLToPath(
    new URL("../src/renderer/src/pages/SettingsPage.tsx", import.meta.url),
  ),
  "utf8",
);
const appSource = readFileSync(
  fileURLToPath(new URL("../src/renderer/src/App.tsx", import.meta.url)),
  "utf8",
);
const preloadSource = readFileSync(
  fileURLToPath(new URL("../src/preload/index.ts", import.meta.url)),
  "utf8",
);
const ipcSource = readFileSync(
  fileURLToPath(new URL("../src/main/ipc.ts", import.meta.url)),
  "utf8",
);
const databaseSource = readFileSync(
  fileURLToPath(new URL("../src/main/database.ts", import.meta.url)),
  "utf8",
);

describe("visual system", () => {
  it("uses comfortable typography at the unchanged 100 percent scale", () => {
    expect(zhixuLightTheme.fontSizeBase300).toBe("15px");
    expect(zhixuDarkTheme.fontSizeBase300).toBe("15px");
    expect(styles).toContain("--font-body: 15px");
    expect(styles).toContain("--font-caption: 14px");
  });

  it("reflows metric grids at high application zoom", () => {
    expect(appSource).toContain("ui-scale-${renderedUiScale}");
    expect(appSource).toContain("setRenderedUiScale(nextScale)");
    expect(styles).toContain(".ui-scale-125");
    expect(styles).toContain(".ui-scale-150");
    expect(styles).toMatch(
      /\.ui-scale-150[\s\S]*\.focus-metrics-grid[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
    );
  });

  it("locks sidebar icons to one aligned slot", () => {
    expect(styles).toMatch(
      /\.nav-item svg \{[^}]*width: 24px;[^}]*height: 24px;[^}]*flex: 0 0 24px;/s,
    );
  });

  it("stretches task and memo workspaces with internal tables", () => {
    expect(styles).toMatch(/\.tasks-page \{[^}]*display: flex;/s);
    expect(styles).toMatch(/\.task-workspace-layout \{[^}]*flex: 1;/s);
    expect(styles).toMatch(/\.memos-page \{[^}]*display: flex;/s);
    expect(styles).toMatch(/\.memo-workspace-layout \{[^}]*flex: 1;/s);
    expect(styles).toMatch(/\.memo-table-scroll \{[^}]*overflow-y: auto;/s);
  });

  it("uses the task workspace structure for focus analytics", () => {
    expect(styles).toMatch(
      /\.focus-page,[\s\S]*\.tasks-page \{[^}]*display: flex;/s,
    );
    expect(styles).toMatch(/\.focus-workspace-layout \{[^}]*flex: 1;/s);
    expect(styles).toContain(".focus-filter-rail");
    expect(styles).toContain(".focus-workspace-panel");
    expect(focusSource).toContain('role="tablist"');
    expect(focusSource).not.toContain('className="stats-grid"');
    expect(focusSource).not.toContain('className="filter-bar"');
  });

  it("uses the same fixed workspace structure for sleep analytics", () => {
    expect(styles).toMatch(/\.sleep-page \{[^}]*display: flex;/s);
    expect(styles).toMatch(/\.sleep-workspace-layout \{[^}]*flex: 1;/s);
    expect(styles).toContain(".sleep-filter-rail");
    expect(styles).toContain(".sleep-workspace-panel");
    expect(sleepSource).toContain('role="tablist"');
    expect(sleepSource).toContain("LineChart");
    expect(sleepSource).toContain("AreaChart");
    expect(sleepSource).toContain("BarChart");
    expect(sleepSource).not.toContain('className="stats-grid"');
  });

  it("renders countdown urgency in circular cards without fake progress", () => {
    expect(countdownSource).toContain('className="countdown-ring"');
    expect(countdownSource).not.toContain("countdown-value");
    expect(styles).toMatch(
      /\.countdown-ring \{[^}]*width: 132px;[^}]*height: 132px;[^}]*border-radius: 50%;/s,
    );
    expect(styles).toMatch(
      /\.countdown-grid \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/s,
    );
  });

  it("keeps the app shell fixed and scrolls long workspace content internally", () => {
    expect(styles).toMatch(/\.content \{[^}]*overflow: hidden;/s);
    expect(styles).toMatch(
      /\.page \{[^}]*height: 100%;[^}]*min-height: 0;[^}]*overflow: hidden;/s,
    );
    expect(styles).toMatch(
      /\.task-table-scroll \{[^}]*overflow-y: auto;[^}]*overflow-x: hidden;/s,
    );
    for (const className of [
      "memo-workspace-scroll",
      "memo-table-scroll",
      "countdown-workspace-scroll",
      "settings-workspace-scroll",
      "today-workspace-scroll",
      "calendar-detail-scroll",
      "week-timeline-scroll",
    ]) {
      expect(styles).toContain(`.${className}`);
    }
  });

  it("uses one fixed and responsive settings workspace", () => {
    expect(styles).toMatch(
      /\.settings-workspace-layout \{[^}]*grid-template-columns: 232px minmax\(0, 1fr\);[^}]*flex: 1;/s,
    );
    expect(styles).toMatch(
      /\.settings-workspace-toolbar \{[^}]*min-height: 58px;[^}]*border-bottom: 1px solid var\(--border\);/s,
    );
    expect(styles).toMatch(
      /\.setting-row \{[^}]*grid-template-columns: minmax\(240px, 1fr\) minmax\(220px, auto\);/s,
    );
    expect(styles).toContain("@container settings-panel (max-width: 620px)");
    expect(settingsSource).not.toContain("data-active=");
    expect(settingsSource).not.toContain("confirm(");
    expect(settingsSource).toContain('className="confirmation-dialog"');
  });

  it("uses tasks for the month view and focus sessions for the week view", () => {
    expect(calendarSource).toContain("buildCalendarMonth");
    expect(calendarSource).toContain("buildFocusWeek");
    expect(calendarSource).toContain("queryFn: window.zhixu.tasks.list");
    expect(calendarSource).toContain("queryFn: window.zhixu.focus.list");
    expect(calendarSource).not.toContain("ScheduleEditor");
    expect(preloadSource).not.toContain('ipcRenderer.invoke("calendar:');
    expect(ipcSource).not.toContain('ipcMain.handle("calendar:');
    expect(databaseSource).toContain("schedule_blocks");
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
    expect(styles).toContain("@container editor-form (max-width: 440px)");
    expect(styles).toMatch(
      /\.form-row\.two:not\(\.paired-row\)[\s\S]*grid-template-columns: minmax\(0, 1fr\);/,
    );
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
