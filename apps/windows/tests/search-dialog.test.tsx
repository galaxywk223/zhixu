import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ZhixuApi } from "../src/preload/api-types";
import { SearchDialog } from "../src/renderer/src/components/SearchDialog";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("global search input", () => {
  it("waits for Chinese composition before querying", async () => {
    const searchQuery = vi.fn().mockResolvedValue([]);
    Object.defineProperty(window, "zhixu", {
      configurable: true,
      value: { search: { query: searchQuery } } as unknown as ZhixuApi,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <FluentProvider theme={webLightTheme}>
          <SearchDialog
            open
            onClose={() => undefined}
            onNavigate={() => undefined}
          />
        </FluentProvider>
      </QueryClientProvider>,
    );
    const input =
      screen.getByPlaceholderText("搜索任务、备忘、倒数、笔记或专注事项");
    vi.useFakeTimers();

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "zhong" } });
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(searchQuery).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "中文" } });
    fireEvent.compositionEnd(input);
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(searchQuery).toHaveBeenCalledTimes(1);
    expect(searchQuery).toHaveBeenCalledWith("中文");
    expect((input as HTMLInputElement).value).toBe("中文");
  });
});
