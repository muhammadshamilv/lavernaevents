import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarPlus,
  Camera,
  Film,
  Image as ImageIcon,
  Images,
  Play,
  Search,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { useGalleryOverview } from "@/queries/useGalleryQueries";
import { eventTypeLabel, formatEventDate } from "@/lib/eventDisplay";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import { PageHeader, PageNav, fieldClass } from "@/components/portal/PortalUI";
import type { GalleryOverviewEvent, GalleryOverviewPreview } from "@/types/gallery.types";

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-IN")} ${count === 1 ? one : many}`;
}

function formatUpdated(iso: string | null): string | null {
  if (!iso) return null;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);

  if (days <= 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 7) return `Updated ${days} days ago`;

  return `Updated ${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Images }) {
  return (
    <Card className="flex items-center gap-3 p-4 transition-shadow [@media(hover:hover)]:hover:shadow-md">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[image:var(--gradient-brand-soft)] text-[var(--brand-pink)]">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-bold leading-tight tabular-nums text-[var(--brand-navy)]">
          {value.toLocaleString("en-IN")}
        </p>
        <p className="truncate text-xs text-slate-500">{label}</p>
      </div>
    </Card>
  );
}

function PreviewTile({
  preview,
  extra,
  className,
}: {
  preview: GalleryOverviewPreview;
  extra?: number;
  className?: string;
}) {
  const url = resolveMediaUrl(preview.thumbnail);
  const isVideo = preview.media_type === "VIDEO";

  return (
    <div className={cn("relative overflow-hidden bg-slate-100", className)}>
      {url ? (
        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-slate-200/70 text-slate-400">
          {isVideo ? <Film className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
        </div>
      )}

      {isVideo && url && (
        <span className="absolute bottom-1.5 left-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white">
          <Play className="h-3 w-3 fill-current" />
        </span>
      )}

      {extra ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-base font-semibold text-white">
          +{extra.toLocaleString("en-IN")}
        </span>
      ) : null}
    </div>
  );
}

function PreviewMosaic({ event }: { event: GalleryOverviewEvent }) {
  const previews = event.previews;
  const total = event.photo_count + event.video_count;
  const coverUrl = resolveMediaUrl(event.cover_image);

  if (previews.length === 0) {
    return (
      <div className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden bg-slate-100">
        {coverUrl && <img src={coverUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
        <div className="relative flex flex-col items-center gap-1.5 text-slate-400">
          <Camera className="h-6 w-6" />
          <span className="text-xs font-medium">No uploads yet</span>
        </div>
      </div>
    );
  }

  const more = Math.max(0, total - previews.length);
  const layout =
    previews.length === 1 ? "grid-cols-1" : "grid-cols-2 grid-rows-2";

  return (
    <div className={cn("grid aspect-[16/10] w-full gap-0.5 overflow-hidden bg-white", layout)}>
      {previews.map((preview, index) => {
        const isLast = index === previews.length - 1;
        const spansTwoRows =
          (previews.length === 2) || (previews.length === 3 && index === 0);

        return (
          <PreviewTile
            key={preview.id}
            preview={preview}
            extra={isLast && more > 0 ? more : undefined}
            className={cn(spansTwoRows && "row-span-2")}
          />
        );
      })}
    </div>
  );
}

function EventGalleryCard({ event }: { event: GalleryOverviewEvent }) {
  const updated = formatUpdated(event.last_upload_at);

  return (
    <Link
      to={`/portal/events/${event.id}/gallery`}
      className="group block rounded-[1.75rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-pink)]/50"
    >
      <Card className="h-full overflow-hidden rounded-[1.75rem] p-0 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-active:scale-[0.99]">
        <PreviewMosaic event={event} />

        <div className="p-4">
          <p className="truncate font-semibold text-[var(--brand-navy)]">{event.name}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {eventTypeLabel(event.event_type, event.custom_event_type_label)} ·{" "}
            {formatEventDate(event.event_date)}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <ImageIcon className="h-4 w-4 text-slate-400" />
              {plural(event.photo_count, "photo", "photos")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Film className="h-4 w-4 text-slate-400" />
              {plural(event.video_count, "video", "videos")}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {event.photographer_count > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-pink)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--brand-pink)]">
                <Camera className="h-3.5 w-3.5" />
                {event.photographer_count.toLocaleString("en-IN")} by photographers
              </span>
            )}
            {updated && <span className="text-xs text-slate-400">{updated}</span>}
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function PortalGallery() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [photographersOnly, setPhotographersOnly] = useState(false);

  // Wait for the user to stop typing before hitting the API.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isError, isPlaceholderData } = useGalleryOverview({
    page,
    search,
    photographersOnly,
  });

  const events = data?.results ?? [];
  const totals = data?.totals;
  const totalPages = data ? Math.max(1, Math.ceil(data.count / data.page_size)) : 1;
  const hasFilters = !!(search || photographersOnly);

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setPhotographersOnly(false);
    setPage(1);
  };

  const chipClass = (active: boolean) =>
    cn(
      "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-all active:scale-95",
      active
        ? "border-[var(--brand-pink)] bg-[var(--brand-pink)] text-white shadow-sm shadow-[var(--brand-pink)]/25"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
    );

  return (
    <div className="mobile-safe-bottom px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          eyebrow="Portal"
          icon={Images}
          title="Gallery"
          description="Photos and videos from all your events, including everything your photographers upload."
        />

        {/* Totals across every event */}
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {isLoading || !totals ? (
            Array.from({ length: 4 }).map((_, index) => (
              <Card key={index} className="flex items-center gap-3 p-4">
                <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </Card>
            ))
          ) : (
            <>
              <StatCard label="Photos" value={totals.photos} icon={ImageIcon} />
              <StatCard label="Videos" value={totals.videos} icon={Film} />
              <StatCard label="From photographers" value={totals.from_photographers} icon={Camera} />
              <StatCard label="Events with uploads" value={totals.events_with_media} icon={Images} />
            </>
          )}
        </div>

        {/* Search + filter */}
        <div className="mt-6 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search your events"
              aria-label="Search events"
              className={cn(fieldClass, "h-12 pl-11 pr-10")}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Filter events">
            <button
              type="button"
              className={chipClass(!photographersOnly)}
              onClick={() => {
                setPhotographersOnly(false);
                setPage(1);
              }}
            >
              All events
            </button>
            <button
              type="button"
              className={chipClass(photographersOnly)}
              onClick={() => {
                setPhotographersOnly(true);
                setPage(1);
              }}
            >
              With photographer uploads
            </button>
          </div>
        </div>

        {isError && (
          <p className="mt-8 text-center text-sm text-rose-600" role="alert">
            Couldn't load your gallery right now. Please refresh the page.
          </p>
        )}

        {isLoading && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="overflow-hidden p-0">
                <Skeleton className="aspect-[16/10] w-full rounded-none" />
                <div className="space-y-2 p-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && !isError && events.length === 0 && (
          <div className="mt-10 flex flex-col items-center px-6 py-14 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full text-[var(--brand-pink)]" style={{ background: "var(--gradient-brand-soft)" }}>
              {hasFilters ? <Search className="h-6 w-6" /> : <CalendarPlus className="h-6 w-6" />}
            </span>
            {hasFilters ? (
              <>
                <p className="mt-4 font-semibold text-[var(--brand-navy)]">No events match</p>
                <p className="mt-1 text-sm text-slate-500">Try another search, or show all events.</p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className={buttonVariants({ variant: "outline", className: "mt-6" })}
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="mt-4 font-semibold text-[var(--brand-navy)]">No events yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  Create an event, then upload photos or invite a photographer to add theirs.
                </p>
                <Link
                  to="/portal/events/new"
                  className={buttonVariants({ variant: "primary", className: "mt-6" })}
                >
                  Create your first event
                </Link>
              </>
            )}
          </div>
        )}

        {!isLoading && !isError && events.length > 0 && (
          <div
            className={cn(
              "mt-6 grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-3",
              isPlaceholderData && "opacity-60"
            )}
          >
            {events.map((event) => (
              <EventGalleryCard key={event.id} event={event} />
            ))}
          </div>
        )}

        {data && totalPages > 1 && (
          <PageNav
            className="mt-6"
            label={`Page ${data.page} of ${totalPages}`}
            canPrev={page > 1}
            canNext={!!data.has_more}
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => prev + 1)}
          />
        )}
      </div>
    </div>
  );
}