import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Search,
  Users,
} from "lucide-react";
import { useEvents } from "@/queries/useEventQueries";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
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
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--brand-pink)]">
          Guests
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--brand-navy)] sm:text-3xl">
          Select an event to manage its guests
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Every guest list belongs to a specific event - pick one below.
        </p>

        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search your events"
            aria-label="Search events"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-[var(--brand-navy)] placeholder:text-slate-400 focus:border-[var(--brand-pink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-pink)]/40"
          />
        </div>

        {isError && (
          <p className="mt-10 text-center text-sm text-rose-600">
            Couldn't load your events right now. Please refresh the page.
          </p>
        )}

        {isLoading && (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={index} className="flex items-center gap-3 p-4">
                <Skeleton className="h-12 w-12 rounded-xl" />
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
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
              <CalendarPlus className="h-6 w-6" />
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
                <Link key={event.id} to={`/portal/events/${event.id}/guests`} className="block">
                  <Card className="card-hover-lift flex items-center gap-3 p-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
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
                    <span className="flex items-center gap-1.5 shrink-0 text-sm font-medium text-[var(--brand-pink)]">
                      <Users className="h-4 w-4" />
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {pagination && pagination.total_pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <span>
              Page {pagination.current_page} of {pagination.total_pages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={!pagination.previous}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => prev + 1)}
                disabled={!pagination.next}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}