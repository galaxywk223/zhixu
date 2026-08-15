import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FluentProvider } from "@fluentui/react-components";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TagRecord, TaskRecord, ZhixuApi } from "../src/preload/api-types";
import { TaskEditor } from "../src/renderer/src/components/TaskEditor";
import { zhixuLightTheme } from "../src/renderer/src/theme";
import { isImplicitEndOfDay } from "../src/shared/task-schedule";

afterEach(cleanup);

function renderEditor(
  api: ZhixuApi,
  initialDueDate?: string,
  task: TaskRecord | null = null,
  editScope: "single" | "series" = "single",
): void {
  Object.defineProperty(window, "zhixu", { configurable: true, value: api });
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <FluentProvider theme={zhixuLightTheme}>
        <TaskEditor
          open
          task={task}
          editScope={editScope}
          initialDueDate={initialDueDate}
          onClose={() => undefined}
        />
      </FluentProvider>
    </QueryClientProvider>,
  );
}

describe("task editor", () => {
  it("prefills an initial date supplied by the calendar", async () => {
    renderEditor(
      {
        tasks: {
          categories: vi.fn().mockResolvedValue([]),
          tags: vi.fn().mockResolvedValue([]),
          save: vi.fn(),
          createBatch: vi.fn(),
          saveTag: vi.fn(),
        },
      } as unknown as ZhixuApi,
      "2026-08-09",
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      (within(dialog).getByLabelText("日期") as HTMLInputElement).value,
    ).toBe("2026年8月9日");
  });

  it("selects existing tags and creates a new selected tag", async () => {
    const records: TagRecord[] = [
      {
        id: "tag-algorithm",
        name: "算法",
        colorHex: "#FF00FF",
        isArchived: false,
      },
    ];
    const saveTask = vi.fn().mockResolvedValue("task-1");
    const saveTag = vi.fn(async ({ name }: { name: string }) => {
      records.push({
        id: "tag-baoyan",
        name,
        colorHex: "#000000",
        isArchived: false,
      });
      return "tag-baoyan";
    });
    renderEditor({
      tasks: {
        categories: vi.fn().mockResolvedValue([]),
        tags: vi.fn(async () => [...records]),
        save: saveTask,
        saveTag,
      },
    } as unknown as ZhixuApi);

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["任务内容", "时间安排", "任务属性"]);
    const tagInput = within(dialog).getByRole("combobox", {
      name: "搜索或新建标签",
    });
    fireEvent.click(tagInput);
    fireEvent.change(tagInput, { target: { value: "算法" } });
    fireEvent.click(await screen.findByRole("option", { name: "算法" }));

    const selectedTag = (): Element | undefined =>
      [...dialog.querySelectorAll(".task-editor-tag")].find((element) =>
        element.textContent?.includes("算法"),
      );
    await waitFor(() => expect(Boolean(selectedTag())).toBe(true));
    fireEvent.click(selectedTag()!);
    await waitFor(() => expect(Boolean(selectedTag())).toBe(false));

    fireEvent.click(tagInput);
    fireEvent.change(tagInput, { target: { value: "算法" } });
    fireEvent.click(await screen.findByRole("option", { name: "算法" }));

    fireEvent.click(tagInput);
    fireEvent.change(tagInput, { target: { value: "保研" } });
    await screen.findByRole("option", { name: "新建“保研”" });
    fireEvent.keyDown(tagInput, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(saveTag).toHaveBeenCalledWith({ name: "保研" }));
    await waitFor(() =>
      expect(
        [...dialog.querySelectorAll(".task-editor-tag")].some((element) =>
          element.textContent?.includes("保研"),
        ),
      ).toBe(true),
    );

    fireEvent.change(within(dialog).getByRole("textbox", { name: /标题/ }), {
      target: { value: "准备夏令营材料" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(saveTask).toHaveBeenCalled());
    expect(within(dialog).queryByLabelText("状态")).toBeNull();
    expect(isImplicitEndOfDay(saveTask.mock.calls[0]?.[0].dueAt)).toBe(true);
    expect(saveTask.mock.calls[0]?.[0].tagIds).toEqual([
      "tag-algorithm",
      "tag-baoyan",
    ]);
  }, 15_000);

  it("creates a bounded weekday task range", async () => {
    const createBatch = vi.fn().mockResolvedValue({
      primaryId: "task-1",
      createdCount: 3,
      ids: ["task-1", "task-2", "task-3"],
    });
    renderEditor({
      tasks: {
        categories: vi.fn().mockResolvedValue([]),
        tags: vi.fn().mockResolvedValue([]),
        save: vi.fn(),
        createBatch,
        saveTag: vi.fn(),
      },
    } as unknown as ZhixuApi);

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /标题/ }), {
      target: { value: "每日复习" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "日期范围" }));
    fireEvent.change(within(dialog).getByLabelText(/开始日期/), {
      target: { value: "2026-08-07" },
    });
    fireEvent.change(within(dialog).getByLabelText(/结束日期/), {
      target: { value: "2026-08-11" },
    });
    fireEvent.change(within(dialog).getByLabelText("重复频率"), {
      target: { value: "weekdays" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => expect(createBatch).toHaveBeenCalled());
    expect(createBatch.mock.calls[0]?.[0]).toMatchObject({
      title: "每日复习",
      startDate: "2026-08-07",
      endDate: "2026-08-11",
      time: null,
      frequency: "weekdays",
    });
  });

  it("edits a complete task series with its saved recurrence", async () => {
    const updateSeries = vi.fn().mockResolvedValue({
      seriesId: "series-1",
      updatedCount: 3,
      createdCount: 0,
      removedCount: 0,
    });
    const task: TaskRecord = {
      id: "task-2",
      title: "每日复习",
      descriptionMd: null,
      status: "done",
      priority: 2,
      dueAt: new Date(2026, 7, 8, 23, 59, 59, 999).toISOString(),
      estimatedMinutes: 45,
      categoryId: null,
      repeatRule: JSON.stringify({
        frequency: "daily",
        startDate: "2026-08-07",
        endDate: "2026-08-09",
        time: null,
      }),
      series: {
        id: "series-1",
        frequency: "daily",
        startDate: "2026-08-07",
        endDate: "2026-08-09",
        time: null,
      },
      completedAt: new Date().toISOString(),
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      tagIds: [],
    };
    renderEditor(
      {
        tasks: {
          categories: vi.fn().mockResolvedValue([]),
          tags: vi.fn().mockResolvedValue([]),
          updateSeries,
          saveTag: vi.fn(),
        },
      } as unknown as ZhixuApi,
      undefined,
      task,
      "series",
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "编辑任务系列" }),
    ).toBeTruthy();
    expect(
      (within(dialog).getByLabelText("开始日期") as HTMLInputElement).value,
    ).toBe("2026年8月7日");
    expect(
      (within(dialog).getByLabelText("结束日期") as HTMLInputElement).value,
    ).toBe("2026年8月9日");
    expect(
      (within(dialog).getByLabelText("重复频率") as HTMLSelectElement).value,
    ).toBe("daily");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /标题/ }), {
      target: { value: "每日算法复习" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => expect(updateSeries).toHaveBeenCalled());
    expect(updateSeries.mock.calls[0]?.[0]).toMatchObject({
      taskId: "task-2",
      title: "每日算法复习",
      startDate: "2026-08-07",
      endDate: "2026-08-09",
      frequency: "daily",
      time: null,
    });
  });

  it("keeps the task draft when inline tag creation fails", async () => {
    const saveTask = vi.fn();
    renderEditor({
      tasks: {
        categories: vi.fn().mockResolvedValue([]),
        tags: vi.fn().mockResolvedValue([]),
        save: saveTask,
        saveTag: vi.fn().mockRejectedValue(new Error("已存在同名标签")),
      },
    } as unknown as ZhixuApi);

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /标题/ }), {
      target: { value: "保留任务草稿" },
    });
    const tagInput = within(dialog).getByRole("combobox", {
      name: "搜索或新建标签",
    });
    fireEvent.click(tagInput);
    fireEvent.change(tagInput, { target: { value: "重复标签" } });
    fireEvent.click(await screen.findByText("新建“重复标签”"));

    expect(await screen.findByText("已存在同名标签")).toBeTruthy();
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: /标题/,
        }) as HTMLInputElement
      ).value,
    ).toBe("保留任务草稿");
    expect(saveTask).not.toHaveBeenCalled();
  });
});
