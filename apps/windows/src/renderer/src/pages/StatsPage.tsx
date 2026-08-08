import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loading, PageHeader, StatCard } from "../components/Page";
import { queryKeys } from "../query";

export function StatsPage(): React.JSX.Element {
  const summary = useQuery({
    queryKey: queryKeys.summary,
    queryFn: window.zhixu.dashboard.summary,
  });
  if (summary.isLoading || !summary.data) return <Loading />;
  const completion = summary.data.taskTotal
    ? Math.round((summary.data.completed / summary.data.taskTotal) * 100)
    : 0;
  return (
    <div className="page">
      <PageHeader title="统计" subtitle="任务完成与专注投入采用独立口径。" />
      <div className="stats-grid">
        <StatCard label="任务完成率" value={`${completion}%`} tone="green" />
        <StatCard
          label="专注累计（本月）"
          value={`${summary.data.focusMonthMinutes} 分钟`}
          tone="blue"
        />
        <StatCard
          label="待办预计工作量"
          value={`${summary.data.estimatedMinutes} 分钟`}
        />
        <StatCard label="逾期任务" value={summary.data.overdue} tone="red" />
      </div>
      <div className="analysis-grid">
        <section className="chart-panel">
          <div className="section-heading">
            <h2>近 7 天专注</h2>
            <span>按开始日期汇总</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={summary.data.focusByDay}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => String(value).slice(5)}
              />
              <YAxis unit="m" />
              <Tooltip />
              <Bar
                dataKey="minutes"
                name="分钟"
                fill="#0f6cbd"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </section>
        <section className="chart-panel">
          <div className="section-heading">
            <h2>任务状态</h2>
            <span>仅手动任务</span>
          </div>
          <div className="status-breakdown">
            <div>
              <span>已完成</span>
              <strong>{summary.data.completed}</strong>
            </div>
            <div>
              <span>进行中</span>
              <strong>{summary.data.inProgress}</strong>
            </div>
            <div>
              <span>待处理</span>
              <strong>
                {Math.max(
                  0,
                  summary.data.taskTotal -
                    summary.data.completed -
                    summary.data.inProgress,
                )}
              </strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
