import { join } from "node:path";
import { net, type BrowserWindow } from "electron";
import {
  createClient,
  FunctionsHttpError,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import type { SyncState } from "../../preload/api-types";
import type { BackupService } from "./backup";
import { canUseBoundWorkspace } from "../../shared/account-access";
import { EncryptedSessionStorage } from "./secure-storage";
import type { QuoteGenerationInput } from "./daily-quotes";
import {
  SyncRepository,
  type PendingOperation,
  type RemoteChange,
  type RemoteSnapshot,
} from "./sync-repository";

interface SyncServiceOptions {
  url: string;
  anonKey: string;
  repository: SyncRepository;
  backup: BackupService;
  storage: EncryptedSessionStorage;
  userDataPath: string;
  automaticSync?: boolean;
  getWindow(): BrowserWindow | null;
  notifyDataChanged(): void;
}

interface PushResult {
  operation_id: string;
  applied_revision: number | null;
  applied: boolean;
  conflict: boolean;
  conflict_id: string | null;
  remote_revision: number | null;
  remote_payload: Record<string, unknown> | null;
}

const callbackUrl = "zhixu://auth/callback";

function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (value && typeof value === "object" && "message" in value)
    return String(value.message);
  return String(value);
}

type DailyQuoteFailureReason =
  | "upstream_auth"
  | "upstream_quota"
  | "upstream_timeout"
  | "upstream_5xx"
  | "invalid_output"
  | "duplicate"
  | "semantic_overlap";

interface DailyQuoteFailurePayload {
  error?: unknown;
  reason?: unknown;
  requestId?: unknown;
}

function dailyQuoteFailureMessage(
  reason: DailyQuoteFailureReason | null,
  requestId: string | null,
): string {
  const message =
    reason === "upstream_auth"
      ? "AI 服务认证配置异常，请联系维护者。"
      : reason === "upstream_quota"
        ? "AI 服务额度不足，请联系维护者。"
        : reason === "invalid_output" ||
            reason === "duplicate" ||
            reason === "semantic_overlap"
          ? "AI 未生成有效的新格言，请重试。"
          : "AI 服务暂时不可用，请稍后重试。";
  return requestId ? `${message} 请求编号：${requestId}` : message;
}

async function dailyQuoteInvocationError(error: unknown): Promise<Error> {
  if (!(error instanceof FunctionsHttpError))
    return new Error("AI 服务暂时不可用，请稍后重试。");
  try {
    const payload = (await error.context.json()) as DailyQuoteFailurePayload;
    const reasons: DailyQuoteFailureReason[] = [
      "upstream_auth",
      "upstream_quota",
      "upstream_timeout",
      "upstream_5xx",
      "invalid_output",
      "duplicate",
      "semantic_overlap",
    ];
    const reason = reasons.includes(payload.reason as DailyQuoteFailureReason)
      ? (payload.reason as DailyQuoteFailureReason)
      : null;
    const requestId =
      typeof payload.requestId === "string" &&
      /^[0-9a-f-]{36}$/i.test(payload.requestId)
        ? payload.requestId
        : null;
    return new Error(dailyQuoteFailureMessage(reason, requestId));
  } catch {
    return new Error("AI 服务暂时不可用，请稍后重试。");
  }
}

export class SyncService {
  private readonly client: SupabaseClient | null;
  private state: SyncState;
  private user: User | null = null;
  private pendingEmail: string | null = null;
  private runPromise: Promise<SyncState> | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private periodicTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryIndex = 0;
  private recoveryFlow = false;

  constructor(private readonly options: SyncServiceOptions) {
    const configured = Boolean(options.url && options.anonKey);
    this.client = configured
      ? createClient(options.url, options.anonKey, {
          auth: {
            storage: options.storage,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            flowType: "pkce",
          },
        })
      : null;
    this.state = {
      status: configured ? "signed_out" : "unconfigured",
      configured,
      canUseApp: false,
      email: null,
      boundEmail: options.repository.getBinding()?.email ?? null,
      lastSyncedAt: options.repository.getBinding()?.lastSyncedAt ?? null,
      pendingCount: options.repository.pendingCount(),
      message: configured
        ? "登录后可在设备之间同步数据。"
        : "未配置 Supabase，当前继续使用本地数据。",
    };
  }

  async initialize(): Promise<void> {
    if (!this.client) return;
    this.client.auth.onAuthStateChange((event, session) => {
      queueMicrotask(() => void this.handleAuthChange(event, session));
    });
    const { data, error } = await this.client.auth.getSession();
    if (error) {
      this.setError(error);
      return;
    }
    if (data.session) await this.establishSession(data.session.user);
    if (this.options.automaticSync !== false)
      this.periodicTimer = setInterval(() => {
        if (this.user && net.isOnline()) this.runInBackground("periodic");
        else if (this.user && this.state.status === "offline" && net.isOnline())
          this.runInBackground("online");
      }, 60_000);
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.periodicTimer) clearInterval(this.periodicTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  getState(): SyncState {
    const binding = this.options.repository.getBinding();
    return {
      ...this.state,
      canUseApp: canUseBoundWorkspace(this.user?.id ?? null, binding),
      boundEmail: binding?.email ?? null,
      lastSyncedAt: binding?.lastSyncedAt ?? null,
      pendingCount: this.options.repository.pendingCount(),
    };
  }

  async generateDailyQuote(input: QuoteGenerationInput): Promise<string> {
    const client = this.requireClient();
    if (!this.user) throw new Error("请先登录后生成每日格言");
    if (!net.isOnline()) throw new Error("当前离线，联网后可生成每日格言");
    const { data, error } = await client.functions.invoke("daily-quote", {
      body: input,
    });
    if (error) throw await dailyQuoteInvocationError(error);
    if (!data || typeof data.text !== "string")
      throw new Error("每日格言响应无效，请稍后重试");
    return data.text;
  }

  requestSync(delay = 750): void {
    if (this.options.automaticSync === false || !this.user || !this.client)
      return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(
      () => this.runInBackground("local-change"),
      delay,
    );
  }

  async signUp(input: { email: string; password: string }): Promise<void> {
    const client = this.requireClient();
    const email = normalizeEmail(input.email);
    this.validatePassword(input.password);
    const { data, error } = await client.auth.signUp({
      email,
      password: input.password,
      options: { emailRedirectTo: `${callbackUrl}?flow=signup` },
    });
    if (error) throw new Error(error.message);
    if (data.session) await this.establishSession(data.session.user);
    else {
      this.pendingEmail = email;
      this.updateState({
        status: "verification_required",
        email,
        message: "验证邮件已发送，请在当前设备完成邮箱验证。",
      });
    }
  }

  async signIn(input: { email: string; password: string }): Promise<void> {
    const client = this.requireClient();
    const email = normalizeEmail(input.email);
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: input.password,
    });
    if (error) {
      if (error.message.toLocaleLowerCase().includes("email not confirmed")) {
        this.pendingEmail = email;
        this.updateState({
          status: "verification_required",
          email,
          message: "邮箱尚未验证，请先完成验证。",
        });
      }
      throw new Error(error.message);
    }
    await this.establishSession(data.user);
  }

  async resendVerification(email: string): Promise<void> {
    const client = this.requireClient();
    const normalized = normalizeEmail(email || this.pendingEmail || "");
    if (!normalized) throw new Error("请输入邮箱地址");
    const { error } = await client.auth.resend({
      type: "signup",
      email: normalized,
      options: { emailRedirectTo: `${callbackUrl}?flow=signup` },
    });
    if (error) throw new Error(error.message);
    this.pendingEmail = normalized;
    this.updateState({
      status: "verification_required",
      email: normalized,
      message: "验证邮件已重新发送。",
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    const client = this.requireClient();
    const normalized = normalizeEmail(email);
    if (!normalized) throw new Error("请输入邮箱地址");
    const { error } = await client.auth.resetPasswordForEmail(normalized, {
      redirectTo: `${callbackUrl}?flow=recovery`,
    });
    if (error) throw new Error(error.message);
    this.updateState({
      status: "signed_out",
      email: normalized,
      message: "重置邮件已发送，请在当前设备打开邮件链接。",
    });
  }

  async handleAuthCallback(url: string): Promise<void> {
    const client = this.requireClient();
    const parsed = new URL(url);
    const code = parsed.searchParams.get("code");
    if (!code) throw new Error("登录回调缺少授权码");
    this.recoveryFlow = parsed.searchParams.get("flow") === "recovery";
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw new Error(error.message);
    if (!data.session) throw new Error("登录回调未返回会话");
    if (this.recoveryFlow) {
      this.user = data.session.user;
      this.updateState({
        status: "password_recovery",
        email: data.session.user.email ?? null,
        message: "请输入新密码完成重置。",
      });
    } else await this.establishSession(data.session.user);
  }

  async completePasswordReset(password: string): Promise<void> {
    const client = this.requireClient();
    this.validatePassword(password);
    if (!this.recoveryFlow || !this.user)
      throw new Error("当前没有待完成的密码重置");
    const { error } = await client.auth.updateUser({ password });
    if (error) throw new Error(error.message);
    this.recoveryFlow = false;
    await this.establishSession(this.user);
  }

  async signOut(): Promise<void> {
    const client = this.requireClient();
    if (this.runPromise) await this.runPromise.catch(() => undefined);
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw new Error(error.message);
    this.options.storage.clear();
    this.user = null;
    this.pendingEmail = null;
    this.updateState({
      status: "signed_out",
      email: null,
      message: "已退出登录，本地数据已保留。",
    });
  }

  async run(_reason = "manual"): Promise<SyncState> {
    if (this.options.automaticSync === false) return this.getState();
    if (this.runPromise) return this.runPromise;
    this.runPromise = this.performSync().finally(() => {
      this.runPromise = null;
    });
    return this.runPromise;
  }

  private async performSync(): Promise<SyncState> {
    const client = this.requireClient();
    if (!this.user) throw new Error("请先登录账号");
    if (!net.isOnline()) {
      this.updateState({
        status: "offline",
        message: "当前离线，修改将在联网后同步。",
      });
      return this.getState();
    }
    try {
      const binding = this.options.repository.getBinding();
      if (binding && binding.userId !== this.user.id)
        throw new Error(`当前数据库已绑定 ${binding.email}，不能直接切换账号`);
      if (!binding || binding.state === "initializing") {
        this.updateState({
          status: "binding",
          message: "正在安全合并本地与云端数据。",
        });
        if (!binding) {
          await this.options.backup.createAutomaticBackup(
            join(this.options.userDataPath, "SyncBackups"),
          );
          this.options.repository.beginBinding(
            this.user.id,
            this.user.email ?? "",
          );
        }
        const { data, error } = await client.rpc("sync_snapshot");
        if (error) throw new Error(error.message);
        this.options.repository.mergeInitialSnapshot(data as RemoteSnapshot);
      }
      this.updateState({ status: "syncing", message: "正在同步数据。" });
      await this.pushPending(client);
      const latest = await this.pullChanges(client);
      const currentBinding = this.options.repository.getBinding();
      if (currentBinding?.state === "initializing")
        this.options.repository.completeBinding(latest);
      else this.options.repository.markSynced(latest);
      this.retryIndex = 0;
      this.options.notifyDataChanged();
      this.updateState({
        status: "idle",
        email: this.user.email ?? null,
        message: "本地与云端数据已同步。",
      });
      return this.getState();
    } catch (error) {
      this.scheduleRetry();
      this.setError(error);
      throw error;
    }
  }

  private async pushPending(client: SupabaseClient): Promise<void> {
    for (;;) {
      const operations = this.options.repository.listPending(100);
      if (!operations.length) return;
      const payload = operations.map((item) => ({
        operation_id: item.operationId,
        entity_type: item.entityType,
        entity_id: item.entityId,
        operation: item.operation,
        base_revision: item.baseRevision,
        payload: item.payload,
      }));
      const { data, error } = await client.rpc("push_operations", {
        operations: payload,
      });
      if (error) {
        for (const operation of operations)
          this.options.repository.markFailed(
            operation.operationId,
            error.message,
          );
        throw new Error(error.message);
      }
      const results = (data ?? []) as PushResult[];
      const byId = new Map(results.map((item) => [item.operation_id, item]));
      for (const operation of operations) {
        const result = byId.get(operation.operationId);
        if (!result) throw new Error("云端未返回完整的同步确认");
        if (result.conflict)
          throw new Error("云端返回了当前客户端不支持的同步冲突");
        if (!result.applied && result.remote_payload) {
          this.options.repository.applyChanges([
            {
              revision: Number(result.remote_revision ?? 0),
              entity_type: operation.entityType,
              entity_id: operation.entityId,
              operation: operation.operation,
              payload: result.remote_payload,
            },
          ]);
          continue;
        }
        this.options.repository.acknowledge(
          operation,
          Number(result.applied_revision ?? operation.baseRevision),
        );
      }
    }
  }

  private async pullChanges(client: SupabaseClient): Promise<number> {
    let cursor = this.options.repository.cursor();
    for (;;) {
      const { data, error } = await client.rpc("pull_changes", {
        after_revision: cursor,
        page_size: 500,
      });
      if (error) throw new Error(error.message);
      const changes = (data ?? []) as RemoteChange[];
      if (!changes.length) return cursor;
      cursor = this.options.repository.applyChanges(changes);
      if (changes.length < 500) return cursor;
    }
  }

  private async establishSession(user: User): Promise<void> {
    const binding = this.options.repository.getBinding();
    if (binding && binding.userId !== user.id) {
      await this.client?.auth.signOut({ scope: "local" });
      this.options.storage.clear();
      this.user = null;
      this.updateState({
        status: "error",
        email: null,
        message: `当前数据库已绑定 ${binding.email}，不能直接切换账号。`,
      });
      throw new Error(`当前数据库已绑定 ${binding.email}，不能直接切换账号`);
    }
    this.user = user;
    this.pendingEmail = null;
    const bindingComplete = binding?.state === "bound";
    this.updateState({
      status: bindingComplete ? "idle" : "binding",
      email: user.email ?? null,
      message: bindingComplete ? "账号已登录。" : "正在准备首次同步。",
    });
    if (this.options.automaticSync !== false) this.runInBackground("login");
  }

  private async handleAuthChange(
    event: AuthChangeEvent,
    session: Session | null,
  ): Promise<void> {
    if (event === "SIGNED_OUT") {
      this.user = null;
      if (this.state.status !== "verification_required")
        this.updateState({ status: "signed_out", email: null });
      return;
    }
    if (session?.user && !this.recoveryFlow)
      await this.establishSession(session.user).catch(() => undefined);
  }

  private requireClient(): SupabaseClient {
    if (!this.client) throw new Error("Supabase 尚未配置");
    return this.client;
  }

  private validatePassword(password: string): void {
    if (password.length < 8 || password.length > 72)
      throw new Error("密码长度必须为 8–72 位");
  }

  private scheduleRetry(): void {
    if (!this.user || this.retryTimer) return;
    const delays = [5_000, 15_000, 60_000, 300_000];
    const delay = delays[Math.min(this.retryIndex, delays.length - 1)]!;
    this.retryIndex += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.user) this.runInBackground("retry");
    }, delay);
  }

  private runInBackground(reason: string): void {
    void this.run(reason).catch(() => undefined);
  }

  private setError(error: unknown): void {
    this.updateState({ status: "error", message: errorMessage(error) });
  }

  private updateState(patch: Partial<SyncState>): void {
    this.state = { ...this.getState(), ...patch };
    this.emit();
  }

  private emit(): void {
    this.options.getWindow()?.webContents.send("sync:state", this.getState());
  }
}
