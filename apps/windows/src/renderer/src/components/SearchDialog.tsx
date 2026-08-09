import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Spinner,
} from "@fluentui/react-components";
import { Search24Regular } from "@fluentui/react-icons";
import type { Route } from "./Shell";

export function SearchDialog(props: {
  open: boolean;
  onClose(): void;
  onNavigate(route: Route, id?: string): void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (props.open) setQuery("");
  }, [props.open]);
  const results = useQuery({
    queryKey: ["search", query],
    queryFn: () => window.zhixu.search.query(query),
    enabled: props.open && query.trim().length > 0,
  });
  const routeMap = {
    task: "tasks",
    memo: "memos",
    countdown: "countdowns",
    note: "notes",
    focus: "focus",
  } as const;
  return (
    <Dialog
      open={props.open}
      onOpenChange={(_, data) => {
        if (!data.open) props.onClose();
      }}
    >
      <DialogSurface className="search-dialog">
        <DialogBody>
          <DialogTitle>全局搜索</DialogTitle>
          <DialogContent>
            <Input
              autoFocus
              size="large"
              contentBefore={<Search24Regular />}
              placeholder="搜索任务、备忘、倒数日、笔记或专注事项"
              value={query}
              onChange={(_, data) => setQuery(data.value)}
            />
            <div className="search-results">
              {results.isFetching ? <Spinner size="tiny" /> : null}
              {(results.data ?? []).map((result) => (
                <button
                  key={`${result.entityType}-${result.id}`}
                  type="button"
                  onClick={() => {
                    props.onNavigate(routeMap[result.entityType], result.id);
                    props.onClose();
                  }}
                >
                  <span className="entity-label">
                    {result.entityType === "task"
                      ? "任务"
                      : result.entityType === "memo"
                        ? "备忘"
                        : result.entityType === "countdown"
                          ? "倒数日"
                          : result.entityType === "note"
                            ? "笔记"
                            : "专注"}
                  </span>
                  <strong>{result.title}</strong>
                  <small>{result.subtitle}</small>
                </button>
              ))}
              {query && results.data?.length === 0 ? (
                <p className="muted">没有匹配结果</p>
              ) : null}
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
