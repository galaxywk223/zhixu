import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@fluentui/react-components";
import { Add20Regular } from "@fluentui/react-icons";
import type { TaskRecord } from "../../../preload/api-types";
import { EmptyState, Loading, PageHeader, StatCard } from "../components/Page";
import { TaskList } from "../components/TaskList";
import { queryKeys } from "../query";

export function TodayPage(props: {
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
  const status = useMutation({
    mutationFn: ({ id, value }: { id: string; value: TaskRecord["status"] }) =>
      window.zhixu.tasks.setStatus(id, value),
    onSuccess: () => client.invalidateQueries(),
  });
  const remove = useMutation({
    mutationFn: window.zhixu.tasks.remove,
    onSuccess: () => client.invalidateQueries(),
  });
  if (tasks.isLoading || summary.isLoading) return <Loading />;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const today = (tasks.data ?? []).filter(
    (task) =>
      task.status !== "done" &&
      task.dueAt &&
      Date.parse(task.dueAt) >= start.getTime() &&
      Date.parse(task.dueAt) < end.getTime(),
  );
  const upcoming = (tasks.data ?? [])
    .filter(
      (task) =>
        task.status !== "done" &&
        (!task.dueAt || Date.parse(task.dueAt) >= end.getTime()),
    )
    .slice(0, 6);
  return (
    <div className="page">
      <PageHeader
        title="今日"
        subtitle="集中查看今日任务、待处理工作量和独立专注投入。"
        actions={
          <Button
            appearance="primary"
            icon={<Add20Regular />}
            onClick={props.onNew}
          >
            添加任务
          </Button>
        }
      />
      <div className="stats-grid">
        <StatCard
          label="今日到期"
          value={summary.data?.dueToday ?? 0}
          detail={`${summary.data?.overdue ?? 0} 项逾期`}
          tone="blue"
        />
        <StatCard
          label="今日专注"
          value={`${summary.data?.focusTodayMinutes ?? 0} 分钟`}
          detail={`本周 ${summary.data?.focusWeekMinutes ?? 0} 分钟`}
          tone="green"
        />
        <StatCard
          label="进行中"
          value={summary.data?.inProgress ?? 0}
          detail={`共 ${summary.data?.taskTotal ?? 0} 项任务`}
        />
        <StatCard
          label="剩余工作量"
          value={`${summary.data?.estimatedMinutes ?? 0} 分钟`}
          detail="仅统计未完成任务"
          tone="amber"
        />
      </div>
      <section className="workspace-section">
        <div className="section-heading">
          <h2>今日待办</h2>
          <span>{today.length} 项</span>
        </div>
        {today.length ? (
          <TaskList
            tasks={today}
            categories={categories.data ?? []}
            tags={tags.data ?? []}
            onEdit={props.onEdit}
            onStatus={(task, value) => status.mutate({ id: task.id, value })}
            onDelete={(task) => {
              if (confirm(`删除“${task.title}”？`)) remove.mutate(task.id);
            }}
          />
        ) : (
          <EmptyState
            title="今天没有到期任务"
            detail="可新建任务或从近期计划中继续推进。"
            action={<Button onClick={props.onNew}>新建任务</Button>}
          />
        )}
      </section>
      <section className="workspace-section">
        <div className="section-heading">
          <h2>接下来</h2>
          <span>{upcoming.length} 项</span>
        </div>
        {upcoming.length ? (
          <TaskList
            tasks={upcoming}
            categories={categories.data ?? []}
            tags={tags.data ?? []}
            onEdit={props.onEdit}
            onStatus={(task, value) => status.mutate({ id: task.id, value })}
            onDelete={(task) => {
              if (confirm(`删除“${task.title}”？`)) remove.mutate(task.id);
            }}
          />
        ) : (
          <p className="muted">暂无后续任务</p>
        )}
      </section>
    </div>
  );
}
