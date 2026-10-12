import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFaceScanStatus, useStartFaceScanMutation } from "@/queries/useGalleryQueries";
import { getApiErrorMessage } from "@/lib/apiError";

interface Props {
  eventId: number;
}

/**
 * Shows the organizer whether guests will be able to find their photos with
 * a selfie. Photos are scanned for faces in the background after upload;
 * this card shows the progress and lets the organizer scan again.
 */
export default function FaceSearchStatus({ eventId }: Props) {
  const { data: status } = useFaceScanStatus(eventId);
  const start = useStartFaceScanMutation(eventId);
  const autoStarted = useRef(false);

  const canScan = !!status && status.available && status.plan_enabled;

  // Photos can be waiting after a server restart or a plan upgrade: kick the
  // scan off once when the page opens.
  useEffect(() => {
    if (canScan && (status?.pending ?? 0) > 0 && !autoStarted.current) {
      autoStarted.current = true;
      start.mutate();
    }
  }, [canScan, status?.pending]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!status || status.total === 0) return null;

  const finished = status.processed + status.failed;
  const percent = Math.round((finished / status.total) * 100);
  const scanning = status.pending > 0;

  let surface = "border-slate-100 bg-white";
  let iconWrap = "bg-[var(--brand-navy)]/5 text-[var(--brand-navy)]";
  let icon = <ScanFace className="h-5 w-5" />;
  let title = "Photo search";
  let text: string;

  if (!status.plan_enabled) {
    text = "Letting guests find their photos with a selfie comes with plans that include QR codes.";
  } else if (!status.available) {
    surface = "border-amber-200 bg-amber-50";
    iconWrap = "bg-amber-100 text-amber-600";
    icon = <AlertTriangle className="h-5 w-5" />;
    text = "Face search isn't switched on for this server yet. Your photos will be scanned as soon as it is.";
  } else if (scanning) {
    surface = "border-[var(--brand-pink)]/15 bg-[var(--brand-pink)]/[0.03]";
    iconWrap = "bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]";
    title = "Preparing photo search";
    text = `${finished} of ${status.total} photos scanned. Guests can find their photos once this finishes.`;
  } else {
    surface = "border-emerald-200 bg-emerald-50/60";
    iconWrap = "bg-emerald-100 text-emerald-600";
    icon = <CheckCircle2 className="h-5 w-5" />;
    title = "Photo search is ready";
    text = `${status.faces_found} face${status.faces_found === 1 ? "" : "s"} found in ${status.processed} photo${status.processed === 1 ? "" : "s"}.`;
  }

  return (
    <section className={`mt-5 rounded-2xl border p-4 soft-shadow sm:p-5 ${surface}`} aria-live="polite">
      <div className="flex items-start gap-3.5">
        <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}>
          {scanning && canScan && (
            <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-xl bg-[var(--brand-pink)]/15" />
          )}
          <span className="relative">{icon}</span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--brand-navy)]">{title}</p>
            {canScan && scanning && <span className="text-xs font-semibold tabular-nums text-[var(--brand-pink)]">{percent}%</span>}
          </div>
          <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{text}</p>

          {canScan && scanning && (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="Photos scanned"
              className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100"
            >
              <div
                className="h-full rounded-full bg-[image:var(--gradient-brand)] transition-[width] duration-500"
                style={{ width: `${Math.max(percent, 4)}%` }}
              />
            </div>
          )}

          {canScan && status.failed > 0 && (
            <p className="mt-2 text-xs text-rose-600">
              {status.failed} photo{status.failed === 1 ? "" : "s"} could not be scanned (the file may be damaged).
            </p>
          )}

          {start.isError && (
            <p className="mt-2 text-xs text-rose-600" role="alert">
              {getApiErrorMessage(start.error, "Couldn't start scanning.")}
            </p>
          )}

          {canScan && (status.failed > 0 || scanning) && (
            <div className="mt-3">
              <Button size="sm" variant="outline" isLoading={start.isPending} onClick={() => start.mutate()}>
                {scanning ? "Check again" : "Scan again"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}