import { useEffect, useState } from "react";
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
  Switch,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowReset20Regular,
  ArrowDownload20Regular,
  ArrowUpload20Regular,
  Delete20Regular,
  Edit20Regular,
  ZoomIn20Regular,
  ZoomOut20Regular,
} from "@fluentui/react-icons";
import type {
  AppSettings,
  TagRecord,
  UpdateState,
} from "../../../preload/api-types";
import { tagTone } from "../../../shared/tag-colors";
import { Loading, PageHeader } from "../components/Page";
import { queryKeys } from "../query";
import { DEFAULT_UI_SCALE, stepUiScale } from "../../../shared/ui-scale";

export function SettingsPage(): React.JSX.Element {
  const client = useQueryClient();
  const bootstrap = useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: window.zhixu.app.bootstrap,
  });
  const settings = useQuery({
    queryKey: queryKeys.settings,
    queryFn: window.zhixu.settings.get,
  });
  const tags = useQuery({
    queryKey: queryKeys.tags,
    queryFn: window.zhixu.tasks.tags,
  });
  const sync = useQuery({
    queryKey: ["sync"],
    queryFn: window.zhixu.sync.getState,
  });
  const updates = useQuery({
    queryKey: queryKeys.updates,
    queryFn: window.zhixu.updates.getState,
  });
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [editingTag, setEditingTag] = useState<TagRecord | "new" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (settings.data)
      setDraft((current) =>
        current
          ? { ...current, uiScale: settings.data.uiScale }
          : settings.data,
      );
  }, [settings.data]);
  useEffect(
    () =>
      window.zhixu.updates.onState((state) =>
        client.setQueryData(queryKeys.updates, state),
      ),
    [client],
  );
  const saveSettings = useMutation({
    mutationFn: window.zhixu.settings.set,
    onSuccess: () => {
      setMessage("设置已保存");
      client.invalidateQueries();
    },
  });
  const setUiScale = useMutation({
    mutationFn: async (uiScale: AppSettings["uiScale"]) => {
      await window.zhixu.settings.setUiScale(uiScale);
      return uiScale;
    },
    onSuccess: (uiScale) => {
      setDraft((current) => (current ? { ...current, uiScale } : current));
    },
  });
  const removeTag = useMutation({
    mutationFn: window.zhixu.tasks.removeTag,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.tags }),
  });
  const exportBackup = useMutation({
    mutationFn: window.zhixu.backup.export,
    onSuccess: (path) => {
      if (path) setMessage(`备份已导出：${path}`);
    },
  });
  const restore = useMutation({
    mutationFn: window.zhixu.backup.restore,
    onSuccess: async (done) => {
      if (done) {
        setMessage("备份已恢复");
        await client.invalidateQueries();
      }
    },
  });
  const checkUpdate = useMutation({
    mutationFn: window.zhixu.updates.check,
    onSuccess: (state) => client.setQueryData(queryKeys.updates, state),
  });
  if (!draft || bootstrap.isLoading) return <Loading />;
  return (
    <div className="page settings-page">
      <PageHeader
        title="设置"
        actions={
          <Button
            appearance="primary"
            onClick={() => saveSettings.mutate(draft)}
          >
            保存设置
          </Button>
        }
      />
      {message ? <div className="success-message">{message}</div> : null}
      <div className="settings-layout">
        <section className="settings-section">
          <h2>主题外观</h2>
          <div className="segmented">
            {(["system", "light", "dark"] as const).map((mode) => (
              <button
                key={mode}
                className={draft.themeMode === mode ? "active" : ""}
                onClick={() => setDraft({ ...draft, themeMode: mode })}
              >
                {mode === "system"
                  ? "跟随系统"
                  : mode === "light"
                    ? "浅色"
                    : "深色"}
              </button>
            ))}
          </div>
          <div className="setting-row scale-setting-row">
            <div>
              <strong>界面缩放</strong>
              <small>同步调整文字、控件和页面布局。</small>
            </div>
            <div className="scale-stepper" role="group" aria-label="界面缩放">
              <Tooltip content="缩小界面  Ctrl+-" relationship="description">
                <Button
                  appearance="subtle"
                  icon={<ZoomOut20Regular />}
                  aria-label="缩小界面"
                  disabled={draft.uiScale === 80 || setUiScale.isPending}
                  onClick={() =>
                    setUiScale.mutate(stepUiScale(draft.uiScale, -1))
                  }
                />
              </Tooltip>
              <output aria-live="polite">{draft.uiScale}%</output>
              <Tooltip content="放大界面  Ctrl++" relationship="description">
                <Button
                  appearance="subtle"
                  icon={<ZoomIn20Regular />}
                  aria-label="放大界面"
                  disabled={draft.uiScale === 150 || setUiScale.isPending}
                  onClick={() =>
                    setUiScale.mutate(stepUiScale(draft.uiScale, 1))
                  }
                />
              </Tooltip>
              <Tooltip content="恢复 100%  Ctrl+0" relationship="description">
                <Button
                  appearance="subtle"
                  icon={<ArrowReset20Regular />}
                  aria-label="恢复默认缩放"
                  disabled={
                    draft.uiScale === DEFAULT_UI_SCALE || setUiScale.isPending
                  }
                  onClick={() => setUiScale.mutate(DEFAULT_UI_SCALE)}
                />
              </Tooltip>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <strong>关闭后驻留系统托盘</strong>
              <small>托盘菜单可重新打开或明确退出。</small>
            </div>
            <Switch
              checked={draft.closeToTray}
              onChange={(_, data) =>
                setDraft({ ...draft, closeToTray: data.checked })
              }
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>启动后保持最小化</strong>
              <small>适合随系统启动的后台工作流。</small>
            </div>
            <Switch
              checked={draft.startMinimized}
              onChange={(_, data) =>
                setDraft({ ...draft, startMinimized: data.checked })
              }
            />
          </div>
        </section>
        <section className="settings-section">
          <div className="section-heading">
            <h2>标签管理</h2>
            <Button onClick={() => setEditingTag("new")}>新建标签</Button>
          </div>
          <div className="tag-settings">
            {(tags.data ?? []).map((tag) => (
              <div key={tag.id}>
                <span data-tag-tone={tagTone(tag.name)} />
                <strong>{tag.name}</strong>
                <Button
                  appearance="subtle"
                  icon={<Edit20Regular />}
                  onClick={() => setEditingTag(tag)}
                />
                <Button
                  appearance="subtle"
                  icon={<Delete20Regular />}
                  onClick={() => {
                    if (confirm(`删除“${tag.name}”标签？任务不会被删除。`))
                      removeTag.mutate(tag.id);
                  }}
                />
              </div>
            ))}
          </div>
        </section>
        <section className="settings-section">
          <h2>数据与备份</h2>
          <p>
            Electron 数据库与 Flutter
            原数据库相互独立。恢复操作在校验失败时自动回滚。
          </p>
          <div className="button-row">
            <Button
              icon={<ArrowDownload20Regular />}
              onClick={() => exportBackup.mutate()}
            >
              导出 v6 备份
            </Button>
            <Button
              icon={<ArrowUpload20Regular />}
              onClick={() => {
                if (confirm("恢复会覆盖当前 Electron 本地数据，是否继续？"))
                  restore.mutate();
              }}
            >
              恢复 v1–v6 备份
            </Button>
          </div>
        </section>
        <section className="settings-section">
          <h2>账户与同步</h2>
          <div className="sync-deferred">
            <strong>本地完整模式</strong>
            <p>{sync.data?.message}</p>
          </div>
        </section>
        <section className="settings-section">
          <h2>数据库迁移</h2>
          <dl className="details-list">
            <dt>状态</dt>
            <dd>{bootstrap.data?.migration.status}</dd>
            <dt>版本</dt>
            <dd>
              {bootstrap.data?.migration.fromVersion} →{" "}
              {bootstrap.data?.migration.toVersion}
            </dd>
            <dt>完整性</dt>
            <dd>{bootstrap.data?.migration.integrity}</dd>
            <dt>源数据库</dt>
            <dd>{bootstrap.data?.migration.sourcePath ?? "未发现旧库"}</dd>
            <dt>迁移备份</dt>
            <dd>{bootstrap.data?.migration.backupPath ?? "无需新备份"}</dd>
          </dl>
        </section>
        <section className="settings-section">
          <h2>关于与更新</h2>
          <p>知序 {bootstrap.data?.version} · Electron Windows x64</p>
          <UpdatePanel
            state={updates.data}
            onCheck={() => checkUpdate.mutate()}
          />
        </section>
      </div>
      <TagEditor value={editingTag} onClose={() => setEditingTag(null)} />
    </div>
  );
}

function UpdatePanel(props: {
  state: UpdateState | undefined;
  onCheck(): void;
}): React.JSX.Element {
  const state = props.state;
  return (
    <div className="update-panel">
      <p>
        {state?.status === "available"
          ? `发现 ${state.version}`
          : state?.status === "current"
            ? (state.message ?? "当前已是最新版本")
            : state?.status === "error"
              ? state.message
              : "可按需检查 GitHub 预览更新。"}
      </p>
      <div className="button-row">
        <Button onClick={props.onCheck} disabled={state?.status === "checking"}>
          {state?.status === "checking" ? "检查中" : "检查更新"}
        </Button>
        {state?.status === "available" ? (
          <Button
            appearance="primary"
            onClick={() => window.zhixu.updates.download()}
          >
            下载更新
          </Button>
        ) : null}
        {state?.status === "downloaded" ? (
          <Button
            appearance="primary"
            onClick={() => window.zhixu.updates.install()}
          >
            重启并安装
          </Button>
        ) : null}
      </div>
      {state?.status === "downloading" ? (
        <progress max="100" value={state.progress} />
      ) : null}
    </div>
  );
}

function TagEditor(props: {
  value: TagRecord | "new" | null;
  onClose(): void;
}): React.JSX.Element {
  const client = useQueryClient();
  const record = props.value && props.value !== "new" ? props.value : null;
  const [name, setName] = useState("");
  useEffect(() => {
    if (props.value) {
      setName(record?.name ?? "");
    }
  }, [props.value, record?.id]);
  const save = useMutation({
    mutationFn: window.zhixu.tasks.saveTag,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.tags });
      props.onClose();
    },
  });
  return (
    <Dialog
      open={props.value !== null}
      onOpenChange={(_, data) => {
        if (!data.open) props.onClose();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{record ? "编辑标签" : "新建标签"}</DialogTitle>
          <DialogContent className="form-grid">
            <Field label="名称">
              <Input value={name} onChange={(_, data) => setName(data.value)} />
            </Field>
            {save.error ? (
              <p className="error-message">{String(save.error)}</p>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={props.onClose}>取消</Button>
            <Button
              appearance="primary"
              disabled={!name.trim()}
              onClick={() =>
                save.mutate(
                  record
                    ? { id: record.id, name: name.trim() }
                    : { name: name.trim() },
                )
              }
            >
              保存
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
