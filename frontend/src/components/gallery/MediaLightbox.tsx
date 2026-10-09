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

  if (!item) return null;

  const fileUrl = resolveMediaUrl(item.file);

  return (
    <div
      className="fixed inset-0 z-[70] flex h-dvh items-center justify-center bg-black/90"
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
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white active:bg-white/30"
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
          className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white active:bg-white/30"
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
          className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white active:bg-white/30"
          aria-label="Next"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      <div className="flex max-h-full max-w-full items-center justify-center p-2 sm:p-10" onClick={(event) => event.stopPropagation()}>
        {item.media_type === "IMAGE" ? (
          <img
            src={fileUrl ?? ""}
            alt={item.caption || "Gallery item"}
            className="max-h-[calc(100dvh-5rem)] max-w-full object-contain"
          />
        ) : (
          <video
            key={item.id}
            src={fileUrl ?? ""}
            controls
            playsInline
            autoPlay
            className="max-h-[calc(100dvh-5rem)] max-w-full"
          />
        )}
      </div>

      <p className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-0 right-0 text-center text-xs text-white/70">
        {index + 1} / {items.length}
        {item.uploaded_by ? ` · by ${item.uploaded_by.full_name}` : ""}
      </p>
    </div>
  );
}