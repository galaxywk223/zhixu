import { useEffect, useMemo, useState } from "react";
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
} from "@fluentui/react-components";
import {
  Add20Regular,
  ChevronLeft20Regular,
  ChevronRight20Regular,
  Delete20Regular,
} from "@fluentui/react-icons";
import type { ScheduleBlockRecord } from "../../../preload/api-types";
import { EmptyState, PageHeader } from "../components/Page";
import { queryKeys } from "../query";

function key(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localInput(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function CalendarPage(props: { onNewTask(): void }): React.JSX.Element {
  const client = useQueryClient();
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [mode, setMode] = useState<"month" | "week">("month");
  const [editing, setEditing] = useState<ScheduleBlockRecord | "new" | null>(
    null,
  );
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  const weekStart = new Date(selected);
  weekStart.setDate(
    selected.getDate() - (selected.getDay() === 0 ? 6 : selected.getDay() - 1),
  );
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const rangeStart = mode === "month" ? monthStart : weekStart;
  const rangeEnd = mode === "month" ? monthEnd : weekEnd;
  const tasks = useQuery({
    queryKey: queryKeys.tasks,
    queryFn: window.zhixu.tasks.list,
  });
  const blocks = useQuery({
    queryKey: queryKeys.calendar(
      rangeStart.toISOString(),
      rangeEnd.toISOString(),
    ),
    queryFn: () =>
      window.zhixu.calendar.list(
        rangeStart.toISOString(),
        rangeEnd.toISOString(),
      ),
  });
  const days = useMemo(() => {
    if (mode === "week")
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + index);
        return date;
      });
    const firstOffset = (monthStart.getDay() + 6) % 7;
    const start = new Date(monthStart);
    start.setDate(start.getDate() - firstOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      return date;
    });
  }, [mode, cursor.getFullYear(), cursor.getMonth(), key(weekStart)]);
  const remove = useMutation({
    mutationFn: window.zhixu.calendar.remove,
    onSuccess: () => client.invalidateQueries({ queryKey: ["calendar"] }),
  });
  const changePeriod = (amount: number): void => {
    if (mode === "month")
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + amount, 1));
    else {
      const next = new Date(selected);
      next.setDate(next.getDate() + amount * 7);
      setSelected(next);
    }
  };
  return (
    <div className="page">
      <PageHeader
        title="日历"
        actions={
          <>
            <div className="segmented">
              <button
                className={mode === "month" ? "active" : ""}
                onClick={() => setMode("month")}
              >
                月视图
              </button>
              <button
                className={mode === "week" ? "active" : ""}
                onClick={() => setMode("week")}
              >
                周视图
              </button>
            </div>
            <Button
              appearance="primary"
              icon={<Add20Regular />}
              onClick={() => setEditing("new")}
            >
              添加时间块
            </Button>
          </>
        }
      />
      <section className="calendar-toolbar">
        <Button
          appearance="subtle"
          icon={<ChevronLeft20Regular />}
          onClick={() => changePeriod(-1)}
        />
        <h2>
          {mode === "month"
            ? `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`
            : `${weekStart.toLocaleDateString("zh-CN")} - ${new Date(weekEnd.getTime() - 1).toLocaleDateString("zh-CN")}`}
        </h2>
        <Button
          appearance="subtle"
          icon={<ChevronRight20Regular />}
          onClick={() => changePeriod(1)}
        />
        <Button
          onClick={() => {
            setCursor(new Date());
            setSelected(new Date());
          }}
        >
          今天
        </Button>
      </section>
      <div className={`calendar-grid ${mode}`}>
        {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map(
          (label) => (
            <div className="weekday" key={label}>
              {label}
            </div>
          ),
        )}
        {days.map((day) => {
          const dayKey = key(day);
          const dayTasks = (tasks.data ?? []).filter(
            (task) => task.dueAt && key(new Date(task.dueAt)) === dayKey,
          );
          const dayBlocks = (blocks.data ?? []).filter(
            (block) => key(new Date(block.startAt)) === dayKey,
          );
          return (
            <button
              key={day.toISOString()}
              type="button"
              className={`day-cell ${key(selected) === dayKey ? "selected" : ""} ${day.getMonth() !== cursor.getMonth() && mode === "month" ? "outside" : ""}`}
              onClick={() => setSelected(day)}
            >
              <span
                className={key(new Date()) === dayKey ? "today-number" : ""}
              >
                {day.getDate()}
              </span>
              {dayTasks.slice(0, 2).map((task) => (
                <small key={task.id} className={`task-dot p${task.priority}`}>
                  {task.title}
                </small>
              ))}
              {dayBlocks.slice(0, 2).map((block) => (
                <small
                  key={block.id}
                  className="block-dot"
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    setEditing(block);
                  }}
                >
                  {new Date(block.startAt).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  {block.title}
                </small>
              ))}
            </button>
          );
        })}
      </div>
      <section className="workspace-section">
        <div className="section-heading">
          <h2>{selected.toLocaleDateString("zh-CN")} 安排</h2>
          <Button appearance="subtle" onClick={props.onNewTask}>
            添加任务
          </Button>
        </div>
        {(blocks.data ?? [])
          .filter((block) => key(new Date(block.startAt)) === key(selected))
          .map((block) => (
            <div className="schedule-row" key={block.id}>
              <span style={{ background: block.colorHex }} />
              <time>
                {new Date(block.startAt).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                -{" "}
                {new Date(block.endAt).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <strong>{block.title}</strong>
              <Button appearance="subtle" onClick={() => setEditing(block)}>
                编辑
              </Button>
              <Button
                appearance="subtle"
                icon={<Delete20Regular />}
                onClick={() => {
                  if (confirm(`删除“${block.title}”？`))
                    remove.mutate(block.id);
                }}
              />
            </div>
          ))}
        {(blocks.data ?? []).filter(
          (block) => key(new Date(block.startAt)) === key(selected),
        ).length === 0 ? (
          <EmptyState
            title="没有时间块"
            detail="任务截止时间仍会显示在上方日历中。"
          />
        ) : null}
      </section>
      <ScheduleEditor
        value={editing}
        selected={selected}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function ScheduleEditor(props: {
  value: ScheduleBlockRecord | "new" | null;
  selected: Date;
  onClose(): void;
}): React.JSX.Element {
  const client = useQueryClient();
  const value = props.value && props.value !== "new" ? props.value : null;
  const startDefault = new Date(props.selected);
  startDefault.setHours(9, 0, 0, 0);
  const endDefault = new Date(startDefault);
  endDefault.setHours(10);
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState(
    localInput(startDefault.toISOString()),
  );
  const [endAt, setEndAt] = useState(localInput(endDefault.toISOString()));
  const [color, setColor] = useState("#2563EB");
  const open = props.value !== null;
  useEffect(() => {
    if (!open) return;
    setTitle(value?.title ?? "");
    setStartAt(localInput(value?.startAt ?? startDefault.toISOString()));
    setEndAt(localInput(value?.endAt ?? endDefault.toISOString()));
    setColor(value?.colorHex ?? "#2563EB");
  }, [open, props.value, props.selected]);
  const save = useMutation({
    mutationFn: window.zhixu.calendar.save,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["calendar"] });
      props.onClose();
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => {
        if (!data.open) props.onClose();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{value ? "编辑时间块" : "新建时间块"}</DialogTitle>
          <DialogContent className="form-grid">
            <Field label="标题">
              <Input
                value={title}
                onChange={(_, data) => setTitle(data.value)}
              />
            </Field>
            <div className="form-row two">
              <Field label="开始">
                <input
                  className="native-control"
                  type="datetime-local"
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                />
              </Field>
              <Field label="结束">
                <input
                  className="native-control"
                  type="datetime-local"
                  value={endAt}
                  onChange={(event) => setEndAt(event.target.value)}
                />
              </Field>
            </div>
            <Field label="颜色">
              <input
                className="native-control color-control"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </Field>
            {save.error ? (
              <p className="error-message">{String(save.error)}</p>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={props.onClose}>取消</Button>
            <Button
              appearance="primary"
              disabled={!title.trim()}
              onClick={() =>
                save.mutate({
                  id: value?.id,
                  title,
                  taskId: value?.taskId ?? null,
                  startAt: new Date(startAt).toISOString(),
                  endAt: new Date(endAt).toISOString(),
                  isAllDay: false,
                  colorHex: color,
                })
              }
            >
              保存
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
