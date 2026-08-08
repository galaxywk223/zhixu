import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input } from "@fluentui/react-components";
import { Add20Regular, Search20Regular } from "@fluentui/react-icons";
import type { TaskRecord } from "../../../preload/api-types";
import { groupTasks } from "../../../shared/domain";
import { EmptyState, Loading, PageHeader, StatCard } from "../components/Page";
import { TaskList } from "../components/TaskList";
import { queryKeys } from "../query";

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
  const summary = useQuery({
    queryKey: queryKeys.summary,
    queryFn: window.zhixu.dashboard.summary,
  });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const status = useMutation({
    mutationFn: ({ id, value }: { id: string; value: TaskRecord["status"] }) =>
      window.zhixu.tasks.setStatus(id, value),
    onSuccess: () => client.invalidateQueries(),
  });
  const remove = useMutation({
    mutationFn: window.zhixu.tasks.remove,
    onSuccess: () => client.invalidateQueries(),
  });
  const filtered = useMemo(
    () =>
      (tasks.data ?? []).filter((task) => {
        if (
          query &&
          !`${task.title} ${task.descriptionMd ?? ""}`
            .toLocaleLowerCase("zh-CN")
            .includes(query.toLocaleLowerCase("zh-CN"))
        )
          return false;
        if (statusFilter === "active" && task.status === "done") return false;
        if (
          !["all", "active"].includes(statusFilter) &&
          task.status !== statusFilter
        )
          return false;
        if (categoryFilter !== "all" && task.categoryId !== categoryFilter)
          return false;
        if (tagFilter !== "all" && !task.tagIds.includes(tagFilter))
          return false;
        return true;
      }),
    [tasks.data, query, statusFilter, categoryFilter, tagFilter],
  );
  if (tasks.isLoading) return <Loading />;
  const groups = groupTasks(filtered);
  return (
    <div className="page">
      <PageHeader
        title="任务"
        subtitle="按日期、状态、分类和标签组织手动待办。"
        actions={
          <Button
            appearance="primary"
            icon={<Add20Regular />}
            onClick={props.onNew}
          >
            新建任务
          </Button>
        }
      />
      <div className="stats-grid compact">
        <StatCard label="任务总数" value={summary.data?.taskTotal ?? 0} />
        <StatCard
          label="今日到期"
          value={summary.data?.dueToday ?? 0}
          tone="blue"
        />
        <StatCard
          label="已逾期"
          value={summary.data?.overdue ?? 0}
          tone="red"
        />
        <StatCard
          label="已完成"
          value={summary.data?.completed ?? 0}
          tone="green"
        />
      </div>
      <div className="filter-bar">
        <Input
          contentBefore={<Search20Regular />}
          placeholder="搜索本地任务"
          value={query}
          onChange={(_, data) => setQuery(data.value)}
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="active">未完成</option>
          <option value="all">全部状态</option>
          <option value="todo">待完成</option>
          <option value="in_progress">进行中</option>
          <option value="done">已完成</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
        >
          <option value="all">全部分类</option>
          {(categories.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
        >
          <option value="all">全部标签</option>
          {(tags.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <Button
          appearance="subtle"
          onClick={() => {
            setQuery("");
            setStatusFilter("active");
            setCategoryFilter("all");
            setTagFilter("all");
          }}
        >
          重置筛选
        </Button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="没有符合条件的任务"
          detail="调整筛选条件或创建一项新任务。"
          action={<Button onClick={props.onNew}>新建任务</Button>}
        />
      ) : (
        groups
          .filter((group) => group.tasks.length > 0)
          .map((group) => (
            <section className="task-group" key={group.kind}>
              <div className="section-heading">
                <h2>{group.label}</h2>
                <span>{group.tasks.length}</span>
              </div>
              <TaskList
                tasks={group.tasks}
                categories={categories.data ?? []}
                tags={tags.data ?? []}
                onEdit={props.onEdit}
                onStatus={(task, value) =>
                  status.mutate({ id: task.id, value })
                }
                onDelete={(task) => {
                  if (confirm(`删除“${task.title}”？`)) remove.mutate(task.id);
                }}
              />
            </section>
          ))
      )}
    </div>
  );
}
