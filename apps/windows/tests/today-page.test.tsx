import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  DashboardSummary,
  TaskRecord,
  ZhixuApi,
} from "../src/preload/api-types";
import { TodayPage } from "../src/renderer/src/pages/TodayPage";
import { localDateKey } from "../src/shared/countdown";

describe("today page", () => {
  it("renders task, focus, memo, and countdown data", async () => {
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
    const futureTask: TaskRecord = {
      ...task,
      id: "future-task",
      title: "明日测试任务",
      dueAt: new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        18,
      ).toISOString(),
    };
    const openMemos = vi.fn();
    const openCountdowns = vi.fn();
    const quoteRecord = {
      id: "quote-1",
      text: "把今天走稳，远方自然会近。",
      localDate: localDateKey(now),
      reaction: "none" as const,
      sourceKind: "ai" as const,
      sourceId: null,
      generationVersion: 3,
      generatedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const setFavorite = vi.fn().mockImplementation(async (input) => ({
      ...quoteRecord,
      reaction: input.favorite ? "favorite" : "none",
    }));
    const addFavorite = vi.fn().mockResolvedValue({
      ...quoteRecord,
      id: "manual-1",
      sourceKind: "manual",
      reaction: "favorite",
    });
    const refreshQuote = vi.fn().mockResolvedValue(quoteRecord);
    const examDate = new Date(now);
    examDate.setDate(examDate.getDate() + 6);
    const api = {
      tasks: {
        list: vi.fn().mockResolvedValue([task, futureTask]),
        categories: vi.fn().mockResolvedValue([]),
        tags: vi.fn().mockResolvedValue([]),
        setStatus: vi.fn(),
        remove: vi.fn(),
      },
      memos: {
        list: vi.fn().mockResolvedValue([
          {
            id: "memo-low",
            title: "低优先级备忘",
            descriptionMd: null,
            priority: 1,
            categoryId: null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            tagIds: [],
          },
          {
            id: "memo-high",
            title: "高优先级备忘",
            descriptionMd: null,
            priority: 3,
            categoryId: null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            tagIds: [],
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
      quotes: {
        today: vi.fn().mockResolvedValue(quoteRecord),
        dislike: vi.fn().mockResolvedValue({
          ...quoteRecord,
          id: "quote-2",
          text: "耐心不是停留，而是清醒地前行。",
        }),
        setFavorite,
        favorites: vi.fn().mockResolvedValue([]),
        addFavorite,
        removeFavorite: vi.fn(),
        useFavoriteToday: vi.fn(),
        refresh: refreshQuote,
        retry: vi.fn(),
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
            onDelete={() => undefined}
            onSearch={() => undefined}
            onOpenMemos={openMemos}
            onOpenCountdowns={openCountdowns}
          />
        </FluentProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("今日测试任务")).toBeTruthy();
    expect(screen.getByText("把今天走稳，远方自然会近。")).toBeTruthy();
    expect(document.querySelector(".daily-quote-band h2")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "喜欢并收藏" }));
    await waitFor(() =>
      expect(setFavorite.mock.calls[0]?.[0]).toEqual({
        id: "quote-1",
        favorite: true,
      }),
    );
    refreshQuote.mockRejectedValueOnce(
      new Error(
        "AI 服务暂时不可用，请稍后重试。 请求编号：00000000-0000-4000-8000-000000000001",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "换一条" }));
    expect(
      await screen.findByText(/请求编号：00000000-0000-4000-8000-000000000001/),
    ).toBeTruthy();
    expect(screen.getByText("把今天走稳，远方自然会近。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "查看收藏" }));
    expect(await screen.findByText("格言收藏")).toBeTruthy();
    const manualQuoteInput = await screen.findByPlaceholderText("输入格言正文");
    const manualQuoteForm = manualQuoteInput.closest("form");
    expect(manualQuoteForm).toBeTruthy();
    fireEvent.change(manualQuoteInput, {
      target: { value: "保持清醒，持续行动。" },
    });
    fireEvent.submit(manualQuoteForm!);
    await waitFor(() =>
      expect(addFavorite).toHaveBeenCalledWith({
        text: "保持清醒，持续行动。",
      }),
    );
    expect(await screen.findByText("暂无收藏")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.querySelector(".task-row-today")).toBeTruthy();
    expect(
      document.querySelector(".task-row-today .task-today-due"),
    ).toBeTruthy();
    expect(document.querySelector(".task-row-today .task-meta")).toBeNull();
    expect(screen.getByText("35 分钟")).toBeTruthy();
    expect(screen.getByText("高优先级备忘")).toBeTruthy();
    expect(screen.queryByText("今日重点建议")).toBeNull();
    expect(
      document.querySelector(".upcoming-item .upcoming-title"),
    ).toBeTruthy();
    expect(document.querySelector(".upcoming-item small")).toBeNull();
    expect(screen.getByText("英语六级考试")).toBeTruthy();
    expect(screen.getByText("还有 6 天")).toBeTruthy();
    expect(document.querySelector(".today-countdown-strip")).toBeTruthy();
    const countdownPanel = document.querySelector(".today-countdown-strip");
    expect(countdownPanel?.nextElementSibling).toBeNull();
    expect(document.querySelector(".recent-notes-panel")).toBeNull();
    expect(screen.getByRole("heading", { name: /^今天 \/ / })).toBeTruthy();
    expect(
      screen.queryByText("聚焦今天最重要的事，稳步推进当前计划。"),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /高优先级备忘/ }));
    expect(openMemos).toHaveBeenCalledWith("memo-high");
    fireEvent.click(screen.getByRole("button", { name: /英语六级考试/ }));
    expect(openCountdowns).toHaveBeenCalledWith("exam-1");
  });
});
