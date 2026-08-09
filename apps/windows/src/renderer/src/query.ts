import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const queryKeys = {
  bootstrap: ["bootstrap"] as const,
  tasks: ["tasks"] as const,
  memos: ["memos"] as const,
  categories: ["task-categories"] as const,
  tags: ["tags"] as const,
  notes: ["notes"] as const,
  focus: ["focus"] as const,
  batches: ["import-batches"] as const,
  events: ["life-events"] as const,
  summary: ["dashboard-summary"] as const,
  settings: ["settings"] as const,
  updates: ["updates"] as const,
  calendar: (start: string, end: string) => ["calendar", start, end] as const,
};

export function useDataInvalidation(): void {
  const client = useQueryClient();
  useEffect(
    () =>
      window.zhixu.app.onDataChanged((scope) => {
        const mapping: Record<string, ReadonlyArray<ReadonlyArray<string>>> = {
          tasks: [
            queryKeys.tasks,
            queryKeys.categories,
            queryKeys.tags,
            queryKeys.summary,
          ],
          memos: [queryKeys.memos, queryKeys.summary],
          notes: [queryKeys.notes],
          calendar: [["calendar"], queryKeys.summary],
          focus: [
            queryKeys.focus,
            queryKeys.batches,
            queryKeys.categories,
            queryKeys.summary,
          ],
          sleep: [queryKeys.events],
          settings: [queryKeys.settings, queryKeys.bootstrap],
          all: [],
        };
        const keys = mapping[scope];
        if (!keys || keys.length === 0) void client.invalidateQueries();
        else
          for (const key of keys)
            void client.invalidateQueries({ queryKey: [...key] });
      }),
    [client],
  );
}
