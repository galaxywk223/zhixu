import { useEffect, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Switch,
  Textarea,
} from "@fluentui/react-components";
import {
  ArrowUpload20Regular,
  Calendar20Regular,
  Filter20Regular,
  Money20Regular,
  ReceiptMoney20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FinanceCategory, FinancePlatform } from "../../../shared/finance";
import {
  FINANCE_CATEGORIES,
  financeImpactReasonLabel,
  financePlatformLabel,
} from "../../../shared/finance";
import type {
  FinanceImportPreview,
  FinanceQuery,
  FinanceTrendGranularity,
  FinanceTransactionRecord,
} from "../../../preload/api-types";
import { LocalDateField } from "../components/DateTimeFields";
import { EmptyState, Loading } from "../components/Page";
import { queryKeys } from "../query";
import { useImeSearch } from "../use-ime-search";
import {
  loadFinanceFilters,
  saveFinanceFilters,
} from "../workspace-view-preferences";
import {
  defaultFinanceFilters,
  financeImpactTone,
  financeQueryForFilters,
  financeTrendGranularityForFilters,
  FINANCE_VIEW_LABELS,
  formatFinanceCents,
  type FinanceFilters,
} from "./finance-workspace-model";

type FinanceTab = "overview" | "records" | "batches";

interface FinancePageProps {
  preview: FinanceImportPreview | null;
  onPreviewChange(preview: FinanceImportPreview | null): void;
}

interface DetailEditorState {
  record: FinanceTransactionRecord;
  note: string;
}

const financeViews: FinanceFilters["view"][] = [
  "today",
  "week",
  "month",
  "year",
  "all",
  "custom",
];
const financeTrendGranularities: FinanceTrendGranularity[] = [
  "day",
  "week",
  "month",
];
const financeTrendGranularityLabels: Record<FinanceTrendGranularity, string> = {
  day: "日",
  week: "周",
  month: "月",
};

function yuanInput(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100)
    : undefined;
}

function dateTimeLabel(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function FinancePage({
  preview,
  onPreviewChange,
}: FinancePageProps): React.JSX.Element {
  const client = useQueryClient();
  const [filters, setFilters] = useState<FinanceFilters>(() =>
    loadFinanceFilters(defaultFinanceFilters()),
  );
  const [tab, setTab] = useState<FinanceTab>("overview");
  const search = useImeSearch();
  const [platform, setPlatform] = useState<FinancePlatform | "all">("all");
  const [category, setCategory] = useState<FinanceCategory | "all">("all");
  const [inclusion, setInclusion] = useState<"all" | "included" | "excluded">(
    "all",
  );
  const [impact, setImpact] =
    useState<NonNullable<FinanceQuery["impact"]>>("all");
  const [status, setStatus] = useState("all");
  const [rawType, setRawType] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sort, setSort] =
    useState<NonNullable<FinanceQuery["sort"]>>("time_desc");
  const [detail, setDetail] = useState<DetailEditorState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trendGranularity = financeTrendGranularityForFilters(filters);

  useEffect(() => saveFinanceFilters(filters), [filters]);

  const query = useMemo(
    () =>
      financeQueryForFilters(filters, {
        search: search.query || undefined,
        platforms: platform === "all" ? undefined : [platform],
        categories: category === "all" ? undefined : [category],
        inclusion,
        impact,
        statuses: status === "all" ? undefined : [status],
        types: rawType === "all" ? undefined : [rawType],
        paymentMethods: paymentMethod === "all" ? undefined : [paymentMethod],
        minAmountCents: yuanInput(minAmount),
        maxAmountCents: yuanInput(maxAmount),
        sort,
      }),
    [
      category,
      filters,
      inclusion,
      impact,
      maxAmount,
      minAmount,
      paymentMethod,
      platform,
      rawType,
      search.query,
      sort,
      status,
    ],
  );
  const finance = useInfiniteQuery({
    queryKey: [...queryKeys.finance, query],
    queryFn: ({ pageParam }) =>
      window.zhixu.finance.list({ ...query, cursor: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: (previousData) => previousData,
  });
  const batches = useQuery({
    queryKey: queryKeys.financeBatches,
    queryFn: window.zhixu.finance.batches,
  });
  const previewImport = useMutation({
    mutationFn: window.zhixu.finance.preview,
    onSuccess: (value) => {
      setError(null);
      if (value) onPreviewChange(value);
    },
    onError: (value) => setError(String(value)),
  });
  const confirmImport = useMutation({
    mutationFn: window.zhixu.finance.confirm,
    onSuccess: async (result) => {
      onPreviewChange(null);
      setError(null);
      setMessage(
        `导入完成：新增 ${result.importedCount} 条，重复 ${result.duplicateCount} 条，全部有效记录已开启`,
      );
      setTab("records");
      await client.invalidateQueries({ queryKey: queryKeys.finance });
      await client.invalidateQueries({ queryKey: queryKeys.financeBatches });
    },
    onError: (value) => setError(String(value)),
  });
  const updateRecord = useMutation({
    mutationFn: window.zhixu.finance.update,
    onSuccess: async () => {
      setDetail(null);
      await client.invalidateQueries({ queryKey: queryKeys.finance });
    },
    onError: (value) => setError(String(value)),
  });

  if (!finance.data && finance.isLoading) return <Loading />;
  if (!finance.data && finance.isError)
    return <div className="error-message">{String(finance.error)}</div>;
  const data = finance.data!.pages[0]!;
  const records = finance.data!.pages.flatMap((page) => page.records);
  const activeFilterCount = [
    platform !== "all",
    category !== "all",
    inclusion !== "all",
    impact !== "all",
    status !== "all",
    rawType !== "all",
    paymentMethod !== "all",
    Boolean(minAmount),
    Boolean(maxAmount),
    sort !== "time_desc",
  ].filter(Boolean).length;
  const resetFilters = (): void => {
    setPlatform("all");
    setCategory("all");
    setInclusion("all");
    setImpact("all");
    setStatus("all");
    setRawType("all");
    setPaymentMethod("all");
    setMinAmount("");
    setMaxAmount("");
    setSort("time_desc");
  };

  return (
    <div className="page focus-page finance-page">
      <header className="focus-workspace-header">
        <h1>消费</h1>
        <Button
          appearance="primary"
          icon={<ArrowUpload20Regular />}
          onClick={() => previewImport.mutate()}
          disabled={previewImport.isPending}
        >
          导入账单
        </Button>
      </header>

      <div
        className="focus-metrics-grid finance-metrics-grid"
        aria-label="消费指标"
      >
        {[
          [
            "当前净消费",
            formatFinanceCents(data.metrics.netCents),
            <Money20Regular />,
          ],
          [
            "已计入记录",
            String(data.metrics.includedCount),
            <ReceiptMoney20Regular />,
          ],
          [
            "消费天数",
            String(data.metrics.consumptionDays),
            <Calendar20Regular />,
          ],
          [
            "日均净消费",
            formatFinanceCents(data.metrics.dailyAverageCents),
            <Money20Regular />,
          ],
          [
            "本月净消费",
            formatFinanceCents(data.metrics.monthNetCents),
            <Calendar20Regular />,
          ],
          [
            "今日净消费",
            formatFinanceCents(data.metrics.todayNetCents),
            <Money20Regular />,
          ],
        ].map(([label, value, icon]) => (
          <section
            className="focus-metric-card finance-metric-card"
            key={String(label)}
          >
            {icon}
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </section>
        ))}
      </div>

      <div className="focus-workspace-layout finance-workspace-layout">
        <aside className="focus-filter-rail finance-filter-rail">
          <div className="focus-filter-scroll finance-filter-scroll">
            <section>
              <h2>快捷视图</h2>
              <nav>
                {financeViews.map((view) => (
                  <button
                    key={view}
                    type="button"
                    className={filters.view === view ? "active" : ""}
                    onClick={() =>
                      setFilters((current) => ({ ...current, view }))
                    }
                  >
                    <Calendar20Regular />
                    <span>{FINANCE_VIEW_LABELS[view]}</span>
                    <strong>{data.viewCounts[view]}</strong>
                  </button>
                ))}
              </nav>
            </section>
            {filters.view === "custom" ? (
              <section className="focus-custom-range">
                <Field label="开始日期">
                  <LocalDateField
                    value={filters.customStart}
                    ariaLabel="消费开始日期"
                    onChange={(customStart) =>
                      setFilters((current) => ({ ...current, customStart }))
                    }
                  />
                </Field>
                <Field label="结束日期">
                  <LocalDateField
                    value={filters.customEnd}
                    ariaLabel="消费结束日期"
                    onChange={(customEnd) =>
                      setFilters((current) => ({ ...current, customEnd }))
                    }
                  />
                </Field>
                {data.rangeError ? (
                  <p className="focus-range-error">{data.rangeError}</p>
                ) : null}
              </section>
            ) : null}
          </div>
          <section className="focus-overview finance-overview">
            <h2>当前范围</h2>
            <dl>
              <div>
                <dt>记录</dt>
                <dd>{data.totalCount}</dd>
              </div>
              <div>
                <dt>净消费</dt>
                <dd>{formatFinanceCents(data.metrics.netCents)}</dd>
              </div>
              <div>
                <dt>消费天数</dt>
                <dd>{data.metrics.consumptionDays}</dd>
              </div>
              <div>
                <dt>平台</dt>
                <dd>
                  {
                    data.overview.platforms.filter(
                      (item) => item.impactCents !== 0,
                    ).length
                  }
                </dd>
              </div>
            </dl>
          </section>
        </aside>

        <section className="focus-workspace-panel finance-workspace-panel">
          <header className="focus-workspace-toolbar finance-workspace-toolbar">
            <div>
              <h2>
                {tab === "overview"
                  ? "数据概览"
                  : tab === "records"
                    ? "交易明细"
                    : "导入记录"}
              </h2>
              <span>{data.totalCount}</span>
            </div>
            <div className="finance-toolbar-actions">
              {tab === "records" ? (
                <>
                  <Input
                    className="finance-search"
                    contentBefore={<Search20Regular />}
                    placeholder="搜索对方、商品或备注"
                    value={search.value}
                    onChange={(_, data) => search.change(data.value)}
                    onCompositionStart={search.compositionStart}
                    onCompositionEnd={(event) =>
                      search.compositionEnd(event.currentTarget.value)
                    }
                  />
                  <Popover positioning="below-end" trapFocus>
                    <PopoverTrigger disableButtonEnhancement>
                      <Button icon={<Filter20Regular />}>
                        筛选{activeFilterCount ? ` ${activeFilterCount}` : ""}
                      </Button>
                    </PopoverTrigger>
                    <PopoverSurface className="finance-filter-popover">
                      <div className="finance-filter-heading">
                        <strong>筛选与排序</strong>
                        <Button appearance="subtle" onClick={resetFilters}>
                          重置
                        </Button>
                      </div>
                      <div className="finance-filter-grid">
                        <Field label="平台">
                          <select
                            value={platform}
                            onChange={(event) =>
                              setPlatform(
                                event.target.value as FinancePlatform | "all",
                              )
                            }
                          >
                            <option value="all">全部平台</option>
                            <option value="wechat">微信</option>
                            <option value="alipay">支付宝</option>
                          </select>
                        </Field>
                        <Field label="是否计入">
                          <select
                            value={inclusion}
                            onChange={(event) =>
                              setInclusion(
                                event.target.value as typeof inclusion,
                              )
                            }
                          >
                            <option value="all">全部记录</option>
                            <option value="included">已计入</option>
                            <option value="excluded">未计入</option>
                          </select>
                        </Field>
                        <Field label="分类">
                          <select
                            value={category}
                            onChange={(event) =>
                              setCategory(
                                event.target.value as FinanceCategory | "all",
                              )
                            }
                          >
                            <option value="all">全部分类</option>
                            {FINANCE_CATEGORIES.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="净消费影响">
                          <select
                            value={impact}
                            onChange={(event) =>
                              setImpact(
                                event.target.value as NonNullable<
                                  FinanceQuery["impact"]
                                >,
                              )
                            }
                          >
                            <option value="all">全部影响</option>
                            <option value="positive">正数</option>
                            <option value="negative">负数</option>
                            <option value="zero">零影响</option>
                          </select>
                        </Field>
                        <Field label="状态">
                          <select
                            value={status}
                            onChange={(event) => setStatus(event.target.value)}
                          >
                            <option value="all">全部状态</option>
                            {data.facets.statuses.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="交易类型">
                          <select
                            value={rawType}
                            onChange={(event) => setRawType(event.target.value)}
                          >
                            <option value="all">全部类型</option>
                            {data.facets.types.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="支付方式">
                          <select
                            value={paymentMethod}
                            onChange={(event) =>
                              setPaymentMethod(event.target.value)
                            }
                          >
                            <option value="all">全部方式</option>
                            {data.facets.paymentMethods.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="最小金额（元）">
                          <Input
                            type="number"
                            min="0"
                            value={minAmount}
                            onChange={(_, value) => setMinAmount(value.value)}
                          />
                        </Field>
                        <Field label="最大金额（元）">
                          <Input
                            type="number"
                            min="0"
                            value={maxAmount}
                            onChange={(_, value) => setMaxAmount(value.value)}
                          />
                        </Field>
                        <Field label="排序">
                          <select
                            value={sort}
                            onChange={(event) =>
                              setSort(event.target.value as typeof sort)
                            }
                          >
                            <option value="time_desc">时间从新到旧</option>
                            <option value="time_asc">时间从旧到新</option>
                            <option value="amount_desc">金额从高到低</option>
                            <option value="amount_asc">金额从低到高</option>
                          </select>
                        </Field>
                      </div>
                    </PopoverSurface>
                  </Popover>
                </>
              ) : null}
              <div
                className="focus-workspace-tabs"
                role="tablist"
                aria-label="消费视图"
              >
                {(
                  [
                    ["overview", "数据概览"],
                    ["records", "交易明细"],
                    ["batches", "导入记录"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={tab === value ? "active" : ""}
                    onClick={() => setTab(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </header>

          <div className="focus-workspace-content finance-workspace-content">
            {message ? <p className="finance-message">{message}</p> : null}
            {error ? <p className="error-message">{error}</p> : null}
            {finance.isError ? (
              <p className="error-message">{String(finance.error)}</p>
            ) : null}
            {tab === "overview" ? (
              data.totalCount === 0 ? (
                <EmptyState
                  title="当前范围暂无消费记录"
                  detail="导入微信或支付宝账单后即可查看净消费趋势。"
                />
              ) : (
                <div className="finance-analytics-grid">
                  <section className="finance-chart-section finance-trend-chart">
                    <header>
                      <div className="finance-chart-heading">
                        <h3>
                          净消费趋势（按
                          {financeTrendGranularityLabels[trendGranularity]}）
                        </h3>
                        <span>
                          {data.range.start && data.range.end
                            ? `${data.range.start} 至 ${data.range.end} · `
                            : ""}
                          支出为正，退款和收入为负
                        </span>
                      </div>
                      <div
                        className="finance-trend-granularity"
                        role="group"
                        aria-label="趋势汇总方式"
                      >
                        {financeTrendGranularities.map((granularity) => (
                          <button
                            key={granularity}
                            type="button"
                            className={
                              trendGranularity === granularity ? "active" : ""
                            }
                            aria-pressed={trendGranularity === granularity}
                            aria-label={`按${financeTrendGranularityLabels[granularity]}汇总`}
                            onClick={() =>
                              setFilters((current) => ({
                                ...current,
                                trendGranularityByView: {
                                  ...current.trendGranularityByView,
                                  [current.view]: granularity,
                                },
                              }))
                            }
                          >
                            {financeTrendGranularityLabels[granularity]}
                          </button>
                        ))}
                      </div>
                    </header>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart
                        data={data.overview.trend}
                        margin={{ top: 8, right: 12, bottom: 8, left: 6 }}
                      >
                        <CartesianGrid
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: "var(--muted)", fontSize: 12 }}
                          minTickGap={22}
                        />
                        <YAxis
                          tickFormatter={(value) =>
                            `¥${Math.round(Number(value) / 100)}`
                          }
                          tick={{ fill: "var(--muted)", fontSize: 12 }}
                          width={58}
                        />
                        <ChartTooltip
                          formatter={(value) =>
                            formatFinanceCents(Number(value))
                          }
                        />
                        <Line
                          type="monotone"
                          dataKey="impactCents"
                          stroke="var(--accent)"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </section>
                  <section className="finance-chart-section">
                    <header>
                      <h3>分类净消费</h3>
                      <span>按统一分类汇总</span>
                    </header>
                    <ResponsiveContainer
                      width="100%"
                      height={Math.max(
                        240,
                        data.overview.categories.length * 34,
                      )}
                    >
                      <BarChart
                        data={data.overview.categories}
                        layout="vertical"
                        margin={{ top: 4, right: 18, bottom: 4, left: 18 }}
                      >
                        <CartesianGrid
                          stroke="var(--border)"
                          horizontal={false}
                        />
                        <XAxis
                          type="number"
                          tickFormatter={(value) =>
                            `¥${Math.round(Number(value) / 100)}`
                          }
                          tick={{ fill: "var(--muted)", fontSize: 12 }}
                        />
                        <YAxis
                          type="category"
                          dataKey="category"
                          width={72}
                          tick={{ fill: "var(--text)", fontSize: 13 }}
                        />
                        <ChartTooltip
                          formatter={(value) =>
                            formatFinanceCents(Number(value))
                          }
                        />
                        <Bar dataKey="impactCents" radius={[3, 3, 3, 3]}>
                          {data.overview.categories.map((item) => (
                            <Cell
                              key={item.category}
                              fill={
                                item.impactCents < 0
                                  ? "var(--success)"
                                  : "var(--accent)"
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </section>
                  <section className="finance-chart-section finance-platform-chart">
                    <header>
                      <h3>平台对比</h3>
                      <span>微信与支付宝净消费</span>
                    </header>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={data.overview.platforms.map((item) => ({
                          ...item,
                          label: financePlatformLabel(item.platform),
                        }))}
                        margin={{ top: 8, right: 20, bottom: 8, left: 12 }}
                      >
                        <CartesianGrid
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: "var(--text)", fontSize: 13 }}
                        />
                        <YAxis
                          tickFormatter={(value) =>
                            `¥${Math.round(Number(value) / 100)}`
                          }
                          tick={{ fill: "var(--muted)", fontSize: 12 }}
                        />
                        <ChartTooltip
                          formatter={(value) =>
                            formatFinanceCents(Number(value))
                          }
                        />
                        <Bar
                          dataKey="impactCents"
                          fill="var(--accent)"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </section>
                </div>
              )
            ) : null}

            {tab === "records" ? (
              records.length === 0 ? (
                <EmptyState
                  title="没有符合筛选条件的交易"
                  detail="调整快捷视图或筛选条件后重试。"
                />
              ) : (
                <div className="finance-table-scroll">
                  <table className="finance-table">
                    <thead>
                      <tr>
                        <th>计入</th>
                        <th>时间</th>
                        <th>交易</th>
                        <th>分类</th>
                        <th>平台</th>
                        <th>类型 / 方式</th>
                        <th>净消费影响</th>
                        <th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record) => (
                        <tr
                          key={record.id}
                          onDoubleClick={() =>
                            setDetail({ record, note: record.note ?? "" })
                          }
                        >
                          <td>
                            <Switch
                              aria-label={`${record.counterparty}是否计入`}
                              checked={record.isIncluded}
                              onChange={(_, value) =>
                                updateRecord.mutate({
                                  id: record.id,
                                  isIncluded: value.checked,
                                })
                              }
                            />
                          </td>
                          <td>
                            <time>{dateTimeLabel(record.transactedAt)}</time>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="finance-record-main"
                              onClick={() =>
                                setDetail({ record, note: record.note ?? "" })
                              }
                            >
                              <strong>
                                {record.counterparty || "未知交易对方"}
                              </strong>
                              <span>
                                {record.description ||
                                  record.rawNote ||
                                  "无商品说明"}
                              </span>
                            </button>
                          </td>
                          <td>
                            <select
                              aria-label={`${record.counterparty}分类`}
                              value={record.category}
                              onChange={(event) =>
                                updateRecord.mutate({
                                  id: record.id,
                                  category: event.target
                                    .value as FinanceCategory,
                                })
                              }
                            >
                              {FINANCE_CATEGORIES.map((item) => (
                                <option key={item} value={item}>
                                  {item}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>{financePlatformLabel(record.platform)}</td>
                          <td>
                            <span className="finance-secondary-cell">
                              {record.rawType || "未分类"}
                              <small>
                                {record.paymentMethod || "未知方式"}
                              </small>
                            </span>
                          </td>
                          <td>
                            <strong
                              className={`finance-impact ${financeImpactTone(record.impactCents)}`}
                            >
                              {formatFinanceCents(record.impactCents)}
                            </strong>
                            {record.impactCents === 0 ? (
                              <small className="finance-impact-reason">
                                {financeImpactReasonLabel(record.impactReason)}
                              </small>
                            ) : null}
                          </td>
                          <td>
                            <span
                              className={`finance-status ${record.isIncluded ? "included" : "excluded"}`}
                            >
                              {record.rawStatus || "未知"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {finance.hasNextPage ? (
                    <Button
                      className="finance-load-more"
                      appearance="subtle"
                      disabled={finance.isFetchingNextPage}
                      onClick={() => void finance.fetchNextPage()}
                    >
                      {finance.isFetchingNextPage ? "正在加载" : "加载更多"}
                    </Button>
                  ) : null}
                </div>
              )
            ) : null}

            {tab === "batches" ? (
              batches.isLoading ? (
                <Loading />
              ) : batches.data?.length ? (
                <div className="finance-batch-list">
                  {batches.data.map((batch) => (
                    <article key={batch.id}>
                      <div>
                        <strong>{batch.fileName}</strong>
                        <span>
                          {financePlatformLabel(batch.platform)} ·{" "}
                          {dateTimeLabel(batch.createdAt)}
                        </span>
                      </div>
                      <dl>
                        <div>
                          <dt>源记录</dt>
                          <dd>{batch.sourceCount}</dd>
                        </div>
                        <div>
                          <dt>新增</dt>
                          <dd>{batch.importedCount}</dd>
                        </div>
                        <div>
                          <dt>重复</dt>
                          <dd>{batch.duplicateCount}</dd>
                        </div>
                        <div>
                          <dt>默认开启</dt>
                          <dd>{batch.sourceCount - batch.errorCount}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="暂无账单导入记录"
                  detail="导入结果会保留在当前设备中。"
                />
              )
            ) : null}
          </div>
        </section>
      </div>

      <Dialog
        open={preview !== null}
        onOpenChange={(_, value) => {
          if (!value.open) onPreviewChange(null);
        }}
      >
        <DialogSurface className="finance-import-dialog">
          <DialogBody>
            <DialogTitle>账单导入预检</DialogTitle>
            <DialogContent>
              {preview ? (
                <div className="finance-preview">
                  <div className="finance-preview-summary">
                    <div>
                      <span>源记录</span>
                      <strong>{preview.counts.source}</strong>
                    </div>
                    <div>
                      <span>新增</span>
                      <strong>{preview.counts.create}</strong>
                    </div>
                    <div>
                      <span>重复</span>
                      <strong>{preview.counts.duplicate}</strong>
                    </div>
                    <div>
                      <span>正数影响</span>
                      <strong>{preview.counts.positive}</strong>
                    </div>
                    <div>
                      <span>负数影响</span>
                      <strong>{preview.counts.negative}</strong>
                    </div>
                    <div>
                      <span>零影响</span>
                      <strong>{preview.counts.zero}</strong>
                    </div>
                    <div>
                      <span>错误</span>
                      <strong>{preview.counts.error}</strong>
                    </div>
                  </div>
                  <div className="finance-preview-files">
                    {preview.files.map((file) => (
                      <article key={file.fileHash}>
                        <strong>{file.fileName}</strong>
                        <span>
                          {financePlatformLabel(file.platform)} ·{" "}
                          {file.sourceCount} 条
                        </span>
                        <span>
                          {file.rangeStart && file.rangeEnd
                            ? `${dateTimeLabel(file.rangeStart)} - ${dateTimeLabel(file.rangeEnd)}`
                            : "无有效日期范围"}
                        </span>
                        <small>
                          新增 {file.newCount} · 重复 {file.duplicateCount} ·
                          正数 {file.positiveCount} · 负数 {file.negativeCount}{" "}
                          · 零影响 {file.zeroCount} · 错误 {file.errorCount}
                        </small>
                      </article>
                    ))}
                  </div>
                  {preview.counts.error > 0 ? (
                    <p className="error-message">
                      存在无法可靠解析的记录，需修正源文件后重新预检。
                    </p>
                  ) : null}
                  <div className="finance-preview-rows">
                    {preview.rows.slice(0, 200).map((row) => (
                      <div
                        key={`${row.fileHash}-${row.sourceRow}`}
                        className={`finance-preview-row ${row.action}`}
                      >
                        <time>
                          {row.action === "error"
                            ? `第 ${row.sourceRow} 行`
                            : dateTimeLabel(row.transactedAt)}
                        </time>
                        <div>
                          <strong>
                            {row.counterparty || row.description || "无法识别"}
                          </strong>
                          <span>{row.description || row.rawType}</span>
                          {row.reason ? <small>{row.reason}</small> : null}
                        </div>
                        <b>
                          {row.action === "create"
                            ? formatFinanceCents(
                                row.analysisKind === "income" ||
                                  row.analysisKind === "refund"
                                  ? -row.amountCents
                                  : row.analysisKind === "neutral"
                                    ? 0
                                    : row.amountCents,
                              )
                            : row.action === "duplicate"
                              ? "重复"
                              : "错误"}
                        </b>
                      </div>
                    ))}
                    {preview.rows.length > 200 ? (
                      <p>
                        其余 {preview.rows.length - 200} 条将在确认时一并导入。
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                onClick={() => onPreviewChange(null)}
              >
                取消
              </Button>
              <Button
                appearance="primary"
                disabled={!preview?.canCommit || confirmImport.isPending}
                onClick={() => preview && confirmImport.mutate(preview.token)}
              >
                确认导入
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={detail !== null}
        onOpenChange={(_, value) => {
          if (!value.open) setDetail(null);
        }}
      >
        <DialogSurface className="finance-detail-dialog">
          <DialogBody>
            <DialogTitle>交易详情</DialogTitle>
            <DialogContent>
              {detail ? (
                <div className="finance-detail-content">
                  <dl>
                    <div>
                      <dt>交易对方</dt>
                      <dd>{detail.record.counterparty || "-"}</dd>
                    </div>
                    <div>
                      <dt>商品说明</dt>
                      <dd>{detail.record.description || "-"}</dd>
                    </div>
                    <div>
                      <dt>原始收支</dt>
                      <dd>{detail.record.rawFlow || "-"}</dd>
                    </div>
                    <div>
                      <dt>原始状态</dt>
                      <dd>{detail.record.rawStatus || "-"}</dd>
                    </div>
                    <div>
                      <dt>净消费影响</dt>
                      <dd>
                        {formatFinanceCents(detail.record.impactCents)} ·{" "}
                        {financeImpactReasonLabel(detail.record.impactReason)}
                      </dd>
                    </div>
                    <div>
                      <dt>金额</dt>
                      <dd>{formatFinanceCents(detail.record.amountCents)}</dd>
                    </div>
                    <div>
                      <dt>支付方式</dt>
                      <dd>{detail.record.paymentMethod || "-"}</dd>
                    </div>
                    <div>
                      <dt>订单号</dt>
                      <dd>{detail.record.transactionId || "-"}</dd>
                    </div>
                    <div>
                      <dt>原始备注</dt>
                      <dd>{detail.record.rawNote || "-"}</dd>
                    </div>
                  </dl>
                  <Field label="人工备注">
                    <Textarea
                      resize="vertical"
                      value={detail.note}
                      onChange={(_, value) =>
                        setDetail((current) =>
                          current ? { ...current, note: value.value } : null,
                        )
                      }
                    />
                  </Field>
                </div>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDetail(null)}>
                取消
              </Button>
              <Button
                appearance="primary"
                disabled={!detail || updateRecord.isPending}
                onClick={() =>
                  detail &&
                  updateRecord.mutate({
                    id: detail.record.id,
                    note: detail.note,
                  })
                }
              >
                保存
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
