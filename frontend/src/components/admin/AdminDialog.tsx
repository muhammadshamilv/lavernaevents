import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  /** md = forms with a few fields, lg = long forms / lists */
  size?: "md" | "lg";
}

/**
 * Shared dialog for every admin form: a bottom sheet on phones (thumb
 * reachable, never taller than the screen, scrolls inside) and a centered
 * dialog from the sm breakpoint up. Closes with Escape or a tap outside,
 * and sits above the mobile bottom bar.
 */
export default function AdminDialog({ title, description, onClose, children, size = "md" }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:px-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white soft-shadow-lg sm:rounded-3xl",
          size === "lg" ? "sm:max-w-lg" : "sm:max-w-md"
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[var(--brand-navy)]">{title}</h2>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 active:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}

/** The Cancel / Save row. Sticks to the bottom of a long form on phones. */
export function DialogActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-1 flex justify-end gap-3 bg-white px-1 pb-1 pt-3">{children}</div>
  );
}