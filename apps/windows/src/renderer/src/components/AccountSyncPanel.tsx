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
} from "@fluentui/react-components";
import {
  ArrowSync20Regular,
  SignOut20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import type {
  NoteConflictRecord,
  NoteConflictResolution,
  SyncState,
} from "../../../preload/api-types";
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
  const conflicts = useQuery({
    queryKey: queryKeys.noteConflicts,
    queryFn: window.zhixu.sync.listNoteConflicts,
    enabled: (sync.data?.conflictCount ?? 0) > 0,
  });
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = sync.data;

  useEffect(
    () =>
      window.zhixu.sync.onState((value) => {
        client.setQueryData(queryKeys.sync, value);
        if (value.conflictCount > 0)
          void client.invalidateQueries({ queryKey: queryKeys.noteConflicts });
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
      ) : (
        <div className="settings-state">
          账号访问状态已失效，应用将返回登录界面。
        </div>
      )}
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
