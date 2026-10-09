import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, ScanFace } from "lucide-react";
import { Card } from "@/components/ui/card";
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

  let tone = "border-slate-100";
  let icon = <ScanFace className="h-5 w-5 text-[var(--brand-navy)]" />;
  let title = "Photo search";
  let text: string;

  if (!status.plan_enabled) {
    text = "Letting guests find their photos with a selfie comes with plans that include QR codes.";
  } else if (!status.available) {
    tone = "border-amber-200 bg-amber-50";
    icon = <AlertTriangle className="h-5 w-5 text-amber-600" />;
    text = "Face search isn't switched on for this server yet. Your photos will be scanned as soon as it is.";
  } else if (scanning) {
    title = "Preparing photo search";
    text = `${finished} of ${status.total} photos scanned. Guests can find their photos once this finishes.`;
  } else {
    icon = <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
    title = "Photo search is ready";
    text = `${status.faces_found} face${status.faces_found === 1 ? "" : "s"} found in ${status.processed} photo${status.processed === 1 ? "" : "s"}.`;
  }

  return (
    <Card className={`mt-5 p-4 sm:p-5 ${tone}`} aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{icon}</span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--brand-navy)]">{title}</p>
          <p className="mt-0.5 text-sm text-slate-500">{text}</p>

          {canScan && scanning && (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="Photos scanned"
              className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
            >
              <div className="h-full rounded-full bg-[var(--brand-pink)] transition-[width]" style={{ width: `${percent}%` }} />
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
        </div>
      </div>

      {canScan && (status.failed > 0 || scanning) && (
        <div className="mt-3 sm:pl-8">
          <Button size="sm" variant="outline" isLoading={start.isPending} onClick={() => start.mutate()}>
            {scanning ? "Check again" : "Scan again"}
          </Button>
        </div>
      )}
    </Card>
  );
}