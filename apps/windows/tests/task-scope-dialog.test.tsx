import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskRecord } from "../src/preload/api-types";
import { TaskScopeDialog } from "../src/renderer/src/components/TaskScopeDialog";

afterEach(cleanup);

const task: TaskRecord = {
  id: "task-2",
  title: "每日复习",
  descriptionMd: null,
  status: "todo",
  priority: 2,
  dueAt: new Date(2026, 7, 8).toISOString(),
  estimatedMinutes: 45,
  categoryId: null,
  repeatRule: "{}",
  series: {
    id: "series-1",
    frequency: "daily",
    startDate: "2026-08-07",
    endDate: "2026-08-09",
    time: null,
  },
  completedAt: null,
  isArchived: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deletedAt: null,
  tagIds: [],
};

function renderDialog(
  action: "edit" | "delete",
  onSingle = vi.fn(),
  onSeries = vi.fn(),
): { onSingle: ReturnType<typeof vi.fn>; onSeries: ReturnType<typeof vi.fn> } {
  render(
    <FluentProvider theme={webLightTheme}>
      <TaskScopeDialog
        task={task}
        action={action}
        seriesCount={3}
        onClose={() => undefined}
        onSingle={onSingle}
        onSeries={onSeries}
      />
    </FluentProvider>,
  );
  return { onSingle, onSeries };
}

describe("task scope dialog", () => {
  it("selects single or whole-series editing", () => {
    const actions = renderDialog("edit");
    expect(
      screen.getByText((_, element) => element?.tagName === "P").textContent,
    ).toContain("属于包含 3项任务的系列");
    fireEvent.click(screen.getByRole("button", { name: "编辑整个系列" }));
    expect(actions.onSeries).toHaveBeenCalledOnce();
  });

  it("requires a second confirmation before deleting a whole series", () => {
    const actions = renderDialog("delete");
    fireEvent.click(screen.getByRole("button", { name: "删除整个系列" }));
    expect(actions.onSeries).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "删除整个任务系列？" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认删除整个系列" }));
    expect(actions.onSeries).toHaveBeenCalledOnce();
  });

  it("confirms deletion directly for a non-series task", () => {
    const onSingle = vi.fn();
    render(
      <FluentProvider theme={webLightTheme}>
        <TaskScopeDialog
          task={{ ...task, repeatRule: null, series: null }}
          action="delete"
          seriesCount={1}
          onClose={() => undefined}
          onSingle={onSingle}
          onSeries={() => undefined}
        />
      </FluentProvider>,
    );
    expect(screen.getByText("确认删除“每日复习”？")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "删除任务" }));
    expect(onSingle).toHaveBeenCalledOnce();
  });
});
