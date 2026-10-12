import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarPlus,
  ChevronRight,
  Image as ImageIcon,
  Search,
  Users,
} from "lucide-react";
import { useEvents } from "@/queries/useEventQueries";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader, PageNav, fieldClass } from "@/components/portal/PortalUI";
import { eventTypeLabel, formatEventDate } from "@/lib/eventDisplay";
import { resolveMediaUrl } from "@/lib/media";

// A launcher, not a duplicate guest list: guests are always scoped to a
// specific event on the backend (there's no cross-event guest endpoint),
// so this page's only job is "pick which event's guests you want to
// manage" and hand off to that event's real guest page.
export default function GuestsHub() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isError } = useEvents({ page, search });
  const events = data?.events ?? [];
  const pagination = data?.pagination;

  return (
    <div className="mobile-safe-bottom px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <PageHeader
          eyebrow="Guests"
          icon={Users}
          title="Select an event to manage its guests"
          description="Every guest list belongs to a specific event - pick one below."
          className="[&_h1]:whitespace-normal"
        />

        <div className="relative mt-6">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search your events"
            aria-label="Search events"
            className={`${fieldClass} h-12 pl-11 pr-4 shadow-sm`}
          />
        </div>

        {isError && (
          <p className="mt-10 rounded-2xl bg-rose-50 px-4 py-3 text-center text-sm text-rose-600">
            Couldn't load your events right now. Please refresh the page.
          </p>
        )}

        {isLoading && (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={index} className="flex items-center gap-3 p-4">
                <Skeleton className="h-14 w-14 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && !isError && events.length === 0 && search && (
          <p className="mt-10 text-center text-sm text-slate-500">
            No events match "{search}".
          </p>
        )}

        {!isLoading && !isError && events.length === 0 && !search && (
          <Card className="mt-8 p-10 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
              <CalendarPlus className="h-7 w-7" />
            </span>
            <p className="mt-4 font-semibold text-[var(--brand-navy)]">No events yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Create an event first, then you can add and manage its guests.
            </p>
            <Link
              to="/portal/events/new"
              className={buttonVariants({ variant: "primary", className: "mt-6" })}
            >
              Create an event
            </Link>
          </Card>
        )}

        {!isLoading && !isError && events.length > 0 && (
          <div className="mt-6 space-y-3">
            {events.map((event) => {
              const coverUrl = resolveMediaUrl(event.cover_image);

              return (
                <Link
                  key={event.id}
                  to={`/portal/events/${event.id}/guests`}
                  className="group block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-pink)]/40"
                >
                  <Card className="card-hover-lift flex items-center gap-3.5 p-3.5 sm:p-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-100">
                      {coverUrl ? (
                        <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-[var(--brand-navy)]">
                        {event.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {eventTypeLabel(event.event_type, event.custom_event_type_label)} · {formatEventDate(event.event_date)}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--brand-pink)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--brand-pink)] transition-colors [@media(hover:hover)]:group-hover:bg-[var(--brand-pink)] [@media(hover:hover)]:group-hover:text-white">
                      <Users className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Guests</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {pagination && pagination.total_pages > 1 && (
          <PageNav
            className="mt-5"
            label={`Page ${pagination.current_page} of ${pagination.total_pages}`}
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => prev + 1)}
            canPrev={!!pagination.previous}
            canNext={!!pagination.next}
          />
        )}
      </div>
    </div>
  );
}