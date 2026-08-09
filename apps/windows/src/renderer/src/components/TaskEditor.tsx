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
import type { TaskDraft } from "@zhixu/contracts";
import type { TagRecord, TaskRecord } from "../../../preload/api-types";
import {
  normalizeTagName,
  tagColorHex,
  tagTone,
} from "../../../shared/tag-colors";
import { queryKeys } from "../query";

const CREATE_TAG_OPTION = "__create-tag__";

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

interface TaskEditorProps {
  open: boolean;
  task: TaskRecord | null;
  onClose(): void;
}

export function TaskEditor({
  open,
  task,
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
  const [status, setStatus] = useState<TaskRecord["status"]>("todo");
  const [priority, setPriority] = useState(1);
  const [dueAt, setDueAt] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.descriptionMd ?? "");
    setStatus(task?.status ?? "todo");
    setPriority(task?.priority ?? 1);
    setDueAt(toLocalInput(task?.dueAt ?? null));
    setEstimatedMinutes(task?.estimatedMinutes ?? 0);
    setCategoryId(task?.categoryId ?? "");
    setTagIds(task?.tagIds ?? []);
    setTagQuery("");
    setError(null);
  }, [open, task]);

  const save = useMutation({
    mutationFn: (draft: TaskDraft) => window.zhixu.tasks.save(draft),
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
    save.mutate({
      id: task?.id,
      title: title.trim(),
      descriptionMd: description || null,
      status,
      priority,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      estimatedMinutes: Math.max(0, estimatedMinutes || 0),
      categoryId: categoryId || null,
      repeatRule: null,
      tagIds,
    });
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
            <div className="form-row three">
              <Field label="状态">
                <Select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as TaskRecord["status"])
                  }
                >
                  <option value="todo">待完成</option>
                  <option value="in_progress">进行中</option>
                  <option value="done">已完成</option>
                </Select>
              </Field>
              <Field label="优先级">
                <Select
                  value={priority}
                  onChange={(event) => setPriority(Number(event.target.value))}
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
            <div className="form-row two">
              <Field label="到期时间">
                <input
                  className="native-control"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </Field>
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
            </div>
            <Field label="标签" className="task-tag-field">
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
