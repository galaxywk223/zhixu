import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FluentProvider, Spinner } from "@fluentui/react-components";
import type { TaskRecord, TomatoPreview } from "../../preload/api-types";
import { SearchDialog } from "./components/SearchDialog";
import { routeForNumericShortcut, Shell, type Route } from "./components/Shell";
import { TaskEditor } from "./components/TaskEditor";
import { CalendarPage } from "./pages/CalendarPage";
import { CountdownsPage } from "./pages/CountdownsPage";
import { FocusPage } from "./pages/FocusPage";
import { NotesPage } from "./pages/NotesPage";
import { MemosPage } from "./pages/MemosPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SleepPage } from "./pages/SleepPage";
import { StatsPage } from "./pages/StatsPage";
import { TasksPage } from "./pages/TasksPage";
import { TodayPage } from "./pages/TodayPage";
import { queryKeys, useDataInvalidation } from "./query";
import { uiScaleForShortcut } from "../../shared/ui-scale";
import { zhixuDarkTheme, zhixuLightTheme } from "./theme";

export function App(): React.JSX.Element {
  const bootstrap = useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: window.zhixu.app.bootstrap,
  });
  const settings = useQuery({
    queryKey: queryKeys.settings,
    queryFn: window.zhixu.settings.get,
  });
  const [route, setRoute] = useState<Route>("today");
  const [editor, setEditor] = useState<{
    open: boolean;
    task: TaskRecord | null;
  }>({ open: false, task: null });
  const [search, setSearch] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [selectedCountdownId, setSelectedCountdownId] = useState<string | null>(
    null,
  );
  const [focusPreview, setFocusPreview] = useState<TomatoPreview | null>(null);
  const [dragging, setDragging] = useState(false);
  const [systemDark, setSystemDark] = useState(
    matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const uiScale = useRef(100);
  useDataInvalidation();

  useEffect(() => {
    const current = settings.data ?? bootstrap.data?.settings;
    if (current) uiScale.current = current.uiScale;
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
        if (target === "new-task") setEditor({ open: true, task: null });
        else if (target === "search") setSearch(true);
        else if (
          [
            "today",
            "tasks",
            "memos",
            "countdowns",
            "calendar",
            "focus",
            "sleep",
            "notes",
            "stats",
            "settings",
          ].includes(target)
        )
          setRoute(target as Route);
      }),
    [],
  );
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (!event.ctrlKey) return;
      const nextScale = uiScaleForShortcut(uiScale.current, event.key);
      if (nextScale !== null) {
        event.preventDefault();
        if (nextScale !== uiScale.current) {
          uiScale.current = nextScale;
          void window.zhixu.settings.update({ uiScale: nextScale });
        }
        return;
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearch(true);
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        setEditor({ open: true, task: null });
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
  }, []);

  if (bootstrap.isLoading || !bootstrap.data)
    return (
      <div className="startup">
        <Spinner size="large" label="正在迁移并校验本地数据" />
      </div>
    );
  if (bootstrap.isError)
    return (
      <div className="startup error-message">{String(bootstrap.error)}</div>
    );
  const mode = settings.data?.themeMode ?? bootstrap.data.settings.themeMode;
  const dark = mode === "dark" || (mode === "system" && systemDark);
  const openNew = (): void => setEditor({ open: true, task: null });
  const openEdit = (task: TaskRecord): void => setEditor({ open: true, task });
  const handleDrop = async (event: React.DragEvent): Promise<void> => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (file.name.toLocaleLowerCase().endsWith(".xls")) {
      const preview = await window.zhixu.focus.previewDropped(file);
      setFocusPreview(preview);
      setRoute("focus");
      return;
    }
    if (file.name.toLocaleLowerCase().endsWith(".zip")) {
      if (confirm(`使用 ${file.name} 覆盖当前 Electron 本地数据？`)) {
        await window.zhixu.backup.restoreDropped(file);
      }
      return;
    }
    alert("仅支持番茄 TODO .xls 或知序 .zip 备份");
  };
  const page = {
    today: (
      <TodayPage
        onNew={openNew}
        onEdit={openEdit}
        onSearch={() => setSearch(true)}
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
    calendar: <CalendarPage onNewTask={openNew} />,
    focus: (
      <FocusPage preview={focusPreview} onPreviewChange={setFocusPreview} />
    ),
    sleep: <SleepPage />,
    notes: <NotesPage initialSelectedId={selectedNoteId} />,
    stats: <StatsPage />,
    settings: <SettingsPage />,
  }[route];
  return (
    <FluentProvider
      theme={dark ? zhixuDarkTheme : zhixuLightTheme}
      className={`app-provider ${dark ? "theme-dark" : "theme-light"}`}
    >
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
            setRoute(nextRoute);
          }}
        >
          {page}
        </Shell>
        {dragging ? (
          <div className="drop-overlay">
            <strong>拖放 .xls 导入或 .zip 恢复</strong>
            <span>文件将在主进程中校验并预览</span>
          </div>
        ) : null}
      </div>
      <TaskEditor
        open={editor.open}
        task={editor.task}
        onClose={() => setEditor({ open: false, task: null })}
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
    </FluentProvider>
  );
}
