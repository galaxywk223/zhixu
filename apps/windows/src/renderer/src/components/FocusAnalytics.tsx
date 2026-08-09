import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FocusWorkspaceModel } from "../pages/focus-workspace-model";
import { formatFocusMinutes } from "../pages/focus-workspace-model";

const chartColors = [
  "var(--chart-blue)",
  "var(--chart-teal)",
  "var(--chart-green)",
  "var(--chart-amber)",
  "var(--chart-coral)",
  "var(--chart-rose)",
  "var(--chart-violet)",
];

function ChartEmpty(props: { text: string }): React.JSX.Element {
  return <div className="focus-chart-empty">{props.text}</div>;
}

export function FocusAnalytics(props: {
  model: FocusWorkspaceModel;
}): React.JSX.Element {
  const { model } = props;
  const hasRangeData = model.overview.count > 0;
  return (
    <div className="focus-analytics">
      <div className="focus-analytics-grid">
        <section className="focus-chart-section subject-distribution">
          <header>
            <div>
              <h3>事项时长分布</h3>
              <span>{formatFocusMinutes(model.overview.minutes)}</span>
            </div>
          </header>
          {!hasRangeData ? (
            <ChartEmpty text="当前范围暂无专注记录" />
          ) : (
            <div className="focus-subject-chart">
              <div className="focus-pie-wrap" aria-label="事项时长分布图">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={model.subjects}
                      dataKey="minutes"
                      nameKey="name"
                      innerRadius="55%"
                      outerRadius="82%"
                      paddingAngle={2}
                      stroke="var(--surface)"
                      strokeWidth={2}
                    >
                      {model.subjects.map((item, index) => (
                        <Cell
                          key={item.name}
                          fill={chartColors[index % chartColors.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [
                        formatFocusMinutes(Number(value)),
                        "时长",
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="focus-pie-total">
                  <strong>{model.overview.count}</strong>
                  <span>次专注</span>
                </div>
              </div>
              <div className="focus-subject-legend">
                {model.subjects.map((item, index) => (
                  <div key={item.name}>
                    <i
                      style={{
                        background: chartColors[index % chartColors.length],
                      }}
                    />
                    <span title={item.name}>{item.name}</span>
                    <small>{formatFocusMinutes(item.minutes)}</small>
                    <strong>{item.percentage}%</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="focus-chart-section hour-distribution">
          <header>
            <div>
              <h3>专注时段分布</h3>
              <span>按开始时间汇总</span>
            </div>
          </header>
          {!hasRangeData ? (
            <ChartEmpty text="当前范围暂无时段数据" />
          ) : (
            <div
              className="focus-chart-canvas"
              aria-label="24 小时专注时段分布图"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={model.hours}
                  margin={{ top: 10, right: 8, left: -10, bottom: 0 }}
                >
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="hour"
                    interval={2}
                    tickFormatter={(value) =>
                      `${String(value).padStart(2, "0")}时`
                    }
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={(value) => `${value}m`}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                  />
                  <Tooltip
                    labelFormatter={(value) =>
                      `${String(value).padStart(2, "0")}:00`
                    }
                    formatter={(value) => [
                      formatFocusMinutes(Number(value)),
                      "专注时长",
                    ]}
                  />
                  <Bar
                    dataKey="minutes"
                    name="专注时长"
                    fill="var(--chart-blue)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={22}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <section className="focus-chart-section focus-total-trend">
        <header>
          <div>
            <h3>专注趋势</h3>
            <span>
              {model.trendGranularity === "day" ? "按日汇总" : "按周汇总"}
            </span>
          </div>
        </header>
        {model.trend.length === 0 ? (
          <ChartEmpty text="暂无可展示的历史趋势" />
        ) : (
          <div className="focus-trend-canvas" aria-label="当前范围专注趋势图">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={model.trend}
                margin={{ top: 18, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="focusTrendFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--chart-blue)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--chart-blue)"
                      stopOpacity={0.03}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="label"
                  minTickGap={28}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(value) => `${value}m`}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip
                  labelFormatter={(_, payload) => payload[0]?.payload.key ?? ""}
                  formatter={(value) => [
                    formatFocusMinutes(Number(value)),
                    "专注时长",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="minutes"
                  name="专注时长"
                  stroke="var(--chart-blue)"
                  strokeWidth={2.5}
                  fill="url(#focusTrendFill)"
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
