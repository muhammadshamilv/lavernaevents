import { AlertCircle, CheckCircle2, Loader2, RotateCcw, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { UploadItem } from "./useUploadQueue";

interface Props {
  items: UploadItem[];
  onRetry: (id: string) => void;
  onRetryAll: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

/** Progress for the files being uploaded: one row each, a retry for the
 * ones that failed, and a summary line. Renders nothing when idle. */
export default function UploadQueuePanel({ items, onRetry, onRetryAll, onRemove, onClear }: Props) {
  if (items.length === 0) return null;

  const done = items.filter((item) => item.status === "done").length;
  const failed = items.filter((item) => item.status === "error").length;
  const active = items.length - done - failed;

  return (
    <Card className="mt-5 p-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--brand-navy)]">
          {active > 0
            ? `Uploading... ${done} of ${items.length} done`
            : failed > 0
              ? `${done} uploaded, ${failed} failed`
              : `All ${done} uploaded`}
        </p>

        <div className="flex gap-2">
          {failed > 0 && active === 0 && (
            <Button size="sm" variant="outline" onClick={onRetryAll}>
              <RotateCcw className="h-3.5 w-3.5" />
              Retry failed
            </Button>
          )}
          {active === 0 && (
            <Button size="sm" variant="outline" onClick={onClear}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-slate-100 p-2.5">
            <div className="flex items-center gap-2.5">
              {item.status === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
              {item.status === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />}
              {(item.status === "uploading" || item.status === "queued") && (
                <Loader2
                  className={`h-4 w-4 shrink-0 text-slate-400 ${item.status === "uploading" ? "animate-spin" : ""}`}
                />
              )}

              <p className="min-w-0 flex-1 truncate text-sm text-[var(--brand-navy)]">{item.file.name}</p>

              {item.status === "error" && !item.error?.startsWith("Unsupported") && !item.error?.includes("up to") && (
                <button
                  type="button"
                  onClick={() => onRetry(item.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
                  aria-label={`Retry ${item.file.name}`}
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              {item.status !== "uploading" && (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 active:bg-slate-100"
                  aria-label={`Remove ${item.file.name} from the list`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {item.status === "uploading" && (
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={item.progress}
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
              >
                <div
                  className="h-full rounded-full bg-[var(--brand-pink)] transition-[width]"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            )}

            {item.status === "error" && item.error && (
              <p className="mt-1.5 break-words text-xs text-rose-600">{item.error}</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}