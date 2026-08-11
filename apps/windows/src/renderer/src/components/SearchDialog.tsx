import { useEffect } from "react";
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
import { useImeSearch } from "../use-ime-search";

export function SearchDialog(props: {
  open: boolean;
  onClose(): void;
  onNavigate(route: Route, id?: string): void;
}): React.JSX.Element {
  const search = useImeSearch();
  useEffect(() => {
    if (props.open) search.reset();
  }, [props.open, search.reset]);
  const results = useQuery({
    queryKey: ["search", search.query],
    queryFn: () => window.zhixu.search.query(search.query),
    enabled: props.open && search.query.trim().length > 0,
  });
  const routeMap = {
    task: "tasks",
    memo: "memos",
    countdown: "countdowns",
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
              placeholder="搜索任务、备忘、倒数或专注事项"
              value={search.value}
              onChange={(_, data) => search.change(data.value)}
              onCompositionStart={search.compositionStart}
              onCompositionEnd={(event) =>
                search.compositionEnd(event.currentTarget.value)
              }
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
                          ? "倒数"
                          : "专注"}
                  </span>
                  <strong>{result.title}</strong>
                  <small>{result.subtitle}</small>
                </button>
              ))}
              {search.query && results.data?.length === 0 ? (
                <p className="muted">没有匹配结果</p>
              ) : null}
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
