import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { useBulkSendInvitations } from "@/queries/useNotificationQueries";
import { CHANNEL_META } from "@/lib/channels";
import { cn } from "@/lib/utils";
import type { BulkSendSelection, NotificationChannel } from "@/types/notification.types";

interface BulkSendDialogProps {
  eventId: number;
  channel: NotificationChannel;
  /** How many guests the organizer selected (for the confirm text). */
  count: number;
  selection: BulkSendSelection;
  open: boolean;
  /** Closed without sending (or while only confirming). */
  onClose: () => void;
  /** The organizer pressed Done after a run - clear the selection. */
  onDone: () => void;
}

export default function BulkSendDialog({
  eventId,
  channel,
  count,
  selection,
  open,
  onClose,
  onDone,
}: BulkSendDialogProps) {
  const { start, cancel, reset, progress, isRunning, errorMessage } =
    useBulkSendInvitations(eventId);

  const [includeAlreadySent, setIncludeAlreadySent] = useState(false);

  const meta = CHANNEL_META[channel];
  const phase = isRunning ? "running" : progress ? "done" : "confirm";

  const handleSend = () => {
    void start(channel, selection, !includeAlreadySent);
  };

  const handleClose = () => {
    if (isRunning) return;
    reset();
    onClose();
  };

  const handleDone = () => {
    reset();
    onDone();
  };

  // The Modal handles Escape / outside taps (locked while a run is in progress).
  // The browser warns before the tab is closed mid-send.
  useEffect(() => {
    if (!isRunning) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isRunning]);

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
      : 0;

  const handleModalClose = phase === "done" ? handleDone : handleClose;
  const description =
    phase === "confirm"
      ? `${count} guest${count === 1 ? "" : "s"} selected`
      : phase === "running"
        ? "Please keep this page open until it finishes."
        : "Here's how it went.";

  return (
    <Modal
      open={open}
      onClose={handleModalClose}
      title={phase === "done" ? "Sending finished" : `Send via ${meta.label}`}
      description={description}
      icon={phase === "done" ? CheckCircle2 : Send}
      tone={phase === "done" ? "success" : "default"}
      size="md"
      dismissible={phase !== "running"}
    >
      <div className="pb-1">
      {phase === "confirm" && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[image:var(--gradient-brand-soft)] p-4 text-sm text-slate-600 ring-1 ring-[var(--brand-pink)]/10">
            <p>
              Your selected template will be sent to {count} guest{count === 1 ? "" : "s"} by{" "}
              <span className="font-semibold">{meta.label}</span>.
            </p>
            {channel === "EMAIL" && (
              <p className="mt-2 text-xs text-slate-500">
                Guests without an email address are skipped.
              </p>
            )}
            {channel === "VOICE_CALL" && (
              <p className="mt-2 text-xs text-slate-500">
                Each call uses one voice call credit from your plan.
              </p>
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-3.5 text-sm text-slate-600 transition-colors hover:border-[var(--brand-pink)]/40">
            <input
              type="checkbox"
              checked={includeAlreadySent}
              onChange={(e) => setIncludeAlreadySent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--brand-pink)]"
            />
            <span>
              Also send to guests who already received this over {meta.label}
              <span className="block text-xs text-slate-400">
                Leave unticked to avoid sending anyone a duplicate.
              </span>
            </span>
          </label>

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSend}>
              Send to {count} guest{count === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}

      {phase === "running" && (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-[var(--brand-navy)]">
                {progress?.processed ?? 0} of {progress?.total ?? count}
              </span>
              <span className="text-slate-400">{percent}%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-100">
              <motion.div
                className="h-full rounded-full bg-[image:var(--gradient-brand)]"
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <Counter label="Sent" value={progress?.sent ?? 0} tone="good" />
            <Counter label="Failed" value={progress?.failed ?? 0} tone="bad" />
            <Counter label="Skipped" value={progress?.skipped ?? 0} tone="muted" />
          </div>

          <Button variant="outline" className="w-full" onClick={cancel}>
            Stop after this batch
          </Button>
        </div>
      )}

      {phase === "done" && progress && (
        <div className="space-y-4">
          {progress.total === 0 && !errorMessage && (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              Nothing to send - every selected guest has already received this over{" "}
              {meta.label}.
            </div>
          )}

          {progress.total > 0 && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <Counter label="Sent" value={progress.sent} tone="good" />
              <Counter label="Failed" value={progress.failed} tone="bad" />
              <Counter label="Skipped" value={progress.skipped} tone="muted" />
            </div>
          )}

          {progress.stopped && (
            <div className="flex items-start gap-2.5 rounded-2xl bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-sm text-amber-900">
                <p className="font-medium">Sending stopped early</p>
                <p className="mt-1 text-amber-800">{progress.stoppedReason}</p>
                {progress.notAttempted > 0 && (
                  <p className="mt-1 text-amber-800">
                    {progress.notAttempted} guest{progress.notAttempted === 1 ? " was" : "s were"}{" "}
                    not attempted.
                  </p>
                )}
              </div>
            </div>
          )}

          {progress.cancelled && (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              You stopped the send. {Math.max(0, progress.total - progress.processed)} guest
              {progress.total - progress.processed === 1 ? " was" : "s were"} not attempted.
            </div>
          )}

          {!progress.stopped && !progress.cancelled && progress.total > 0 && progress.failed === 0 && (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              All invitations went out.
            </div>
          )}

          {progress.issues.length > 0 && (
            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-2xl border border-slate-100 p-3">
              {progress.issues.slice(0, 50).map((item) => (
                <div key={item.guest_id} className="flex items-start justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate font-medium text-[var(--brand-navy)]">{item.guest_name}</span>
                  <span
                    className={cn(
                      "text-right",
                      item.outcome === "failed" ? "text-rose-600" : "text-slate-400"
                    )}
                  >
                    {item.message || (item.outcome === "failed" ? "Failed" : "Skipped")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {errorMessage && <FormError message={errorMessage} />}

          <Button className="w-full" onClick={handleDone}>
            Done
          </Button>
        </div>
      )}
      </div>
    </Modal>
  );
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "bad" | "muted";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl p-3",
        tone === "good" && "bg-emerald-50 text-emerald-700",
        tone === "bad" && "bg-rose-50 text-rose-700",
        tone === "muted" && "bg-slate-50 text-slate-600"
      )}
    >
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}