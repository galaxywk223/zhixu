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
  Select,
  Textarea,
} from "@fluentui/react-components";
import {
  Add20Regular,
  Calendar20Regular,
  Clock20Regular,
  Delete20Regular,
  Edit20Regular,
  List20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LifeEventRecord } from "../../../preload/api-types";
import {
  combineLocalDateTime,
  localDateTimeParts,
} from "../../../shared/local-date";
import { LocalDateField, LocalTimeField } from "../components/DateTimeFields";
import { EmptyState, Loading } from "../components/Page";
import { queryKeys } from "../query";
import {
  buildSleepWorkspace,
  DEFAULT_SLEEP_FILTERS,
  formatSleepClock,
  formatSleepMinutes,
  SLEEP_VIEW_LABELS,
  type SleepFilters,
  type SleepView,
  type SleepWorkspaceModel,
} from "./sleep-workspace-model";

type SleepTab = "overview" | "records" | "events";

const sleepViews: Array<{ value: SleepView; icon: React.ReactNode }> = [
  { value: "last7", icon: <Calendar20Regular /> },
  { value: "last30", icon: <Calendar20Regular /> },
  { value: "all", icon: <List20Regular /> },
  { value: "custom", icon: <Calendar20Regular /> },
];

export function SleepPage(): React.JSX.Element {
  const client = useQueryClient();
  const events = useQuery({
    queryKey: queryKeys.events,
    queryFn: window.zhixu.sleep.events,
  });
  const [editing, setEditing] = useState<LifeEventRecord | "new" | null>(null);
  const [filters, setFilters] = useState<SleepFilters>({
    ...DEFAULT_SLEEP_FILTERS,
  });
  const [tab, setTab] = useState<SleepTab>("overview");
  const remove = useMutation({
    mutationFn: window.zhixu.sleep.remove,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.events }),
  });
  const model = useMemo(
    () => buildSleepWorkspace(events.data ?? [], filters),
    [events.data, filters],
  );
  if (events.isLoading) return <Loading />;

  return (
    <div className="page sleep-page">
      <header className="sleep-workspace-header">
        <h1>睡眠</h1>
        <Button
          appearance="primary"
          icon={<Add20Regular />}
          onClick={() => setEditing("new")}
        >
          记录事件
        </Button>
      </header>

      <div className="sleep-metrics-grid" aria-label="睡眠概览">
        <SleepMetric
          icon={<Calendar20Regular />}
          label="有效睡眠"
          value={`${model.metrics.validCount} 次`}
        />
        <SleepMetric
          icon={<Clock20Regular />}
          label="平均时长"
          value={formatSleepMinutes(model.metrics.averageDurationMinutes)}
        />
        <SleepMetric
          icon={<Clock20Regular />}
          label="平均入睡"
          value={formatSleepClock(model.metrics.averageBedtimeMinutes)}
        />
        <SleepMetric
          icon={<Clock20Regular />}
          label="平均起床"
          value={formatSleepClock(model.metrics.averageWakeMinutes)}
        />
        <SleepMetric
          icon={<Clock20Regular />}
          label="最近睡眠"
          value={
            model.metrics.latestDurationMinutes === null
              ? "—"
              : formatSleepMinutes(model.metrics.latestDurationMinutes)
          }
          tone="success"
        />
        <SleepMetric
          icon={<Warning20Regular />}
          label="待修正"
          value={`${model.metrics.issueCount} 条`}
          tone="warning"
        />
      </div>

      <div className="sleep-workspace-layout">
        <aside className="sleep-filter-rail">
          <div className="sleep-filter-scroll">
            <section>
              <h2>快捷视图</h2>
              <nav>
                {sleepViews.map((view) => (
                  <button
                    type="button"
                    className={filters.view === view.value ? "active" : ""}
                    key={view.value}
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        view: view.value,
                      }))
                    }
                  >
                    {view.icon}
                    <span>{SLEEP_VIEW_LABELS[view.value]}</span>
                    <strong>{model.viewCounts[view.value]}</strong>
                  </button>
                ))}
              </nav>
            </section>
            {filters.view === "custom" ? (
              <section className="sleep-custom-range">
                <Field label="开始日期">
                  <LocalDateField
                    ariaLabel="睡眠开始日期"
                    value={filters.customStart}
                    onChange={(value) =>
                      setFilters((current) => ({
                        ...current,
                        customStart: value,
                      }))
                    }
                  />
                </Field>
                <Field label="结束日期">
                  <LocalDateField
                    ariaLabel="睡眠结束日期"
                    value={filters.customEnd}
                    min={filters.customStart || undefined}
                    onChange={(value) =>
                      setFilters((current) => ({
                        ...current,
                        customEnd: value,
                      }))
                    }
                  />
                </Field>
                {model.rangeError ? (
                  <p className="sleep-range-error">{model.rangeError}</p>
                ) : null}
              </section>
            ) : null}
          </div>
          <section className="sleep-overview">
            <h2>当前范围</h2>
            <dl>
              <div>
                <dt>睡眠次数</dt>
                <dd>{model.overview.count}</dd>
              </div>
              <div>
                <dt>总时长</dt>
                <dd>{formatSleepMinutes(model.overview.totalMinutes)}</dd>
              </div>
              <div>
                <dt>平均时长</dt>
                <dd>{formatSleepMinutes(model.overview.averageMinutes)}</dd>
              </div>
              <div>
                <dt>异常记录</dt>
                <dd>{model.overview.issueCount}</dd>
              </div>
            </dl>
          </section>
        </aside>

        <section className="sleep-workspace-panel">
          <div className="sleep-workspace-toolbar">
            <div>
              <h2>{SLEEP_VIEW_LABELS[filters.view]}</h2>
              <span>{model.overview.count}</span>
            </div>
            <div className="sleep-workspace-tabs" role="tablist">
              {(
                [
                  ["overview", "数据概览"],
                  ["records", "睡眠记录"],
                  ["events", "生活事件"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  className={tab === value ? "active" : ""}
                  key={value}
                  onClick={() => setTab(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="sleep-workspace-content">
            {tab === "overview" ? <SleepAnalytics model={model} /> : null}
            {tab === "records" ? <SleepRecords model={model} /> : null}
            {tab === "events" ? (
              <SleepEvents
                events={model.events}
                onEdit={setEditing}
                onDelete={(event) => {
                  if (confirm(`删除“${event.title}”？`))
                    remove.mutate(event.id);
                }}
              />
            ) : null}
          </div>
        </section>
      </div>
      <EventEditor value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function SleepMetric(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "success" | "warning";
}): React.JSX.Element {
  return (
    <section className={`sleep-metric-card ${props.tone ?? ""}`}>
      {props.icon}
      <div>
        <span>{props.label}</span>
        <strong>{props.value}</strong>
      </div>
    </section>
  );
}

function SleepAnalytics(props: {
  model: SleepWorkspaceModel;
}): React.JSX.Element {
  if (!props.model.trend.length)
    return (
      <EmptyState
        title="当前范围暂无睡眠趋势"
        detail="完整的睡觉与起床事件会形成可视化数据。"
      />
    );
  return (
    <div className="sleep-analytics">
      <section className="sleep-chart-section sleep-schedule-chart">
        <header>
          <h3>入睡与起床时间变化</h3>
          <span>按起床日期归档</span>
        </header>
        <div className="sleep-chart-canvas" aria-label="入睡与起床时间趋势图">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={props.model.trend}
              margin={{ top: 12, right: 12, left: 2 }}
            >
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                dataKey="label"
                minTickGap={24}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(value) => formatSleepClock(Number(value))}
                tickLine={false}
                axisLine={false}
                width={54}
              />
              <Tooltip
                labelFormatter={(_, payload) => payload[0]?.payload.key ?? ""}
                formatter={(value, name) => [
                  formatSleepClock(Number(value)),
                  name === "bedtimeMinutes" ? "入睡" : "起床",
                ]}
              />
              <Line
                type="monotone"
                dataKey="bedtimeMinutes"
                name="入睡"
                stroke="var(--chart-violet)"
                strokeWidth={2.5}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="wakeMinutes"
                name="起床"
                stroke="var(--chart-amber)"
                strokeWidth={2.5}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
      <div className="sleep-analytics-grid">
        <section className="sleep-chart-section">
          <header>
            <h3>睡眠时长趋势</h3>
            <span>真实有效区间</span>
          </header>
          <div className="sleep-chart-canvas" aria-label="睡眠时长趋势图">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={props.model.trend}
                margin={{ top: 12, right: 12, left: -4 }}
              >
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="label"
                  minTickGap={22}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(value) =>
                    `${Math.round(Number(value) / 60)}h`
                  }
                  tickLine={false}
                  axisLine={false}
                  width={42}
                />
                <Tooltip
                  labelFormatter={(_, payload) => payload[0]?.payload.key ?? ""}
                  formatter={(value) => [
                    formatSleepMinutes(Number(value)),
                    "睡眠时长",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="durationMinutes"
                  name="睡眠时长"
                  stroke="var(--chart-blue)"
                  fill="var(--accentSoft)"
                  strokeWidth={2.5}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="sleep-chart-section">
          <header>
            <h3>睡眠时长分布</h3>
            <span>当前范围</span>
          </header>
          <div className="sleep-chart-canvas" aria-label="睡眠时长分布图">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={props.model.durationBuckets}
                margin={{ top: 12, right: 12, left: -18 }}
              >
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={34}
                />
                <Tooltip formatter={(value) => [`${value} 次`, "睡眠记录"]} />
                <Bar
                  dataKey="count"
                  fill="var(--chart-teal)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={38}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}

function SleepRecords(props: {
  model: SleepWorkspaceModel;
}): React.JSX.Element {
  if (!props.model.records.length)
    return (
      <EmptyState
        title="当前范围暂无睡眠记录"
        detail="完整的睡觉与起床事件会显示在这里。"
      />
    );
  return (
    <div className="sleep-record-table-wrap">
      <table className="sleep-record-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>入睡</th>
            <th>起床</th>
            <th>时长</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {props.model.records.map((record) => (
            <tr key={record.key} className={record.issue ? "invalid" : ""}>
              <td>{record.dateKey || "未知"}</td>
              <td>
                {record.start
                  ? new Date(record.start.occurredAt).toLocaleString("zh-CN")
                  : "缺少开始"}
              </td>
              <td>
                {record.end
                  ? new Date(record.end.occurredAt).toLocaleString("zh-CN")
                  : "缺少结束"}
              </td>
              <td>
                {record.durationMinutes === null
                  ? "—"
                  : formatSleepMinutes(record.durationMinutes)}
              </td>
              <td>{record.issue ?? "有效"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SleepEvents(props: {
  events: LifeEventRecord[];
  onEdit(event: LifeEventRecord): void;
  onDelete(event: LifeEventRecord): void;
}): React.JSX.Element {
  if (!props.events.length)
    return (
      <EmptyState
        title="当前范围暂无生活事件"
        detail="记录睡觉、起床或其他生活事件后会显示在这里。"
      />
    );
  return (
    <div className="sleep-event-list">
      {props.events.map((event) => (
        <article key={event.id}>
          <span className={`event-kind ${event.kind}`}>
            {event.kind === "sleep"
              ? "睡觉"
              : event.kind === "wake"
                ? "起床"
                : "其他"}
          </span>
          <div>
            <strong>{event.title}</strong>
            <small>
              {new Date(event.occurredAt).toLocaleString("zh-CN")} ·{" "}
              {event.source === "manual" ? "手动" : "番茄导入"}
            </small>
          </div>
          <Button
            appearance="subtle"
            icon={<Edit20Regular />}
            aria-label={`编辑${event.title}`}
            onClick={() => props.onEdit(event)}
          />
          <Button
            appearance="subtle"
            icon={<Delete20Regular />}
            aria-label={`删除${event.title}`}
            onClick={() => props.onDelete(event)}
          />
        </article>
      ))}
    </div>
  );
}

function EventEditor(props: {
  value: LifeEventRecord | "new" | null;
  onClose(): void;
}): React.JSX.Element {
  const client = useQueryClient();
  const record = props.value && props.value !== "new" ? props.value : null;
  const [kind, setKind] = useState<"sleep" | "wake" | "other">("sleep");
  const [title, setTitle] = useState("睡觉");
  const initialOccurredAt = localDateTimeParts(new Date().toISOString());
  const [occurredDate, setOccurredDate] = useState(initialOccurredAt.date);
  const [occurredTime, setOccurredTime] = useState(initialOccurredAt.time);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!props.value) return;
    setKind(record?.kind ?? "sleep");
    setTitle(record?.title ?? "睡觉");
    const nextOccurredAt = localDateTimeParts(
      record?.occurredAt ?? new Date().toISOString(),
    );
    setOccurredDate(nextOccurredAt.date);
    setOccurredTime(nextOccurredAt.time);
    setNote(record?.note ?? "");
  }, [props.value, record?.id]);
  const save = useMutation({
    mutationFn: window.zhixu.sleep.save,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.events });
      props.onClose();
    },
  });
  return (
    <Dialog
      open={props.value !== null}
      onOpenChange={(_, data) => {
        if (!data.open) props.onClose();
      }}
    >
      <DialogSurface className="editor-dialog">
        <DialogBody>
          <DialogTitle>{record ? "修改生活事件" : "记录生活事件"}</DialogTitle>
          <DialogContent className="form-grid">
            <div className="form-row two">
              <Field label="类型">
                <Select
                  value={kind}
                  onChange={(event) => {
                    const value = event.target.value as typeof kind;
                    setKind(value);
                    if (!record)
                      setTitle(
                        value === "sleep"
                          ? "睡觉"
                          : value === "wake"
                            ? "起床"
                            : "生活事件",
                      );
                  }}
                >
                  <option value="sleep">睡觉</option>
                  <option value="wake">起床</option>
                  <option value="other">其他</option>
                </Select>
              </Field>
              <Field label="标题">
                <Input
                  value={title}
                  onChange={(_, data) => setTitle(data.value)}
                />
              </Field>
            </div>
            <div className="form-row date-time-row">
              <Field label="日期" required>
                <LocalDateField
                  ariaLabel="事件日期"
                  required
                  value={occurredDate}
                  onChange={setOccurredDate}
                />
              </Field>
              <Field label="时间" required>
                <LocalTimeField
                  ariaLabel="事件时间"
                  anchorDate={occurredDate}
                  value={occurredTime}
                  onChange={setOccurredTime}
                />
              </Field>
            </div>
            <Field label="备注">
              <Textarea
                value={note}
                onChange={(_, data) => setNote(data.value)}
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
              disabled={
                !title.trim() ||
                !occurredDate ||
                !occurredTime ||
                save.isPending
              }
              onClick={() =>
                save.mutate({
                  id: record?.id,
                  kind,
                  title,
                  occurredAt: combineLocalDateTime(occurredDate, occurredTime),
                  note: note || null,
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
