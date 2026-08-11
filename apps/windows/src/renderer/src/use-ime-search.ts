import { useCallback, useEffect, useRef, useState } from "react";

export interface ImeSearchState {
  value: string;
  query: string;
  change(value: string): void;
  compositionStart(): void;
  compositionEnd(value: string): void;
  reset(): void;
}

export function useImeSearch(delay = 250): ImeSearchState {
  const [value, setValue] = useState("");
  const [query, setQuery] = useState("");
  const composing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPending = useCallback((): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const commitLater = useCallback(
    (next: string): void => {
      cancelPending();
      if (!next) {
        setQuery("");
        return;
      }
      timer.current = setTimeout(() => {
        timer.current = null;
        setQuery(next);
      }, delay);
    },
    [cancelPending, delay],
  );

  const change = useCallback(
    (next: string): void => {
      setValue(next);
      if (!next) {
        cancelPending();
        setQuery("");
      } else if (!composing.current) commitLater(next);
    },
    [cancelPending, commitLater],
  );

  const compositionStart = useCallback((): void => {
    composing.current = true;
    cancelPending();
  }, [cancelPending]);

  const compositionEnd = useCallback(
    (next: string): void => {
      composing.current = false;
      setValue(next);
      commitLater(next);
    },
    [commitLater],
  );

  const reset = useCallback((): void => {
    composing.current = false;
    cancelPending();
    setValue("");
    setQuery("");
  }, [cancelPending]);

  useEffect(() => cancelPending, [cancelPending]);

  return {
    value,
    query,
    change,
    compositionStart,
    compositionEnd,
    reset,
  };
}
