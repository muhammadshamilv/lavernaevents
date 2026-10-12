import { AlertCircle, CheckCircle2, Clock, Loader2, RotateCcw, X } from "lucide-react";
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
  const percent = Math.round((done / items.length) * 100);

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-100 bg-white soft-shadow" aria-live="polite">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                active > 0
                  ? "bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]"
                  : failed > 0
                    ? "bg-amber-100 text-amber-600"
                    : "bg-emerald-100 text-emerald-600"
              }`}
            >
              {active > 0 ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin" />
              ) : failed > 0 ? (
                <AlertCircle className="h-4.5 w-4.5" />
              ) : (
                <CheckCircle2 className="h-4.5 w-4.5" />
              )}
            </span>
            <p className="text-sm font-semibold text-[var(--brand-navy)]">
              {active > 0
                ? `Uploading... ${done} of ${items.length} done`
                : failed > 0
                  ? `${done} uploaded, ${failed} failed`
                  : `All ${done} uploaded`}
            </p>
          </div>

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

        <div
          role="progressbar"
          aria-label="Overall upload progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${failed > 0 && active === 0 ? "bg-amber-400" : "bg-[image:var(--gradient-brand)]"}`}
            style={{ width: `${Math.max(percent, active > 0 ? 3 : 0)}%` }}
          />
        </div>
      </div>

      <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100 bg-slate-50/50">
        {items.map((item) => (
          <li key={item.id} className="px-4 py-2.5 sm:px-5">
            <div className="flex items-center gap-2.5">
              {item.status === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
              {item.status === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />}
              {item.status === "uploading" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--brand-pink)]" />}
              {item.status === "queued" && <Clock className="h-4 w-4 shrink-0 text-slate-400" />}

              <p className="min-w-0 flex-1 truncate text-sm text-[var(--brand-navy)]">{item.file.name}</p>

              {item.status === "uploading" && (
                <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">{item.progress}%</span>
              )}

              {item.status === "error" && !item.error?.startsWith("Unsupported") && !item.error?.includes("up to") && (
                <button
                  type="button"
                  onClick={() => onRetry(item.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 active:bg-slate-200"
                  aria-label={`Retry ${item.file.name}`}
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              {item.status !== "uploading" && (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 active:bg-slate-200"
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
                className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-200"
              >
                <div className="h-full rounded-full bg-[var(--brand-pink)] transition-[width]" style={{ width: `${item.progress}%` }} />
              </div>
            )}

            {item.status === "error" && item.error && <p className="mt-1.5 break-words pl-[1.625rem] text-xs text-rose-600">{item.error}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}