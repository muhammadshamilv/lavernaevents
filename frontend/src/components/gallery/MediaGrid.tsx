import type { ReactNode } from "react";
import { Play, Star } from "lucide-react";
import { resolveMediaUrl } from "@/lib/media";
import type { GalleryMedia } from "@/types/gallery.types";

interface Props {
  items: GalleryMedia[];
  onOpen: (index: number) => void;
  /** Optional per-tile buttons (feature / delete) for organizers. */
  renderActions?: (item: GalleryMedia) => ReactNode;
  className?: string;
}

/** Square thumbnails. Uses the small generated thumbnail (not the full
 * photo) and lazy-loads, so a large gallery stays light on mobile data.
 * Tile buttons are always visible on touch screens and only appear on
 * hover where a real mouse exists. */
export default function MediaGrid({ items, onOpen, renderActions, className }: Props) {
  return (
    <div className={className ?? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"}>
      {items.map((item, index) => {
        const thumb = resolveMediaUrl(item.thumbnail) ?? (item.media_type === "IMAGE" ? resolveMediaUrl(item.file) : null);

        return (
          <div key={item.id} className="group relative aspect-square overflow-hidden rounded-2xl bg-slate-100">
            <button
              type="button"
              onClick={() => onOpen(index)}
              className="block h-full w-full"
              aria-label={`Open ${item.media_type === "VIDEO" ? "video" : "photo"} ${index + 1}`}
            >
              {thumb ? (
                <img
                  src={thumb}
                  alt={item.caption || ""}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-slate-200 text-slate-400">
                  <Play className="h-6 w-6" />
                </span>
              )}
            </button>

            {item.media_type === "VIDEO" && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white">
                  <Play className="h-5 w-5 fill-current" />
                </span>
              </span>
            )}

            {item.is_featured && (
              <span className="pointer-events-none absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-gold)] text-white">
                <Star className="h-3.5 w-3.5 fill-current" />
              </span>
            )}

            {renderActions && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-end gap-1.5 bg-gradient-to-t from-black/40 to-transparent p-2 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100">
                <div className="pointer-events-auto flex gap-1.5">{renderActions(item)}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}