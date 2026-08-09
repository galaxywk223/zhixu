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
  Tag,
  TagPicker,
  TagPickerControl,
  TagPickerGroup,
  TagPickerInput,
  TagPickerList,
  TagPickerOption,
  Textarea,
} from "@fluentui/react-components";
import type { TaskBatchDraft, TaskDraft } from "@zhixu/contracts";
import type { TagRecord, TaskRecord } from "../../../preload/api-types";
import {
  normalizeTagName,
  tagColorHex,
  tagTone,
} from "../../../shared/tag-colors";
import { queryKeys } from "../query";
import {
  combineLocalDueAt,
  isImplicitEndOfDay,
  localDateKey,
} from "../../../shared/task-schedule";
import { LocalDateField, LocalTimeField } from "./DateTimeFields";

const CREATE_TAG_OPTION = "__create-tag__";

function dueParts(value: string | null): { date: string; time: string } {
  if (!value) return { date: localDateKey(new Date()), time: "" };
  const date = new Date(value);
  return {
    date: localDateKey(date),
    time: isImplicitEndOfDay(value)
      ? ""
      : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
  };
}

type SaveRequest =
  | { kind: "single"; draft: TaskDraft }
  | { kind: "batch"; draft: TaskBatchDraft };

interface TaskEditorProps {
  open: boolean;
  task: TaskRecord | null;
  initialDueDate?: string | null;
  onClose(): void;
}

export function TaskEditor({
  open,
  task,
  initialDueDate = null,
  onClose,
}: TaskEditorProps): React.JSX.Element {
  const client = useQueryClient();
  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: window.zhixu.tasks.categories,
  });
  const tags = useQuery({
    queryKey: queryKeys.tags,
    queryFn: window.zhixu.tasks.tags,
  });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(1);
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [creationMode, setCreationMode] = useState<"single" | "range">(
    "single",
  );
  const [rangeEnd, setRangeEnd] = useState("");
  const [frequency, setFrequency] =
    useState<TaskBatchDraft["frequency"]>("daily");
  const [estimatedMinutes, setEstimatedMinutes] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.descriptionMd ?? "");
    setPriority(task?.priority ?? 1);
    const due = task
      ? dueParts(task.dueAt)
      : { date: initialDueDate ?? localDateKey(new Date()), time: "" };
    setDueDate(due.date);
    setDueTime(due.time);
    setCreationMode("single");
    setRangeEnd(due.date);
    setFrequency("daily");
    setEstimatedMinutes(task?.estimatedMinutes ?? 0);
    setCategoryId(task?.categoryId ?? "");
    setTagIds(task?.tagIds ?? []);
    setTagQuery("");
    setError(null);
  }, [open, task, initialDueDate]);

  const save = useMutation<unknown, Error, SaveRequest>({
    mutationFn: (request: SaveRequest) =>
      request.kind === "single"
        ? window.zhixu.tasks.save(request.draft)
        : window.zhixu.tasks.createBatch(request.draft),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.tasks });
      onClose();
    },
    onError: (value) =>
      setError(value instanceof Error ? value.message : String(value)),
  });
  const createTag = useMutation({
    mutationFn: (name: string) => window.zhixu.tasks.saveTag({ name }),
  });

  const availableTags = (tags.data ?? []).filter((tag) => !tag.isArchived);
  const selectedTags = tagIds
    .map((id) => availableTags.find((tag) => tag.id === id))
    .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));
  const normalizedTagQuery = normalizeTagName(tagQuery);
  const exactTag = availableTags.find(
    (tag) => normalizeTagName(tag.name) === normalizedTagQuery,
  );
  const matchingTags = availableTags.filter(
    (tag) =>
      !tagIds.includes(tag.id) &&
      normalizeTagName(tag.name).includes(normalizedTagQuery),
  );
  const canCreateTag = normalizedTagQuery.length > 0 && !exactTag;

  const handleCreateTag = async (): Promise<void> => {
    const name = tagQuery.trim();
    if (!name || createTag.isPending) return;
    setError(null);
    try {
      const id = await createTag.mutateAsync(name);
      client.setQueryData<TagRecord[]>(queryKeys.tags, (current = []) =>
        current.some((tag) => tag.id === id)
          ? current
          : [
              ...current,
              {
                id,
                name,
                colorHex: tagColorHex(name),
                isArchived: false,
              },
            ],
      );
      setTagIds((current) =>
        current.includes(id) ? current : [...current, id],
      );
      setTagQuery("");
      void client.invalidateQueries({ queryKey: queryKeys.tags });
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    }
  };

  const submit = (): void => {
    if (!title.trim()) return setError("任务标题不能为空");
    if (!dueDate) return setError("请选择任务日期");
    setError(null);
    const common = {
      title: title.trim(),
      descriptionMd: description || null,
      priority,
      estimatedMinutes: Math.max(0, estimatedMinutes || 0),
      categoryId: categoryId || null,
      tagIds,
    };
    try {
      if (!task && creationMode === "range") {
        if (!rangeEnd) return setError("请选择结束日期");
        save.mutate({
          kind: "batch",
          draft: {
            ...common,
            startDate: dueDate,
            endDate: rangeEnd,
            time: dueTime || null,
            frequency,
          },
        });
        return;
      }
      save.mutate({
        kind: "single",
        draft: {
          ...common,
          id: task?.id,
          status: task?.status ?? "todo",
          dueAt: combineLocalDueAt(dueDate, dueTime || null),
          repeatRule: task?.repeatRule ?? null,
        },
      });
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface className="editor-dialog">
        <DialogBody>
          <DialogTitle>{task ? "编辑任务" : "新建任务"}</DialogTitle>
          <DialogContent className="form-grid">
            <section className="form-section">
              <h3>任务内容</h3>
              <Field label="标题" required>
                <Input
                  value={title}
                  onChange={(_, data) => setTitle(data.value)}
                  autoFocus
                />
              </Field>
              <Field label="说明">
                <Textarea
                  resize="vertical"
                  value={description}
                  onChange={(_, data) => setDescription(data.value)}
                />
              </Field>
            </section>
            <section className="form-section">
              <h3>时间安排</h3>
              {!task ? (
                <Field label="创建方式">
                  <div className="segmented task-creation-mode">
                    <button
                      type="button"
                      className={creationMode === "single" ? "active" : ""}
                      onClick={() => setCreationMode("single")}
                    >
                      单次
                    </button>
                    <button
                      type="button"
                      className={creationMode === "range" ? "active" : ""}
                      onClick={() => setCreationMode("range")}
                    >
                      日期范围
                    </button>
                  </div>
                </Field>
              ) : null}
              <div className="form-row two paired-row">
                <Field
                  label={
                    creationMode === "range" && !task ? "开始日期" : "日期"
                  }
                  required
                >
                  <LocalDateField
                    ariaLabel={
                      creationMode === "range" && !task ? "开始日期" : "日期"
                    }
                    required
                    value={dueDate}
                    onChange={(value) => {
                      setDueDate(value);
                      if (value && (!rangeEnd || rangeEnd < value))
                        setRangeEnd(value);
                    }}
                  />
                </Field>
                <Field label="时间（可选）">
                  <LocalTimeField
                    ariaLabel="时间（可选）"
                    optional
                    anchorDate={dueDate}
                    value={dueTime}
                    onChange={setDueTime}
                  />
                </Field>
              </div>
              {creationMode === "range" && !task ? (
                <div className="form-row two">
                  <Field label="结束日期" required>
                    <LocalDateField
                      ariaLabel="结束日期"
                      required
                      min={dueDate}
                      value={rangeEnd}
                      onChange={setRangeEnd}
                    />
                  </Field>
                  <Field label="重复频率">
                    <Select
                      value={frequency}
                      onChange={(event) =>
                        setFrequency(
                          event.target.value as TaskBatchDraft["frequency"],
                        )
                      }
                    >
                      <option value="daily">每天</option>
                      <option value="weekdays">工作日</option>
                      <option value="weekly">每周</option>
                    </Select>
                  </Field>
                </div>
              ) : null}
            </section>
            <section className="form-section">
              <h3>任务属性</h3>
              <div className="form-row two paired-row">
                <Field label="优先级">
                  <Select
                    value={priority}
                    onChange={(event) =>
                      setPriority(Number(event.target.value))
                    }
                  >
                    <option value={1}>低</option>
                    <option value={2}>中</option>
                    <option value={3}>高</option>
                  </Select>
                </Field>
                <Field label="预计分钟">
                  <Input
                    type="number"
                    min={0}
                    value={String(estimatedMinutes)}
                    onChange={(_, data) =>
                      setEstimatedMinutes(Number(data.value))
                    }
                  />
                </Field>
              </div>
              <Field label="分类">
                <Select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">未分类</option>
                  {(categories.data ?? [])
                    .filter((item) => !item.isArchived)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="任务标签" className="task-tag-field">
                <TagPicker
                  selectedOptions={tagIds}
                  disabled={createTag.isPending}
                  onOptionSelect={(_, data) => {
                    if (data.value === CREATE_TAG_OPTION) {
                      void handleCreateTag();
                      return;
                    }
                    setTagIds(
                      data.selectedOptions.filter(
                        (value) => value !== CREATE_TAG_OPTION,
                      ),
                    );
                    setTagQuery("");
                  }}
                >
                  <TagPickerControl className="task-tag-picker-control">
                    <TagPickerGroup>
                      {selectedTags.map((tag) => (
                        <Tag
                          key={tag.id}
                          value={tag.id}
                          dismissible
                          shape="rounded"
                          className="task-editor-tag"
                          data-tag-tone={tagTone(tag.name)}
                        >
                          {tag.name}
                        </Tag>
                      ))}
                    </TagPickerGroup>
                    <TagPickerInput
                      aria-label="搜索或新建标签"
                      placeholder={tagIds.length === 0 ? "搜索或新建标签" : ""}
                      value={tagQuery}
                      onChange={(event) => setTagQuery(event.target.value)}
                    />
                  </TagPickerControl>
                  <TagPickerList>
                    {matchingTags.map((tag) => (
                      <TagPickerOption
                        key={tag.id}
                        value={tag.id}
                        text={tag.name}
                        media={
                          <span
                            className="tag-tone-dot"
                            data-tag-tone={tagTone(tag.name)}
                          />
                        }
                      >
                        {tag.name}
                      </TagPickerOption>
                    ))}
                    {canCreateTag ? (
                      <TagPickerOption
                        value={CREATE_TAG_OPTION}
                        text={`新建“${tagQuery.trim()}”`}
                      >
                        新建“{tagQuery.trim()}”
                      </TagPickerOption>
                    ) : null}
                  </TagPickerList>
                </TagPicker>
              </Field>
            </section>
            {error ? <div className="error-message">{error}</div> : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              取消
            </Button>
            <Button
              appearance="primary"
              onClick={submit}
              disabled={save.isPending || createTag.isPending}
            >
              {save.isPending ? "保存中" : "保存"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
