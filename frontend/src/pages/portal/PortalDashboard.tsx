import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlarmClock,
  CalendarDays,
  CalendarPlus,
  Image as ImageIcon,
  Mail,
  Send,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/auth.store";
import { useEvents } from "@/queries/useEventQueries";
import { useOrganizerInvitationOverview } from "@/queries/useDashboardQueries";
import { eventStatusBadgeClass, eventTypeLabel, formatEventDate } from "@/lib/eventDisplay";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import UsageOverview from "@/components/membership/UsageOverview";
import type { InvitationChannelKey } from "@/types/dashboard.types";

const QUICK_ACTIONS = [
  { to: "/portal/events/new", label: "New event", icon: CalendarPlus, accent: "pink" as const },
  { to: "/portal/guests", label: "Guests", icon: Users, accent: "navy" as const },
  { to: "/portal/templates", label: "Templates", icon: Mail, accent: "green" as const },
  { to: "/portal/gallery", label: "Gallery", icon: ImageIcon, accent: "gold" as const },
];

const accentIconClass: Record<(typeof QUICK_ACTIONS)[number]["accent"], string> = {
  pink: "bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]",
  navy: "bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]",
  green: "bg-[var(--brand-green)]/12 text-[var(--brand-green-dark)]",
  gold: "bg-[var(--brand-gold)]/15 text-[#8a5c0a]",
};

const CHANNEL_LABEL: Record<InvitationChannelKey, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  SMS: "SMS",
  VOICE_CALL: "Voice Call",
};

function formatEventDateShort(value: string): string {
  // "YYYY-MM-DD" alone is read as UTC midnight, which can show the
  // previous day west of UTC; pin it to local midnight instead.
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * The portal's landing dashboard: gradient header, stat tiles, quota
 * usage, a per-channel send/failure chart, a prioritized "needs attention"
 * list, quick actions and recent events. The stats come from one combined
 * backend call (useOrganizerInvitationOverview).
 */
export default function PortalDashboard() {
  const { user } = useAuthStore();
  const firstName = user?.full_name?.split(" ")[0] ?? "there";

  const {
    data: overview,
    isLoading: overviewLoading,
    isError: overviewError,
    refetch: refetchOverview,
  } = useOrganizerInvitationOverview();
  const { data: eventsPage, isLoading: eventsLoading } = useEvents(1);
  const recentEvents = (eventsPage?.events ?? []).slice(0, 3);

  const statTiles = [
    { label: "Events", value: overview?.total_events, icon: CalendarDays },
    { label: "Guests", value: overview?.total_guests, icon: Users },
    { label: "Accepted", value: overview?.total_accepted, icon: UserCheck },
    { label: "Expected attendance", value: overview?.total_expected_attendance, icon: Send },
  ];

  const chartData = overview
    ? (Object.keys(overview.channel_performance) as InvitationChannelKey[]).map((channel) => ({
        channel: CHANNEL_LABEL[channel],
        Sent: overview.channel_performance[channel].sent,
        Failed: overview.channel_performance[channel].failed,
      }))
    : [];

  const attentionEvents = overview?.events_needing_attention ?? [];
  const waitingReminders = overview?.pending_whatsapp_reminders ?? 0;

  return (
    <div className="mobile-safe-bottom overflow-hidden px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mx-auto max-w-5xl"
      >
        <div
          className="relative overflow-hidden rounded-3xl px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10"
          style={{ background: "var(--gradient-brand)" }}
        >
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl"
            aria-hidden
          />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              Dashboard
            </p>
            <h1 className="mt-1.5 text-xl font-bold text-white sm:text-2xl lg:text-3xl">
              Welcome back, {firstName}
            </h1>
            <p className="mt-1.5 text-sm text-white/70">
              Here's how your invitations are performing.
            </p>
          </div>
        </div>

        <div className="mt-5 sm:mt-6">
          {overviewError && (
            <div
              role="alert"
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              <span>Couldn't load your dashboard numbers.</span>
              <button
                type="button"
                onClick={() => refetchOverview()}
                className="min-h-10 rounded-full px-3 font-semibold underline underline-offset-4"
              >
                Try again
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {statTiles.map((tile) => (
              <Card key={tile.label} className="p-4 sm:p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
                  <tile.icon className="h-4 w-4" />
                </span>
                {overviewLoading ? (
                  <Skeleton className="mt-3 h-7 w-12" />
                ) : (
                  <p className="mt-3 text-xl font-bold text-[var(--brand-navy)] sm:text-2xl">
                    {tile.value ?? 0}
                  </p>
                )}
                <p className="text-xs text-slate-500">{tile.label}</p>
              </Card>
            ))}
          </div>

          {/* Invitation / template / voice-call quota usage. */}
          <div className="mt-5 sm:mt-6">
            <UsageOverview />
          </div>

          {/* Per-channel performance chart. */}
          <div className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Channel performance
            </p>
            <Card className="mt-3 p-4 sm:p-5">
              {overviewLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : chartData.every((row) => row.Sent === 0 && row.Failed === 0) ? (
                <p className="py-10 text-center text-sm text-slate-500">
                  No sends yet - this chart fills in once you start sending invitations.
                </p>
              ) : (
                <div
                  className="h-64 w-full"
                  role="img"
                  aria-label={`Messages sent and failed per channel: ${chartData
                    .map((row) => `${row.channel} ${row.Sent} sent, ${row.Failed} failed`)
                    .join("; ")}`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
                      <XAxis dataKey="channel" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Sent" fill="var(--brand-green)" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="Failed" fill="#F43F5E" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          {/* WhatsApp reminders are sent by the organizer tapping a link, so
              they pile up until someone acts - surface the total. */}
          {!overviewLoading && waitingReminders > 0 && (
            <div className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlarmClock className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {waitingReminders} WhatsApp reminder{waitingReminders === 1 ? " is" : "s are"} waiting
                for you to send. Open the event's invitations page to send them.
              </p>
            </div>
          )}

          {/* Events needing attention. */}
          {!overviewLoading && attentionEvents.length > 0 && (
            <div className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Needs attention
              </p>
              <div className="mt-3 space-y-2.5">
                {attentionEvents.map((event) => (
                  <Link
                    key={event.event_id}
                    to={`/portal/events/${event.event_id}/invitations`}
                  >
                    <Card className="card-hover-lift flex items-center gap-3 p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                        <AlarmClock className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[var(--brand-navy)]">
                          {event.event_name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {formatEventDateShort(event.event_date)} &middot;{" "}
                          {event.pending_count} of {event.total_guests} invited guests pending
                          {event.pending_whatsapp_reminders > 0 &&
                            ` · ${event.pending_whatsapp_reminders} WhatsApp reminder${event.pending_whatsapp_reminders === 1 ? "" : "s"} waiting`}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        {Math.round(event.pending_rate * 100)}% pending
                      </span>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <p className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Quick actions
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {QUICK_ACTIONS.map((action) => (
              <Link key={action.to} to={action.to}>
                <Card className="card-hover-lift flex h-full flex-col items-center gap-2.5 p-4 text-center sm:p-5">
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full",
                      accentIconClass[action.accent]
                    )}
                  >
                    <action.icon className="h-5 w-5" />
                  </span>
                  <p className="text-sm font-semibold text-[var(--brand-navy)]">
                    {action.label}
                  </p>
                </Card>
              </Link>
            ))}
          </div>

          <div className="mt-8 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Recent events
            </p>
            {recentEvents.length > 0 && (
              <Link to="/portal/events" className="text-sm font-semibold text-[var(--brand-pink)]">
                View all
              </Link>
            )}
          </div>

          <Card className="mt-3 p-4 sm:p-5">
            {eventsLoading && (
              <div className="space-y-2.5">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
              </div>
            )}

            {!eventsLoading && recentEvents.length === 0 && (
              <div className="py-6 text-center">
                <span
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ background: "var(--gradient-brand-soft)" }}
                >
                  <Sparkles className="h-5 w-5 text-[var(--brand-navy)]" />
                </span>
                <p className="mt-3 text-sm text-slate-500">
                  You haven't created any events yet.
                </p>
                <Link
                  to="/portal/events/new"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand-pink)]"
                >
                  <CalendarPlus className="h-4 w-4" />
                  Create your first event
                </Link>
              </div>
            )}

            {!eventsLoading && recentEvents.length > 0 && (
              <div className="space-y-2.5">
                {recentEvents.map((event) => {
                  const coverUrl = resolveMediaUrl(event.cover_image);

                  return (
                    <Link
                      key={event.id}
                      to={`/portal/events/${event.id}`}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5 transition-colors hover:bg-slate-50"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                        {coverUrl ? (
                          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-slate-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--brand-navy)]">
                          {event.name}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {eventTypeLabel(event.event_type)} · {formatEventDate(event.event_date)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                          eventStatusBadgeClass(event.status)
                        )}
                      >
                        {event.status}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </motion.div>
    </div>
  );
}