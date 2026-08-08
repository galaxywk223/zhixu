import { Button, Tooltip } from "@fluentui/react-components";
import {
  Add24Regular,
  Calendar24Regular,
  CheckmarkSquare24Regular,
  DataBarVertical24Regular,
  Home24Regular,
  Note24Regular,
  Search24Regular,
  Settings24Regular,
  Timer24Regular,
  WeatherMoon24Regular,
} from "@fluentui/react-icons";

export type Route =
  | "today"
  | "tasks"
  | "calendar"
  | "focus"
  | "sleep"
  | "notes"
  | "stats"
  | "settings";

const navigation = [
  { route: "today" as const, label: "今日", icon: <Home24Regular /> },
  {
    route: "tasks" as const,
    label: "任务",
    icon: <CheckmarkSquare24Regular />,
  },
  { route: "calendar" as const, label: "日历", icon: <Calendar24Regular /> },
  { route: "focus" as const, label: "专注", icon: <Timer24Regular /> },
  { route: "sleep" as const, label: "睡眠", icon: <WeatherMoon24Regular /> },
  { route: "notes" as const, label: "笔记", icon: <Note24Regular /> },
  {
    route: "stats" as const,
    label: "统计",
    icon: <DataBarVertical24Regular />,
  },
  { route: "settings" as const, label: "设置", icon: <Settings24Regular /> },
];

interface ShellProps {
  route: Route;
  onRouteChange(route: Route): void;
  onNewTask(): void;
  onSearch(): void;
  children: React.ReactNode;
}

export function Shell(props: ShellProps): React.JSX.Element {
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand-block">
          <img src="/zhixu-mark-1024.png" alt="知序" />
          <div>
            <strong>知序</strong>
            <span>个人工作台</span>
          </div>
        </div>
        <Button
          appearance="primary"
          icon={<Add24Regular />}
          className="quick-add"
          onClick={props.onNewTask}
        >
          新建任务
        </Button>
        <nav aria-label="主导航">
          {navigation.map((item) => (
            <Tooltip
              key={item.route}
              content={`${item.label}  Ctrl+${navigation.indexOf(item) + 1}`}
              relationship="description"
            >
              <button
                type="button"
                className={`nav-item ${props.route === item.route ? "active" : ""}`}
                onClick={() => props.onRouteChange(item.route)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            </Tooltip>
          ))}
        </nav>
        <button type="button" className="search-entry" onClick={props.onSearch}>
          <Search24Regular />
          <span>全局搜索</span>
          <kbd>Ctrl K</kbd>
        </button>
      </aside>
      <main className="content">{props.children}</main>
    </div>
  );
}
