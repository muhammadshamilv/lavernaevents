import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/card";
import { useIsDesktop } from "@/hooks/useMediaQuery";
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
  const isDesktop = useIsDesktop();
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

  // Escape closes the dialog (never while a run is in progress), and the
  // browser warns before the tab is closed mid-send.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isRunning) return;
      if (phase === "done") handleDone();
      else handleClose();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isRunning, phase]);

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

  const content = (
    <div className="p-6 sm:p-8">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--brand-navy)]">
            {phase === "done" ? "Sending finished" : `Send via ${meta.label}`}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {phase === "confirm" && `${count} guest${count === 1 ? "" : "s"} selected`}
            {phase === "running" && "Please keep this page open until it finishes."}
            {phase === "done" && "Here's how it went."}
          </p>
        </div>
        {phase !== "running" && (
          <button
            type="button"
            onClick={phase === "done" ? handleDone : handleClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {phase === "confirm" && (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
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

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-600">
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
        <div className="mt-6 space-y-4">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-[var(--brand-navy)]">
                {progress?.processed ?? 0} of {progress?.total ?? count}
              </span>
              <span className="text-slate-400">{percent}%</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <motion.div
                className="h-full rounded-full bg-[var(--brand-pink)]"
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
        <div className="mt-6 space-y-4">
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
  );

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={`Send via ${meta.label}`}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/40"
            onClick={phase === "confirm" ? handleClose : undefined}
          />

          {isDesktop ? (
            <div className="absolute inset-0 flex items-center justify-center px-4">
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="premium-card relative max-h-[90dvh] w-full max-w-lg overflow-y-auto"
              >
                {content}
              </motion.div>
            </div>
          ) : (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="mobile-safe-bottom absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white"
            >
              {content}
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
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