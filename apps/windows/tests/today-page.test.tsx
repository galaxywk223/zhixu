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
import { localDateKey } from "../src/shared/countdown";

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
      pending: 1,
      estimatedMinutes: 45,
      focusTodayMinutes: 35,
      focusWeekMinutes: 90,
      focusMonthMinutes: 180,
      focusByDay: [{ date: now.toISOString().slice(0, 10), minutes: 35 }],
    };
    const openNotes = vi.fn();
    const openCountdowns = vi.fn();
    const examDate = new Date(now);
    examDate.setDate(examDate.getDate() + 6);
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
      countdowns: {
        list: vi.fn().mockResolvedValue([
          {
            id: "exam-1",
            title: "英语六级考试",
            targetDate: localDateKey(examDate),
            note: null,
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
            onOpenCountdowns={openCountdowns}
          />
        </FluentProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("今日测试任务")).toBeTruthy();
    expect(document.querySelector(".task-row-today")).toBeTruthy();
    expect(
      document.querySelector(".task-row-today .task-today-due"),
    ).toBeTruthy();
    expect(document.querySelector(".task-row-today .task-meta")).toBeNull();
    expect(screen.getByText("35 分钟")).toBeTruthy();
    expect(screen.getByText("英语六级考试")).toBeTruthy();
    expect(screen.getByText("还有 6 天")).toBeTruthy();
    expect(document.querySelector(".today-countdown-strip")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^今天 \/ / })).toBeTruthy();
    expect(
      screen.queryByText("聚焦今天最重要的事，稳步推进当前计划。"),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /测试笔记/ }));
    expect(openNotes).toHaveBeenCalledWith("note-1");
    fireEvent.click(screen.getByRole("button", { name: /英语六级考试/ }));
    expect(openCountdowns).toHaveBeenCalledWith("exam-1");
  });
});
