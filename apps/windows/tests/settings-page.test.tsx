import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FluentProvider } from "@fluentui/react-components";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, ZhixuApi } from "../src/preload/api-types";
import { SettingsPage } from "../src/renderer/src/pages/SettingsPage";
import { zhixuLightTheme } from "../src/renderer/src/theme";

afterEach(cleanup);

describe("settings page", () => {
  it("applies interface scale steps immediately", async () => {
    const settings: AppSettings = {
      themeMode: "light",
      uiScale: 100,
      closeToTray: true,
      startMinimized: false,
    };
    const setUiScale = vi.fn().mockResolvedValue(undefined);
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const api = {
      app: {
        bootstrap: vi.fn().mockResolvedValue({
          version: "0.2.0",
          migration: {
            status: "current",
            sourcePath: null,
            sourceHash: null,
            backupPath: null,
            fromVersion: 6,
            toVersion: 6,
            integrity: "ok",
            entityCounts: {},
          },
          settings,
        }),
      },
      settings: {
        get: vi.fn().mockResolvedValue(settings),
        set: saveSettings,
        setUiScale,
      },
      tasks: {
        tags: vi.fn().mockResolvedValue([]),
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
    fireEvent.click(screen.getByRole("button", { name: "深色" }));
    fireEvent.click(screen.getByRole("button", { name: "放大界面" }));
    await waitFor(() => expect(setUiScale).toHaveBeenCalledWith(110));
    expect(await screen.findByText("110%")).toBeTruthy();
    client.setQueryData(["settings"], { ...settings, uiScale: 125 });
    expect(await screen.findByText("125%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() => expect(saveSettings).toHaveBeenCalled());
    expect(saveSettings.mock.calls[0]?.[0]).toEqual({
      ...settings,
      themeMode: "dark",
      uiScale: 125,
    });
    expect(screen.getByRole("button", { name: "恢复默认缩放" })).toBeTruthy();
  });
});
