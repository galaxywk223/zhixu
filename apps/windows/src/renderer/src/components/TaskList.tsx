import { useState } from "react";
import { Button, Checkbox, Tooltip } from "@fluentui/react-components";
import {
  Delete20Regular,
  Edit20Regular,
  MoreHorizontal20Regular,
} from "@fluentui/react-icons";
import type {
  CategoryRecord,
  TagRecord,
  TaskRecord,
} from "../../../preload/api-types";
import { tagTone } from "../../../shared/tag-colors";

interface TaskListProps {
  tasks: TaskRecord[];
  categories: CategoryRecord[];
  tags: TagRecord[];
  onEdit(task: TaskRecord): void;
  onStatus(task: TaskRecord, status: TaskRecord["status"]): void;
  onDelete(task: TaskRecord): void;
}

export function TaskList(props: TaskListProps): React.JSX.Element {
  const [menuTask, setMenuTask] = useState<string | null>(null);
  const categoryMap = new Map(props.categories.map((item) => [item.id, item]));
  const tagMap = new Map(props.tags.map((item) => [item.id, item]));
  return (
    <div className="task-list" role="table" aria-label="任务列表">
      {props.tasks.map((task) => (
        <div
          key={task.id}
          className={`task-row priority-${task.priority}`}
          role="row"
          onDoubleClick={() => props.onEdit(task)}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenuTask(task.id);
          }}
        >
          <Checkbox
            aria-label={task.status === "done" ? "标记为未完成" : "标记为完成"}
            checked={task.status === "done"}
            onChange={(_, data) =>
              props.onStatus(task, data.checked ? "done" : "todo")
            }
          />
          <div className="task-main">
            <strong className={task.status === "done" ? "completed" : ""}>
              {task.title}
            </strong>
            <div className="task-meta">
              <span className={`status status-${task.status}`}>
                {task.status === "todo"
                  ? "待完成"
                  : task.status === "in_progress"
                    ? "进行中"
                    : "已完成"}
              </span>
              {task.categoryId && categoryMap.get(task.categoryId) ? (
                <span>{categoryMap.get(task.categoryId)?.name}</span>
              ) : null}
              {task.dueAt ? (
                <time>
                  {new Date(task.dueAt).toLocaleString("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              ) : (
                <span>无日期</span>
              )}
              {task.estimatedMinutes > 0 ? (
                <span>{task.estimatedMinutes} 分钟</span>
              ) : null}
            </div>
          </div>
          <div className="task-tags">
            {task.tagIds
              .slice(0, 3)
              .map((id) => tagMap.get(id))
              .filter(Boolean)
              .map((tag) => (
                <span key={tag!.id} data-tag-tone={tagTone(tag!.name)}>
                  {tag!.name}
                </span>
              ))}
          </div>
          <div className="row-actions">
            <Tooltip content="编辑" relationship="label">
              <Button
                appearance="subtle"
                icon={<Edit20Regular />}
                onClick={() => props.onEdit(task)}
              />
            </Tooltip>
            <Tooltip content="更多操作" relationship="label">
              <Button
                appearance="subtle"
                icon={<MoreHorizontal20Regular />}
                onClick={() =>
                  setMenuTask(menuTask === task.id ? null : task.id)
                }
              />
            </Tooltip>
            {menuTask === task.id ? (
              <div className="context-menu">
                {task.status === "todo" ? (
                  <button
                    type="button"
                    onClick={() => {
                      props.onStatus(task, "in_progress");
                      setMenuTask(null);
                    }}
                  >
                    标记进行中
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    props.onEdit(task);
                    setMenuTask(null);
                  }}
                >
                  <Edit20Regular />
                  编辑
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    props.onDelete(task);
                    setMenuTask(null);
                  }}
                >
                  <Delete20Regular />
                  删除
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
