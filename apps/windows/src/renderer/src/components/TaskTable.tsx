import { Button, Checkbox, Tooltip } from "@fluentui/react-components";
import { Delete20Regular, Edit20Regular } from "@fluentui/react-icons";
import type {
  CategoryRecord,
  TagRecord,
  TaskRecord,
} from "../../../preload/api-types";
import { tagTone } from "../../../shared/tag-colors";
import { isImplicitEndOfDay } from "../../../shared/task-schedule";
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
  if (!value) return "日期异常";
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return "日期异常";
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  tomorrow.setDate(tomorrow.getDate() + 1);
  const date = sameLocalDay(due, now)
    ? "今天"
    : sameLocalDay(due, tomorrow)
      ? "明天"
      : due.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  if (isImplicitEndOfDay(value)) return date;
  return `${date} ${due.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function TaskTable(props: TaskTableProps): React.JSX.Element {
  const categoryMap = new Map(props.categories.map((item) => [item.id, item]));
  const tagMap = new Map(props.tags.map((item) => [item.id, item]));
  const visibleGroups = props.groups.filter((group) => group.tasks.length > 0);

  return (
    <div className="task-table-scroll">
      <table className="workspace-task-table" aria-label="任务表格">
        <thead>
          <tr>
            <th scope="col" aria-label="完成状态" />
            <th scope="col">任务</th>
            <th scope="col">日期</th>
            <th scope="col">分类</th>
            <th scope="col">优先级</th>
            <th scope="col">标签</th>
            <th scope="col">预计时长</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        {visibleGroups.map((group) => (
          <tbody className="workspace-task-group" key={group.kind}>
            <tr className={`task-table-group-label group-${group.kind}`}>
              <th colSpan={8} scope="rowgroup">
                <strong>{group.label}</strong>
                <span>{group.tasks.length}</span>
              </th>
            </tr>
            {group.tasks.map((task) => {
              const category = task.categoryId
                ? categoryMap.get(task.categoryId)
                : null;
              const taskTags = task.tagIds
                .map((id) => tagMap.get(id))
                .filter((tag): tag is TagRecord => Boolean(tag));
              return (
                <tr
                  className={`workspace-task-row priority-${task.priority}`}
                  key={task.id}
                  onDoubleClick={() => props.onEdit(task)}
                >
                  <td>
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
                  </td>
                  <td className="workspace-task-title">
                    <strong
                      className={task.status === "done" ? "completed" : ""}
                    >
                      {task.title}
                    </strong>
                  </td>
                  <td>
                    <time
                      className={
                        group.kind === "overdue"
                          ? "task-due overdue"
                          : "task-due"
                      }
                      dateTime={task.dueAt ?? undefined}
                    >
                      {formatDueAt(task.dueAt)}
                    </time>
                  </td>
                  <td className="task-category">
                    {category?.name ?? "未分类"}
                  </td>
                  <td>
                    <span className={`task-priority priority-${task.priority}`}>
                      {priorityLabel(task.priority)}
                    </span>
                  </td>
                  <td>
                    <div className="workspace-task-tags">
                      {taskTags.length === 0 ? (
                        <span className="table-empty-value">--</span>
                      ) : (
                        taskTags.map((tag) => (
                          <span
                            className="workspace-task-tag"
                            key={tag.id}
                            data-tag-tone={tagTone(tag.name)}
                          >
                            {tag.name}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="task-estimate">
                    {task.estimatedMinutes > 0
                      ? formatEstimatedMinutes(task.estimatedMinutes)
                      : "--"}
                  </td>
                  <td>
                    <div className="workspace-row-actions">
                      <Tooltip content="编辑任务" relationship="label">
                        <Button
                          appearance="subtle"
                          icon={<Edit20Regular />}
                          aria-label={`编辑${task.title}`}
                          onClick={() => props.onEdit(task)}
                        />
                      </Tooltip>
                      <Tooltip content="删除任务" relationship="label">
                        <Button
                          appearance="subtle"
                          icon={<Delete20Regular />}
                          aria-label={`删除${task.title}`}
                          onClick={() => props.onDelete(task)}
                        />
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}
