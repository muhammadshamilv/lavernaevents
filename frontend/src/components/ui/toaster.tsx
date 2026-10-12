import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { toastStore, useToasts } from "@/stores/toast.store";
import { cn } from "@/lib/utils";

// Mounted once in PortalLayout - call toastStore.show(message, variant)
// from anywhere to surface a toast, no context/provider needed.
export function Toaster() {
  const toasts = useToasts();

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:left-auto sm:right-4 sm:items-end">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "soft-shadow-lg pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-l-4 bg-white p-4 shadow-xl backdrop-blur",
              toast.variant === "success"
                ? "border-emerald-100 border-l-emerald-500"
                : "border-rose-100 border-l-rose-500"
            )}
          >
            {toast.variant === "success" ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
            ) : (
              <XCircle className="h-5 w-5 shrink-0 text-rose-500" />
            )}
            <p className="flex-1 break-words text-sm font-medium leading-relaxed text-[var(--brand-navy)]">{toast.message}</p>
            <button
              type="button"
              onClick={() => toastStore.dismiss(toast.id)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 -mr-1.5 -mt-1.5"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}