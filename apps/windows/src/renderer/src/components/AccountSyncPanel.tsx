import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
} from "@fluentui/react-components";
import {
  ArrowClockwise20Regular,
  ArrowSync20Regular,
  LockClosed20Regular,
  Mail20Regular,
  SignOut20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import type {
  NoteConflictRecord,
  NoteConflictResolution,
  SyncState,
} from "../../../preload/api-types";
import { queryKeys } from "../query";

type AuthDialogMode =
  "sign-in" | "sign-up" | "forgot" | "complete-reset" | null;

const statusLabels: Record<SyncState["status"], string> = {
  unconfigured: "未配置",
  signed_out: "未登录",
  verification_required: "待验证",
  password_recovery: "重置密码",
  binding: "首次合并",
  syncing: "同步中",
  idle: "已同步",
  offline: "离线",
  error: "同步异常",
};

function toneForStatus(
  status: SyncState["status"],
): "neutral" | "success" | "warning" | "danger" {
  if (status === "idle") return "success";
  if (status === "error") return "danger";
  if (
    status === "offline" ||
    status === "verification_required" ||
    status === "password_recovery"
  )
    return "warning";
  return "neutral";
}

function formatSyncTime(value: string | null): string {
  if (!value) return "尚未完成同步";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AccountSyncPanel(): React.JSX.Element {
  const client = useQueryClient();
  const sync = useQuery({
    queryKey: queryKeys.sync,
    queryFn: window.zhixu.sync.getState,
  });
  const conflicts = useQuery({
    queryKey: queryKeys.noteConflicts,
    queryFn: window.zhixu.sync.listNoteConflicts,
    enabled: (sync.data?.conflictCount ?? 0) > 0,
  });
  const [authMode, setAuthMode] = useState<AuthDialogMode>(null);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = sync.data;

  useEffect(
    () =>
      window.zhixu.sync.onState((value) => {
        client.setQueryData(queryKeys.sync, value);
        if (value.status === "password_recovery") setAuthMode("complete-reset");
        if (value.conflictCount > 0)
          void client.invalidateQueries({ queryKey: queryKeys.noteConflicts });
      }),
    [client],
  );
  useEffect(() => {
    if (state?.status === "password_recovery") setAuthMode("complete-reset");
  }, [state?.status]);

  const run = useMutation({
    mutationFn: window.zhixu.sync.run,
    onSuccess: (value) => client.setQueryData(queryKeys.sync, value),
    onError: (value) => setError(String(value)),
  });
  const signOut = useMutation({
    mutationFn: window.zhixu.account.signOut,
    onSuccess: () => void sync.refetch(),
    onError: (value) => setError(String(value)),
  });
  const resend = useMutation({
    mutationFn: window.zhixu.account.resendVerification,
    onSuccess: () => void sync.refetch(),
    onError: (value) => setError(String(value)),
  });

  if (sync.isLoading)
    return <div className="settings-state">正在读取账户状态</div>;
  if (sync.isError || !state)
    return (
      <div className="settings-state">
        <span>账户状态读取失败</span>
        <Button onClick={() => void sync.refetch()}>重试</Button>
      </div>
    );

  const signedIn =
    Boolean(state.email) &&
    !["verification_required", "password_recovery", "signed_out"].includes(
      state.status,
    );

  return (
    <section
      className="settings-section account-sync-section"
      aria-label="账户与同步设置"
    >
      {error ? (
        <div className="error-message settings-feedback">{error}</div>
      ) : null}
      <div className="setting-row">
        <div className="setting-copy">
          <strong>账户状态</strong>
          <small>{state.message ?? "账户状态已更新。"}</small>
        </div>
        <div className="setting-control">
          <span
            className="settings-status"
            data-tone={toneForStatus(state.status)}
          >
            {statusLabels[state.status]}
          </span>
          {state.status === "signed_out" ||
          (state.status === "error" && !state.email) ? (
            <>
              <Button
                icon={<Mail20Regular />}
                onClick={() => setAuthMode("sign-in")}
              >
                登录
              </Button>
              <Button
                appearance="primary"
                disabled={Boolean(state.boundEmail)}
                onClick={() => setAuthMode("sign-up")}
              >
                注册
              </Button>
            </>
          ) : null}
          {state.status === "verification_required" ? (
            <Button
              icon={<ArrowClockwise20Regular />}
              disabled={resend.isPending}
              onClick={() => resend.mutate(state.email ?? "")}
            >
              重新发送
            </Button>
          ) : null}
        </div>
      </div>

      {state.status === "unconfigured" ? (
        <div className="sync-configuration-note">
          <Warning20Regular />
          <span>
            配置 SUPABASE_URL 和 SUPABASE_ANON_KEY 后即可启用账户同步。
          </span>
        </div>
      ) : null}

      {signedIn ? (
        <>
          <div className="setting-row">
            <div className="setting-copy">
              <strong>当前账号</strong>
              <small>本地数据库固定绑定到该账号，退出不会删除本地数据。</small>
            </div>
            <div className="setting-control sync-account-email">
              <strong>{state.email}</strong>
              <Button
                appearance="subtle"
                icon={<SignOut20Regular />}
                disabled={signOut.isPending || state.status === "syncing"}
                onClick={() => signOut.mutate()}
              >
                退出
              </Button>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-copy">
              <strong>同步状态</strong>
              <small>
                上次同步：{formatSyncTime(state.lastSyncedAt)}；待上传{" "}
                {state.pendingCount} 条。
              </small>
            </div>
            <div className="setting-control">
              {state.conflictCount > 0 ? (
                <Button
                  icon={<Warning20Regular />}
                  onClick={() => setConflictsOpen(true)}
                >
                  处理冲突 {state.conflictCount}
                </Button>
              ) : null}
              <Button
                appearance="primary"
                icon={<ArrowSync20Regular />}
                disabled={
                  run.isPending ||
                  state.status === "syncing" ||
                  state.status === "binding"
                }
                onClick={() => {
                  setError(null);
                  run.mutate();
                }}
              >
                {state.status === "syncing" || state.status === "binding"
                  ? "正在同步"
                  : "立即同步"}
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {state.status === "signed_out" ||
      (state.status === "error" && !state.email) ? (
        <button
          className="text-action"
          type="button"
          onClick={() => setAuthMode("forgot")}
        >
          忘记密码
        </button>
      ) : null}

      <AuthDialog
        mode={authMode}
        initialEmail={state.email ?? state.boundEmail ?? ""}
        onClose={() => setAuthMode(null)}
        onCompleted={() => {
          setAuthMode(null);
          void sync.refetch();
        }}
        onSwitch={setAuthMode}
      />
      <ConflictDialog
        open={conflictsOpen}
        records={conflicts.data ?? []}
        loading={conflicts.isLoading}
        onClose={() => setConflictsOpen(false)}
        onResolved={async () => {
          await conflicts.refetch();
          await sync.refetch();
        }}
      />
    </section>
  );
}

function AuthDialog(props: {
  mode: AuthDialogMode;
  initialEmail: string;
  onClose(): void;
  onCompleted(): void;
  onSwitch(mode: AuthDialogMode): void;
}): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (props.mode) {
      setEmail(props.initialEmail);
      setPassword("");
      setConfirmation("");
      setError(null);
    }
  }, [props.mode, props.initialEmail]);

  const submit = useMutation({
    mutationFn: async () => {
      if (props.mode === "forgot")
        return window.zhixu.account.requestPasswordReset(email);
      if (props.mode === "complete-reset") {
        if (password !== confirmation) throw new Error("两次输入的密码不一致");
        return window.zhixu.account.completePasswordReset(password);
      }
      if (props.mode === "sign-up") {
        if (password !== confirmation) throw new Error("两次输入的密码不一致");
        return window.zhixu.account.signUp({ email, password });
      }
      return window.zhixu.account.signIn({ email, password });
    },
    onSuccess: props.onCompleted,
    onError: (value) =>
      setError(value instanceof Error ? value.message : String(value)),
  });

  const title =
    props.mode === "sign-up"
      ? "注册知序账号"
      : props.mode === "forgot"
        ? "找回密码"
        : props.mode === "complete-reset"
          ? "设置新密码"
          : "登录知序";
  const needsEmail = props.mode !== "complete-reset";
  const needsPassword = props.mode !== "forgot";
  const needsConfirmation =
    props.mode === "sign-up" || props.mode === "complete-reset";
  const valid =
    (!needsEmail || /.+@.+\..+/.test(email)) &&
    (!needsPassword || (password.length >= 8 && password.length <= 72)) &&
    (!needsConfirmation || password === confirmation);

  return (
    <Dialog
      open={props.mode !== null}
      onOpenChange={(_, data) => {
        if (!data.open && !submit.isPending) props.onClose();
      }}
    >
      <DialogSurface className="editor-dialog account-dialog">
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent className="form-grid">
            {needsEmail ? (
              <Field label="邮箱" required>
                <Input
                  type="email"
                  value={email}
                  contentBefore={<Mail20Regular />}
                  onChange={(_, data) => setEmail(data.value)}
                />
              </Field>
            ) : null}
            {needsPassword ? (
              <Field
                label={props.mode === "complete-reset" ? "新密码" : "密码"}
                required
              >
                <Input
                  type="password"
                  value={password}
                  contentBefore={<LockClosed20Regular />}
                  onChange={(_, data) => setPassword(data.value)}
                />
              </Field>
            ) : null}
            {needsConfirmation ? (
              <Field label="确认密码" required>
                <Input
                  type="password"
                  value={confirmation}
                  onChange={(_, data) => setConfirmation(data.value)}
                />
              </Field>
            ) : null}
            {needsPassword ? <small>密码长度为 8–72 位。</small> : null}
            {error ? <p className="error-message">{error}</p> : null}
            {props.mode === "sign-in" ? (
              <div className="auth-dialog-links">
                <button type="button" onClick={() => props.onSwitch("forgot")}>
                  忘记密码
                </button>
                <button type="button" onClick={() => props.onSwitch("sign-up")}>
                  注册账号
                </button>
              </div>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={props.onClose} disabled={submit.isPending}>
              取消
            </Button>
            <Button
              appearance="primary"
              disabled={!valid || submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending
                ? "正在处理"
                : props.mode === "forgot"
                  ? "发送重置邮件"
                  : props.mode === "sign-up"
                    ? "注册"
                    : props.mode === "complete-reset"
                      ? "更新密码"
                      : "登录"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function ConflictDialog(props: {
  open: boolean;
  records: NoteConflictRecord[];
  loading: boolean;
  onClose(): void;
  onResolved(): Promise<void>;
}): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(
    () =>
      props.records.find((item) => item.id === selectedId) ??
      props.records[0] ??
      null,
    [props.records, selectedId],
  );
  const resolve = useMutation({
    mutationFn: (resolution: NoteConflictResolution) =>
      window.zhixu.sync.resolveNoteConflict(selected!.id, resolution),
    onSuccess: props.onResolved,
    onError: (value) => setError(String(value)),
  });
  return (
    <Dialog
      open={props.open}
      onOpenChange={(_, data) => !data.open && props.onClose()}
    >
      <DialogSurface className="conflict-dialog">
        <DialogBody>
          <DialogTitle>笔记冲突</DialogTitle>
          <DialogContent className="conflict-dialog-content">
            {props.loading ? (
              <div className="settings-state">正在读取冲突</div>
            ) : null}
            {!props.loading && !selected ? (
              <div className="settings-state">没有待处理冲突</div>
            ) : null}
            {selected ? (
              <>
                <nav className="conflict-list" aria-label="冲突笔记">
                  {props.records.map((record) => (
                    <button
                      type="button"
                      key={record.id}
                      className={record.id === selected.id ? "active" : ""}
                      onClick={() => setSelectedId(record.id)}
                    >
                      {record.localTitle}
                    </button>
                  ))}
                </nav>
                <div className="conflict-comparison">
                  <ConflictVersion
                    label="本地版本"
                    title={selected.localTitle}
                    content={selected.localContentMd}
                    updatedAt={selected.localUpdatedAt}
                  />
                  <ConflictVersion
                    label="云端版本"
                    title={selected.remoteTitle}
                    content={selected.remoteContentMd}
                    updatedAt={selected.remoteUpdatedAt}
                  />
                </div>
              </>
            ) : null}
            {error ? <p className="error-message">{error}</p> : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={props.onClose}>关闭</Button>
            {selected ? (
              <>
                <Button
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate("remote")}
                >
                  使用云端
                </Button>
                <Button
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate("both")}
                >
                  保留两份
                </Button>
                <Button
                  appearance="primary"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate("local")}
                >
                  使用本地
                </Button>
              </>
            ) : null}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function ConflictVersion(props: {
  label: string;
  title: string;
  content: string;
  updatedAt: string | null;
}): React.JSX.Element {
  return (
    <article className="conflict-version">
      <header>
        <strong>{props.label}</strong>
        <small>
          {props.updatedAt ? formatSyncTime(props.updatedAt) : "时间未知"}
        </small>
      </header>
      <h3>{props.title}</h3>
      <pre>{props.content || "（空白笔记）"}</pre>
    </article>
  );
}
