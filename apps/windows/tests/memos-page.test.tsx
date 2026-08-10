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
import type { ZhixuApi } from "../src/preload/api-types";
import { MemosPage } from "../src/renderer/src/pages/MemosPage";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("memos page", () => {
  it("renders legacy undated records and edits only memo fields", async () => {
    const save = vi.fn().mockResolvedValue("memo-1");
    const api = {
      memos: {
        list: vi.fn().mockResolvedValue([
          {
            id: "memo-1",
            title: "联系导师",
            descriptionMd: "整理邮件内容",
            priority: 3,
            categoryId: "study",
            tagIds: ["tag-1"],
            createdAt: new Date(2026, 7, 8).toISOString(),
            updatedAt: new Date(2026, 7, 9).toISOString(),
          },
        ]),
        save,
        remove: vi.fn(),
      },
      tasks: {
        categories: vi.fn().mockResolvedValue([
          {
            id: "study",
            name: "升学",
            colorHex: "#397BC6",
            source: "manual",
            isArchived: false,
          },
        ]),
        tags: vi.fn().mockResolvedValue([
          {
            id: "tag-1",
            name: "保研",
            colorHex: "#B7791F",
            isArchived: false,
          },
        ]),
      },
    } as unknown as ZhixuApi;
    Object.defineProperty(window, "zhixu", { configurable: true, value: api });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <FluentProvider theme={webLightTheme}>
          <MemosPage initialSelectedId="memo-1" />
        </FluentProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("联系导师")).toBeTruthy();
    for (const column of [
      "备忘",
      "分类",
      "优先级",
      "标签",
      "更新时间",
      "操作",
    ]) {
      expect(screen.getByRole("columnheader", { name: column })).toBeTruthy();
    }
    expect(screen.getByText("高", { selector: ".task-priority" })).toBeTruthy();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText("日期")).toBeNull();
    expect(within(dialog).queryByLabelText("状态")).toBeNull();
    fireEvent.change(within(dialog).getByRole("textbox", { name: /标题/ }), {
      target: { value: "联系目标导师" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]?.[0]).toEqual({
      id: "memo-1",
      title: "联系目标导师",
      descriptionMd: "整理邮件内容",
      priority: 3,
      categoryId: "study",
      tagIds: ["tag-1"],
    });
  });
});
