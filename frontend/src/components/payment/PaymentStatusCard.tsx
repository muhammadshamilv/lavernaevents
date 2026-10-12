import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, Clock, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type PaymentTone = "loading" | "success" | "failed" | "pending" | "cancelled";

const TONES: Record<PaymentTone, { ring: string; badge: string; glow: string }> = {
  loading: { ring: "bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]", badge: "", glow: "from-[var(--brand-pink)]/15" },
  success: { ring: "bg-emerald-500 text-white", badge: "", glow: "from-emerald-400/25" },
  failed: { ring: "bg-rose-500 text-white", badge: "", glow: "from-rose-400/20" },
  pending: { ring: "bg-amber-400 text-white", badge: "", glow: "from-amber-300/25" },
  cancelled: { ring: "bg-slate-400 text-white", badge: "", glow: "from-slate-300/30" },
};

function StatusIcon({ tone }: { tone: PaymentTone }) {
  const reduce = useReducedMotion();
  const styles = TONES[tone];

  return (
    <div className="relative mx-auto h-24 w-24">
      {tone === "success" && !reduce && (
        <>
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-emerald-400/30"
            initial={{ scale: 0.8, opacity: 0.8 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 1.4, ease: "easeOut" }}
          />
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-emerald-400/20"
            initial={{ scale: 0.8, opacity: 0.8 }}
            animate={{ scale: 2.1, opacity: 0 }}
            transition={{ duration: 1.8, delay: 0.15, ease: "easeOut" }}
          />
        </>
      )}
      <motion.span
        initial={reduce ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 13, stiffness: 200 }}
        className={cn("relative flex h-24 w-24 items-center justify-center rounded-full shadow-lg", styles.ring)}
      >
        {tone === "loading" && <Loader2 className="h-10 w-10 animate-spin" />}
        {tone === "success" && (
          <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.55, delay: 0.25, ease: "easeOut" }}
            />
          </svg>
        )}
        {tone === "failed" && <AlertTriangle className="h-11 w-11" />}
        {tone === "pending" && <Clock className="h-11 w-11" />}
        {tone === "cancelled" && <X className="h-11 w-11" strokeWidth={3} />}
      </motion.span>
    </div>
  );
}

export interface PaymentDetail {
  label: string;
  value: ReactNode;
}

interface PaymentStatusCardProps {
  tone: PaymentTone;
  title: string;
  message: ReactNode;
  /** Receipt-style rows under the message (what was bought, status...). */
  details?: PaymentDetail[];
  /** While redirecting, shows a bar that fills over this many milliseconds. */
  redirectMs?: number;
  actions?: ReactNode;
  note?: ReactNode;
}

// One look for every payment result (plan paid, topup paid, failed, still
// confirming, cancelled), so the three payment pages stay in step.
export default function PaymentStatusCard({ tone, title, message, details, redirectMs, actions, note }: PaymentStatusCardProps) {
  const reduce = useReducedMotion();
  const styles = TONES[tone];

  return (
    <div className="gradient-mesh-subtle flex min-h-[70vh] items-center justify-center px-4 py-12 sm:py-20">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
      >
        <div aria-hidden="true" className={cn("pointer-events-none absolute -inset-x-6 -top-10 h-56 rounded-full bg-gradient-to-b to-transparent blur-3xl", styles.glow)} />

        <div className="relative overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-6 text-center soft-shadow-lg sm:p-10" role="status" aria-live="polite">
          <StatusIcon tone={tone} />

          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-[var(--brand-navy)]">{title}</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">{message}</p>

          {details && details.length > 0 && (
            <dl className="mt-6 divide-y divide-dashed divide-slate-200 rounded-2xl bg-slate-50 px-4 text-left text-sm">
              {details.map((detail) => (
                <div key={detail.label} className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-slate-500">{detail.label}</dt>
                  <dd className="min-w-0 break-words text-right font-semibold text-[var(--brand-navy)]">{detail.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {redirectMs && (
            <div className="mt-6" aria-hidden="true">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className="h-full rounded-full bg-emerald-500"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: redirectMs / 1000, ease: "linear" }}
                />
              </div>
            </div>
          )}

          {actions && <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">{actions}</div>}
          {note && <div className="mt-5 text-xs text-slate-400">{note}</div>}
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <Check className="h-3.5 w-3.5" />
          Payments are handled by Cashfree. We never see your card or UPI details.
        </p>
      </motion.div>
    </div>
  );
}

export function PaymentLink({ to, children, primary }: { to: string; children: ReactNode; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-semibold transition-colors",
        primary
          ? "bg-[var(--brand-pink)] text-white shadow-md shadow-[var(--brand-pink)]/25 hover:bg-[var(--brand-pink-dark)]"
          : "border border-slate-200 bg-white text-[var(--brand-navy)] hover:bg-slate-50"
      )}
    >
      {children}
    </Link>
  );
}