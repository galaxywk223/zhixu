import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  FinanceImportPreview,
  FinanceListResult,
  ZhixuApi,
} from "../src/preload/api-types";
import { FinancePage } from "../src/renderer/src/pages/FinancePage";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

const listResult: FinanceListResult = {
  records: [],
  nextCursor: null,
  totalCount: 0,
  range: { start: "2026-08-01", end: "2026-08-31" },
  rangeError: null,
  viewCounts: { today: 0, week: 0, month: 0, year: 0, all: 0, custom: 0 },
  metrics: {
    netCents: 0,
    includedCount: 0,
    consumptionDays: 0,
    dailyAverageCents: 0,
    monthNetCents: 0,
    todayNetCents: 0,
  },
  overview: {
    trend: [],
    categories: [],
    platforms: [
      { platform: "alipay", impactCents: 0 },
      { platform: "wechat", impactCents: 0 },
    ],
  },
  facets: { statuses: [], types: [], paymentMethods: [] },
};

const preview: FinanceImportPreview = {
  token: "finance-token",
  files: [
    {
      fileName: "alipay.csv",
      fileHash: "hash",
      platform: "alipay",
      rangeStart: "2026-08-09T00:00:00.000Z",
      rangeEnd: "2026-08-10T00:00:00.000Z",
      sourceCount: 2,
      newCount: 1,
      duplicateCount: 1,
      excludedCount: 0,
      positiveCount: 1,
      negativeCount: 0,
      zeroCount: 0,
      errorCount: 0,
    },
  ],
  rows: [
    {
      sourceRow: 25,
      fileHash: "hash",
      platform: "alipay",
      sourceKey: "source",
      transactionId: "order",
      merchantOrderId: null,
      transactedAt: "2026-08-09T04:00:00.000Z",
      amountCents: 1800,
      rawFlow: "支出",
      rawStatus: "交易成功",
      rawType: "餐饮美食",
      counterparty: "校园餐厅",
      counterpartyAccount: null,
      description: "午餐",
      paymentMethod: "余额",
      rawNote: null,
      rawPayloadJson: "{}",
      analysisKind: "expense",
      impactReason: "expense",
      category: "餐饮",
      isIncluded: true,
      action: "create",
      reason: null,
    },
  ],
  counts: {
    source: 2,
    create: 1,
    duplicate: 1,
    excluded: 0,
    positive: 1,
    negative: 0,
    zero: 0,
    error: 0,
  },
  canCommit: true,
};

function renderPage(
  value: FinanceImportPreview | null = null,
  result: FinanceListResult = listResult,
) {
  const financeList = vi.fn().mockResolvedValue(result);
  const api = {
    finance: {
      list: financeList,
      batches: vi.fn().mockResolvedValue([]),
      preview: vi.fn().mockResolvedValue(value),
      confirm: vi.fn().mockResolvedValue({
        batchIds: ["batch"],
        importedCount: 1,
        duplicateCount: 1,
        excludedCount: 0,
      }),
      update: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as ZhixuApi;
  Object.defineProperty(window, "zhixu", { configurable: true, value: api });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onPreviewChange = vi.fn();
  const rendered = render(
    <QueryClientProvider client={client}>
      <FluentProvider theme={webLightTheme}>
        <FinancePage preview={value} onPreviewChange={onPreviewChange} />
      </FluentProvider>
    </QueryClientProvider>,
  );
  return { ...rendered, onPreviewChange, api, financeList };
}

describe("finance workspace", () => {
  it("uses the task-style workspace and exposes comprehensive filters", async () => {
    const { container } = renderPage();
    expect(
      await screen.findByRole("heading", { name: "消费", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByLabelText("消费指标")).toBeTruthy();
    expect(screen.getByText("本年")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "交易明细" }));
    fireEvent.click(screen.getByRole("button", { name: "筛选" }));
    expect(await screen.findByText("筛选与排序")).toBeTruthy();
    expect(screen.getByText("支付方式")).toBeTruthy();
    expect(screen.getByText("净消费影响")).toBeTruthy();
    expect(screen.getByText("零影响")).toBeTruthy();
    expect(screen.getByText("最小金额（元）")).toBeTruthy();
    expect(container.querySelector(".finance-workspace-layout")).toBeTruthy();
  });

  it("uses one preview dialog for file selection and drag-drop results", async () => {
    const { onPreviewChange } = renderPage(preview);
    const dialog = await screen.findByRole("dialog");
    expect(screen.getByText("alipay.csv")).toBeTruthy();
    expect(screen.getByText("校园餐厅")).toBeTruthy();
    expect(screen.getByText("重复")).toBeTruthy();
    expect(screen.getByText("正数影响")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认导入" }));
    await waitFor(() => expect(onPreviewChange).toHaveBeenCalledWith(null));
    expect(dialog).toBeTruthy();
  });

  it("keeps the search input mounted while an IME query is pending", async () => {
    const { financeList } = renderPage();
    await screen.findByRole("heading", { name: "消费", level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "交易明细" }));
    const input = screen.getByPlaceholderText("搜索对方、商品或备注");
    financeList.mockImplementationOnce(() => new Promise(() => undefined));
    vi.useFakeTimers();

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "zhong" } });
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(financeList).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: "中文" } });
    fireEvent.compositionEnd(input);
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(financeList).toHaveBeenCalledTimes(2);
    expect(financeList.mock.calls[1]?.[0]).toMatchObject({ search: "中文" });
    expect(screen.getByPlaceholderText("搜索对方、商品或备注")).toBe(input);
    expect((input as HTMLInputElement).value).toBe("中文");
    expect(screen.queryByText("正在加载")).toBeNull();
  });

  it("switches trend granularity and remembers it for each shortcut view", async () => {
    const chartResult: FinanceListResult = {
      ...listResult,
      totalCount: 1,
      range: { start: "2026-08-01", end: "2026-08-11" },
      overview: {
        ...listResult.overview,
        trend: [{ key: "2026-08-01", label: "8/1", impactCents: 1000 }],
      },
    };
    const { financeList } = renderPage(null, chartResult);
    await screen.findByRole("heading", { name: "消费", level: 1 });
    expect(financeList.mock.calls[0]?.[0]).toMatchObject({
      view: "month",
      trendGranularity: "day",
    });

    fireEvent.click(screen.getByRole("button", { name: "按周汇总" }));
    await waitFor(() =>
      expect(financeList.mock.calls.at(-1)?.[0]).toMatchObject({
        view: "month",
        trendGranularity: "week",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /全部/ }));
    await waitFor(() =>
      expect(financeList.mock.calls.at(-1)?.[0]).toMatchObject({
        view: "all",
        trendGranularity: "month",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /本月/ }));
    await waitFor(() =>
      expect(financeList.mock.calls.at(-1)?.[0]).toMatchObject({
        view: "month",
        trendGranularity: "week",
      }),
    );
  });
});
