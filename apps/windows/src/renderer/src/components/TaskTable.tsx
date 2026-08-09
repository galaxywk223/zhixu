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
import type { TaskGroup } from "../../../shared/domain";
import { formatEstimatedMinutes } from "../pages/task-workspace-model";

interface TaskTableProps {
  groups: TaskGroup[];
  categories: CategoryRecord[];
  tags: TagRecord[];
  onEdit(task: TaskRecord): void;
  onStatus(task: TaskRecord, status: TaskRecord["status"]): void;
  onDelete(task: TaskRecord): void;
}

const statusLabels: Record<TaskRecord["status"], string> = {
  todo: "待完成",
  in_progress: "进行中",
  done: "已完成",
};

function priorityLabel(priority: number): string {
  if (priority >= 3) return "高";
  if (priority === 2) return "中";
  return "低";
}

function sameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatDueAt(value: string | null, now = new Date()): string {
  if (!value) return "无日期";
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return "日期异常";
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  tomorrow.setDate(tomorrow.getDate() + 1);
  const time = due.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (sameLocalDay(due, now)) return `今天 ${time}`;
  if (sameLocalDay(due, tomorrow)) return `明天 ${time}`;
  return due.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TaskTable(props: TaskTableProps): React.JSX.Element {
  const [menuTask, setMenuTask] = useState<string | null>(null);
  const categoryMap = new Map(props.categories.map((item) => [item.id, item]));
  const tagMap = new Map(props.tags.map((item) => [item.id, item]));
  const visibleGroups = props.groups.filter((group) => group.tasks.length > 0);

  return (
    <div className="task-table-scroll">
      <div className="workspace-task-table" role="table" aria-label="任务表格">
        <div className="workspace-task-head" role="row">
          <span role="columnheader" aria-label="完成状态" />
          <span role="columnheader">任务</span>
          <span role="columnheader">到期时间</span>
          <span role="columnheader">优先级</span>
          <span role="columnheader">标签</span>
          <span role="columnheader">状态</span>
          <span role="columnheader">预计时长</span>
          <span role="columnheader">操作</span>
        </div>
        {visibleGroups.map((group) => (
          <div
            className="workspace-task-group"
            role="rowgroup"
            key={group.kind}
          >
            <div className={`task-table-group-label group-${group.kind}`}>
              <strong>{group.label}</strong>
              <span>{group.tasks.length}</span>
            </div>
            {group.tasks.map((task) => {
              const category = task.categoryId
                ? categoryMap.get(task.categoryId)
                : null;
              const taskTags = task.tagIds
                .map((id) => tagMap.get(id))
                .filter((tag): tag is TagRecord => Boolean(tag));
              return (
                <div
                  className={`workspace-task-row priority-${task.priority}`}
                  role="row"
                  key={task.id}
                  onDoubleClick={() => props.onEdit(task)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenuTask(task.id);
                  }}
                >
                  <div role="cell">
                    <Checkbox
                      aria-label={
                        task.status === "done"
                          ? `将${task.title}标记为未完成`
                          : `将${task.title}标记为完成`
                      }
                      checked={task.status === "done"}
                      onChange={(_, data) =>
                        props.onStatus(task, data.checked ? "done" : "todo")
                      }
                    />
                  </div>
                  <div className="workspace-task-title" role="cell">
                    <strong
                      className={task.status === "done" ? "completed" : ""}
                    >
                      {task.title}
                    </strong>
                    <small>{category?.name ?? "未分类"}</small>
                  </div>
                  <time
                    className={
                      group.kind === "overdue" ? "task-due overdue" : "task-due"
                    }
                    role="cell"
                    dateTime={task.dueAt ?? undefined}
                  >
                    {formatDueAt(task.dueAt)}
                  </time>
                  <div role="cell">
                    <span className={`task-priority priority-${task.priority}`}>
                      {priorityLabel(task.priority)}
                    </span>
                  </div>
                  <div className="workspace-task-tags" role="cell">
                    {taskTags.length === 0 ? (
                      <span className="table-empty-value">--</span>
                    ) : (
                      <>
                        {taskTags.slice(0, 2).map((tag) => (
                          <span
                            className="workspace-task-tag"
                            key={tag.id}
                            style={{
                              borderColor: tag.colorHex,
                              color: tag.colorHex,
                            }}
                          >
                            {tag.name}
                          </span>
                        ))}
                        {taskTags.length > 2 ? (
                          <span className="task-tag-more">
                            +{taskTags.length - 2}
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                  <div role="cell">
                    <span className={`table-task-status status-${task.status}`}>
                      <i />
                      {statusLabels[task.status]}
                    </span>
                  </div>
                  <span className="task-estimate" role="cell">
                    {task.estimatedMinutes > 0
                      ? formatEstimatedMinutes(task.estimatedMinutes)
                      : "--"}
                  </span>
                  <div className="workspace-row-actions" role="cell">
                    <Tooltip content="编辑任务" relationship="label">
                      <Button
                        appearance="subtle"
                        icon={<Edit20Regular />}
                        aria-label={`编辑${task.title}`}
                        onClick={() => props.onEdit(task)}
                      />
                    </Tooltip>
                    <Tooltip content="更多操作" relationship="label">
                      <Button
                        appearance="subtle"
                        icon={<MoreHorizontal20Regular />}
                        aria-label={`${task.title}的更多操作`}
                        aria-expanded={menuTask === task.id}
                        onClick={() =>
                          setMenuTask(menuTask === task.id ? null : task.id)
                        }
                      />
                    </Tooltip>
                    {menuTask === task.id ? (
                      <div className="context-menu workspace-context-menu">
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
                        {task.status === "in_progress" ? (
                          <button
                            type="button"
                            onClick={() => {
                              props.onStatus(task, "todo");
                              setMenuTask(null);
                            }}
                          >
                            标记待完成
                          </button>
                        ) : null}
                        {task.status === "done" ? (
                          <button
                            type="button"
                            onClick={() => {
                              props.onStatus(task, "todo");
                              setMenuTask(null);
                            }}
                          >
                            恢复未完成
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
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
