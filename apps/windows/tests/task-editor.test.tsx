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
import type { TagRecord, ZhixuApi } from "../src/preload/api-types";
import { TaskEditor } from "../src/renderer/src/components/TaskEditor";
import { zhixuLightTheme } from "../src/renderer/src/theme";

afterEach(cleanup);

function renderEditor(api: ZhixuApi): void {
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
        <TaskEditor open task={null} onClose={() => undefined} />
      </FluentProvider>
    </QueryClientProvider>,
  );
}

describe("task editor tags", () => {
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
    expect(saveTask.mock.calls[0]?.[0].tagIds).toEqual([
      "tag-algorithm",
      "tag-baoyan",
    ]);
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
