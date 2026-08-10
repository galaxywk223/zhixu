import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FluentProvider, Spinner } from "@fluentui/react-components";
import type {
  FinanceImportPreview,
  TaskRecord,
  TomatoPreview,
} from "../../preload/api-types";
import { SearchDialog } from "./components/SearchDialog";
import { AuthGate } from "./components/AuthGate";
import { routeForNumericShortcut, Shell, type Route } from "./components/Shell";
import { TaskEditor } from "./components/TaskEditor";
import { CalendarPage } from "./pages/CalendarPage";
import { CountdownsPage } from "./pages/CountdownsPage";
import { FocusPage } from "./pages/FocusPage";
import { FinancePage } from "./pages/FinancePage";
import { NotesPage } from "./pages/NotesPage";
import { MemosPage } from "./pages/MemosPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SleepPage } from "./pages/SleepPage";
import { TasksPage } from "./pages/TasksPage";
import { TodayPage } from "./pages/TodayPage";
import { queryKeys, useDataInvalidation } from "./query";
import { uiScaleForShortcut } from "../../shared/ui-scale";
import { zhixuDarkTheme, zhixuLightTheme } from "./theme";

export function App(): React.JSX.Element {
  const client = useQueryClient();
  const bootstrap = useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: window.zhixu.app.bootstrap,
  });
  const settings = useQuery({
    queryKey: queryKeys.settings,
    queryFn: window.zhixu.settings.get,
  });
  const sync = useQuery({
    queryKey: queryKeys.sync,
    queryFn: window.zhixu.sync.getState,
  });
  const canUseApp = sync.data?.canUseApp === true;
  const [route, setRoute] = useState<Route>("today");
  const [editor, setEditor] = useState<{
    open: boolean;
    task: TaskRecord | null;
    initialDueDate: string | null;
  }>({ open: false, task: null, initialDueDate: null });
  const [search, setSearch] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [selectedCountdownId, setSelectedCountdownId] = useState<string | null>(
    null,
  );
  const [settingsInitialSection, setSettingsInitialSection] = useState<
    "appearance" | "sync"
  >("appearance");
  const [focusPreview, setFocusPreview] = useState<TomatoPreview | null>(null);
  const [financePreview, setFinancePreview] =
    useState<FinanceImportPreview | null>(null);
  const [dragging, setDragging] = useState(false);
  const [systemDark, setSystemDark] = useState(
    matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const uiScale = useRef(100);
  const [renderedUiScale, setRenderedUiScale] = useState(100);
  useDataInvalidation();

  useEffect(
    () =>
      window.zhixu.sync.onState((state) => {
        client.setQueryData(queryKeys.sync, state);
      }),
    [client],
  );

  useEffect(() => {
    const current = settings.data ?? bootstrap.data?.settings;
    if (current) {
      uiScale.current = current.uiScale;
      setRenderedUiScale(current.uiScale);
    }
  }, [bootstrap.data, settings.data]);

  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const change = (): void => setSystemDark(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(
    () =>
      window.zhixu.app.onNavigate((target) => {
        if (!canUseApp) return;
        if (target === "new-task")
          setEditor({ open: true, task: null, initialDueDate: null });
        else if (target === "search") setSearch(true);
        else if (target === "settings-sync") {
          setSettingsInitialSection("sync");
          setRoute("settings");
        } else if (
          [
            "today",
            "tasks",
            "memos",
            "countdowns",
            "calendar",
            "focus",
            "sleep",
            "notes",
            "finance",
            "settings",
          ].includes(target)
        )
          setRoute(target as Route);
      }),
    [canUseApp],
  );
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (!event.ctrlKey) return;
      const nextScale = uiScaleForShortcut(uiScale.current, event.key);
      if (nextScale !== null) {
        event.preventDefault();
        if (nextScale !== uiScale.current) {
          uiScale.current = nextScale;
          setRenderedUiScale(nextScale);
          void window.zhixu.settings.update({ uiScale: nextScale });
        }
        return;
      }
      if (!canUseApp) return;
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearch(true);
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        setEditor({ open: true, task: null, initialDueDate: null });
      }
      if (event.key === ",") {
        event.preventDefault();
        setRoute("settings");
        return;
      }
      const nextRoute = routeForNumericShortcut(event.key);
      if (nextRoute) {
        event.preventDefault();
        setRoute(nextRoute);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canUseApp]);

  if (bootstrap.isError)
    return (
      <div className="startup error-message">{String(bootstrap.error)}</div>
    );
  if (bootstrap.isLoading || !bootstrap.data)
    return (
      <div className="startup">
        <Spinner size="large" label="正在迁移并校验本地数据" />
      </div>
    );
  const mode = settings.data?.themeMode ?? bootstrap.data.settings.themeMode;
  const dark = mode === "dark" || (mode === "system" && systemDark);
  const openNew = (): void =>
    setEditor({ open: true, task: null, initialDueDate: null });
  const openNewForDate = (initialDueDate: string): void =>
    setEditor({ open: true, task: null, initialDueDate });
  const openEdit = (task: TaskRecord): void =>
    setEditor({ open: true, task, initialDueDate: null });
  const handleDrop = async (event: React.DragEvent): Promise<void> => {
    event.preventDefault();
    setDragging(false);
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    if (
      files.length === 1 &&
      files[0]!.name.toLocaleLowerCase().endsWith(".xls")
    ) {
      const preview = await window.zhixu.focus.previewDropped(files[0]!);
      setFocusPreview(preview);
      setRoute("focus");
      return;
    }
    if (files.every((file) => /\.(csv|xlsx)$/i.test(file.name))) {
      const preview = await window.zhixu.finance.previewDropped(files);
      setFinancePreview(preview);
      setRoute("finance");
      return;
    }
    alert("支持番茄 TODO .xls、支付宝 .csv 和微信 .xlsx 文件");
  };
  const page = {
    today: (
      <TodayPage
        onNew={openNew}
        onEdit={openEdit}
        onSearch={() => setSearch(true)}
        onOpenMemos={(memoId) => {
          setSelectedMemoId(memoId);
          setRoute("memos");
        }}
        onOpenNotes={(noteId) => {
          setSelectedNoteId(noteId);
          setRoute("notes");
        }}
        onOpenCountdowns={(countdownId) => {
          setSelectedCountdownId(countdownId);
          setRoute("countdowns");
        }}
      />
    ),
    tasks: <TasksPage onNew={openNew} onEdit={openEdit} />,
    memos: <MemosPage initialSelectedId={selectedMemoId} />,
    countdowns: <CountdownsPage initialSelectedId={selectedCountdownId} />,
    calendar: <CalendarPage onNewTask={openNewForDate} onEditTask={openEdit} />,
    focus: (
      <FocusPage preview={focusPreview} onPreviewChange={setFocusPreview} />
    ),
    sleep: <SleepPage />,
    finance: (
      <FinancePage
        preview={financePreview}
        onPreviewChange={setFinancePreview}
      />
    ),
    notes: <NotesPage initialSelectedId={selectedNoteId} />,
    settings: <SettingsPage initialSection={settingsInitialSection} />,
  }[route];
  return (
    <FluentProvider
      theme={dark ? zhixuDarkTheme : zhixuLightTheme}
      className={`app-provider ${dark ? "theme-dark" : "theme-light"} ui-scale-${renderedUiScale}`}
    >
      {sync.isError ? (
        <div className="startup error-message">{String(sync.error)}</div>
      ) : sync.isLoading || !sync.data ? (
        <div className="startup">
          <Spinner size="large" label="正在恢复账号会话" />
        </div>
      ) : !sync.data.canUseApp ? (
        <AuthGate state={sync.data} onRefresh={() => void sync.refetch()} />
      ) : (
        <>
          <div
            className="drop-root"
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) setDragging(false);
            }}
            onDrop={(event) => void handleDrop(event)}
          >
            <Shell
              route={route}
              onRouteChange={(nextRoute) => {
                if (nextRoute === "notes") setSelectedNoteId(null);
                if (nextRoute === "memos") setSelectedMemoId(null);
                if (nextRoute === "countdowns") setSelectedCountdownId(null);
                if (nextRoute === "settings")
                  setSettingsInitialSection("appearance");
                setRoute(nextRoute);
              }}
            >
              {page}
            </Shell>
            {dragging ? (
              <div className="drop-overlay">
                <strong>拖放账单或番茄记录导入</strong>
                <span>.csv / .xlsx / .xls 将在主进程中校验并预览</span>
              </div>
            ) : null}
          </div>
          <TaskEditor
            open={editor.open}
            task={editor.task}
            initialDueDate={editor.initialDueDate}
            onClose={() =>
              setEditor({ open: false, task: null, initialDueDate: null })
            }
          />
          <SearchDialog
            open={search}
            onClose={() => setSearch(false)}
            onNavigate={(target, id) => {
              if (target === "memos") setSelectedMemoId(id ?? null);
              if (target === "countdowns") setSelectedCountdownId(id ?? null);
              setRoute(target);
            }}
          />
        </>
      )}
    </FluentProvider>
  );
}
