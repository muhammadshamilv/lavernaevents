import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Camera,
  Clock,
  FileText,
  Image as ImageIcon,
  Mail,
  MapPin,
  Pencil,
  QrCode,
  Send,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  useDeleteEventMutation,
  useEvent,
  useUpdateEventMutation,
} from "@/queries/useEventQueries";
import { EVENT_STATUS_TRANSITIONS } from "@/types/event.types";
import type { EventStatus } from "@/types/event.types";
import { useEventDashboardStats } from "@/queries/useDashboardQueries";
import {
  eventStatusBadgeClass,
  eventTypeLabel,
  formatEventDate,
  formatEventTime,
} from "@/lib/eventDisplay";
import { resolveMediaUrl } from "@/lib/media";
import { getApiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

const STATUS_ACTION_LABEL: Record<EventStatus, string> = {
  DRAFT: "Move to draft",
  PUBLISHED: "Publish",
  COMPLETED: "Mark completed",
  CANCELLED: "Cancel event",
};

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const eventId = id ? Number(id) : undefined;
  const navigate = useNavigate();

  const { data: event, isLoading, isError } = useEvent(eventId);
  const deleteMutation = useDeleteEventMutation();
  const statusMutation = useUpdateEventMutation();
  const { data: stats, isLoading: statsLoading } = useEventDashboardStats(eventId);

  const [confirm, setConfirm] = useState<"delete" | "cancel" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const changeStatus = (status: EventStatus) => {
    if (!eventId) return;
    setActionError(null);

    statusMutation.mutate(
      { id: eventId, payload: { status } },
      {
        onSuccess: () => setConfirm(null),
        onError: (error) => {
          setConfirm(null);
          setActionError(getApiErrorMessage(error, "Couldn't change the event status."));
        },
      }
    );
  };

  const handleDelete = () => {
    if (!eventId) return;
    setActionError(null);

    deleteMutation.mutate(eventId, {
      onSuccess: () => navigate("/portal/events", { replace: true }),
      onError: (error) => {
        setActionError(getApiErrorMessage(error, "Couldn't delete this event."));
        setConfirm(null);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <Skeleton className="h-4 w-32" />
        <Card className="mt-6 overflow-hidden">
          <Skeleton className="h-48 w-full rounded-none" />
          <div className="p-8">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="mt-3 h-4 w-48" />
          </div>
        </Card>
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Card className="p-8">
          <p className="text-sm text-slate-500">
            This event couldn't be found, or you don't have access to it.
          </p>
          <Link
            to="/portal/events"
            className={buttonVariants({ variant: "outline", className: "mt-6" })}
          >
            Back to events
          </Link>
        </Card>
      </div>
    );
  }

  const coverUrl = resolveMediaUrl(event.cover_image);

  const statTiles = [
    { label: "Guests", value: stats?.total_guests, icon: Users, accent: "navy" as const },
    { label: "Accepted", value: stats?.accepted_count, icon: UserCheck, accent: "green" as const },
    { label: "Invites sent", value: stats?.invitations_sent, icon: Send, accent: "pink" as const },
    {
      label: "Expected",
      value: stats?.expected_attendance,
      icon: CalendarDays,
      accent: "gold" as const,
    },
  ];

  const accentClass: Record<(typeof statTiles)[number]["accent"], string> = {
    pink: "bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]",
    navy: "bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]",
    green: "bg-[var(--brand-green)]/12 text-[var(--brand-green-dark)]",
    gold: "bg-[var(--brand-gold)]/15 text-[#8a5c0a]",
  };

  return (
    <div className="mobile-safe-bottom px-4 py-6 sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/portal/events"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-[var(--brand-navy)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to events
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="mt-4 overflow-hidden">
            <div className="relative flex h-48 items-center justify-center bg-slate-100 sm:h-56">
              {coverUrl ? (
                <img src={coverUrl} alt={event.name} className="h-full w-full object-cover" />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center"
                  style={{ background: "var(--gradient-brand-soft)" }}
                >
                  <ImageIcon className="h-10 w-10 text-[var(--brand-navy)]/20" />
                </div>
              )}
            </div>

            <div className="p-5 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                      eventStatusBadgeClass(event.status)
                    )}
                  >
                    {event.status}
                  </span>
                  <h1 className="mt-3 text-xl font-bold text-[var(--brand-navy)] sm:text-2xl">
                    {event.name}
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {eventTypeLabel(event.event_type, event.custom_event_type_label)}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Link
                    to={`/portal/events/${event.id}/edit`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                    aria-label="Edit event"
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="hidden sm:inline">Edit</span>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-rose-200 text-rose-600 hover:bg-rose-50"
                    onClick={() => setConfirm("delete")}
                    aria-label="Delete event"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                </div>
              </div>

              {actionError && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3" role="alert">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="text-sm text-amber-800">{actionError}</p>
                </div>
              )}

              {/* Status actions - only the moves the server allows */}
              <div className="mt-4 flex flex-wrap gap-2">
                {EVENT_STATUS_TRANSITIONS[event.status].map((next) => (
                  <Button
                    key={next}
                    size="sm"
                    variant={next === "CANCELLED" ? "outline" : "primary"}
                    className={
                      next === "CANCELLED"
                        ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                        : undefined
                    }
                    isLoading={statusMutation.isPending && statusMutation.variables?.payload.status === next}
                    disabled={statusMutation.isPending}
                    onClick={() => (next === "CANCELLED" ? setConfirm("cancel") : changeStatus(next))}
                  >
                    {STATUS_ACTION_LABEL[next]}
                  </Button>
                ))}
              </div>

              {event.description && (
                <p className="mt-5 text-sm text-slate-600">{event.description}</p>
              )}

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {statTiles.map((tile) => (
                  <div key={tile.label} className="premium-card p-3.5">
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full",
                        accentClass[tile.accent]
                      )}
                    >
                      <tile.icon className="h-4 w-4" />
                    </span>
                    {statsLoading ? (
                      <Skeleton className="mt-2.5 h-6 w-10" />
                    ) : (
                      <p className="mt-2.5 text-lg font-bold text-[var(--brand-navy)]">
                        {tile.value ?? 0}
                      </p>
                    )}
                    <p className="text-xs text-slate-500">{tile.label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 rounded-2xl bg-[var(--surface-muted)] p-5 sm:grid-cols-2">
                <div className="flex items-center gap-2.5 text-sm text-slate-600">
                  <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
                  {formatEventDate(event.event_date)}
                </div>
                <div className="flex items-center gap-2.5 text-sm text-slate-600">
                  <Clock className="h-4 w-4 shrink-0 text-slate-400" />
                  {formatEventTime(event.event_time)}
                  {event.event_end_time && ` - ${formatEventTime(event.event_end_time)}`}
                </div>
                {event.venue_name && (
                  <div className="flex items-start gap-2.5 text-sm text-slate-600 sm:col-span-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <span className="min-w-0 break-words">
                      {event.venue_name}
                      {event.address && ` - ${event.address}`}
                    </span>
                  </div>
                )}
                {event.host_name && (
                  <div className="flex items-center gap-2.5 text-sm text-slate-600">
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                    Hosted by {event.host_name}
                  </div>
                )}
                {event.google_maps_link && (
                  <a
                    href={event.google_maps_link}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2.5 text-sm font-medium text-[var(--brand-pink)]"
                  >
                    <MapPin className="h-4 w-4 shrink-0" />
                    View on Google Maps
                  </a>
                )}
              </div>
            </div>
          </Card>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 sm:gap-5">
            <Link to={`/portal/events/${event.id}/gallery`} className="sm:col-span-2">
              <Card className="card-hover-lift h-full p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-green)]/12 text-[var(--brand-green-dark)]">
                      <Camera className="h-5 w-5" />
                    </span>
                    <h2 className="font-semibold text-[var(--brand-navy)]">Gallery</h2>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-500">
                  Upload photos and videos, or invite a photographer to contribute.
                </p>
                <p className="mt-4 text-sm font-semibold text-[var(--brand-pink)]">
                  Manage gallery →
                </p>
              </Card>
            </Link>

            <Link to={`/portal/events/${event.id}/qr-code`} className="sm:col-span-2">
              <Card className="card-hover-lift h-full p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]">
                      <QrCode className="h-5 w-5" />
                    </span>
                    <h2 className="font-semibold text-[var(--brand-navy)]">QR Code</h2>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-500">
                  Download and print a QR code for guests to scan and find their photos.
                </p>
                <p className="mt-4 text-sm font-semibold text-[var(--brand-pink)]">
                  View QR code →
                </p>
              </Card>
            </Link>

            <Link to={`/portal/events/${event.id}/guests`}>
              <Card className="card-hover-lift h-full p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
                      <Users className="h-5 w-5" />
                    </span>
                    <h2 className="font-semibold text-[var(--brand-navy)]">Guests</h2>
                  </div>
                  {typeof stats?.total_guests === "number" && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {stats.total_guests}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm text-slate-500">
                  Manage your guest list and track RSVPs.
                </p>
                <p className="mt-4 text-sm font-semibold text-[var(--brand-pink)]">
                  Manage guests →
                </p>
              </Card>
            </Link>

            <Link to={`/portal/events/${event.id}/invitations`}>
              <Card className="card-hover-lift h-full p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]">
                      <Mail className="h-5 w-5" />
                    </span>
                    <h2 className="font-semibold text-[var(--brand-navy)]">Invitations</h2>
                  </div>
                  {typeof stats?.notifications_sent === "number" && (
                    <span className="rounded-full badge-success px-2.5 py-1 text-xs font-semibold">
                      {stats.notifications_sent} sent
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm text-slate-500">
                  Send invitations and track delivery status for every guest.
                </p>
                <p className="mt-4 text-sm font-semibold text-[var(--brand-pink)]">
                  View invitations →
                </p>
              </Card>
            </Link>
          </div>
        </motion.div>
      </div>

      <ConfirmDialog
        open={confirm === "delete"}
        title="Delete this event?"
        description={`"${event.name}" and everything attached to it - guests, invitations, RSVPs and gallery - will be permanently deleted. This can't be undone. If you only want to stop it, cancel the event instead.`}
        confirmLabel="Delete event"
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm === "cancel"}
        title="Cancel this event?"
        description={`"${event.name}" will be marked as cancelled. You can reactivate it later (if your plan still has room for it).`}
        confirmLabel="Cancel event"
        destructive
        isLoading={statusMutation.isPending}
        onConfirm={() => changeStatus("CANCELLED")}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}