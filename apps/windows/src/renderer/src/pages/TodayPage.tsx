import { useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Spinner,
  Tooltip,
} from "@fluentui/react-components";
import {
  Add20Regular,
  ArrowClockwise20Regular,
  BookmarkMultiple20Regular,
  CalendarClock20Regular,
  CalendarToday20Regular,
  ChevronRight20Regular,
  Heart20Filled,
  Heart20Regular,
  NotePin20Regular,
  Search20Regular,
  Delete20Regular,
  ThumbDislike20Regular,
} from "@fluentui/react-icons";
import type { DailyQuoteRecord, TaskRecord } from "../../../preload/api-types";
import { EmptyState, Loading } from "../components/Page";
import { TaskList } from "../components/TaskList";
import { queryKeys } from "../query";
import { buildTodayDashboard } from "./today-page-model";
import { isImplicitEndOfDay } from "../../../shared/task-schedule";
import {
  countdownDays,
  countdownLabel,
  countdownPreview,
  parseLocalDate,
} from "../../../shared/countdown";

function formatToday(date: Date): string {
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
  }).format(date);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekday}`;
}

function formatMinutes(value: number): string {
  if (value < 60) return `${value} 分钟`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
}

function formatDeadline(value: string): string {
  const date = new Date(value);
  if (isImplicitEndOfDay(value))
    return date.toLocaleDateString("zh-CN", {
      month: "numeric",
      day: "numeric",
    });
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysUntil(value: string, now: Date): number {
  const currentDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const due = new Date(value);
  const dueDay = new Date(
    due.getFullYear(),
    due.getMonth(),
    due.getDate(),
  ).getTime();
  return Math.max(0, Math.round((dueDay - currentDay) / 86_400_000));
}

function formatUpdatedTime(value: string, now: Date): string {
  const date = new Date(value);
  if (date.toDateString() === now.toDateString())
    return `今天 ${date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString())
    return `昨天 ${date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  return date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

function memoPriorityLabel(value: number): string {
  if (value === 3) return "高";
  if (value === 2) return "中";
  return "低";
}

function formatFavoriteDate(value: string): string {
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function quoteErrorMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  const marker = value.lastIndexOf("Error: ");
  return marker >= 0 ? value.slice(marker + 7) : value;
}

export function TodayPage(props: {
  onNew(): void;
  onEdit(task: TaskRecord): void;
  onDelete(task: TaskRecord): void;
  onSearch(): void;
  onOpenMemos(memoId: string | null): void;
  onOpenCountdowns(countdownId: string | null): void;
}): React.JSX.Element {
  const client = useQueryClient();
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [favoriteText, setFavoriteText] = useState("");
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
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
  const memos = useQuery({
    queryKey: queryKeys.memos,
    queryFn: window.zhixu.memos.list,
  });
  const countdowns = useQuery({
    queryKey: queryKeys.countdowns,
    queryFn: window.zhixu.countdowns.list,
  });
  const summary = useQuery({
    queryKey: queryKeys.summary,
    queryFn: window.zhixu.dashboard.summary,
  });
  const quote = useQuery({
    queryKey: queryKeys.quote,
    queryFn: window.zhixu.quotes.today,
    retry: false,
  });
  const favorites = useQuery({
    queryKey: queryKeys.quoteFavorites,
    queryFn: window.zhixu.quotes.favorites,
    enabled: favoritesOpen,
  });
  const favoriteQuote = useMutation({
    mutationFn: (input: { id: string; favorite: boolean }) =>
      window.zhixu.quotes.setFavorite(input),
    onSuccess: (record, input) => {
      client.setQueryData<DailyQuoteRecord | null>(
        queryKeys.quote,
        (current) => (current?.id === input.id ? record : current),
      );
      void client.invalidateQueries({ queryKey: queryKeys.quoteFavorites });
    },
    onError: (error) => setQuoteError(String(error)),
  });
  const dislikeQuote = useMutation({
    mutationFn: window.zhixu.quotes.dislike,
    onMutate: () => {
      setQuoteError(null);
      client.setQueryData(queryKeys.quote, null);
    },
    onSuccess: (record) => client.setQueryData(queryKeys.quote, record),
    onError: (error) => setQuoteError(quoteErrorMessage(error)),
  });
  const retryQuote = useMutation({
    mutationFn: window.zhixu.quotes.retry,
    onMutate: () => setQuoteError(null),
    onSuccess: (record) => client.setQueryData(queryKeys.quote, record),
    onError: (error) => setQuoteError(quoteErrorMessage(error)),
  });
  const refreshQuote = useMutation({
    mutationFn: window.zhixu.quotes.refresh,
    onMutate: () => setQuoteError(null),
    onSuccess: (record) => client.setQueryData(queryKeys.quote, record),
    onError: (error) => setQuoteError(quoteErrorMessage(error)),
  });
  const addFavorite = useMutation({
    mutationFn: (input: { text: string }) =>
      window.zhixu.quotes.addFavorite(input),
    onMutate: () => setFavoriteError(null),
    onSuccess: () => {
      setFavoriteText("");
      void client.invalidateQueries({ queryKey: queryKeys.quoteFavorites });
    },
    onError: (error) => setFavoriteError(String(error)),
  });
  const removeFavorite = useMutation({
    mutationFn: (id: string) => window.zhixu.quotes.removeFavorite(id),
    onMutate: () => setFavoriteError(null),
    onSuccess: (_value, id) => {
      void client.invalidateQueries({ queryKey: queryKeys.quoteFavorites });
      client.setQueryData<DailyQuoteRecord | null>(
        queryKeys.quote,
        (current) =>
          current?.sourceId === id ? { ...current, reaction: "none" } : current,
      );
    },
    onError: (error) => setFavoriteError(String(error)),
  });
  const useFavoriteToday = useMutation({
    mutationFn: (id: string) => window.zhixu.quotes.useFavoriteToday(id),
    onMutate: () => setFavoriteError(null),
    onSuccess: (record) => {
      client.setQueryData(queryKeys.quote, record);
      setFavoritesOpen(false);
    },
    onError: (error) => setFavoriteError(String(error)),
  });
  const status = useMutation({
    mutationFn: ({ id, value }: { id: string; value: TaskRecord["status"] }) =>
      window.zhixu.tasks.setStatus(id, value),
    onSuccess: () => client.invalidateQueries(),
  });
  if (
    tasks.isLoading ||
    summary.isLoading ||
    memos.isLoading ||
    countdowns.isLoading
  )
    return <Loading />;

  const now = new Date();
  const dashboard = buildTodayDashboard(tasks.data ?? [], now);
  const upcoming = dashboard.upcomingTasks.slice(0, 4);
  const priorityMemos = [...(memos.data ?? [])]
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    )
    .slice(0, 3);
  const upcomingCountdowns = countdownPreview(countdowns.data ?? [], now);
  const focusByDay = summary.data?.focusByDay ?? [];
  const maxFocusMinutes = Math.max(
    1,
    ...focusByDay.map((item) => item.minutes),
  );
  const remainingCount = dashboard.totalCount - dashboard.completedCount;
  const estimatedMinutes = dashboard.todayTasks
    .filter((task) => task.status !== "done")
    .reduce((total, task) => total + task.estimatedMinutes, 0);

  return (
    <div className="page today-page">
      <header className="today-header">
        <h1>
          今天 <span>/ {formatToday(now)}</span>
        </h1>
        <div className="today-header-actions">
          <Button
            className="today-search"
            appearance="outline"
            icon={<Search20Regular />}
            onClick={props.onSearch}
          >
            搜索任务、备忘…
          </Button>
          <Button
            appearance="primary"
            icon={<Add20Regular />}
            onClick={props.onNew}
          >
            添加任务
          </Button>
        </div>
      </header>

      <div className="today-workspace-scroll">
        <section className="daily-quote-band" aria-label="每日格言">
          {quote.data ? (
            <>
              <div className="daily-quote-copy">
                <p>{quote.data.text}</p>
                {quoteError ? (
                  <div className="daily-quote-error" role="alert">
                    <span>{quoteError}</span>
                    <Tooltip content="重试" relationship="label">
                      <Button
                        appearance="subtle"
                        icon={<ArrowClockwise20Regular />}
                        aria-label="重试生成格言"
                        disabled={refreshQuote.isPending}
                        onClick={() => refreshQuote.mutate()}
                      />
                    </Tooltip>
                  </div>
                ) : null}
              </div>
              <div className="daily-quote-actions">
                <Tooltip
                  content={
                    quote.data.reaction === "favorite"
                      ? "取消收藏"
                      : "喜欢并收藏"
                  }
                  relationship="label"
                >
                  <Button
                    appearance="subtle"
                    icon={
                      quote.data.reaction === "favorite" ? (
                        <Heart20Filled />
                      ) : (
                        <Heart20Regular />
                      )
                    }
                    aria-pressed={quote.data.reaction === "favorite"}
                    disabled={favoriteQuote.isPending || dislikeQuote.isPending}
                    onClick={() =>
                      favoriteQuote.mutate({
                        id: quote.data!.id,
                        favorite: quote.data!.reaction !== "favorite",
                      })
                    }
                  />
                </Tooltip>
                <Tooltip content="不喜欢，换一条" relationship="label">
                  <Button
                    appearance="subtle"
                    icon={<ThumbDislike20Regular />}
                    disabled={dislikeQuote.isPending || favoriteQuote.isPending}
                    onClick={() => dislikeQuote.mutate(quote.data!.id)}
                  />
                </Tooltip>
                <Tooltip content="换一条" relationship="label">
                  <Button
                    appearance="subtle"
                    icon={<ArrowClockwise20Regular />}
                    aria-label="换一条"
                    disabled={refreshQuote.isPending || dislikeQuote.isPending}
                    onClick={() => refreshQuote.mutate()}
                  />
                </Tooltip>
                <Tooltip content="查看收藏" relationship="label">
                  <Button
                    appearance="subtle"
                    icon={<BookmarkMultiple20Regular />}
                    onClick={() => setFavoritesOpen(true)}
                  />
                </Tooltip>
              </div>
            </>
          ) : quote.isLoading ||
            dislikeQuote.isPending ||
            refreshQuote.isPending ||
            retryQuote.isPending ? (
            <Spinner size="small" label="正在生成今日格言" />
          ) : (
            <div className="daily-quote-error daily-quote-error-empty">
              {quoteError ? <span role="alert">{quoteError}</span> : null}
              <Button
                appearance="subtle"
                icon={<ArrowClockwise20Regular />}
                onClick={() => retryQuote.mutate()}
              >
                {quoteError ? "重试" : "生成今日格言"}
              </Button>
            </div>
          )}
        </section>
        <div className="today-dashboard-grid">
          <section className="today-panel today-task-panel">
            <div className="today-panel-heading">
              <h2>今日待办</h2>
              <span className="panel-count">{dashboard.totalCount}</span>
              {estimatedMinutes > 0 ? (
                <span className="panel-meta">
                  预计 {formatMinutes(estimatedMinutes)}
                </span>
              ) : null}
            </div>
            {dashboard.todayTasks.length ? (
              <TaskList
                tasks={dashboard.todayTasks}
                categories={categories.data ?? []}
                tags={tags.data ?? []}
                variant="today"
                onEdit={props.onEdit}
                onStatus={(task, value) =>
                  status.mutate({ id: task.id, value })
                }
                onDelete={props.onDelete}
              />
            ) : (
              <EmptyState
                title="今天没有待处理任务"
                detail="添加任务后，今日安排会集中显示在这里。"
                action={<Button onClick={props.onNew}>添加任务</Button>}
              />
            )}
            <button
              className="panel-footer-action"
              type="button"
              onClick={props.onNew}
            >
              <Add20Regular />
              添加任务
            </button>
          </section>

          <section className="today-panel upcoming-panel">
            <div className="today-panel-heading">
              <h2>即将到期</h2>
              <span className="panel-count">
                {dashboard.upcomingTasks.length}
              </span>
            </div>
            {upcoming.length ? (
              <div className="upcoming-list">
                {upcoming.map((task) => {
                  const remainingDays = daysUntil(task.dueAt!, now);
                  return (
                    <button
                      type="button"
                      key={task.id}
                      className={`upcoming-item ${remainingDays <= 1 ? "urgent" : remainingDays <= 3 ? "soon" : "later"}`}
                      onClick={() => props.onEdit(task)}
                    >
                      <span className="deadline-dot" />
                      <strong className="upcoming-title">{task.title}</strong>
                      <span className="upcoming-relative">
                        {remainingDays === 1
                          ? "明天到期"
                          : `剩余 ${remainingDays} 天`}
                      </span>
                      <time className="upcoming-deadline">
                        {formatDeadline(task.dueAt!)}
                      </time>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="暂无临近截止任务"
                detail="未来任务会按截止时间显示。"
              />
            )}
          </section>

          <section className="today-panel today-progress-panel">
            <div className="today-panel-heading">
              <h2>今日进度概览</h2>
            </div>
            <div className="today-progress-grid">
              <div className="completion-metric">
                <span>今日完成率</span>
                <div
                  className="completion-ring"
                  role="progressbar"
                  aria-label="今日完成率"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={dashboard.completionRate}
                  style={
                    {
                      "--completion-angle": `${dashboard.completionRate * 3.6}deg`,
                    } as CSSProperties
                  }
                >
                  <strong>{dashboard.completionRate}%</strong>
                </div>
                <small>
                  {dashboard.completedCount} / {dashboard.totalCount} 已完成
                </small>
              </div>

              <div className="focus-metric">
                <span>今日专注</span>
                <strong>
                  {formatMinutes(summary.data?.focusTodayMinutes ?? 0)}
                </strong>
                <small>近七日专注趋势</small>
                <div className="focus-bars" aria-label="近七日专注趋势">
                  {focusByDay.map((item) => (
                    <i
                      key={item.date}
                      title={`${item.date} ${item.minutes} 分钟`}
                      style={{
                        height: `${Math.max(8, (item.minutes / maxFocusMinutes) * 100)}%`,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="task-progress-metric">
                <span>任务完成数</span>
                <strong>
                  {dashboard.completedCount}
                  <small> / {dashboard.totalCount}</small>
                </strong>
                <div className="completion-dots" aria-hidden="true">
                  {dashboard.todayTasks.slice(0, 8).map((task) => (
                    <i
                      key={task.id}
                      className={task.status === "done" ? "done" : ""}
                    />
                  ))}
                </div>
                <small>
                  {remainingCount
                    ? `还有 ${remainingCount} 项待处理`
                    : "今日任务已处理完毕"}
                </small>
              </div>
            </div>
          </section>

          <section className="today-panel today-memo-panel">
            <div className="today-panel-heading">
              <NotePin20Regular />
              <h2>备忘</h2>
              <span className="panel-count">{memos.data?.length ?? 0}</span>
              <button
                type="button"
                className="panel-link"
                onClick={() => props.onOpenMemos(null)}
              >
                查看全部
                <ChevronRight20Regular />
              </button>
            </div>
            {priorityMemos.length ? (
              <div className="today-memo-list">
                {priorityMemos.map((memo) => (
                  <button
                    type="button"
                    className={`today-memo-item priority-${memo.priority}`}
                    key={memo.id}
                    onClick={() => props.onOpenMemos(memo.id)}
                  >
                    <i aria-hidden="true" />
                    <strong>{memo.title}</strong>
                    <span>{memoPriorityLabel(memo.priority)}优先级</span>
                    <time>{formatUpdatedTime(memo.updatedAt, now)}</time>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="暂无备忘"
                detail="重要备忘会优先显示在这里。"
                action={
                  <Button onClick={() => props.onOpenMemos(null)}>
                    前往备忘
                  </Button>
                }
              />
            )}
          </section>

          <section className="today-panel today-countdown-strip">
            <div className="today-countdown-heading">
              <CalendarClock20Regular />
              <h2>倒数</h2>
              <button
                type="button"
                className="panel-link"
                onClick={() => props.onOpenCountdowns(null)}
              >
                查看全部
                <ChevronRight20Regular />
              </button>
            </div>
            {upcomingCountdowns.length ? (
              <div className="today-countdown-list">
                {upcomingCountdowns.map((item) => {
                  const days = countdownDays(item.targetDate, now);
                  return (
                    <button
                      type="button"
                      className={`today-countdown-item ${days === 0 ? "today" : days <= 7 ? "soon" : "future"}`}
                      key={item.id}
                      onClick={() => props.onOpenCountdowns(item.id)}
                    >
                      <span>
                        <strong>{item.title}</strong>
                        <time dateTime={item.targetDate}>
                          {parseLocalDate(item.targetDate).toLocaleDateString(
                            "zh-CN",
                            { month: "long", day: "numeric" },
                          )}
                        </time>
                      </span>
                      <b>{countdownLabel(days)}</b>
                    </button>
                  );
                })}
              </div>
            ) : (
              <button
                type="button"
                className="today-countdown-empty"
                onClick={() => props.onOpenCountdowns(null)}
              >
                暂无倒数，添加重要日期
                <Add20Regular />
              </button>
            )}
          </section>
        </div>
      </div>

      <Dialog
        open={favoritesOpen}
        onOpenChange={(_event, data) => setFavoritesOpen(data.open)}
      >
        <DialogSurface className="quote-favorites-dialog">
          <DialogBody>
            <DialogTitle>格言收藏</DialogTitle>
            <DialogContent>
              <form
                className="quote-favorite-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (favoriteText.trim())
                    addFavorite.mutate({ text: favoriteText });
                }}
              >
                <Input
                  value={favoriteText}
                  maxLength={80}
                  placeholder="输入格言正文"
                  aria-label="格言正文"
                  disabled={addFavorite.isPending}
                  onChange={(_event, data) => setFavoriteText(data.value)}
                />
                <Tooltip content="添加到收藏" relationship="label">
                  <Button
                    type="submit"
                    appearance="primary"
                    icon={<Add20Regular />}
                    aria-label="添加到收藏"
                    disabled={!favoriteText.trim() || addFavorite.isPending}
                  />
                </Tooltip>
              </form>
              {favoriteError ? (
                <div className="quote-favorite-error" role="alert">
                  {favoriteError}
                </div>
              ) : null}
              {favorites.isLoading ? (
                <Spinner size="small" label="正在读取收藏" />
              ) : favorites.data?.length ? (
                <div className="quote-favorites-list">
                  {favorites.data.map((item) => (
                    <article key={item.id}>
                      <div>
                        <p>{item.text}</p>
                        <div className="quote-favorite-meta">
                          <time dateTime={item.updatedAt}>
                            {formatFavoriteDate(item.updatedAt)}
                          </time>
                          {item.sourceKind === "manual" ? (
                            <span>手动</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="quote-favorite-actions">
                        <Tooltip content="设为今日格言" relationship="label">
                          <Button
                            appearance="subtle"
                            icon={<CalendarToday20Regular />}
                            aria-label="设为今日格言"
                            disabled={useFavoriteToday.isPending}
                            onClick={() => useFavoriteToday.mutate(item.id)}
                          />
                        </Tooltip>
                        {item.sourceKind === "manual" ? (
                          <Tooltip content="删除" relationship="label">
                            <Button
                              appearance="subtle"
                              icon={<Delete20Regular />}
                              aria-label="删除手动格言"
                              disabled={removeFavorite.isPending}
                              onClick={() => removeFavorite.mutate(item.id)}
                            />
                          </Tooltip>
                        ) : (
                          <Tooltip content="取消收藏" relationship="label">
                            <Button
                              appearance="subtle"
                              icon={<Heart20Filled />}
                              aria-label="取消收藏"
                              disabled={favoriteQuote.isPending}
                              onClick={() =>
                                favoriteQuote.mutate({
                                  id: item.id,
                                  favorite: false,
                                })
                              }
                            />
                          </Tooltip>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="quote-favorites-empty">暂无收藏</div>
              )}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
