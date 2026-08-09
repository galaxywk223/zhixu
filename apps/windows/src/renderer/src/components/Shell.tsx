import { Tooltip } from "@fluentui/react-components";
import {
  Calendar24Regular,
  CheckmarkSquare24Regular,
  DataBarVertical24Regular,
  Home24Regular,
  Note24Regular,
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
  {
    route: "today" as const,
    label: "今天",
    shortcut: 1,
    icon: <Home24Regular />,
  },
  {
    route: "tasks" as const,
    label: "任务",
    shortcut: 2,
    icon: <CheckmarkSquare24Regular />,
  },
  {
    route: "calendar" as const,
    label: "日历",
    shortcut: 3,
    icon: <Calendar24Regular />,
  },
  {
    route: "notes" as const,
    label: "笔记",
    shortcut: 4,
    icon: <Note24Regular />,
  },
  {
    route: "focus" as const,
    label: "专注",
    shortcut: 5,
    icon: <Timer24Regular />,
  },
  {
    route: "sleep" as const,
    label: "睡眠",
    shortcut: 6,
    icon: <WeatherMoon24Regular />,
  },
  {
    route: "stats" as const,
    label: "统计",
    shortcut: 7,
    icon: <DataBarVertical24Regular />,
  },
];

interface ShellProps {
  route: Route;
  onRouteChange(route: Route): void;
  children: React.ReactNode;
}

export function Shell(props: ShellProps): React.JSX.Element {
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand-block">
          <img src="/zhixu-mark-1024.png" alt="知序" />
          <strong>知序</strong>
        </div>
        <nav aria-label="主导航">
          {navigation.map((item) => (
            <Tooltip
              key={item.route}
              content={`${item.label}  Ctrl+${item.shortcut}`}
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
        <div className="sidebar-spacer" />
        <Tooltip content="设置  Ctrl+8" relationship="description">
          <button
            type="button"
            className={`nav-item sidebar-settings ${props.route === "settings" ? "active" : ""}`}
            onClick={() => props.onRouteChange("settings")}
          >
            <Settings24Regular />
            <span>设置</span>
          </button>
        </Tooltip>
      </aside>
      <main className="content">{props.children}</main>
    </div>
  );
}
