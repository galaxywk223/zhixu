import { render, screen } from "@testing-library/react";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { describe, expect, it } from "vitest";
import {
  EmptyState,
  PageHeader,
  StatCard,
} from "../src/renderer/src/components/Page";
import { Shell } from "../src/renderer/src/components/Shell";

describe("shared page components", () => {
  it("renders compact desktop headings and summary values", () => {
    render(
      <FluentProvider theme={webLightTheme}>
        <PageHeader title="任务" subtitle="本地任务工作台" />
        <StatCard label="今日到期" value={3} />
        <EmptyState title="暂无任务" detail="当前筛选没有结果" />
      </FluentProvider>,
    );
    expect(screen.getByRole("heading", { name: "任务" })).toBeTruthy();
    expect(screen.getByText("今日到期")).toBeTruthy();
    expect(screen.getByText("暂无任务")).toBeTruthy();
  });

  it("renders the compact shell without a workspace subtitle", () => {
    render(
      <FluentProvider theme={webLightTheme}>
        <Shell route="today" onRouteChange={() => undefined}>
          <main>页面内容</main>
        </Shell>
      </FluentProvider>,
    );

    expect(screen.getByText("知序")).toBeTruthy();
    expect(screen.queryByText("个人工作台")).toBeNull();
    expect(screen.getByRole("button", { name: "设置" })).toBeTruthy();
  });
});
