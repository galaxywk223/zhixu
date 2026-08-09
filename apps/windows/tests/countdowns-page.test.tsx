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
import type { CountdownRecord, ZhixuApi } from "../src/preload/api-types";
import { CountdownsPage } from "../src/renderer/src/pages/CountdownsPage";
import { localDateKey } from "../src/shared/countdown";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("countdowns page", () => {
  it("renders upcoming and past dates and edits a selected countdown", async () => {
    const now = new Date();
    const future = new Date(now);
    future.setDate(future.getDate() + 12);
    const past = new Date(now);
    past.setDate(past.getDate() - 2);
    const records: CountdownRecord[] = [
      {
        id: "exam",
        title: "大学英语六级",
        targetDate: localDateKey(future),
        note: "打印准考证",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      {
        id: "registration",
        title: "报名截止",
        targetDate: localDateKey(past),
        note: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ];
    const save = vi.fn().mockResolvedValue("exam");
    const remove = vi.fn().mockResolvedValue(undefined);
    const api = {
      countdowns: {
        list: vi.fn().mockResolvedValue(records),
        save,
        remove,
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
          <CountdownsPage initialSelectedId="exam" />
        </FluentProvider>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "即将到来" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "已经过去" })).toBeTruthy();
    expect(screen.getByLabelText("还有 12 天")).toBeTruthy();
    expect(screen.getByLabelText("已过去 2 天")).toBeTruthy();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/^日期/)).toBeTruthy();
    expect(within(dialog).getByLabelText("备注")).toBeTruthy();
    expect(within(dialog).queryByLabelText("颜色")).toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/^标题/), {
      target: { value: "英语六级考试" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      id: "exam",
      title: "英语六级考试",
      targetDate: localDateKey(future),
      note: "打印准考证",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "删除报名截止",
        hidden: true,
      }),
    );
    await waitFor(() => expect(remove).toHaveBeenCalled());
    expect(remove.mock.calls[0]?.[0]).toBe("registration");
  });
});
