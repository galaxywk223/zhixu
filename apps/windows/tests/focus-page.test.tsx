import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TomatoPreview, ZhixuApi } from "../src/preload/api-types";
import { FocusPage } from "../src/renderer/src/pages/FocusPage";

afterEach(cleanup);

function renderPage(preview: TomatoPreview | null, confirm = vi.fn()) {
  const api = {
    focus: {
      list: vi.fn().mockResolvedValue([]),
      batches: vi.fn().mockResolvedValue([]),
      preview: vi.fn().mockResolvedValue(preview),
      confirm,
      rollback: vi.fn().mockResolvedValue(undefined),
    },
    dashboard: {
      summary: vi.fn().mockResolvedValue({
        focusTodayMinutes: 0,
        focusWeekMinutes: 0,
        focusMonthMinutes: 0,
      }),
    },
  } as unknown as ZhixuApi;
  Object.defineProperty(window, "zhixu", {
    configurable: true,
    value: api,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onPreviewChange = vi.fn();
  const rendered = render(
    <QueryClientProvider client={client}>
      <FluentProvider theme={webLightTheme}>
        <FocusPage preview={preview} onPreviewChange={onPreviewChange} />
      </FluentProvider>
    </QueryClientProvider>,
  );
  return { onPreviewChange, container: rendered.container };
}

const preview: TomatoPreview = {
  token: "preview-token",
  fileName: "tomatodo_history.xls",
  fileHash: "hash",
  exportUser: "Galaxy 2025",
  declaredMinutes: 630,
  declaredRecords: 3,
  rangeStart: "2026-08-01T00:00:00.000Z",
  rangeEnd: "2026-08-11T00:00:00.000Z",
  calculatedMinutes: 630,
  focusCount: 1,
  lifeEventCount: 1,
  counts: {
    create: 1,
    update: 0,
    unchanged: 0,
    reconcile: 1,
    excluded: 1,
    error: 0,
  },
  canCommit: true,
  rows: [
    {
      sourceRow: 3,
      sourceKey: "focus",
      legacySourceKey: null,
      startAt: "2026-08-09T08:01:00.000Z",
      endAt: "2026-08-09T08:44:00.000Z",
      taskName: "项目开发",
      durationMinutes: 43,
      reflection: null,
      status: "已完成",
      classification: "focus",
      action: "create",
      reason: null,
      warnings: [],
    },
    {
      sourceRow: 4,
      sourceKey: "sleep",
      legacySourceKey: null,
      startAt: "2026-08-09T01:40:00.000Z",
      endAt: "2026-08-09T01:40:00.000Z",
      taskName: "睡眠",
      durationMinutes: 0,
      reflection: null,
      status: "已完成",
      classification: "life_event",
      action: "reconcile",
      reason: null,
      warnings: ["已修复旧版编码文本"],
    },
    {
      sourceRow: 5,
      sourceKey: "abandoned",
      legacySourceKey: null,
      startAt: "2026-08-09T06:38:00.000Z",
      endAt: "2026-08-09T06:38:00.000Z",
      taskName: "项目开发",
      durationMinutes: 0,
      reflection: null,
      status: "中途放弃",
      classification: "excluded",
      action: "excluded",
      reason: "中途放弃",
      warnings: [],
    },
  ],
};

describe("focus import preview", () => {
  it("renders the task-style focus workspace instead of the old page layout", async () => {
    const { container } = renderPage(null);
    expect(
      await screen.findByRole("heading", { name: "专注", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByLabelText("专注指标")).toBeTruthy();
    expect(screen.getByLabelText("专注快捷视图")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "数据概览" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "专注明细" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "导入批次" })).toBeTruthy();
    expect(container.querySelector(".stats-grid")).toBeNull();
    expect(container.querySelector(".filter-bar")).toBeNull();
    expect(container.querySelector(".workspace-section")).toBeNull();
  });

  it("shows database-aware outcomes and row-level details", async () => {
    renderPage(preview);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("tomatodo_history.xls")).toBeTruthy();
    expect(within(dialog).getByText("有效时长")).toBeTruthy();
    expect(within(dialog).getByText("630 分钟")).toBeTruthy();
    expect(within(dialog).getByText("新增 1")).toBeTruthy();
    expect(within(dialog).getByText("纠正旧错误 1")).toBeTruthy();
    expect(within(dialog).getByText("本次不导入")).toBeTruthy();
    expect(within(dialog).getByText("8 月 9 日")).toBeTruthy();
    expect(within(dialog).queryByRole("table")).toBeNull();
    expect(within(dialog).getByText("睡眠")).toBeTruthy();
    expect(within(dialog).getByText("中途放弃")).toBeTruthy();
    expect(
      (
        within(dialog).getByRole("button", {
          name: "确认导入",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("keeps the preview open and reports a failed commit", async () => {
    const confirm = vi.fn().mockRejectedValue(new Error("database busy"));
    const { onPreviewChange } = renderPage(preview, confirm);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "确认导入" }));
    expect(await within(dialog).findByText(/database busy/)).toBeTruthy();
    expect(onPreviewChange).not.toHaveBeenCalledWith(null);
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("preview-token"));
  });

  it("disables commit when the preview contains parser errors", async () => {
    renderPage({
      ...preview,
      canCommit: false,
      counts: { ...preview.counts, error: 1 },
      rows: [
        {
          ...preview.rows[0]!,
          classification: "error",
          action: "error",
          reason: "无法识别状态",
        },
      ],
    });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("错误 1")).toBeTruthy();
    expect(
      (
        within(dialog).getByRole("button", {
          name: "确认导入",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
