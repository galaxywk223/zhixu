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
import type {
  AppSettings,
  TagRecord,
  UpdateState,
  ZhixuApi,
} from "../src/preload/api-types";
import { SettingsPage } from "../src/renderer/src/pages/SettingsPage";
import { zhixuLightTheme } from "../src/renderer/src/theme";
import { tagTone } from "../src/shared/tag-colors";

afterEach(cleanup);

const defaultTags: TagRecord[] = [
  {
    id: "tag-study",
    name: "学习",
    colorHex: "#FF00FF",
    isArchived: false,
  },
];

const idleUpdate: UpdateState = {
  status: "idle",
  version: null,
  progress: 0,
  message: null,
};

function renderSettings(options?: {
  tags?: TagRecord[];
  update?: UpdateState;
}): {
  settings: AppSettings;
  updateSettings: ReturnType<typeof vi.fn>;
  saveTag: ReturnType<typeof vi.fn>;
  removeTag: ReturnType<typeof vi.fn>;
  client: QueryClient;
  signOut: ReturnType<typeof vi.fn>;
  runSync: ReturnType<typeof vi.fn>;
} {
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
  const removeTag = vi.fn().mockResolvedValue(undefined);
  const signOut = vi.fn().mockResolvedValue(undefined);
  const runSync = vi.fn().mockResolvedValue({
    status: "idle",
    configured: true,
    canUseApp: true,
    email: "user@example.com",
    boundEmail: "user@example.com",
    lastSyncedAt: "2026-08-10T04:00:00.000Z",
    pendingCount: 0,
    message: "同步完成",
  });
  const api = {
    app: {
      bootstrap: vi.fn().mockResolvedValue({
        version: "0.2.0",
        migration: {
          status: "current",
          sourcePath:
            "C:\\Users\\example\\a-very-long-source-path\\zhixu.sqlite",
          sourceHash: null,
          backupPath: null,
          fromVersion: 7,
          toVersion: 12,
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
      tags: vi.fn().mockResolvedValue(options?.tags ?? defaultTags),
      saveTag,
      removeTag,
    },
    account: {
      signUp: vi.fn().mockResolvedValue(undefined),
      signIn: vi.fn().mockResolvedValue(undefined),
      resendVerification: vi.fn().mockResolvedValue(undefined),
      requestPasswordReset: vi.fn().mockResolvedValue(undefined),
      completePasswordReset: vi.fn().mockResolvedValue(undefined),
      signOut,
    },
    sync: {
      getState: vi.fn().mockResolvedValue({
        status: "idle",
        configured: true,
        canUseApp: true,
        email: "user@example.com",
        boundEmail: "user@example.com",
        lastSyncedAt: "2026-08-10T04:00:00.000Z",
        pendingCount: 0,
        message: "本地与云端数据已同步。",
      }),
      run: runSync,
      onState: vi.fn().mockReturnValue(() => undefined),
    },
    updates: {
      getState: vi.fn().mockResolvedValue(options?.update ?? idleUpdate),
      check: vi.fn().mockResolvedValue(idleUpdate),
      download: vi.fn().mockResolvedValue(undefined),
      install: vi.fn().mockResolvedValue(undefined),
      onState: vi.fn().mockReturnValue(() => undefined),
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

  return {
    settings,
    updateSettings,
    saveTag,
    removeTag,
    client,
    signOut,
    runSync,
  };
}

describe("settings page", () => {
  it("renders one active section and applies settings immediately", async () => {
    const { settings, updateSettings, saveTag, removeTag, client } =
      renderSettings();

    expect(await screen.findByText("100%")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "主题外观" }),
    ).toBeTruthy();
    expect(screen.getByText("主题模式")).toBeTruthy();
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
    fireEvent.click(screen.getByRole("switch", { name: "启动后保持最小化" }));
    expect(await screen.findByText("设置写入失败")).toBeTruthy();
    await waitFor(() =>
      expect(
        (
          screen.getByRole("switch", {
            name: "启动后保持最小化",
          }) as HTMLInputElement
        ).checked,
      ).toBe(false),
    );

    fireEvent.click(screen.getByRole("button", { name: "标签管理" }));
    expect(
      screen
        .getByRole("button", { name: "标签管理" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("heading", { level: 2, name: "标签管理" }),
    ).toBeTruthy();
    expect(screen.queryByText("界面缩放")).toBeNull();
    expect(await screen.findByText("学习")).toBeTruthy();
    expect(
      document
        .querySelector(".tag-settings [data-tag-tone]")
        ?.getAttribute("data-tag-tone"),
    ).toBe(tagTone("学习"));

    fireEvent.click(screen.getByRole("button", { name: "新建标签" }));
    const tagDialog = screen.getByRole("dialog");
    expect(within(tagDialog).queryByLabelText("颜色")).toBeNull();
    fireEvent.change(within(tagDialog).getByLabelText("名称"), {
      target: { value: "算法" },
    });
    fireEvent.click(within(tagDialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(saveTag).toHaveBeenCalled());
    expect(saveTag.mock.calls[0]?.[0]).toEqual({ name: "算法" });

    fireEvent.click(
      await screen.findByRole("button", { name: "删除标签 学习" }),
    );
    const removeDialog = screen.getByRole("dialog");
    expect(within(removeDialog).getByText(/任务不会被删除/)).toBeTruthy();
    fireEvent.click(
      within(removeDialog).getByRole("button", { name: "删除标签" }),
    );
    await waitFor(() => expect(removeTag).toHaveBeenCalled());
    expect(removeTag.mock.calls[0]?.[0]).toBe("tag-study");

    for (const section of ["账户", "关于与更新"]) {
      fireEvent.click(screen.getByRole("button", { name: section }));
      expect(
        screen.getByRole("heading", { level: 2, name: section }),
      ).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: "数据与备份" })).toBeNull();
    expect(screen.queryByRole("button", { name: "数据库迁移" })).toBeNull();
    expect(
      screen
        .getByRole("navigation", { name: "设置分类" })
        .querySelectorAll("button"),
    ).toHaveLength(4);
    expect(screen.getByText("0.2.0")).toBeTruthy();
  });

  it("shows stable empty and update progress states", async () => {
    renderSettings({
      tags: [],
      update: {
        status: "downloading",
        version: "0.3.0",
        progress: 42,
        message: "正在下载 0.3.0",
      },
    });

    expect(await screen.findByText("100%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "标签管理" }));
    expect(await screen.findByText("暂无标签")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关于与更新" }));
    expect(await screen.findByText("42%")).toBeTruthy();
    expect(
      screen
        .getByRole("progressbar", { name: "更新下载进度" })
        .getAttribute("value"),
    ).toBe("42");
    expect(screen.getByText("下载中")).toBeTruthy();
  });

  it("shows the bound account and keeps synchronization controls", async () => {
    const { signOut, runSync } = renderSettings();
    expect(await screen.findByText("100%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "账户" }));
    expect(await screen.findByText("user@example.com")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "立即同步" }));
    await waitFor(() => expect(runSync).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "退出" }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });
});
