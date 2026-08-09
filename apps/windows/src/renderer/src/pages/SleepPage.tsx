import { useEffect, useState } from "react";
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
  Delete20Regular,
  Edit20Regular,
} from "@fluentui/react-icons";
import type { LifeEventRecord } from "../../../preload/api-types";
import { buildSleepRecords } from "../../../shared/domain";
import {
  combineLocalDateTime,
  localDateTimeParts,
} from "../../../shared/local-date";
import { LocalDateField, LocalTimeField } from "../components/DateTimeFields";
import { EmptyState, Loading, PageHeader, StatCard } from "../components/Page";
import { queryKeys } from "../query";

export function SleepPage(): React.JSX.Element {
  const client = useQueryClient();
  const events = useQuery({
    queryKey: queryKeys.events,
    queryFn: window.zhixu.sleep.events,
  });
  const [editing, setEditing] = useState<LifeEventRecord | "new" | null>(null);
  const remove = useMutation({
    mutationFn: window.zhixu.sleep.remove,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.events }),
  });
  if (events.isLoading) return <Loading />;
  const records = buildSleepRecords(events.data ?? []);
  const valid = records.filter(
    (record) => !record.issue && record.durationMinutes != null,
  );
  const average = valid.length
    ? Math.round(
        valid.reduce((sum, record) => sum + (record.durationMinutes ?? 0), 0) /
          valid.length,
      )
    : 0;
  const latest = valid[0];
  return (
    <div className="page sleep-page">
      <PageHeader
        title="睡眠"
        actions={
          <Button
            appearance="primary"
            icon={<Add20Regular />}
            onClick={() => setEditing("new")}
          >
            记录事件
          </Button>
        }
      />
      <div className="stats-grid">
        <StatCard
          label="最近睡眠"
          value={
            latest
              ? `${Math.floor((latest.durationMinutes ?? 0) / 60)}时${(latest.durationMinutes ?? 0) % 60}分`
              : "—"
          }
          tone="blue"
        />
        <StatCard
          label="平均时长"
          value={average ? `${(average / 60).toFixed(1)} 小时` : "—"}
        />
        <StatCard label="有效区间" value={valid.length} tone="green" />
        <StatCard
          label="待修正"
          value={records.filter((record) => record.issue).length}
          tone="amber"
        />
      </div>
      <div className="sleep-workspace">
        <section className="workspace-section sleep-panel">
          <div className="section-heading">
            <h2>睡眠记录</h2>
            <span>{records.length}</span>
          </div>
          {records.length === 0 ? (
            <EmptyState
              title="暂无睡眠记录"
              detail="导入或记录睡觉与起床事件后自动形成区间。"
            />
          ) : (
            <div className="sleep-records">
              {records.map((record, index) => (
                <div
                  key={`${record.start?.id ?? "none"}-${record.end?.id ?? index}`}
                  className={record.issue ? "invalid" : ""}
                >
                  <div>
                    <strong>
                      {record.start
                        ? new Date(record.start.occurredAt).toLocaleString(
                            "zh-CN",
                          )
                        : "缺少开始"}{" "}
                      →{" "}
                      {record.end
                        ? new Date(record.end.occurredAt).toLocaleString(
                            "zh-CN",
                          )
                        : "缺少结束"}
                    </strong>
                    <small>
                      {record.issue ??
                        `${Math.floor((record.durationMinutes ?? 0) / 60)} 小时 ${(record.durationMinutes ?? 0) % 60} 分钟`}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="workspace-section sleep-panel">
          <div className="section-heading">
            <h2>生活事件</h2>
            <span>{events.data?.length ?? 0}</span>
          </div>
          <div className="event-list">
            {(events.data ?? []).map((event) => (
              <div key={event.id}>
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
                  onClick={() => setEditing(event)}
                />
                <Button
                  appearance="subtle"
                  icon={<Delete20Regular />}
                  onClick={() => {
                    if (confirm(`删除“${event.title}”？`))
                      remove.mutate(event.id);
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
      <EventEditor value={editing} onClose={() => setEditing(null)} />
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
    if (props.value) {
      setKind(record?.kind ?? "sleep");
      setTitle(record?.title ?? "睡觉");
      const nextOccurredAt = localDateTimeParts(
        record?.occurredAt ?? new Date().toISOString(),
      );
      setOccurredDate(nextOccurredAt.date);
      setOccurredTime(nextOccurredAt.time);
      setNote(record?.note ?? "");
    }
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
              disabled={!title.trim() || !occurredDate || !occurredTime}
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
