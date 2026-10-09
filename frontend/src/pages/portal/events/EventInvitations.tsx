import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Mail,
  Phone,
  RefreshCw,
} from "lucide-react";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useEvent } from "@/queries/useEventQueries";
import { useEventInvitations } from "@/queries/useInvitationQueries";
import {
  useEventNotificationLogs,
  useMarkWhatsAppSentMutation,
  useRetryNotificationMutation,
} from "@/queries/useNotificationQueries";
import InvitationReportTab from "@/components/invitations/InvitationReportTab";
import { toastStore } from "@/stores/toast.store";
import { navigateWhatsAppWindow, openPendingWhatsAppWindow } from "@/lib/whatsapp";
import { getApiErrorMessage } from "@/lib/apiError";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, FormError } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InvitationStatus } from "@/types/invitation.types";
import type { NotificationLog, NotificationStatus } from "@/types/notification.types";

const INVITATION_STATUS_LABEL: Record<InvitationStatus, string> = {
  GENERATED: "Ready",
  FAILED: "Failed",
};

const LOG_STATUS_LABEL: Record<NotificationStatus, string> = {
  LINK_GENERATED: "Awaiting confirmation",
  SENT: "Sent",
  FAILED: "Failed",
  CALLING: "Calling",
};

const INVITATION_STATUS_BADGE_CLASS: Record<InvitationStatus, string> = {
  GENERATED: "badge-success",
  FAILED: "bg-rose-100 text-rose-700",
};

const LOG_STATUS_BADGE_CLASS: Record<NotificationStatus, string> = {
  LINK_GENERATED: "badge-gold",
  SENT: "badge-success",
  FAILED: "bg-rose-100 text-rose-700",
  // Phase 21: a voice call in flight - Twilio has accepted the request
  // and is dialing, outcome not yet known (see
  // notifications/services.py's apply_voice_call_status_callback).
  CALLING: "bg-sky-100 text-sky-700",
};

const CHANNEL_LABEL: Record<NotificationLog["channel"], string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  SMS: "SMS",
  VOICE_CALL: "Voice Call",
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTimeWithClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Tab = "invitations" | "logs" | "report";

export default function EventInvitations() {
  const { id } = useParams<{ id: string }>();
  const eventId = id ? Number(id) : undefined;
  const { data: event, isLoading: eventLoading, isError: eventError } = useEvent(eventId);

  const [tab, setTab] = useState<Tab>("invitations");

  if (eventLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-7 w-56" />
      </div>
    );
  }

  if (eventError || !event || !eventId) {
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

  return (
    <div className="mobile-safe-bottom px-4 py-6 sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <Link
          to={`/portal/events/${eventId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-[var(--brand-navy)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {event.name}
        </Link>

        <h1 className="mt-3 text-xl font-bold text-[var(--brand-navy)] sm:text-2xl">
          Invitations
        </h1>

        <div role="tablist" aria-label="Invitation sections" className="mt-4 flex gap-1 rounded-full bg-slate-100 p-1 sm:inline-flex sm:gap-2 sm:bg-transparent sm:p-0 sm:border-b sm:border-slate-100">
          <button
            type="button"
            onClick={() => setTab("invitations")}
            role="tab"
            aria-selected={tab === "invitations"}
            className={cn(
              "flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors sm:flex-none sm:rounded-none sm:border-b-2 sm:px-3 sm:py-2",
              tab === "invitations"
                ? "bg-white text-[var(--brand-pink)] soft-shadow sm:bg-transparent sm:border-[var(--brand-pink)] sm:shadow-none"
                : "text-slate-500 hover:text-[var(--brand-navy)] sm:border-transparent"
            )}
          >
            Invitations
          </button>
          <button
            type="button"
            onClick={() => setTab("logs")}
            role="tab"
            aria-selected={tab === "logs"}
            className={cn(
              "flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors sm:flex-none sm:rounded-none sm:border-b-2 sm:px-3 sm:py-2",
              tab === "logs"
                ? "bg-white text-[var(--brand-pink)] soft-shadow sm:bg-transparent sm:border-[var(--brand-pink)] sm:shadow-none"
                : "text-slate-500 hover:text-[var(--brand-navy)] sm:border-transparent"
            )}
          >
            Send log
          </button>
          <button
            type="button"
            onClick={() => setTab("report")}
            role="tab"
            aria-selected={tab === "report"}
            className={cn(
              "flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors sm:flex-none sm:rounded-none sm:border-b-2 sm:px-3 sm:py-2",
              tab === "report"
                ? "bg-white text-[var(--brand-pink)] soft-shadow sm:bg-transparent sm:border-[var(--brand-pink)] sm:shadow-none"
                : "text-slate-500 hover:text-[var(--brand-navy)] sm:border-transparent"
            )}
          >
            Report
          </button>
        </div>

        {tab === "invitations" && <InvitationsTab eventId={eventId} />}
        {tab === "logs" && <NotificationLogsTab eventId={eventId} />}
        {tab === "report" && <InvitationReportTab eventId={eventId} />}
      </div>
    </div>
  );
}

function InvitationsTab({ eventId }: { eventId: number }) {
  const isDesktop = useIsDesktop();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useEventInvitations(eventId, page);

  const invitations = data?.invitations ?? [];
  const pagination = data?.pagination;

  return (
    <div className="mt-6">
      {isError && (
        <p className="text-center text-sm text-rose-600">
          Couldn't load invitation history right now. Please refresh the page.
        </p>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="p-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-24" />
            </Card>
          ))}
        </div>
      )}

      {!isLoading && !isError && invitations.length === 0 && (
        <Card className="p-8 text-center sm:p-10">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
            <Mail className="h-6 w-6" />
          </span>
          <p className="mt-4 font-semibold text-[var(--brand-navy)]">
            No invitations sent yet for this event
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Send one from a guest's card on the Guests page - it'll show up here once
            generated.
          </p>
        </Card>
      )}

      {!isLoading && !isError && invitations.length > 0 && isDesktop && (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3">Guest</th>
                <th className="px-6 py-3">Template</th>
                <th className="px-6 py-3">Generated</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invitations.map((invitation) => (
                <tr key={invitation.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-[var(--brand-navy)]">
                    {invitation.guest_name}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{invitation.template_name}</td>
                  <td className="px-6 py-4 text-slate-600">
                    {formatDateTime(invitation.created_at)}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                        INVITATION_STATUS_BADGE_CLASS[invitation.status]
                      )}
                    >
                      {INVITATION_STATUS_LABEL[invitation.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {!isLoading && !isError && invitations.length > 0 && !isDesktop && (
        <div className="space-y-3">
          {invitations.map((invitation) => (
            <Card key={invitation.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[var(--brand-navy)]">
                    {invitation.guest_name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{invitation.template_name}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                    INVITATION_STATUS_BADGE_CLASS[invitation.status]
                  )}
                >
                  {INVITATION_STATUS_LABEL[invitation.status]}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {formatDateTime(invitation.created_at)}
              </p>
            </Card>
          ))}
        </div>
      )}

      {pagination && pagination.total_pages > 1 && (
        <PaginationRow pagination={pagination} onPageChange={setPage} />
      )}
    </div>
  );
}

function NotificationLogsTab({ eventId }: { eventId: number }) {
  const isDesktop = useIsDesktop();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useEventNotificationLogs(eventId, page);
  const markSentMutation = useMarkWhatsAppSentMutation(eventId);
  const retryMutation = useRetryNotificationMutation(eventId);
  const [actionError, setActionError] = useState<string | null>(null);

  const logs = data?.logs ?? [];
  const pagination = data?.pagination;

  const handleOpenWhatsApp = (log: NotificationLog) => {
    if (log.wa_link) window.open(log.wa_link, "_blank");
  };

  const handleMarkSent = (log: NotificationLog) => {
    setActionError(null);
    markSentMutation.mutate(log.id, {
      onSuccess: () => toastStore.show("Marked as sent."),
      onError: (error) =>
        setActionError(getApiErrorMessage(error, "Couldn't mark this as sent.")),
    });
  };

  const handleRetry = (log: NotificationLog) => {
    setActionError(null);

    // WhatsApp opens on this device: open the tab during the click, then
    // point it at the link once the server has built it.
    const popup = log.channel === "WHATSAPP" ? openPendingWhatsAppWindow() : null;

    retryMutation.mutate(log.id, {
      onSuccess: (newLog) => {
        if (popup && newLog.wa_link) {
          if (!navigateWhatsAppWindow(popup, newLog.wa_link)) {
            toastStore.show("Your browser blocked the WhatsApp window. Allow pop-ups for this site.", "error");
          }
        } else {
          toastStore.show("Sent again.");
        }
      },
      onError: (error) => {
        popup?.close();
        setActionError(getApiErrorMessage(error, "Retry failed."));
      },
    });
  };

  const renderActions = (log: NotificationLog) => {
    if (log.channel === "WHATSAPP" && log.status === "LINK_GENERATED") {
      return (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => handleOpenWhatsApp(log)}>
            <ExternalLink className="h-3.5 w-3.5" />
            Open WhatsApp
          </Button>
          <Button
            size="sm"
            onClick={() => handleMarkSent(log)}
            isLoading={markSentMutation.isPending && markSentMutation.variables === log.id}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Mark as sent
          </Button>
        </div>
      );
    }

    // Phase 21: a CALLING row is mid-flight (Twilio is dialing) - nothing
    // for the organizer to do but wait for the status callback to land,
    // so no retry/action button shows until it resolves to SENT or FAILED.
    if (log.status === "CALLING") {
      return <span className="text-xs text-slate-400">Waiting for call outcome...</span>;
    }

    if (log.status === "FAILED") {
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleRetry(log)}
          isLoading={retryMutation.isPending && retryMutation.variables === log.id}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      );
    }

    return null;
  };

  return (
    <div className="mt-6">
      {actionError && <div className="mb-4"><FormError message={actionError} /></div>}

      {isError && (
        <p className="text-center text-sm text-rose-600">
          Couldn't load the send log right now. Please refresh the page.
        </p>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="p-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-24" />
            </Card>
          ))}
        </div>
      )}

      {!isLoading && !isError && logs.length === 0 && (
        <Card className="p-8 text-center sm:p-10">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
            <Mail className="h-6 w-6" />
          </span>
          <p className="mt-4 font-semibold text-[var(--brand-navy)]">No sends yet</p>
          <p className="mt-2 text-sm text-slate-500">
            Every WhatsApp, Email, SMS, or Voice Call attempt for this event will show up here.
          </p>
        </Card>
      )}

      {!isLoading && !isError && logs.length > 0 && isDesktop && (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3">Guest</th>
                <th className="px-6 py-3">Channel</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">When</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-[var(--brand-navy)]">
                    {log.guest_name}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    <span className="flex items-center gap-1.5">
                      {log.channel === "VOICE_CALL" && <Phone className="h-3.5 w-3.5 text-slate-400" />}
                      {CHANNEL_LABEL[log.channel]}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                        LOG_STATUS_BADGE_CLASS[log.status]
                      )}
                    >
                      {LOG_STATUS_LABEL[log.status]}
                    </span>
                    {log.status === "FAILED" && log.failure_reason && (
                      <p className="mt-1 max-w-xs text-xs text-rose-500">{log.failure_reason}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{formatDateTimeWithClock(log.created_at)}</td>
                  <td className="px-6 py-4">{renderActions(log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {!isLoading && !isError && logs.length > 0 && !isDesktop && (
        <div className="space-y-3">
          {logs.map((log) => (
            <Card key={log.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[var(--brand-navy)]">{log.guest_name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    {log.channel === "VOICE_CALL" && <Phone className="h-3 w-3" />}
                    {CHANNEL_LABEL[log.channel]}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                    LOG_STATUS_BADGE_CLASS[log.status]
                  )}
                >
                  {LOG_STATUS_LABEL[log.status]}
                </span>
              </div>
              {log.status === "FAILED" && log.failure_reason && (
                <p className="mt-2 text-xs text-rose-500">{log.failure_reason}</p>
              )}
              <p className="mt-2 text-xs text-slate-400">{formatDateTimeWithClock(log.created_at)}</p>
              {renderActions(log) && <div className="mt-3">{renderActions(log)}</div>}
            </Card>
          ))}
        </div>
      )}

      {pagination && pagination.total_pages > 1 && (
        <PaginationRow pagination={pagination} onPageChange={setPage} />
      )}
    </div>
  );
}

function PaginationRow({
  pagination,
  onPageChange,
}: {
  pagination: { current_page: number; total_pages: number; next: string | null; previous: string | null };
  onPageChange: (updater: (prev: number) => number) => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
      <span>
        Page {pagination.current_page} of {pagination.total_pages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange((prev) => Math.max(1, prev - 1))}
          disabled={!pagination.previous}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange((prev) => prev + 1)}
          disabled={!pagination.next}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}