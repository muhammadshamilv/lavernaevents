import { MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/apiError";
import { toastStore } from "@/stores/toast.store";
import { usePendingWhatsAppReminders } from "@/queries/useInvitationQueries";
import { useSendPendingWhatsAppReminderMutation } from "@/queries/useNotificationQueries";
import { formatRelativeTime } from "@/lib/format";
import { navigateWhatsAppWindow, openPendingWhatsAppWindow } from "@/lib/whatsapp";

/**
 * WhatsApp has no server-side auto-send path without the Business API, so
 * an automatic WhatsApp reminder is queued here instead of being sent by
 * Celery. Each one is sent with a single click: WhatsApp opens with the
 * reminder ready to go (same wa.me flow as a normal WhatsApp send).
 */
export default function PendingWhatsAppReminders() {
  const { data: pending, isLoading } = usePendingWhatsAppReminders();
  const sendMutation = useSendPendingWhatsAppReminderMutation();

  const handleSend = (pendingId: number) => {
    // Open the tab now (on the click); point it at WhatsApp once ready.
    const popup = openPendingWhatsAppWindow();

    sendMutation.mutate(pendingId, {
      onSuccess: (log) => {
        const opened = navigateWhatsAppWindow(popup, log.wa_link);

        if (!opened) {
          toastStore.show(
            "Your browser blocked the WhatsApp window. Allow pop-ups for this site.",
            "error"
          );
        }
      },
      onError: (error) => {
        popup?.close();
        toastStore.show(getApiErrorMessage(error, "Could not send this reminder."), "error");
      },
    });
  };

  if (isLoading || !pending || pending.length === 0) {
    return null;
  }

  return (
    <div className="premium-card border border-emerald-100 bg-emerald-50/60 p-4 lg:p-5">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-[var(--brand-navy)]">
          WhatsApp reminders waiting to send ({pending.length})
        </h3>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        WhatsApp reminders can't be sent automatically - tap Send and WhatsApp opens with the
        reminder ready.
      </p>

      <div className="mt-3 space-y-2">
        {pending.map((reminder) => (
          <div
            key={reminder.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-[var(--brand-navy)]">{reminder.guest_name}</p>
              <p className="truncate text-xs text-slate-500">
                {reminder.guest_mobile_number} · due {formatRelativeTime(reminder.due_at)}
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => handleSend(reminder.id)}
              isLoading={sendMutation.isPending && sendMutation.variables === reminder.id}
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}