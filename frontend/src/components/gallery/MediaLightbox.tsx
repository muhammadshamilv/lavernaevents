import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { resolveMediaUrl } from "@/lib/media";
import type { GalleryMedia } from "@/types/gallery.types";

interface Props {
  items: GalleryMedia[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

const ROUND_BUTTON =
  "flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 active:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

/** Full-screen viewer for one photo or video, with arrows, swipe and
 * keyboard (Escape, left, right). The page behind it stops scrolling. */
export default function MediaLightbox({ items, index, onIndexChange, onClose }: Props) {
  const touchStartX = useRef<number | null>(null);
  const item = items[index];

  const hasPrevious = index > 0;
  const hasNext = index < items.length - 1;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      if (event.key === "ArrowRight" && index < items.length - 1) onIndexChange(index + 1);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [index, items.length, onClose, onIndexChange]);

  // Warm the next/previous photo so arrow and swipe feel instant.
  useEffect(() => {
    [items[index - 1], items[index + 1]].forEach((neighbour) => {
      if (neighbour?.media_type === "IMAGE") {
        const url = resolveMediaUrl(neighbour.file);
        if (url) new Image().src = url;
      }
    });
  }, [index, items]);

  if (!item) return null;

  const fileUrl = resolveMediaUrl(item.file);
  const progress = items.length > 1 ? ((index + 1) / items.length) * 100 : 100;

  return (
    <div
      className="fixed inset-0 z-[70] flex h-dvh items-center justify-center bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
      onClick={onClose}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        const end = event.changedTouches[0]?.clientX;
        touchStartX.current = null;

        if (start === null || end === undefined) return;
        const delta = end - start;

        if (delta > 60 && hasPrevious) onIndexChange(index - 1);
        if (delta < -60 && hasNext) onIndexChange(index + 1);
      }}
    >
      {/* thin progress line across the top */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-white/10">
        <div className="h-full bg-[var(--brand-pink)] transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium tabular-nums text-white/90 backdrop-blur-md">
        {index + 1} / {items.length}
      </div>

      <button
        type="button"
        onClick={onClose}
        className={`${ROUND_BUTTON} absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))]`}
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {hasPrevious && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onIndexChange(index - 1);
          }}
          className={`${ROUND_BUTTON} absolute left-2 sm:left-5 sm:h-12 sm:w-12`}
          aria-label="Previous"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {hasNext && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onIndexChange(index + 1);
          }}
          className={`${ROUND_BUTTON} absolute right-2 sm:right-5 sm:h-12 sm:w-12`}
          aria-label="Next"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      <div className="flex max-h-full max-w-full items-center justify-center p-2 sm:p-14" onClick={(event) => event.stopPropagation()}>
        {item.media_type === "IMAGE" ? (
          <img
            key={item.id}
            src={fileUrl ?? ""}
            alt={item.caption || "Gallery item"}
            className="max-h-[calc(100dvh-7rem)] max-w-full rounded-lg object-contain shadow-2xl animate-in fade-in duration-200"
          />
        ) : (
          <video
            key={item.id}
            src={fileUrl ?? ""}
            controls
            playsInline
            autoPlay
            className="max-h-[calc(100dvh-7rem)] max-w-full rounded-lg shadow-2xl"
          />
        )}
      </div>

      {(item.caption || item.uploaded_by) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10 text-center">
          {item.caption && <p className="mx-auto max-w-xl text-sm text-white/90">{item.caption}</p>}
          {item.uploaded_by && <p className="mt-0.5 text-xs text-white/60">by {item.uploaded_by.full_name}</p>}
        </div>
      )}
    </div>
  );
}