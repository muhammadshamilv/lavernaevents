import { useCallback, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getEventNotificationLogs,
  markWhatsAppSent,
  retryNotification,
  sendBulkInvitationBatch,
  sendInvitation,
  sendPendingWhatsAppReminder,
  sendReminder,
} from "@/api/notifications.api";
import { guestKeys } from "@/queries/useGuestQueries";
import { invitationKeys } from "@/queries/useInvitationQueries";
import { getApiErrorMessage } from "@/lib/apiError";
import type {
  BulkSendResultItem,
  BulkSendSelection,
  NotificationChannel,
  SendActiveTemplatePayload,
} from "@/types/notification.types";

export const notificationLogKeys = {
  lists: (eventId: number) => ["notification-logs", eventId, "list"] as const,
  list: (eventId: number, page: number) =>
    ["notification-logs", eventId, "list", page] as const,
};

export function useEventNotificationLogs(eventId: number, page: number) {
  return useQuery({
    queryKey: notificationLogKeys.list(eventId, page),
    queryFn: () => getEventNotificationLogs(eventId, page),
    placeholderData: keepPreviousData,
  });
}

export function useSendInvitationMutation(eventId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    // The organizer picks the channel on the Guests page; the payload is
    // { guest_id, channel }. The template is always the active filled one.
    mutationFn: (payload: SendActiveTemplatePayload) => sendInvitation(eventId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: guestKeys.lists(eventId) });
      queryClient.invalidateQueries({ queryKey: notificationLogKeys.lists(eventId) });
      // A brand-new platform template's in_library flag can flip as a
      // side effect of the first real send going through.
      queryClient.invalidateQueries({ queryKey: invitationKeys.templates });
    },
  });
}

export function useMarkWhatsAppSentMutation(eventId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (logId: number) => markWhatsAppSent(logId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: guestKeys.lists(eventId) });
      queryClient.invalidateQueries({ queryKey: notificationLogKeys.lists(eventId) });
    },
  });
}

export function useRetryNotificationMutation(eventId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (logId: number) => retryNotification(logId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: guestKeys.lists(eventId) });
      queryClient.invalidateQueries({ queryKey: notificationLogKeys.lists(eventId) });
    },
  });
}

export function useSendReminderMutation(eventId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SendActiveTemplatePayload) => sendReminder(eventId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: guestKeys.lists(eventId) });
      queryClient.invalidateQueries({ queryKey: notificationLogKeys.lists(eventId) });
    },
  });
}

export function useSendPendingWhatsAppReminderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pendingId: number) => sendPendingWhatsAppReminder(pendingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations", "pending-whatsapp-reminders"] });
      // A reminder send adds a row to the event's send log.
      queryClient.invalidateQueries({ queryKey: ["notification-logs"] });
    },
    onError: () => {
      // The server drops reminders that can never be sent (guest already
      // replied, event closed), so refresh the list either way.
      queryClient.invalidateQueries({ queryKey: ["invitations", "pending-whatsapp-reminders"] });
    },
  });
}

// --------------------------------------------------
// Bulk send (Email / SMS / Voice Call)
// --------------------------------------------------

const BULK_BATCH_SIZE = 10;

export interface BulkSendProgress {
  /** Guests this run set out to send to (fixed by the first batch). */
  total: number;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  /** Failed + skipped guests, with the reason for each. */
  issues: BulkSendResultItem[];
  /** True when a quota / platform limit ended the run early. */
  stopped: boolean;
  stoppedReason: string;
  notAttempted: number;
  /** True when the organizer pressed Stop. */
  cancelled: boolean;
}

const EMPTY_PROGRESS: BulkSendProgress = {
  total: 0,
  processed: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  issues: [],
  stopped: false,
  stoppedReason: "",
  notAttempted: 0,
  cancelled: false,
};

/**
 * Runs a bulk send batch by batch (10 guests per request) and exposes
 * live progress. Each request stays short - no timeouts - and the
 * progress bar is real. The run ends when the server reports no more
 * guests, a quota/platform limit is hit, or the organizer presses Stop.
 */
export function useBulkSendInvitations(eventId: number) {
  const queryClient = useQueryClient();

  const [progress, setProgress] = useState<BulkSendProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cancelRequested = useRef(false);

  const start = useCallback(
    async (
      channel: NotificationChannel,
      selection: BulkSendSelection,
      skipAlreadySent: boolean
    ) => {
      cancelRequested.current = false;
      setIsRunning(true);
      setErrorMessage(null);

      let current: BulkSendProgress = { ...EMPTY_PROGRESS };
      setProgress(current);

      let afterId = 0;
      let isFirstBatch = true;

      try {
        for (;;) {
          const batch = await sendBulkInvitationBatch(eventId, {
            ...selection,
            channel,
            skip_already_sent: skipAlreadySent,
            after_id: afterId,
            batch_size: BULK_BATCH_SIZE,
          });

          current = {
            ...current,
            total: isFirstBatch ? batch.total_matching : current.total,
            processed: current.processed + batch.processed,
            sent: current.sent + batch.sent,
            failed: current.failed + batch.failed,
            skipped: current.skipped + batch.skipped,
            issues: [...current.issues, ...batch.results.filter((r) => r.outcome !== "sent")],
            stopped: batch.stopped,
            stoppedReason: batch.stopped_reason,
            notAttempted: batch.not_attempted,
          };
          isFirstBatch = false;
          setProgress(current);

          if (batch.stopped || !batch.has_more || batch.next_after_id === null) {
            break;
          }

          if (cancelRequested.current) {
            current = { ...current, cancelled: true };
            setProgress(current);
            break;
          }

          afterId = batch.next_after_id;
        }
      } catch (error) {
        setErrorMessage(
          getApiErrorMessage(
            error,
            "Sending was interrupted. Check the guest list to see what already went out."
          )
        );
      } finally {
        setIsRunning(false);
        queryClient.invalidateQueries({ queryKey: guestKeys.lists(eventId) });
        queryClient.invalidateQueries({ queryKey: notificationLogKeys.lists(eventId) });
        queryClient.invalidateQueries({ queryKey: invitationKeys.templates });
      }

      return current;
    },
    [eventId, queryClient]
  );

  const cancel = useCallback(() => {
    cancelRequested.current = true;
  }, []);

  const reset = useCallback(() => {
    setProgress(null);
    setErrorMessage(null);
    cancelRequested.current = false;
  }, []);

  return { start, cancel, reset, progress, isRunning, errorMessage };
}