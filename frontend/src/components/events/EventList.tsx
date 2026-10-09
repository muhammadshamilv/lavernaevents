import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Eye,
  Image as ImageIcon,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { useEvents } from "@/queries/useEventQueries";
import {
  eventStatusBadgeClass,
  eventTypeLabel,
  formatEventDate,
} from "@/lib/eventDisplay";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import { EVENT_STATUS_OPTIONS } from "@/types/event.types";
import type { EventStatus } from "@/types/event.types";

type WhenFilter = "" | "upcoming" | "past";

const WHEN_OPTIONS: { value: WhenFilter; label: string }[] = [
  { value: "", label: "All dates" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];

export default function EventList() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EventStatus | "">("");
  const [when, setWhen] = useState<WhenFilter>("");

  // Wait for the user to stop typing before hitting the API.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isError, isPlaceholderData } = useEvents({
    page,
    search,
    status,
    when,
  });

  const events = data?.events ?? [];
  const pagination = data?.pagination;
  const hasFilters = !!(search || status || when);

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatus("");
    setWhen("");
    setPage(1);
  };

  const chipClass = (active: boolean) =>
    cn(
      "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
      active
        ? "border-[var(--brand-pink)] bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]"
        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
    );

  return (
    <div className="mobile-safe-bottom relative px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--brand-navy)] lg:text-2xl">
              Your events
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              <span className="lg:hidden">Tap an event to view details.</span>
              <span className="hidden lg:inline">Manage every event you've created.</span>
            </p>
          </div>
          {/* Desktop "New event" button - hidden below lg:, replaced by the FAB */}
          <Link
            to="/portal/events/new"
            className={cn(buttonVariants({ variant: "primary" }), "hidden lg:inline-flex")}
          >
            <CalendarPlus className="h-4 w-4" />
            New event
          </Link>
        </div>

        {/* Search + filters */}
        <div className="mt-5 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, venue or host"
              aria-label="Search events"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-10 text-sm text-[var(--brand-navy)] placeholder:text-slate-400 focus:border-[var(--brand-pink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-pink)]/40"
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

          <div
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
            role="group"
            aria-label="Filter by status"
          >
            <button
              type="button"
              className={chipClass(status === "")}
              onClick={() => {
                setStatus("");
                setPage(1);
              }}
            >
              All
            </button>
            {EVENT_STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={chipClass(status === option.value)}
                onClick={() => {
                  setStatus(option.value);
                  setPage(1);
                }}
              >
                {option.label}
              </button>
            ))}
            <span className="mx-1 hidden w-px self-stretch bg-slate-200 sm:block" />
            {WHEN_OPTIONS.filter((option) => option.value !== "").map((option) => (
              <button
                key={option.value}
                type="button"
                className={chipClass(when === option.value)}
                onClick={() => {
                  setWhen(when === option.value ? "" : option.value);
                  setPage(1);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {isError && (
          <p className="mt-8 text-center text-sm text-rose-600 lg:mt-6" role="alert">
            Couldn't load your events right now. Please refresh the page.
          </p>
        )}

        {isLoading && (
          <>
            {/* Mobile skeleton */}
            <div className="mt-6 space-y-3 lg:hidden">
              {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index} className="flex items-center gap-3 p-4">
                  <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </Card>
              ))}
            </div>
            {/* Desktop skeleton */}
            <Card className="mt-6 hidden overflow-hidden lg:block">
              <div className="divide-y divide-slate-100">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-4 px-6 py-4">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="ml-auto h-6 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {!isLoading && !isError && events.length === 0 && (
          <div className="mt-10 flex flex-col items-center px-6 py-16 text-center lg:mt-6">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
              <CalendarPlus className="h-6 w-6" />
            </span>
            {hasFilters ? (
              <>
                <p className="mt-4 font-semibold text-[var(--brand-navy)]">
                  No events match your filters
                </p>
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
                  Create your first event to start planning.
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
          <div className={cn("transition-opacity", isPlaceholderData && "opacity-60")}>
            {/* Mobile / tablet: card list */}
            <div className="mt-6 space-y-3 lg:hidden">
              {events.map((event) => {
                const coverUrl = resolveMediaUrl(event.cover_image);
                return (
                  <Link key={event.id} to={`/portal/events/${event.id}`} className="block">
                    <Card className="flex items-center gap-3 p-4 transition-transform active:scale-[0.98]">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                        {coverUrl ? (
                          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-slate-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-[var(--brand-navy)]">{event.name}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {eventTypeLabel(event.event_type, event.custom_event_type_label)} ·{" "}
                          {formatEventDate(event.event_date)}
                        </p>
                        {event.venue_name && (
                          <p className="mt-0.5 truncate text-xs text-slate-400">{event.venue_name}</p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                          eventStatusBadgeClass(event.status)
                        )}
                      >
                        {event.status}
                      </span>
                    </Card>
                  </Link>
                );
              })}
            </div>

            {/* Desktop: table */}
            <Card className="mt-6 hidden overflow-hidden lg:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Venue</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {events.map((event) => {
                    const coverUrl = resolveMediaUrl(event.cover_image);
                    return (
                      <tr key={event.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <Link
                            to={`/portal/events/${event.id}`}
                            className="flex items-center gap-3"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                              {coverUrl ? (
                                <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <ImageIcon className="h-4 w-4 text-slate-300" />
                              )}
                            </div>
                            <span className="font-medium text-[var(--brand-navy)]">{event.name}</span>
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {eventTypeLabel(event.event_type, event.custom_event_type_label)}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{formatEventDate(event.event_date)}</td>
                        <td className="px-6 py-4 text-slate-600">{event.venue_name || "-"}</td>
                        <td className="px-6 py-4">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                              eventStatusBadgeClass(event.status)
                            )}
                          >
                            {event.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              to={`/portal/events/${event.id}`}
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-[var(--brand-navy)]"
                              aria-label="View event"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            <Link
                              to={`/portal/events/${event.id}/edit`}
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-[var(--brand-navy)]"
                              aria-label="Edit event"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
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

      {/* Mobile FAB - hidden at lg: since the header button covers that case */}
      <Link
        to="/portal/events/new"
        className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-pink)] text-white soft-shadow-lg transition-transform active:scale-95 lg:hidden"
        style={{ bottom: "calc(5.5rem + var(--safe-area-inset-bottom))" }}
        aria-label="New event"
      >
        <CalendarPlus className="h-6 w-6" />
      </Link>
    </div>
  );
}