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
import type { AppSettings, ZhixuApi } from "../src/preload/api-types";
import { SettingsPage } from "../src/renderer/src/pages/SettingsPage";
import { zhixuLightTheme } from "../src/renderer/src/theme";
import { tagTone } from "../src/shared/tag-colors";

afterEach(cleanup);

describe("settings page", () => {
  it("applies interface scale steps immediately", async () => {
    const settings: AppSettings = {
      themeMode: "light",
      uiScale: 100,
      closeToTray: true,
      startMinimized: false,
    };
    const updateSettings = vi.fn(async (patch: Partial<AppSettings>) => {
      Object.assign(settings, patch);
    });
    const saveTag = vi.fn().mockResolvedValue("tag-algorithm");
    const api = {
      app: {
        bootstrap: vi.fn().mockResolvedValue({
          version: "0.2.0",
          migration: {
            status: "current",
            sourcePath: null,
            sourceHash: null,
            backupPath: null,
            fromVersion: 7,
            toVersion: 7,
            integrity: "ok",
            entityCounts: {},
          },
          settings,
        }),
      },
      settings: {
        get: vi.fn().mockResolvedValue(settings),
        update: updateSettings,
      },
      tasks: {
        tags: vi.fn().mockResolvedValue([
          {
            id: "tag-study",
            name: "学习",
            colorHex: "#FF00FF",
            isArchived: false,
          },
        ]),
        saveTag,
      },
      sync: {
        getState: vi
          .fn()
          .mockResolvedValue({ status: "deferred", message: "本地模式" }),
      },
      updates: {
        getState: vi.fn().mockResolvedValue({ status: "idle" }),
        check: vi.fn(),
        download: vi.fn(),
        install: vi.fn(),
        onState: vi.fn().mockReturnValue(() => undefined),
      },
      backup: {
        export: vi.fn(),
        restore: vi.fn(),
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
        <FluentProvider theme={zhixuLightTheme}>
          <SettingsPage />
        </FluentProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("100%")).toBeTruthy();
    expect(
      document
        .querySelector(".tag-settings [data-tag-tone]")
        ?.getAttribute("data-tag-tone"),
    ).toBe(tagTone("学习"));
    fireEvent.click(screen.getByRole("button", { name: "深色" }));
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({ themeMode: "dark" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "放大界面" }));
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({ uiScale: 110 }),
    );
    expect(await screen.findByText("110%")).toBeTruthy();
    client.setQueryData(["settings"], { ...settings, uiScale: 125 });
    expect(await screen.findByText("125%")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "保存设置" })).toBeNull();
    expect(screen.getByRole("button", { name: "恢复默认缩放" })).toBeTruthy();

    updateSettings.mockRejectedValueOnce(new Error("设置写入失败"));
    const startMinimized = screen.getAllByRole("switch")[1]!;
    fireEvent.click(startMinimized);
    expect(await screen.findByText("设置写入失败")).toBeTruthy();
    await waitFor(() =>
      expect((startMinimized as HTMLInputElement).checked).toBe(false),
    );

    fireEvent.click(screen.getByRole("button", { name: "新建标签" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText("颜色")).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("名称"), {
      target: { value: "算法" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(saveTag).toHaveBeenCalled());
    expect(saveTag.mock.calls[0]?.[0]).toEqual({ name: "算法" });
  });
});
