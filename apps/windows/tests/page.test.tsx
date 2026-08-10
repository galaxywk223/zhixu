import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { afterEach, describe, expect, it } from "vitest";
import {
  EmptyState,
  PageHeader,
  StatCard,
} from "../src/renderer/src/components/Page";
import {
  routeForNumericShortcut,
  Shell,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
} from "../src/renderer/src/components/Shell";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("shared page components", () => {
  it("renders compact desktop headings and summary values", () => {
    const { container } = render(
      <FluentProvider theme={webLightTheme}>
        <PageHeader title="任务" />
        <StatCard label="今日到期" value={3} />
        <EmptyState title="暂无任务" detail="当前筛选没有结果" />
      </FluentProvider>,
    );
    expect(screen.getByRole("heading", { name: "任务" })).toBeTruthy();
    expect(screen.getByText("今日到期")).toBeTruthy();
    expect(screen.getByText("暂无任务")).toBeTruthy();
    expect(container.querySelector(".page-header p")).toBeNull();
  });

  it("persists manual sidebar collapse while preserving navigation", () => {
    const { container, unmount } = render(
      <FluentProvider theme={webLightTheme}>
        <Shell route="today" onRouteChange={() => undefined}>
          <main>页面内容</main>
        </Shell>
      </FluentProvider>,
    );

    expect(screen.getByText("知序")).toBeTruthy();
    expect(screen.queryByText("个人工作台")).toBeNull();
    expect(screen.getByRole("button", { name: "设置" })).toBeTruthy();
    expect(container.querySelector(".app-frame.sidebar-collapsed")).toBeNull();

    const collapseButton = screen.getByRole("button", { name: "折叠侧栏" });
    expect(collapseButton.querySelector("span")?.textContent).toBe("收起");
    fireEvent.click(collapseButton);
    expect(
      container.querySelector(".app-frame.sidebar-collapsed"),
    ).toBeTruthy();
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("true");
    expect(screen.getByRole("button", { name: "展开侧栏" })).toBeTruthy();
    expect(collapseButton.querySelector("span")).toBeNull();

    unmount();
    const restored = render(
      <FluentProvider theme={webLightTheme}>
        <Shell route="tasks" onRouteChange={() => undefined}>
          <main>恢复后的页面</main>
        </Shell>
      </FluentProvider>,
    );
    expect(
      restored.container.querySelector(".app-frame.sidebar-collapsed"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "展开侧栏" }).querySelector("span"),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "任务" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "备忘" })).toBeTruthy();
    expect(screen.queryByText("倒数日")).toBeNull();
    expect(screen.queryByRole("button", { name: "统计" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "倒数" })
        .getAttribute("aria-keyshortcuts"),
    ).toBe("Control+6");
    expect(
      screen
        .getByRole("button", { name: "日历" })
        .getAttribute("aria-keyshortcuts"),
    ).toBe("Control+4");
    expect(
      screen
        .getByRole("button", { name: "专注" })
        .getAttribute("aria-keyshortcuts"),
    ).toBe("Control+3");
    expect(
      screen
        .getByRole("button", { name: "设置" })
        .getAttribute("aria-keyshortcuts"),
    ).toBe("Control+,");
  });

  it("defaults to an expanded sidebar for invalid stored preferences", () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "invalid");
    const { container } = render(
      <FluentProvider theme={webLightTheme}>
        <Shell route="today" onRouteChange={() => undefined}>
          <main>页面内容</main>
        </Shell>
      </FluentProvider>,
    );

    expect(container.querySelector(".app-frame.sidebar-collapsed")).toBeNull();
    expect(
      screen.getByRole("button", { name: "折叠侧栏" }).querySelector("span")
        ?.textContent,
    ).toBe("收起");
  });

  it("maps numeric shortcuts to the sidebar order", () => {
    expect(routeForNumericShortcut("1")).toBe("today");
    expect(routeForNumericShortcut("3")).toBe("focus");
    expect(routeForNumericShortcut("4")).toBe("calendar");
    expect(routeForNumericShortcut("5")).toBe("memos");
    expect(routeForNumericShortcut("6")).toBe("countdowns");
    expect(routeForNumericShortcut("8")).toBe("sleep");
    expect(routeForNumericShortcut("9")).toBeNull();
    expect(routeForNumericShortcut("0")).toBeNull();
  });
});
