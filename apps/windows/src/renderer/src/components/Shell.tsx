import { useState } from "react";
import { Tooltip } from "@fluentui/react-components";
import {
  Calendar24Regular,
  CalendarClock24Regular,
  CheckmarkSquare24Regular,
  Home24Regular,
  NotePinRegular,
  Money24Regular,
  PanelLeftContract24Regular,
  PanelLeftExpand24Regular,
  Settings24Regular,
  Timer24Regular,
  WeatherMoon24Regular,
} from "@fluentui/react-icons";

export const SIDEBAR_COLLAPSED_STORAGE_KEY = "zhixu-sidebar-collapsed";

export type Route =
  | "today"
  | "tasks"
  | "memos"
  | "countdowns"
  | "calendar"
  | "focus"
  | "sleep"
  | "finance"
  | "settings";

const navigation = [
  {
    route: "today" as const,
    label: "今天",
    icon: <Home24Regular />,
  },
  {
    route: "tasks" as const,
    label: "任务",
    icon: <CheckmarkSquare24Regular />,
  },
  {
    route: "focus" as const,
    label: "专注",
    icon: <Timer24Regular />,
  },
  {
    route: "calendar" as const,
    label: "日历",
    icon: <Calendar24Regular />,
  },
  {
    route: "memos" as const,
    label: "备忘",
    icon: <NotePinRegular />,
  },
  {
    route: "countdowns" as const,
    label: "倒数",
    icon: <CalendarClock24Regular />,
  },
  {
    route: "sleep" as const,
    label: "睡眠",
    icon: <WeatherMoon24Regular />,
  },
  {
    route: "finance" as const,
    label: "消费",
    icon: <Money24Regular />,
  },
];

interface ShellProps {
  route: Route;
  onRouteChange(route: Route): void;
  children: React.ReactNode;
}

function readCollapsedPreference(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function Shell(props: ShellProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);
  const toggleLabel = collapsed ? "展开侧栏" : "折叠侧栏";
  const toggleSidebar = (): void => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // The current session still supports collapsing when storage is unavailable.
      }
      return next;
    });
  };
  return (
    <div className={`app-frame ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand-block">
          <img src="./zhixu-mark-1024.png" alt="知序" />
          <strong>知序</strong>
        </div>
        <nav aria-label="主导航">
          {navigation.map((item) => (
            <Tooltip
              key={item.route}
              content={item.label}
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
        <Tooltip content={toggleLabel} relationship="description">
          <button
            type="button"
            className="nav-item sidebar-collapse"
            aria-label={toggleLabel}
            onClick={toggleSidebar}
          >
            {collapsed ? (
              <PanelLeftExpand24Regular />
            ) : (
              <PanelLeftContract24Regular />
            )}
            {!collapsed ? <span>收起</span> : null}
          </button>
        </Tooltip>
        <Tooltip content="设置" relationship="description">
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
