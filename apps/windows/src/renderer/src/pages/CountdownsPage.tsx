import { useEffect, useRef, useState } from "react";
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
  Textarea,
} from "@fluentui/react-components";
import {
  Add20Regular,
  CalendarClock24Regular,
  Delete20Regular,
  Edit20Regular,
} from "@fluentui/react-icons";
import type { CountdownDraft } from "@zhixu/contracts";
import type { CountdownRecord } from "../../../preload/api-types";
import {
  countdownDays,
  countdownLabel,
  localDateKey,
  parseLocalDate,
  splitCountdowns,
} from "../../../shared/countdown";
import { EmptyState, Loading, PageHeader } from "../components/Page";
import { LocalDateField } from "../components/DateTimeFields";
import { queryKeys } from "../query";

export function CountdownsPage(props: {
  initialSelectedId: string | null;
}): React.JSX.Element {
  const client = useQueryClient();
  const countdowns = useQuery({
    queryKey: queryKeys.countdowns,
    queryFn: window.zhixu.countdowns.list,
  });
  const [editing, setEditing] = useState<CountdownRecord | "new" | null>(null);
  const handledInitialId = useRef<string | null>(null);
  const remove = useMutation({
    mutationFn: window.zhixu.countdowns.remove,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.countdowns }),
  });
  useEffect(() => {
    if (
      !props.initialSelectedId ||
      !countdowns.data ||
      handledInitialId.current === props.initialSelectedId
    )
      return;
    const selected = countdowns.data.find(
      (item) => item.id === props.initialSelectedId,
    );
    if (selected) {
      handledInitialId.current = props.initialSelectedId;
      setEditing(selected);
    }
  }, [countdowns.data, props.initialSelectedId]);

  if (countdowns.isLoading) return <Loading />;
  const groups = splitCountdowns(countdowns.data ?? []);
  const removeItem = (item: CountdownRecord): void => {
    if (confirm(`删除“${item.title}”？`)) remove.mutate(item.id);
  };
  return (
    <div className="page countdowns-page">
      <PageHeader
        title="倒数日"
        actions={
          <Button
            appearance="primary"
            icon={<Add20Regular />}
            onClick={() => setEditing("new")}
          >
            新建倒数日
          </Button>
        }
      />
      <div className="countdown-workspace-scroll">
        {groups.upcoming.length === 0 && groups.past.length === 0 ? (
          <EmptyState
            title="暂无倒数日"
            detail="记录考试、申请截止或其他重要日期。"
            action={
              <Button onClick={() => setEditing("new")}>新建倒数日</Button>
            }
          />
        ) : (
          <div className="countdown-sections">
            <CountdownSection
              title="即将到来"
              items={groups.upcoming}
              empty="暂无即将到来的日期"
              onEdit={setEditing}
              onDelete={removeItem}
            />
            {groups.past.length ? (
              <CountdownSection
                title="已经过去"
                items={groups.past}
                onEdit={setEditing}
                onDelete={removeItem}
              />
            ) : null}
          </div>
        )}
      </div>
      <CountdownEditor value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function CountdownSection(props: {
  title: string;
  items: CountdownRecord[];
  empty?: string;
  onEdit(item: CountdownRecord): void;
  onDelete(item: CountdownRecord): void;
}): React.JSX.Element {
  return (
    <section className="countdown-section">
      <header>
        <h2>{props.title}</h2>
        <span>{props.items.length}</span>
      </header>
      {props.items.length ? (
        <div className="countdown-grid">
          {props.items.map((item) => (
            <CountdownCard
              key={item.id}
              item={item}
              onEdit={() => props.onEdit(item)}
              onDelete={() => props.onDelete(item)}
            />
          ))}
        </div>
      ) : (
        <p className="countdown-empty">{props.empty}</p>
      )}
    </section>
  );
}

function CountdownCard(props: {
  item: CountdownRecord;
  onEdit(): void;
  onDelete(): void;
}): React.JSX.Element {
  const days = countdownDays(props.item.targetDate);
  const tone =
    days === 0
      ? "today"
      : days <= 7 && days > 0
        ? "soon"
        : days < 0
          ? "past"
          : "future";
  return (
    <article className={`countdown-card ${tone}`}>
      <div className="countdown-card-icon">
        <CalendarClock24Regular />
      </div>
      <div className="countdown-card-main">
        <strong>{props.item.title}</strong>
        <time dateTime={props.item.targetDate}>
          {parseLocalDate(props.item.targetDate).toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "short",
          })}
        </time>
        {props.item.note ? <p>{props.item.note}</p> : null}
      </div>
      <div className="countdown-value">
        {days !== 0 ? <strong>{Math.abs(days)}</strong> : null}
        <span>{countdownLabel(days)}</span>
      </div>
      <div className="countdown-actions">
        <Button
          appearance="subtle"
          icon={<Edit20Regular />}
          aria-label={`编辑${props.item.title}`}
          onClick={props.onEdit}
        />
        <Button
          appearance="subtle"
          icon={<Delete20Regular />}
          aria-label={`删除${props.item.title}`}
          onClick={props.onDelete}
        />
      </div>
    </article>
  );
}

function CountdownEditor(props: {
  value: CountdownRecord | "new" | null;
  onClose(): void;
}): React.JSX.Element {
  const client = useQueryClient();
  const record = props.value && props.value !== "new" ? props.value : null;
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState(localDateKey(new Date()));
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!props.value) return;
    setTitle(record?.title ?? "");
    setTargetDate(record?.targetDate ?? localDateKey(new Date()));
    setNote(record?.note ?? "");
  }, [props.value, record]);
  const save = useMutation({
    mutationFn: (draft: CountdownDraft) => window.zhixu.countdowns.save(draft),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.countdowns });
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
          <DialogTitle>{record ? "编辑倒数日" : "新建倒数日"}</DialogTitle>
          <DialogContent className="form-grid">
            <Field label="标题" required>
              <Input
                autoFocus
                value={title}
                onChange={(_, data) => setTitle(data.value)}
              />
            </Field>
            <Field label="日期" required>
              <LocalDateField
                ariaLabel="倒数日期"
                required
                value={targetDate}
                onChange={setTargetDate}
              />
            </Field>
            <Field label="备注">
              <Textarea
                resize="vertical"
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
              disabled={!title.trim() || !targetDate || save.isPending}
              onClick={() =>
                save.mutate({
                  id: record?.id,
                  title: title.trim(),
                  targetDate,
                  note: note.trim() || null,
                })
              }
            >
              {save.isPending ? "保存中" : "保存"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
