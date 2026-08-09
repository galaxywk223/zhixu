import { useMemo, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Checkbox, Tooltip } from "@fluentui/react-components";
import {
  Add20Regular,
  Calendar20Regular,
  CheckmarkCircle20Regular,
  ChevronLeft20Regular,
  ChevronRight20Regular,
  Clock20Regular,
  Edit20Regular,
  Timer20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import type { TaskRecord } from "../../../preload/api-types";
import { localDateKey } from "../../../shared/local-date";
import { EmptyState, Loading } from "../components/Page";
import { queryKeys } from "../query";
import {
  buildCalendarMonth,
  buildFocusWeek,
  formatWorkspaceMinutes,
  type FocusTimelineSegment,
} from "./calendar-workspace-model";

type CalendarMode = "month" | "week";

interface CalendarPageProps {
  onNewTask(initialDueDate: string): void;
  onEditTask(task: TaskRecord): void;
}

const weekLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
function formatTaskTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (
    date.getHours() === 23 &&
    date.getMinutes() === 59 &&
    date.getSeconds() === 59
  )
    return "全天";
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClockMinutes(minutes: number): string {
  if (minutes === 1440) return "24:00";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function changeMonth(value: Date, amount: number): Date {
  const targetMonth = new Date(
    value.getFullYear(),
    value.getMonth() + amount,
    1,
  );
  const lastDay = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth() + 1,
    0,
  ).getDate();
  targetMonth.setDate(Math.min(value.getDate(), lastDay));
  return targetMonth;
}

export function CalendarPage(props: CalendarPageProps): React.JSX.Element {
  const client = useQueryClient();
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [mode, setMode] = useState<CalendarMode>("month");
  const tasks = useQuery({
    queryKey: queryKeys.tasks,
    queryFn: window.zhixu.tasks.list,
  });
  const focus = useQuery({
    queryKey: queryKeys.focus,
    queryFn: window.zhixu.focus.list,
  });
  const month = useMemo(
    () => buildCalendarMonth(tasks.data ?? [], cursor, selected),
    [tasks.data, cursor, selected],
  );
  const week = useMemo(
    () => buildFocusWeek(focus.data ?? [], selected),
    [focus.data, selected],
  );
  const selectedWeekDay =
    week.days.find((day) => day.key === localDateKey(selected)) ??
    week.days[0]!;
  const status = useMutation({
    mutationFn: (input: { id: string; value: TaskRecord["status"] }) =>
      window.zhixu.tasks.setStatus(input.id, input.value),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.tasks });
      await client.invalidateQueries({ queryKey: queryKeys.summary });
    },
  });

  if (tasks.isLoading || focus.isLoading) return <Loading />;

  const changePeriod = (amount: number): void => {
    if (mode === "month") {
      const next = changeMonth(selected, amount);
      setSelected(next);
      setCursor(next);
      return;
    }
    const next = new Date(selected);
    next.setDate(next.getDate() + amount * 7);
    setSelected(next);
    setCursor(next);
  };
  const returnToday = (): void => {
    const today = new Date();
    setSelected(today);
    setCursor(today);
  };
  const selectDay = (date: Date): void => {
    setSelected(date);
    if (mode === "month" && date.getMonth() !== cursor.getMonth())
      setCursor(date);
  };
  const title =
    mode === "month"
      ? `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`
      : `${week.start.toLocaleDateString("zh-CN", { month: "long", day: "numeric" })} - ${new Date(week.end.getTime() - 1).toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}`;

  return (
    <div className="page calendar-page">
      <header className="workspace-page-header calendar-page-header">
        <h1>日历</h1>
        <div className="calendar-header-actions">
          <div className="segmented" aria-label="日历视图">
            <button
              type="button"
              className={mode === "month" ? "active" : ""}
              onClick={() => setMode("month")}
            >
              月视图
            </button>
            <button
              type="button"
              className={mode === "week" ? "active" : ""}
              onClick={() => setMode("week")}
            >
              周视图
            </button>
          </div>
          {mode === "month" ? (
            <Button
              appearance="primary"
              icon={<Add20Regular />}
              onClick={() => props.onNewTask(localDateKey(selected))}
            >
              新建任务
            </Button>
          ) : null}
        </div>
      </header>

      {mode === "month" ? (
        <div className="calendar-metrics-grid" aria-label="本月任务概览">
          <CalendarMetric
            icon={<Calendar20Regular />}
            label="任务完成"
            value={`${month.metrics.completed} / ${month.metrics.total}`}
          />
          <CalendarMetric
            icon={<CheckmarkCircle20Regular />}
            label="完成率"
            value={`${month.metrics.completionRate}%`}
            tone="success"
          />
          <CalendarMetric
            icon={<Clock20Regular />}
            label="预计时长"
            value={formatWorkspaceMinutes(month.metrics.estimatedMinutes)}
          />
          <CalendarMetric
            icon={<Warning20Regular />}
            label="高优先级待办"
            value={String(month.metrics.highPriority)}
            tone="warning"
          />
        </div>
      ) : (
        <div className="calendar-metrics-grid" aria-label="本周专注概览">
          <CalendarMetric
            icon={<Timer20Regular />}
            label="专注次数"
            value={String(week.metrics.count)}
          />
          <CalendarMetric
            icon={<Clock20Regular />}
            label="专注时长"
            value={formatWorkspaceMinutes(week.metrics.minutes)}
          />
          <CalendarMetric
            icon={<Calendar20Regular />}
            label="专注天数"
            value={String(week.metrics.focusDays)}
            tone="success"
          />
          <CalendarMetric
            icon={<Timer20Regular />}
            label="平均单次"
            value={formatWorkspaceMinutes(week.metrics.averageMinutes)}
            tone="warning"
          />
        </div>
      )}

      <div className="calendar-workspace">
        <section className="calendar-main-panel">
          <div className="calendar-toolbar">
            <Tooltip content="上一周期" relationship="label">
              <Button
                appearance="subtle"
                icon={<ChevronLeft20Regular />}
                aria-label="上一周期"
                onClick={() => changePeriod(-1)}
              />
            </Tooltip>
            <h2>{title}</h2>
            <Tooltip content="下一周期" relationship="label">
              <Button
                appearance="subtle"
                icon={<ChevronRight20Regular />}
                aria-label="下一周期"
                onClick={() => changePeriod(1)}
              />
            </Tooltip>
            <Button appearance="subtle" onClick={returnToday}>
              今天
            </Button>
          </div>
          {mode === "month" ? (
            <MonthCalendar
              days={month.days}
              selectedKey={localDateKey(selected)}
              onSelect={selectDay}
              onEdit={props.onEditTask}
            />
          ) : (
            <FocusWeekTimeline
              days={week.days}
              selectedKey={localDateKey(selected)}
              timeline={week.timeline}
              onSelect={selectDay}
            />
          )}
        </section>

        {mode === "month" ? (
          <MonthDayDetails
            date={selected}
            tasks={month.selectedTasks}
            onNew={() => props.onNewTask(localDateKey(selected))}
            onEdit={props.onEditTask}
            onStatus={(task, value) => status.mutate({ id: task.id, value })}
          />
        ) : (
          <FocusDayDetails day={selectedWeekDay} />
        )}
      </div>
    </div>
  );
}

function CalendarMetric(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "success" | "warning";
}): React.JSX.Element {
  return (
    <section className={`calendar-metric-card ${props.tone ?? ""}`}>
      {props.icon}
      <div>
        <span>{props.label}</span>
        <strong>{props.value}</strong>
      </div>
    </section>
  );
}

function MonthCalendar(props: {
  days: CalendarMonthModel["days"];
  selectedKey: string;
  onSelect(date: Date): void;
  onEdit(task: TaskRecord): void;
}): React.JSX.Element {
  return (
    <div className="month-calendar-scroll">
      <div className="month-calendar-grid" role="grid" aria-label="任务月历">
        {weekLabels.map((label) => (
          <div className="calendar-weekday" role="columnheader" key={label}>
            {label}
          </div>
        ))}
        {props.days.map((day) => (
          <article
            className={`month-day-cell ${day.inCurrentMonth ? "" : "outside"} ${day.key === props.selectedKey ? "selected" : ""}`}
            role="gridcell"
            aria-selected={day.key === props.selectedKey}
            key={day.key}
            onClick={() => props.onSelect(day.date)}
          >
            <button
              type="button"
              className={`month-day-number ${day.isToday ? "today" : ""}`}
              aria-label={day.date.toLocaleDateString("zh-CN")}
              onClick={() => props.onSelect(day.date)}
            >
              {day.date.getDate()}
            </button>
            <div className="month-day-tasks">
              {day.visibleTasks.map((task) => (
                <button
                  type="button"
                  className={`month-task-item priority-${task.priority} ${task.status === "done" ? "completed" : ""}`}
                  key={task.id}
                  title={task.title}
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onEdit(task);
                  }}
                >
                  <i />
                  <span>{task.title}</span>
                  <time>{formatTaskTime(task.dueAt)}</time>
                </button>
              ))}
              {day.hiddenTaskCount ? (
                <button
                  type="button"
                  className="month-more-tasks"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onSelect(day.date);
                  }}
                >
                  +{day.hiddenTaskCount} 项
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function MonthDayDetails(props: {
  date: Date;
  tasks: TaskRecord[];
  onNew(): void;
  onEdit(task: TaskRecord): void;
  onStatus(task: TaskRecord, status: TaskRecord["status"]): void;
}): React.JSX.Element {
  return (
    <aside className="calendar-detail-panel" aria-label="选中日期任务">
      <div className="calendar-detail-heading">
        <div>
          <span>
            {props.date.toLocaleDateString("zh-CN", { weekday: "long" })}
          </span>
          <h2>
            {props.date.toLocaleDateString("zh-CN", {
              month: "long",
              day: "numeric",
            })}
          </h2>
        </div>
        <Tooltip content="在所选日期新建任务" relationship="label">
          <Button
            appearance="subtle"
            icon={<Add20Regular />}
            aria-label="在所选日期新建任务"
            onClick={props.onNew}
          />
        </Tooltip>
      </div>
      <div className="calendar-detail-scroll">
        {props.tasks.length ? (
          <div className="calendar-task-list">
            {props.tasks.map((task) => (
              <article className="calendar-task-row" key={task.id}>
                <Checkbox
                  checked={task.status === "done"}
                  aria-label={`${task.status === "done" ? "恢复" : "完成"}${task.title}`}
                  onChange={(_, data) =>
                    props.onStatus(task, data.checked ? "done" : "todo")
                  }
                />
                <button type="button" onClick={() => props.onEdit(task)}>
                  <strong className={task.status === "done" ? "completed" : ""}>
                    {task.title}
                  </strong>
                  <span>
                    <i className={`priority-${task.priority}`} />
                    {formatTaskTime(task.dueAt)}
                  </span>
                </button>
                <Tooltip content="编辑任务" relationship="label">
                  <Button
                    appearance="subtle"
                    icon={<Edit20Regular />}
                    aria-label={`编辑${task.title}`}
                    onClick={() => props.onEdit(task)}
                  />
                </Tooltip>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="当天没有任务"
            detail="新任务会自动使用当前选中的日期。"
            action={<Button onClick={props.onNew}>新建任务</Button>}
          />
        )}
      </div>
    </aside>
  );
}

function FocusWeekTimeline(props: {
  days: FocusWeekModel["days"];
  selectedKey: string;
  timeline: FocusWeekModel["timeline"];
  onSelect(date: Date): void;
}): React.JSX.Element {
  const firstHour = props.timeline
    ? Math.ceil(props.timeline.startMinutes / 60)
    : 0;
  const lastHour = props.timeline
    ? Math.floor(props.timeline.endMinutes / 60)
    : -1;
  const hours = Array.from(
    { length: Math.max(0, lastHour - firstHour + 1) },
    (_, index) => firstHour + index,
  );
  const timelineHeight = props.timeline
    ? (props.timeline.endMinutes - props.timeline.startMinutes) *
      props.timeline.minuteScale
    : 0;
  return (
    <div className="week-timeline">
      <div className="week-timeline-header">
        <span />
        {props.days.map((day, index) => (
          <button
            type="button"
            className={`${day.key === props.selectedKey ? "selected" : ""} ${day.isToday ? "today" : ""}`}
            key={day.key}
            onClick={() => props.onSelect(day.date)}
          >
            <span>{weekLabels[index]}</span>
            <strong>{day.date.getDate()}</strong>
          </button>
        ))}
      </div>
      {!props.timeline ? (
        <EmptyState
          title="本周暂无专注记录"
          detail="导入的专注记录会按实际时间显示在周视图中。"
        />
      ) : (
        <div className="week-timeline-scroll">
          <div
            className="week-timeline-body"
            style={
              {
                height: timelineHeight,
                "--hour-height": `${props.timeline.minuteScale * 60}px`,
              } as CSSProperties
            }
          >
            <div className="week-hour-axis">
              {hours.map((hour) => (
                <time
                  key={hour}
                  style={{
                    top:
                      (hour * 60 - props.timeline!.startMinutes) *
                      props.timeline!.minuteScale,
                  }}
                >
                  {String(hour).padStart(2, "0")}:00
                </time>
              ))}
            </div>
            <div className="week-day-columns">
              {props.days.map((day) => (
                <button
                  type="button"
                  className={`week-day-column ${day.key === props.selectedKey ? "selected" : ""}`}
                  key={day.key}
                  onClick={() => props.onSelect(day.date)}
                >
                  {day.segments.map((segment) => (
                    <FocusSegment
                      key={segment.id}
                      segment={segment}
                      rangeStartMinutes={props.timeline!.startMinutes}
                      minuteScale={props.timeline!.minuteScale}
                    />
                  ))}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FocusSegment(props: {
  segment: FocusTimelineSegment;
  rangeStartMinutes: number;
  minuteScale: number;
}): React.JSX.Element {
  const top =
    (props.segment.startMinutes - props.rangeStartMinutes) * props.minuteScale;
  const height = Math.max(
    64,
    (props.segment.endMinutes - props.segment.startMinutes) * props.minuteScale,
  );
  const style = {
    top,
    height,
    "--segment-left": `${(props.segment.lane / props.segment.laneCount) * 100}%`,
    "--segment-width": `${100 / props.segment.laneCount}%`,
  } as CSSProperties;
  return (
    <span className="focus-calendar-block" style={style}>
      <strong>{props.segment.session.taskName || "未命名事项"}</strong>
      <small>
        {formatClockMinutes(props.segment.startMinutes)} -{" "}
        {formatClockMinutes(props.segment.endMinutes)}
      </small>
    </span>
  );
}

function FocusDayDetails(props: {
  day: FocusWeekModel["days"][number];
}): React.JSX.Element {
  return (
    <aside className="calendar-detail-panel" aria-label="选中日期专注记录">
      <div className="calendar-detail-heading focus-detail-heading">
        <div>
          <span>
            {props.day.date.toLocaleDateString("zh-CN", { weekday: "long" })}
          </span>
          <h2>
            {props.day.date.toLocaleDateString("zh-CN", {
              month: "long",
              day: "numeric",
            })}
          </h2>
        </div>
        <strong>{formatWorkspaceMinutes(props.day.allocatedMinutes)}</strong>
      </div>
      <div className="calendar-detail-summary">
        <span>{props.day.sessions.length} 次专注</span>
        <span>{formatWorkspaceMinutes(props.day.allocatedMinutes)}</span>
      </div>
      <div className="calendar-detail-scroll">
        {props.day.sessions.length ? (
          <div className="calendar-focus-list">
            {props.day.segments.map((segment) => (
              <article key={segment.id}>
                <div>
                  <strong>{segment.session.taskName || "未命名事项"}</strong>
                  <time>
                    {formatClockMinutes(segment.startMinutes)} -{" "}
                    {formatClockMinutes(segment.endMinutes)}
                  </time>
                </div>
                <b>
                  {formatWorkspaceMinutes(
                    segment.endMinutes - segment.startMinutes,
                  )}
                </b>
                {segment.session.reflection ? (
                  <p>{segment.session.reflection}</p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="当天没有专注记录"
            detail="番茄 TODO 导入记录会按实际时间显示。"
          />
        )}
      </div>
    </aside>
  );
}

type CalendarMonthModel = ReturnType<typeof buildCalendarMonth>;
type FocusWeekModel = ReturnType<typeof buildFocusWeek>;
