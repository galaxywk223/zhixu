import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  DashboardSummary,
  TaskRecord,
  ZhixuApi,
} from "../src/preload/api-types";
import { TodayPage } from "../src/renderer/src/pages/TodayPage";

describe("today page", () => {
  it("renders task, focus, and recent-note data and opens a selected note", async () => {
    const now = new Date();
    const task: TaskRecord = {
      id: "today-task",
      title: "今日测试任务",
      descriptionMd: null,
      status: "todo",
      priority: 3,
      dueAt: new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        18,
      ).toISOString(),
      estimatedMinutes: 45,
      categoryId: null,
      repeatRule: null,
      completedAt: null,
      isArchived: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      deletedAt: null,
      tagIds: [],
    };
    const summary: DashboardSummary = {
      taskTotal: 1,
      dueToday: 1,
      overdue: 0,
      completed: 0,
      inProgress: 0,
      estimatedMinutes: 45,
      focusTodayMinutes: 35,
      focusWeekMinutes: 90,
      focusMonthMinutes: 180,
      focusByDay: [{ date: now.toISOString().slice(0, 10), minutes: 35 }],
    };
    const openNotes = vi.fn();
    const api = {
      tasks: {
        list: vi.fn().mockResolvedValue([task]),
        categories: vi.fn().mockResolvedValue([]),
        tags: vi.fn().mockResolvedValue([]),
        setStatus: vi.fn(),
        remove: vi.fn(),
      },
      notes: {
        list: vi.fn().mockResolvedValue([
          {
            id: "note-1",
            title: "测试笔记",
            contentMd: "最近整理的内容",
            isPinned: false,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ]),
      },
      dashboard: { summary: vi.fn().mockResolvedValue(summary) },
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
          <TodayPage
            onNew={() => undefined}
            onEdit={() => undefined}
            onSearch={() => undefined}
            onOpenNotes={openNotes}
          />
        </FluentProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("今日测试任务")).toBeTruthy();
    expect(screen.getByText("35 分钟")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /测试笔记/ }));
    expect(openNotes).toHaveBeenCalledWith("note-1");
  });
});
