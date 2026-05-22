import { useEffect, useRef } from "react";

export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean = true
) {
  const savedFn = useRef(fn);

  useEffect(() => {
    savedFn.current = fn;
  }, [fn]);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (!document.hidden) savedFn.current();
    };

    const id = setInterval(tick, intervalMs);

    const onVisible = () => {
      if (!document.hidden) savedFn.current();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled]);
}
