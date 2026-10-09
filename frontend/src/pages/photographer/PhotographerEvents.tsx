import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Camera, CalendarDays, Clock, MapPin, Timer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/auth.store";
import { useMyPhotographerEvents } from "@/queries/usePhotographerQueries";
import { formatEventDate, formatEventTime } from "@/lib/eventDisplay";
import { resolveMediaUrl } from "@/lib/media";

function formatExpiry(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PhotographerEvents() {
  const { user } = useAuthStore();
  const firstName = user?.full_name?.split(" ")[0] ?? "there";

  const { data: grants, isLoading, isError } = useMyPhotographerEvents();

  return (
    <div className="mobile-safe-bottom px-4 py-6 sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-pink)]">Photographer</p>
          <h1 className="mt-1.5 text-xl font-bold text-[var(--brand-navy)] sm:text-2xl">Welcome, {firstName}</h1>
          <p className="mt-1.5 text-sm text-slate-500">Events you've been granted access to.</p>

          <div className="mt-6">
            {isLoading && (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
              </div>
            )}

            {isError && (
              <Card className="p-8 text-center text-sm text-rose-600">
                Couldn't load your events. Please refresh the page.
              </Card>
            )}

            {!isLoading && !isError && (!grants || grants.length === 0) && (
              <Card className="p-10 text-center">
                <span
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ background: "var(--gradient-brand-soft)" }}
                >
                  <Camera className="h-5 w-5 text-[var(--brand-navy)]" />
                </span>
                <p className="mt-3 text-sm text-slate-500">
                  You don't have access to any events yet. Ask the organizer to invite you by your mobile number.
                </p>
              </Card>
            )}

            {!isLoading && grants && grants.length > 0 && (
              <div className="space-y-3">
                {grants.map((grant) => {
                  const coverUrl = resolveMediaUrl(grant.event.cover_image);

                  return (
                    <Link key={grant.id} to={`/photographer/events/${grant.event.id}`} className="block">
                      <Card className="card-hover-lift flex items-center gap-4 p-4">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                          {coverUrl ? (
                            <img src={coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <Camera className="h-5 w-5 text-slate-300" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[var(--brand-navy)]">{grant.event.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                              {formatEventDate(grant.event.event_date)}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              {formatEventTime(grant.event.event_time)}
                            </span>
                          </div>
                          {grant.event.venue_name && (
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                              <MapPin className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{grant.event.venue_name}</span>
                            </div>
                          )}
                          {grant.expires_at && (
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-600">
                              <Timer className="h-3.5 w-3.5 shrink-0" />
                              Access until {formatExpiry(grant.expires_at)}
                            </div>
                          )}
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}