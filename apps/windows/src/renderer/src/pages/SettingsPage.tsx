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
  Add20Regular,
  ArrowDownload20Regular,
  ArrowReset20Regular,
  ArrowUpload20Regular,
  CheckmarkCircle20Regular,
  Delete20Regular,
  Edit20Regular,
  Eye20Regular,
  Folder20Regular,
  Tag20Regular,
  ZoomIn20Regular,
  ZoomOut20Regular,
} from "@fluentui/react-icons";
import type {
  AppSettings,
  TagRecord,
  UpdateState,
} from "../../../preload/api-types";
import { tagTone } from "../../../shared/tag-colors";
import { DEFAULT_UI_SCALE, stepUiScale } from "../../../shared/ui-scale";
import { Loading, PageHeader } from "../components/Page";
import { AccountSyncPanel } from "../components/AccountSyncPanel";
import { queryKeys } from "../query";

type SettingsSection =
  "appearance" | "tags" | "backup" | "sync" | "migration" | "about";

type ConfirmAction =
  { kind: "remove-tag"; tag: TagRecord } | { kind: "restore" } | null;

const settingsSections: Array<{
  value: SettingsSection;
  label: string;
  icon: React.ReactNode;
}> = [
  { value: "appearance", label: "主题外观", icon: <Eye20Regular /> },
  { value: "tags", label: "标签管理", icon: <Tag20Regular /> },
  { value: "backup", label: "数据与备份", icon: <ArrowDownload20Regular /> },
  { value: "sync", label: "账户与同步", icon: <ArrowUpload20Regular /> },
  { value: "migration", label: "数据库迁移", icon: <Folder20Regular /> },
  { value: "about", label: "关于与更新", icon: <CheckmarkCircle20Regular /> },
];

export function SettingsPage(props: {
  initialSection?: "appearance" | "sync";
}): React.JSX.Element {
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
  const updates = useQuery({
    queryKey: queryKeys.updates,
    queryFn: window.zhixu.updates.getState,
  });
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [editingTag, setEditingTag] = useState<TagRecord | "new" | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    props.initialSection ?? "appearance",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  useEffect(() => {
    if (props.initialSection) setActiveSection(props.initialSection);
  }, [props.initialSection]);

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

  const showOperationError = (value: unknown): void => {
    setSettingsError(value instanceof Error ? value.message : String(value));
  };
  const updateSettings = useMutation({
    mutationFn: (value: {
      patch: Partial<AppSettings>;
      previous: AppSettings;
    }) => window.zhixu.settings.update(value.patch),
    onError: (value, variables) => {
      setDraft(variables.previous);
      client.setQueryData(queryKeys.settings, variables.previous);
      client.setQueryData(queryKeys.bootstrap, (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        return { ...current, settings: variables.previous };
      });
      showOperationError(value);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.settings });
      void client.invalidateQueries({ queryKey: queryKeys.bootstrap });
    },
  });
  const changeSettings = (patch: Partial<AppSettings>): void => {
    if (!draft) return;
    const previous: AppSettings = draft;
    const next: AppSettings = { ...draft, ...patch };
    setSettingsError(null);
    setMessage(null);
    setDraft(next);
    client.setQueryData(queryKeys.settings, next);
    client.setQueryData(queryKeys.bootstrap, (current: unknown) => {
      if (!current || typeof current !== "object") return current;
      return { ...current, settings: next };
    });
    updateSettings.mutate({ patch, previous });
  };
  const removeTag = useMutation({
    mutationFn: window.zhixu.tasks.removeTag,
    onSuccess: async () => {
      setConfirmAction(null);
      setMessage("标签已删除");
      await client.invalidateQueries({ queryKey: queryKeys.tags });
    },
    onError: showOperationError,
  });
  const exportBackup = useMutation({
    mutationFn: window.zhixu.backup.export,
    onSuccess: (path) => {
      if (path) setMessage(`备份已导出：${path}`);
    },
    onError: showOperationError,
  });
  const restore = useMutation({
    mutationFn: window.zhixu.backup.restore,
    onSuccess: async (done) => {
      setConfirmAction(null);
      if (done) {
        setMessage("备份已恢复");
        await client.invalidateQueries();
      }
    },
    onError: showOperationError,
  });
  const checkUpdate = useMutation({
    mutationFn: window.zhixu.updates.check,
    onSuccess: (state) => client.setQueryData(queryKeys.updates, state),
    onError: showOperationError,
  });
  const downloadUpdate = useMutation({
    mutationFn: window.zhixu.updates.download,
    onError: showOperationError,
  });
  const installUpdate = useMutation({
    mutationFn: window.zhixu.updates.install,
    onError: showOperationError,
  });

  if (!draft || bootstrap.isLoading) return <Loading />;
  const activeSectionLabel =
    settingsSections.find((section) => section.value === activeSection)
      ?.label ?? "设置";
  const migration = bootstrap.data?.migration;

  return (
    <div className="page settings-page">
      <PageHeader title="设置" />
      <div className="settings-workspace-layout">
        <nav className="settings-section-nav" aria-label="设置分类">
          {settingsSections.map((section) => (
            <button
              type="button"
              key={section.value}
              className={activeSection === section.value ? "active" : ""}
              aria-current={
                activeSection === section.value ? "page" : undefined
              }
              onClick={() => setActiveSection(section.value)}
            >
              <span className="settings-nav-icon" aria-hidden="true">
                {section.icon}
              </span>
              <span>{section.label}</span>
            </button>
          ))}
        </nav>
        <section
          className="settings-content-panel"
          aria-labelledby="settings-panel-title"
        >
          <header className="settings-workspace-toolbar">
            <h2 id="settings-panel-title">{activeSectionLabel}</h2>
            {activeSection === "tags" ? (
              <Button
                icon={<Add20Regular />}
                onClick={() => setEditingTag("new")}
              >
                新建标签
              </Button>
            ) : null}
          </header>
          <div className="settings-workspace-scroll">
            {settingsError ? (
              <div className="error-message settings-feedback" role="alert">
                {settingsError}
              </div>
            ) : null}
            {message ? (
              <div className="success-message settings-feedback" role="status">
                {message}
              </div>
            ) : null}

            {activeSection === "appearance" ? (
              <section className="settings-section" aria-label="主题外观设置">
                <SettingRow
                  title="主题模式"
                  description="选择浅色、深色或跟随 Windows 系统设置。"
                >
                  <div className="segmented" aria-label="主题模式">
                    {(["system", "light", "dark"] as const).map((mode) => (
                      <button
                        type="button"
                        key={mode}
                        className={draft.themeMode === mode ? "active" : ""}
                        aria-pressed={draft.themeMode === mode}
                        disabled={updateSettings.isPending}
                        onClick={() => changeSettings({ themeMode: mode })}
                      >
                        {mode === "system"
                          ? "跟随系统"
                          : mode === "light"
                            ? "浅色"
                            : "深色"}
                      </button>
                    ))}
                  </div>
                </SettingRow>
                <SettingRow
                  title="界面缩放"
                  description="同步调整文字、控件和页面布局。"
                >
                  <div
                    className="scale-stepper"
                    role="group"
                    aria-label="界面缩放"
                  >
                    <Tooltip
                      content="缩小界面  Ctrl+-"
                      relationship="description"
                    >
                      <Button
                        appearance="subtle"
                        icon={<ZoomOut20Regular />}
                        aria-label="缩小界面"
                        disabled={
                          draft.uiScale === 80 || updateSettings.isPending
                        }
                        onClick={() =>
                          changeSettings({
                            uiScale: stepUiScale(draft.uiScale, -1),
                          })
                        }
                      />
                    </Tooltip>
                    <output aria-live="polite">{draft.uiScale}%</output>
                    <Tooltip
                      content="放大界面  Ctrl++"
                      relationship="description"
                    >
                      <Button
                        appearance="subtle"
                        icon={<ZoomIn20Regular />}
                        aria-label="放大界面"
                        disabled={
                          draft.uiScale === 150 || updateSettings.isPending
                        }
                        onClick={() =>
                          changeSettings({
                            uiScale: stepUiScale(draft.uiScale, 1),
                          })
                        }
                      />
                    </Tooltip>
                    <Tooltip
                      content="恢复 100%  Ctrl+0"
                      relationship="description"
                    >
                      <Button
                        appearance="subtle"
                        icon={<ArrowReset20Regular />}
                        aria-label="恢复默认缩放"
                        disabled={
                          draft.uiScale === DEFAULT_UI_SCALE ||
                          updateSettings.isPending
                        }
                        onClick={() =>
                          changeSettings({ uiScale: DEFAULT_UI_SCALE })
                        }
                      />
                    </Tooltip>
                  </div>
                </SettingRow>
                <SettingRow
                  title="关闭后驻留系统托盘"
                  description="关闭窗口后继续在后台运行，可从托盘重新打开。"
                >
                  <Switch
                    aria-label="关闭后驻留系统托盘"
                    checked={draft.closeToTray}
                    disabled={updateSettings.isPending}
                    onChange={(_, data) =>
                      changeSettings({ closeToTray: data.checked })
                    }
                  />
                </SettingRow>
                <SettingRow
                  title="启动后保持最小化"
                  description="启动应用后不显示主窗口，适合后台工作流。"
                >
                  <Switch
                    aria-label="启动后保持最小化"
                    checked={draft.startMinimized}
                    disabled={updateSettings.isPending}
                    onChange={(_, data) =>
                      changeSettings({ startMinimized: data.checked })
                    }
                  />
                </SettingRow>
              </section>
            ) : null}

            {activeSection === "tags" ? (
              <section className="settings-section" aria-label="标签管理设置">
                {tags.isLoading ? (
                  <SettingsState message="正在读取标签" />
                ) : tags.isError ? (
                  <SettingsState
                    message="标签读取失败"
                    actionLabel="重试"
                    onAction={() => void tags.refetch()}
                  />
                ) : (tags.data ?? []).length === 0 ? (
                  <SettingsState
                    message="暂无标签"
                    actionLabel="新建标签"
                    onAction={() => setEditingTag("new")}
                  />
                ) : (
                  <div className="tag-settings">
                    {(tags.data ?? []).map((tag) => (
                      <div key={tag.id} className="tag-setting-row">
                        <span data-tag-tone={tagTone(tag.name)} />
                        <strong>{tag.name}</strong>
                        <Tooltip content="编辑标签" relationship="label">
                          <Button
                            appearance="subtle"
                            icon={<Edit20Regular />}
                            aria-label={`编辑标签 ${tag.name}`}
                            onClick={() => setEditingTag(tag)}
                          />
                        </Tooltip>
                        <Tooltip content="删除标签" relationship="label">
                          <Button
                            appearance="subtle"
                            icon={<Delete20Regular />}
                            aria-label={`删除标签 ${tag.name}`}
                            onClick={() =>
                              setConfirmAction({ kind: "remove-tag", tag })
                            }
                          />
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {activeSection === "backup" ? (
              <section className="settings-section" aria-label="数据与备份设置">
                <SettingRow
                  title="数据隔离"
                  description="Electron 数据库与 Flutter 原数据库相互独立。"
                >
                  <SettingsStatus>本地数据</SettingsStatus>
                </SettingRow>
                <SettingRow
                  title="导出备份"
                  description="创建包含当前本地业务数据的 v7 ZIP 备份。"
                >
                  <Button
                    icon={<ArrowDownload20Regular />}
                    disabled={exportBackup.isPending}
                    onClick={() => {
                      setMessage(null);
                      setSettingsError(null);
                      exportBackup.mutate();
                    }}
                  >
                    {exportBackup.isPending ? "正在导出" : "导出 v7 备份"}
                  </Button>
                </SettingRow>
                <SettingRow
                  title="恢复备份"
                  description="支持 v1–v7 备份；恢复会覆盖当前数据，校验失败时自动回滚。"
                >
                  <Button
                    icon={<ArrowUpload20Regular />}
                    disabled={restore.isPending}
                    onClick={() => setConfirmAction({ kind: "restore" })}
                  >
                    恢复 v1–v7 备份
                  </Button>
                </SettingRow>
              </section>
            ) : null}

            {activeSection === "sync" ? <AccountSyncPanel /> : null}

            {activeSection === "migration" ? (
              <section className="settings-section" aria-label="数据库迁移设置">
                <dl className="settings-details">
                  <div>
                    <dt>状态</dt>
                    <dd>
                      <SettingsStatus tone="success">
                        {migrationStatusLabel(migration?.status)}
                      </SettingsStatus>
                    </dd>
                  </div>
                  <div>
                    <dt>版本</dt>
                    <dd>
                      {migration?.fromVersion} → {migration?.toVersion}
                    </dd>
                  </div>
                  <div>
                    <dt>完整性</dt>
                    <dd>
                      <SettingsStatus
                        tone={
                          migration?.integrity === "ok" ? "success" : "warning"
                        }
                      >
                        {migration?.integrity === "ok"
                          ? "正常"
                          : (migration?.integrity ?? "未知")}
                      </SettingsStatus>
                    </dd>
                  </div>
                  <div>
                    <dt>源数据库</dt>
                    <dd>{migration?.sourcePath ?? "未发现旧库"}</dd>
                  </div>
                  <div>
                    <dt>迁移备份</dt>
                    <dd>{migration?.backupPath ?? "无需新备份"}</dd>
                  </div>
                </dl>
              </section>
            ) : null}

            {activeSection === "about" ? (
              <section className="settings-section" aria-label="关于与更新设置">
                <SettingRow title="知序" description="Electron Windows x64">
                  <SettingsStatus>
                    {bootstrap.data?.version ?? "未知版本"}
                  </SettingsStatus>
                </SettingRow>
                <UpdatePanel
                  state={updates.data}
                  loading={updates.isLoading}
                  queryError={updates.error}
                  checking={checkUpdate.isPending}
                  downloading={downloadUpdate.isPending}
                  installing={installUpdate.isPending}
                  onCheck={() => {
                    setSettingsError(null);
                    checkUpdate.mutate();
                  }}
                  onDownload={() => {
                    setSettingsError(null);
                    downloadUpdate.mutate();
                  }}
                  onInstall={() => {
                    setSettingsError(null);
                    installUpdate.mutate();
                  }}
                />
              </section>
            ) : null}
          </div>
        </section>
      </div>
      <TagEditor value={editingTag} onClose={() => setEditingTag(null)} />
      <SettingsConfirmDialog
        action={confirmAction}
        pending={removeTag.isPending || restore.isPending}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          setMessage(null);
          setSettingsError(null);
          if (confirmAction?.kind === "remove-tag") {
            removeTag.mutate(confirmAction.tag.id);
          } else if (confirmAction?.kind === "restore") {
            restore.mutate();
          }
        }}
      />
    </div>
  );
}

function SettingRow(props: {
  title: string;
  description: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <strong>{props.title}</strong>
        <small>{props.description}</small>
      </div>
      <div className="setting-control">{props.children}</div>
    </div>
  );
}

function SettingsStatus(props: {
  tone?: "neutral" | "success" | "warning" | "danger";
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <span className="settings-status" data-tone={props.tone ?? "neutral"}>
      {props.children}
    </span>
  );
}

function SettingsState(props: {
  message: string;
  actionLabel?: string;
  onAction?(): void;
}): React.JSX.Element {
  return (
    <div className="settings-state">
      <span>{props.message}</span>
      {props.actionLabel && props.onAction ? (
        <Button onClick={props.onAction}>{props.actionLabel}</Button>
      ) : null}
    </div>
  );
}

function migrationStatusLabel(
  status: "fresh" | "migrated" | "current" | undefined,
): string {
  if (status === "fresh") return "新建数据库";
  if (status === "migrated") return "迁移完成";
  if (status === "current") return "当前版本";
  return "未知";
}

function updateDescription(
  state: UpdateState | undefined,
  loading: boolean,
  queryError: unknown,
): string {
  if (queryError) return "更新状态读取失败，请重试。";
  if (loading || !state) return "正在读取更新状态。";
  if (state.status === "available")
    return `发现 ${state.version ?? "新版本"}。`;
  if (state.status === "current") return state.message ?? "当前已是最新版本。";
  if (state.status === "checking") return "正在检查可用更新。";
  if (state.status === "downloading") return state.message ?? "正在下载更新。";
  if (state.status === "downloaded")
    return state.message ?? "更新已下载，可以重启安装。";
  if (state.status === "error") return state.message ?? "更新检查失败。";
  return "可按需检查 GitHub 预览更新。";
}

function updateStatusLabel(
  state: UpdateState | undefined,
  loading: boolean,
  queryError: unknown,
): string {
  if (queryError) return "读取失败";
  if (loading || !state) return "读取中";
  if (state.status === "checking") return "检查中";
  if (state.status === "available") return "有新版本";
  if (state.status === "downloading") return "下载中";
  if (state.status === "downloaded") return "等待安装";
  if (state.status === "current") return "已是最新";
  if (state.status === "error") return "检查失败";
  return "未检查";
}

function UpdatePanel(props: {
  state: UpdateState | undefined;
  loading: boolean;
  queryError: unknown;
  checking: boolean;
  downloading: boolean;
  installing: boolean;
  onCheck(): void;
  onDownload(): void;
  onInstall(): void;
}): React.JSX.Element {
  const state = props.state;
  const busy =
    props.loading ||
    props.checking ||
    props.downloading ||
    props.installing ||
    state?.status === "checking" ||
    state?.status === "downloading";
  const progress = Math.max(0, Math.min(100, state?.progress ?? 0));
  const tone =
    props.queryError || state?.status === "error"
      ? "danger"
      : state?.status === "current" || state?.status === "downloaded"
        ? "success"
        : state?.status === "available" || state?.status === "downloading"
          ? "warning"
          : "neutral";
  return (
    <div className="update-panel">
      <SettingRow
        title="应用更新"
        description={updateDescription(state, props.loading, props.queryError)}
      >
        <SettingsStatus tone={tone}>
          {updateStatusLabel(state, props.loading, props.queryError)}
        </SettingsStatus>
        <Button onClick={props.onCheck} disabled={busy}>
          {props.checking || state?.status === "checking"
            ? "检查中"
            : props.queryError || state?.status === "error"
              ? "重新检查"
              : "检查更新"}
        </Button>
        {state?.status === "available" ? (
          <Button
            appearance="primary"
            onClick={props.onDownload}
            disabled={props.downloading}
          >
            {props.downloading ? "正在下载" : "下载更新"}
          </Button>
        ) : null}
        {state?.status === "downloaded" ? (
          <Button
            appearance="primary"
            onClick={props.onInstall}
            disabled={props.installing}
          >
            {props.installing ? "正在启动" : "重启并安装"}
          </Button>
        ) : null}
      </SettingRow>
      {state?.status === "downloading" ? (
        <div className="update-progress">
          <div>
            <span>下载进度</span>
            <strong>{progress}%</strong>
          </div>
          <progress aria-label="更新下载进度" max="100" value={progress} />
        </div>
      ) : null}
    </div>
  );
}

function SettingsConfirmDialog(props: {
  action: ConfirmAction;
  pending: boolean;
  onClose(): void;
  onConfirm(): void;
}): React.JSX.Element {
  const removing = props.action?.kind === "remove-tag";
  return (
    <Dialog
      open={props.action !== null}
      onOpenChange={(_, data) => {
        if (!data.open && !props.pending) props.onClose();
      }}
    >
      <DialogSurface className="confirmation-dialog">
        <DialogBody>
          <DialogTitle>{removing ? "删除标签" : "恢复备份"}</DialogTitle>
          <DialogContent>
            {props.action?.kind === "remove-tag"
              ? `删除“${props.action.tag.name}”标签？任务不会被删除。`
              : "恢复会覆盖当前 Electron 本地数据。恢复前会校验备份，失败时自动回滚。"}
          </DialogContent>
          <DialogActions>
            <Button onClick={props.onClose} disabled={props.pending}>
              取消
            </Button>
            <Button
              appearance="primary"
              className="danger-action"
              onClick={props.onConfirm}
              disabled={props.pending}
            >
              {props.pending ? "正在处理" : removing ? "删除标签" : "恢复备份"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
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
      <DialogSurface className="editor-dialog">
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
              disabled={!name.trim() || save.isPending}
              onClick={() =>
                save.mutate(
                  record
                    ? { id: record.id, name: name.trim() }
                    : { name: name.trim() },
                )
              }
            >
              {save.isPending ? "正在保存" : "保存"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
