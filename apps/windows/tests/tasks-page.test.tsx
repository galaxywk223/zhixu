import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskRecord, ZhixuApi } from "../src/preload/api-types";
import { TasksPage } from "../src/renderer/src/pages/TasksPage";
import { tagTone } from "../src/shared/tag-colors";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function task(id: string, overrides: Partial<TaskRecord> = {}): TaskRecord {
  const now = new Date();
  return {
    id,
    title: id,
    descriptionMd: null,
    status: "todo",
    priority: 2,
    dueAt: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      18,
    ).toISOString(),
    estimatedMinutes: 45,
    categoryId: "study",
    repeatRule: null,
    completedAt: null,
    isArchived: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    deletedAt: null,
    tagIds: ["blue"],
    ...overrides,
  };
}

describe("tasks page", () => {
  it("renders real metrics, dynamic views, grouped table columns, and task actions", async () => {
    const activeTask = task("线性代数复习", { priority: 3 });
    const doneTask = task("归档课堂笔记", {
      status: "done",
      completedAt: new Date().toISOString(),
      estimatedMinutes: 30,
    });
    const setStatus = vi.fn().mockResolvedValue(undefined);
    const onEdit = vi.fn();
    const api = {
      tasks: {
        list: vi.fn().mockResolvedValue([activeTask, doneTask]),
        categories: vi
          .fn()
          .mockResolvedValue([
            { id: "study", name: "课程学习", colorHex: "#2488ff" },
          ]),
        tags: vi
          .fn()
          .mockResolvedValue([
            { id: "blue", name: "学习", colorHex: "#2488ff" },
          ]),
        setStatus,
        remove: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as ZhixuApi;
    Object.defineProperty(window, "zhixu", {
      configurable: true,
      value: api,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <FluentProvider theme={webLightTheme}>
          <TasksPage onNew={() => undefined} onEdit={onEdit} />
        </FluentProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("线性代数复习")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "任务" })).toBeTruthy();
    expect(screen.queryByText("任务管理")).toBeNull();
    expect(screen.queryByText("集中查看、分类整理并推进本地任务。")).toBeNull();
    expect(screen.getByRole("heading", { name: "未完成" })).toBeTruthy();
    expect(screen.getAllByText("累计完成")).toHaveLength(2);
    expect(screen.getByText("剩余预计时间")).toBeTruthy();
    for (const column of [
      "任务",
      "日期",
      "分类",
      "优先级",
      "标签",
      "预计时长",
      "操作",
    ]) {
      expect(screen.getByRole("columnheader", { name: column })).toBeTruthy();
    }
    expect(screen.queryByRole("columnheader", { name: "状态" })).toBeNull();
    expect(
      screen.getByText("今天", { selector: ".task-table-group-label strong" }),
    ).toBeTruthy();
    expect(
      screen
        .getByText("高", { selector: ".task-priority" })
        .classList.contains("priority-3"),
    ).toBe(true);
    expect(
      screen
        .getByText("学习", { selector: ".workspace-task-tag" })
        .getAttribute("data-tag-tone"),
    ).toBe(tagTone("学习"));

    fireEvent.doubleClick(screen.getByText("线性代数复习"));
    expect(onEdit).toHaveBeenCalledWith(activeTask);

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "将线性代数复习标记为完成",
      }),
    );
    await waitFor(() =>
      expect(setStatus).toHaveBeenCalledWith("线性代数复习", "done"),
    );

    expect(
      screen.getByRole("button", { name: "删除线性代数复习" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("精确状态")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /全部任务/ }));
    expect(await screen.findByText("归档课堂笔记")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "全部任务" })).toBeTruthy();
    expect(
      screen.getByText("已完成", {
        selector: ".task-table-group-label strong",
      }),
    ).toBeTruthy();
  });

  it("treats legacy in-progress rows as unfinished without exposing status filters", async () => {
    const api = {
      tasks: {
        list: vi
          .fn()
          .mockResolvedValue([
            task("进行中任务", { status: "in_progress" }),
            task("待完成任务"),
          ]),
        categories: vi.fn().mockResolvedValue([]),
        tags: vi.fn().mockResolvedValue([]),
        setStatus: vi.fn(),
        remove: vi.fn(),
      },
    } as unknown as ZhixuApi;
    Object.defineProperty(window, "zhixu", {
      configurable: true,
      value: api,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <FluentProvider theme={webLightTheme}>
          <TasksPage onNew={() => undefined} onEdit={() => undefined} />
        </FluentProvider>
      </QueryClientProvider>,
    );

    await screen.findByText("进行中任务");
    fireEvent.click(screen.getByRole("button", { name: "筛选" }));
    expect(screen.queryByLabelText("精确状态")).toBeNull();
    expect(screen.getByText("待完成任务")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "未完成" })).toBeTruthy();
  });

  it("light-dismisses the filter popover without clearing selected filters", async () => {
    const api = {
      tasks: {
        list: vi.fn().mockResolvedValue([task("筛选测试")]),
        categories: vi.fn().mockResolvedValue([
          {
            id: "study",
            name: "课程学习",
            colorHex: "#397BC6",
            isArchived: false,
          },
        ]),
        tags: vi.fn().mockResolvedValue([]),
        setStatus: vi.fn(),
        remove: vi.fn(),
      },
    } as unknown as ZhixuApi;
    Object.defineProperty(window, "zhixu", { configurable: true, value: api });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <FluentProvider theme={webLightTheme}>
          <TasksPage onNew={() => undefined} onEdit={() => undefined} />
        </FluentProvider>
      </QueryClientProvider>,
    );

    await screen.findByText("筛选测试");
    fireEvent.click(screen.getByRole("button", { name: "筛选" }));
    const category = await screen.findByLabelText("分类");
    fireEvent.change(category, { target: { value: "study" } });
    expect((category as HTMLSelectElement).value).toBe("study");

    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);
    await waitFor(() => expect(screen.queryByLabelText("任务筛选")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /^筛选/ }));
    expect(
      ((await screen.findByLabelText("分类")) as HTMLSelectElement).value,
    ).toBe("study");
    fireEvent.keyDown(screen.getByLabelText("任务筛选"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("任务筛选")).toBeNull());
  });
});
