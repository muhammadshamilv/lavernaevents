import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

// Pull down from the top of a page on a phone to refresh it. It only reacts
// when the page is scrolled to the very top, never inside a dialog, and
// never when the finger started on something that scrolls on its own.
// The page content is not moved; only a small indicator is shown.

const THRESHOLD = 64;
const MAX_PULL = 110;

interface PullToRefreshProps {
  onRefresh: () => Promise<unknown> | unknown;
  children: ReactNode;
  disabled?: boolean;
}

function startsInsideScroller(target: EventTarget | null) {
  let el = target instanceof HTMLElement ? target : null;
  while (el && el !== document.body) {
    if (el.getAttribute("role") === "dialog") return true;
    const overflowY = window.getComputedStyle(el).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollTop > 0) return true;
    el = el.parentElement;
  }
  return false;
}

export function PullToRefresh({ onRefresh, children, disabled = false }: PullToRefreshProps) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const busy = useRef(false);

  const setPullValue = useCallback((value: number) => {
    pullRef.current = value;
    setPull(value);
  }, []);

  useEffect(() => {
    if (disabled) return;
    const root = document.documentElement;
    const previous = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "contain";

    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1) return;
      if (window.scrollY > 0 || startsInsideScroller(e.target)) return;
      startY.current = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0 || window.scrollY > 0) {
        startY.current = null;
        setPullValue(0);
        return;
      }
      // Resistance: the further you pull, the heavier it feels.
      setPullValue(Math.min(MAX_PULL, delta * 0.5));
    };

    const onEnd = async () => {
      if (startY.current === null) return;
      startY.current = null;
      if (pullRef.current >= THRESHOLD && !busy.current) {
        busy.current = true;
        setRefreshing(true);
        setPullValue(THRESHOLD * 0.75);
        try {
          await onRefresh();
        } catch {
          // The page keeps its old content if the refresh fails.
        } finally {
          // Keep the spinner up for a moment so a quick refresh still feels like one.
          window.setTimeout(() => {
            busy.current = false;
            setRefreshing(false);
            setPullValue(0);
          }, 400);
        }
      } else {
        setPullValue(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      root.style.overscrollBehaviorY = previous;
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [disabled, onRefresh, setPullValue]);

  const ready = pull >= THRESHOLD;
  const visible = pull > 4 || refreshing;

  return (
    <>
      <div
        aria-hidden={!visible}
        className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center"
        style={{ paddingTop: "calc(var(--safe-area-inset-top) + 0.5rem)" }}
      >
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full bg-white text-[var(--brand-pink)] shadow-lg ring-1 ring-slate-100 transition-[opacity,transform] duration-200",
            visible ? "opacity-100" : "opacity-0"
          )}
          style={{ transform: `translateY(${Math.max(0, pull - 28)}px) scale(${visible ? 1 : 0.8})` }}
        >
          {refreshing ? (
            <Spinner size="sm" label="Refreshing" />
          ) : (
            <ArrowDown
              className={cn("h-5 w-5 transition-transform duration-200", ready && "rotate-180")}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
      {children}
    </>
  );
}