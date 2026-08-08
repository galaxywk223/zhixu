import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@fluentui/react-components";
import type { TaskDraft } from "@zhixu/contracts";
import type { TaskRecord } from "../../../preload/api-types";
import { queryKeys } from "../query";

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
            <Label required>标题</Label>
            <Input
              value={title}
              onChange={(_, data) => setTitle(data.value)}
              autoFocus
            />
            <Label>说明</Label>
            <Textarea
              resize="vertical"
              value={description}
              onChange={(_, data) => setDescription(data.value)}
            />
            <div className="form-row three">
              <label>
                状态
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as TaskRecord["status"])
                  }
                >
                  <option value="todo">待完成</option>
                  <option value="in_progress">进行中</option>
                  <option value="done">已完成</option>
                </select>
              </label>
              <label>
                优先级
                <select
                  value={priority}
                  onChange={(event) => setPriority(Number(event.target.value))}
                >
                  <option value={1}>低</option>
                  <option value={2}>中</option>
                  <option value={3}>高</option>
                </select>
              </label>
              <label>
                预计分钟
                <input
                  type="number"
                  min="0"
                  value={estimatedMinutes}
                  onChange={(event) =>
                    setEstimatedMinutes(Number(event.target.value))
                  }
                />
              </label>
            </div>
            <div className="form-row two">
              <label>
                到期时间
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </label>
              <label>
                分类
                <select
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
                </select>
              </label>
            </div>
            <fieldset className="tag-fieldset">
              <legend>标签</legend>
              {(tags.data ?? [])
                .filter((tag) => !tag.isArchived)
                .map((tag) => (
                  <Checkbox
                    key={tag.id}
                    checked={tagIds.includes(tag.id)}
                    label={tag.name}
                    onChange={(_, data) =>
                      setTagIds((current) =>
                        data.checked
                          ? [...current, tag.id]
                          : current.filter((id) => id !== tag.id),
                      )
                    }
                  />
                ))}
              {(tags.data ?? []).length === 0 ? (
                <span className="muted">可在设置页创建标签</span>
              ) : null}
            </fieldset>
            {error ? <div className="error-message">{error}</div> : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              取消
            </Button>
            <Button
              appearance="primary"
              onClick={submit}
              disabled={save.isPending}
            >
              {save.isPending ? "保存中" : "保存"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
