import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FluentProvider,
  Spinner,
  webDarkTheme,
  webLightTheme,
} from "@fluentui/react-components";
import type { TaskRecord } from "../../preload/api-types";
import { SearchDialog } from "./components/SearchDialog";
import { Shell, type Route } from "./components/Shell";
import { TaskEditor } from "./components/TaskEditor";
import { CalendarPage } from "./pages/CalendarPage";
import { FocusPage } from "./pages/FocusPage";
import { NotesPage } from "./pages/NotesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SleepPage } from "./pages/SleepPage";
import { StatsPage } from "./pages/StatsPage";
import { TasksPage } from "./pages/TasksPage";
import { TodayPage } from "./pages/TodayPage";
import { queryKeys, useDataInvalidation } from "./query";

export function App(): React.JSX.Element {
  const bootstrap = useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: window.zhixu.app.bootstrap,
  });
  const [route, setRoute] = useState<Route>("today");
  const [editor, setEditor] = useState<{
    open: boolean;
    task: TaskRecord | null;
  }>({ open: false, task: null });
  const [search, setSearch] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [systemDark, setSystemDark] = useState(
    matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useDataInvalidation();

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
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearch(true);
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        setEditor({ open: true, task: null });
      }
      const routes: Route[] = [
        "today",
        "tasks",
        "calendar",
        "notes",
        "focus",
        "sleep",
        "stats",
        "settings",
      ];
      const index = Number(event.key) - 1;
      if (index >= 0 && routes[index]) {
        event.preventDefault();
        setRoute(routes[index]);
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
  const mode = bootstrap.data.settings.themeMode;
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
      setRoute("focus");
      if (
        confirm(
          `导入 ${preview.fileName} 的 ${preview.sessions.length} 条记录？`,
        )
      ) {
        const result = await window.zhixu.focus.confirm(preview.token);
        alert(
          `导入完成：新增 ${result.importedCount}，更新 ${result.updatedCount}，跳过 ${result.skippedCount}`,
        );
      }
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
      />
    ),
    tasks: <TasksPage onNew={openNew} onEdit={openEdit} />,
    calendar: <CalendarPage onNewTask={openNew} />,
    focus: <FocusPage />,
    sleep: <SleepPage />,
    notes: <NotesPage initialSelectedId={selectedNoteId} />,
    stats: <StatsPage />,
    settings: <SettingsPage />,
  }[route];
  return (
    <FluentProvider
      theme={dark ? webDarkTheme : webLightTheme}
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
        onNavigate={setRoute}
      />
    </FluentProvider>
  );
}
