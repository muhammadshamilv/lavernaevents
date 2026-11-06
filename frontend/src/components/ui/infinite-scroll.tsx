import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { PulsingDots } from "@/components/ui/pulsing-dots";

// Loads the next batch when the end of a list comes close to the screen.
// It calls the same "load more" function the button used to call. If the
// automatic load does not work (for example the list does not grow), the
// "Load more" button stays available, so nothing is ever stuck.

interface InfiniteScrollTriggerProps {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  /** How many items are on screen now. Used to notice a load that adds nothing. */
  itemCount: number;
}

const MIN_GAP_MS = 600;
const MAX_EMPTY_LOADS = 2;

export function InfiniteScrollTrigger({ hasMore, isLoading, onLoadMore, itemCount }: InfiniteScrollTriggerProps) {
  const sentinel = useRef<HTMLDivElement | null>(null);
  const lastLoadAt = useRef(0);
  const countAtLastLoad = useRef<number | null>(null);
  const emptyLoads = useRef(0);
  const latest = useRef({ hasMore, isLoading, onLoadMore, itemCount });
  latest.current = { hasMore, isLoading, onLoadMore, itemCount };

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        const { hasMore: more, isLoading: loading, onLoadMore: load, itemCount: count } = latest.current;
        if (!more || loading) return;
        if (Date.now() - lastLoadAt.current < MIN_GAP_MS) return;

        if (countAtLastLoad.current !== null && count <= countAtLastLoad.current) {
          emptyLoads.current += 1;
        } else {
          emptyLoads.current = 0;
        }
        if (emptyLoads.current >= MAX_EMPTY_LOADS) return;

        countAtLastLoad.current = count;
        lastLoadAt.current = Date.now();
        load();
      },
      { rootMargin: "400px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoading, itemCount]);

  if (!hasMore) return null;

  return (
    <div ref={sentinel} className="mt-6 flex min-h-12 items-center justify-center text-center">
      {isLoading ? (
        <PulsingDots label="Loading more" />
      ) : (
        <Button variant="outline" onClick={onLoadMore}>
          Load more
        </Button>
      )}
    </div>
  );
}