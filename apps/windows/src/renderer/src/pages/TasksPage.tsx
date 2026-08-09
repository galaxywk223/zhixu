import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Field,
  Input,
  Select,
  Tooltip,
} from "@fluentui/react-components";
import {
  Add20Regular,
  Calendar20Regular,
  CheckmarkCircle20Regular,
  Clock20Regular,
  Filter20Regular,
  List20Regular,
  Search20Regular,
  Tag20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import type { TaskRecord } from "../../../preload/api-types";
import { tagTone } from "../../../shared/tag-colors";
import { EmptyState, Loading } from "../components/Page";
import { TaskTable } from "../components/TaskTable";
import { queryKeys } from "../query";
import {
  buildTaskWorkspace,
  DEFAULT_TASK_WORKSPACE_FILTERS,
  formatEstimatedMinutes,
  selectExactTaskStatus,
  selectTaskView,
  TASK_VIEW_LABELS,
  type ExactTaskStatus,
  type TaskSort,
  type TaskView,
} from "./task-workspace-model";

const quickViews: Array<{
  value: TaskView;
  icon: React.ReactNode;
}> = [
  { value: "active", icon: <Clock20Regular /> },
  { value: "all", icon: <List20Regular /> },
  { value: "overdue", icon: <Warning20Regular /> },
  { value: "today", icon: <Calendar20Regular /> },
  { value: "tomorrow", icon: <Calendar20Regular /> },
  { value: "next7days", icon: <Calendar20Regular /> },
  { value: "undated", icon: <Clock20Regular /> },
  { value: "done", icon: <CheckmarkCircle20Regular /> },
];

export function TasksPage(props: {
  onNew(): void;
  onEdit(task: TaskRecord): void;
}): React.JSX.Element {
  const client = useQueryClient();
  const tasks = useQuery({
    queryKey: queryKeys.tasks,
    queryFn: window.zhixu.tasks.list,
  });
  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: window.zhixu.tasks.categories,
  });
  const tags = useQuery({
    queryKey: queryKeys.tags,
    queryFn: window.zhixu.tasks.tags,
  });
  const [filters, setFilters] = useState({
    ...DEFAULT_TASK_WORKSPACE_FILTERS,
  });
  const [sort, setSort] = useState<TaskSort>("due");
  const [filterOpen, setFilterOpen] = useState(false);
  const status = useMutation({
    mutationFn: ({ id, value }: { id: string; value: TaskRecord["status"] }) =>
      window.zhixu.tasks.setStatus(id, value),
    onSuccess: () => client.invalidateQueries(),
  });
  const remove = useMutation({
    mutationFn: window.zhixu.tasks.remove,
    onSuccess: () => client.invalidateQueries(),
  });
  const workspace = useMemo(
    () => buildTaskWorkspace(tasks.data ?? [], filters, sort),
    [tasks.data, filters, sort],
  );
  const activeFilterCount = [
    filters.status !== "all",
    filters.categoryId !== "all",
    filters.tagId !== "all",
  ].filter(Boolean).length;

  if (tasks.isLoading) return <Loading />;

  const resetFilters = (): void => {
    setFilters({ ...DEFAULT_TASK_WORKSPACE_FILTERS });
    setSort("due");
  };

  return (
    <div className="page tasks-page">
      <header className="task-workspace-header">
        <h1>任务</h1>
        <div className="task-workspace-actions">
          <Input
            className="task-workspace-search"
            contentBefore={<Search20Regular />}
            aria-label="搜索任务"
            placeholder="搜索任务"
            value={filters.query}
            onChange={(_, data) =>
              setFilters((current) => ({ ...current, query: data.value }))
            }
          />
          <div className="task-filter-trigger">
            <Button
              appearance="secondary"
              icon={<Filter20Regular />}
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((open) => !open)}
            >
              筛选
              {activeFilterCount > 0 ? (
                <span className="active-filter-count">{activeFilterCount}</span>
              ) : null}
            </Button>
            {filterOpen ? (
              <div
                className="task-filter-popover"
                role="dialog"
                aria-label="任务筛选"
              >
                <div className="task-filter-popover-heading">
                  <strong>组合筛选</strong>
                  <button type="button" onClick={resetFilters}>
                    重置
                  </button>
                </div>
                <Field label="精确状态">
                  <Select
                    value={filters.status}
                    onChange={(event) =>
                      setFilters((current) =>
                        selectExactTaskStatus(
                          current,
                          event.target.value as ExactTaskStatus,
                        ),
                      )
                    }
                  >
                    <option value="all">全部状态</option>
                    <option value="todo">待完成</option>
                    <option value="in_progress">进行中</option>
                    <option value="done">已完成</option>
                  </Select>
                </Field>
                <Field label="分类">
                  <Select
                    value={filters.categoryId}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        categoryId: event.target.value,
                      }))
                    }
                  >
                    <option value="all">全部分类</option>
                    {(categories.data ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="标签">
                  <Select
                    value={filters.tagId}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        tagId: event.target.value,
                      }))
                    }
                  >
                    <option value="all">全部标签</option>
                    {(tags.data ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : null}
          </div>
          <Button
            appearance="primary"
            icon={<Add20Regular />}
            onClick={props.onNew}
          >
            新建任务
          </Button>
        </div>
      </header>

      <div className="task-metrics-grid" aria-label="任务指标">
        <section className="task-metric-card">
          <List20Regular />
          <div>
            <span>任务总数</span>
            <strong>{workspace.metrics.total}</strong>
          </div>
        </section>
        <section className="task-metric-card due">
          <Calendar20Regular />
          <div>
            <span>今日到期</span>
            <strong>{workspace.metrics.dueToday}</strong>
          </div>
        </section>
        <section className="task-metric-card overdue">
          <Warning20Regular />
          <div>
            <span>已逾期</span>
            <strong>{workspace.metrics.overdue}</strong>
          </div>
        </section>
        <section className="task-metric-card completed">
          <CheckmarkCircle20Regular />
          <div>
            <span>累计完成</span>
            <strong>{workspace.metrics.completed}</strong>
          </div>
        </section>
        <section className="task-metric-card progress">
          <Clock20Regular />
          <div>
            <span>进行中</span>
            <strong>{workspace.metrics.inProgress}</strong>
          </div>
        </section>
        <section className="task-metric-card estimate">
          <Clock20Regular />
          <div>
            <span>剩余预计时间</span>
            <strong>
              {formatEstimatedMinutes(
                workspace.metrics.remainingEstimatedMinutes,
              )}
            </strong>
          </div>
        </section>
      </div>

      <div className="task-workspace-layout">
        <aside className="task-filter-rail" aria-label="任务视图与标签">
          <section>
            <h2>快捷视图</h2>
            <nav aria-label="快捷视图">
              {quickViews.map((view) => (
                <button
                  type="button"
                  className={filters.view === view.value ? "active" : ""}
                  key={view.value}
                  onClick={() =>
                    setFilters((current) => selectTaskView(current, view.value))
                  }
                >
                  {view.icon}
                  <span>{TASK_VIEW_LABELS[view.value]}</span>
                  <strong>{workspace.viewCounts[view.value]}</strong>
                </button>
              ))}
            </nav>
          </section>
          <section className="task-tag-navigation">
            <h2>
              标签
              <Tooltip content="标签可在设置中维护" relationship="description">
                <Tag20Regular />
              </Tooltip>
            </h2>
            {(tags.data ?? []).length === 0 ? (
              <p>暂无标签</p>
            ) : (
              <nav aria-label="标签筛选">
                {(tags.data ?? []).map((tag) => (
                  <button
                    type="button"
                    className={filters.tagId === tag.id ? "active" : ""}
                    key={tag.id}
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        tagId: current.tagId === tag.id ? "all" : tag.id,
                      }))
                    }
                  >
                    <i data-tag-tone={tagTone(tag.name)} />
                    <span>{tag.name}</span>
                    <strong>{workspace.tagCounts[tag.id] ?? 0}</strong>
                  </button>
                ))}
              </nav>
            )}
          </section>
          <section className="task-overview">
            <h2>任务概览</h2>
            <dl>
              <div>
                <dt>总数</dt>
                <dd>{workspace.metrics.total}</dd>
              </div>
              <div>
                <dt>逾期</dt>
                <dd>{workspace.metrics.overdue}</dd>
              </div>
              <div>
                <dt>今日到期</dt>
                <dd>{workspace.metrics.dueToday}</dd>
              </div>
              <div>
                <dt>累计完成</dt>
                <dd>{workspace.metrics.completed}</dd>
              </div>
            </dl>
          </section>
        </aside>

        <section className="task-table-panel">
          <div className="task-table-toolbar">
            <div>
              <h2>{TASK_VIEW_LABELS[filters.view]}</h2>
              <span>{workspace.filteredTasks.length}</span>
            </div>
            <Field label="排序" orientation="horizontal">
              <Select
                aria-label="任务排序"
                value={sort}
                onChange={(event) => setSort(event.target.value as TaskSort)}
              >
                <option value="due">到期时间</option>
                <option value="priority">优先级</option>
                <option value="updated">最近更新</option>
              </Select>
            </Field>
          </div>
          {workspace.filteredTasks.length === 0 ? (
            <EmptyState
              title="没有符合条件的任务"
              detail="调整当前视图或筛选条件。"
              action={<Button onClick={props.onNew}>新建任务</Button>}
            />
          ) : (
            <TaskTable
              groups={workspace.groups}
              categories={categories.data ?? []}
              tags={tags.data ?? []}
              onEdit={props.onEdit}
              onStatus={(task, value) => status.mutate({ id: task.id, value })}
              onDelete={(task) => {
                if (confirm(`删除“${task.title}”？`)) remove.mutate(task.id);
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}
