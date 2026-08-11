import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@fluentui/react-components";
import { ArrowSync20Regular, SignOut20Regular } from "@fluentui/react-icons";
import type { SyncState } from "../../../preload/api-types";
import { queryKeys } from "../query";

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
  const [error, setError] = useState<string | null>(null);
  const state = sync.data;

  useEffect(
    () =>
      window.zhixu.sync.onState((value) => {
        client.setQueryData(queryKeys.sync, value);
      }),
    [client],
  );
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

  if (sync.isLoading)
    return <div className="settings-state">正在读取账户状态</div>;
  if (sync.isError || !state)
    return (
      <div className="settings-state">
        <span>账户状态读取失败</span>
        <Button onClick={() => void sync.refetch()}>重试</Button>
      </div>
    );

  return (
    <section
      className="settings-section account-sync-section"
      aria-label="账户设置"
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
        </div>
      </div>
      {state.canUseApp ? (
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
      ) : (
        <div className="settings-state">
          账号访问状态已失效，应用将返回登录界面。
        </div>
      )}
    </section>
  );
}
