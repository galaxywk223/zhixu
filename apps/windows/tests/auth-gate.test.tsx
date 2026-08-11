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
import type { SyncState, ZhixuApi } from "../src/preload/api-types";
import { AuthGate } from "../src/renderer/src/components/AuthGate";
import { zhixuLightTheme } from "../src/renderer/src/theme";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function state(patch: Partial<SyncState> = {}): SyncState {
  return {
    status: "signed_out",
    configured: true,
    canUseApp: false,
    email: null,
    boundEmail: null,
    lastSyncedAt: null,
    pendingCount: 0,
    message: null,
    ...patch,
  };
}

function renderGate(value: SyncState) {
  const signIn = vi.fn().mockResolvedValue(undefined);
  const signUp = vi.fn().mockResolvedValue(undefined);
  const resendVerification = vi.fn().mockResolvedValue(undefined);
  const requestPasswordReset = vi.fn().mockResolvedValue(undefined);
  const completePasswordReset = vi.fn().mockResolvedValue(undefined);
  const run = vi.fn().mockResolvedValue(value);
  const signOut = vi.fn().mockResolvedValue(undefined);
  const api = {
    account: {
      signIn,
      signUp,
      resendVerification,
      requestPasswordReset,
      completePasswordReset,
      signOut,
    },
    sync: { run },
  } as unknown as ZhixuApi;
  Object.defineProperty(window, "zhixu", { configurable: true, value: api });
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <FluentProvider theme={zhixuLightTheme}>
        <AuthGate state={value} onRefresh={vi.fn()} />
      </FluentProvider>
    </QueryClientProvider>,
  );
  return {
    signIn,
    signUp,
    resendVerification,
    requestPasswordReset,
    completePasswordReset,
    run,
    signOut,
  };
}

describe("account access gate", () => {
  it("blocks the workspace and validates registration credentials", async () => {
    const { signUp } = renderGate(state());
    expect(
      await screen.findByRole("heading", { name: "登录知序" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "注册账号" }));
    fireEvent.change(screen.getByLabelText(/邮箱/), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^密码/), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText(/确认密码/), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "password123",
      }),
    );
  });

  it("shows verification and first-binding recovery states", async () => {
    const resend = renderGate(
      state({
        status: "verification_required",
        email: "user@example.com",
        message: "请验证邮箱",
      }),
    );
    expect(await screen.findByText("验证邮箱")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重新发送验证邮件" }));
    await waitFor(() =>
      expect(resend.resendVerification).toHaveBeenCalledWith(
        "user@example.com",
      ),
    );
  });

  it("keeps first binding behind a blocking progress state", async () => {
    renderGate(
      state({
        status: "binding",
        email: "user@example.com",
        message: "正在安全合并本地与云端数据。",
      }),
    );
    expect(await screen.findByText("正在合并数据")).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "登录" })).toBeNull();
  });

  it("blocks unconfigured builds and completes password recovery in place", async () => {
    const unconfigured = renderGate(
      state({
        status: "unconfigured",
        configured: false,
        message: "Supabase 尚未配置",
      }),
    );
    expect(await screen.findByText("账号服务未配置")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "登录" })).toBeNull();
    expect(unconfigured.signIn).not.toHaveBeenCalled();
    cleanup();

    const recovery = renderGate(
      state({
        status: "password_recovery",
        email: "user@example.com",
      }),
    );
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(passwordInputs[0]!, {
      target: { value: "new-password" },
    });
    fireEvent.change(passwordInputs[1]!, {
      target: { value: "new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "更新密码" }));
    await waitFor(() =>
      expect(recovery.completePasswordReset).toHaveBeenCalledWith(
        "new-password",
      ),
    );
  });

  it("offers retry and sign out when initial merge fails", async () => {
    const controls = renderGate(
      state({
        status: "error",
        email: "user@example.com",
        boundEmail: "user@example.com",
        message: "网络不可用",
      }),
    );
    expect(await screen.findByText("首次同步未完成")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(controls.run).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    await waitFor(() => expect(controls.signOut).toHaveBeenCalled());
  });
});
