import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

// Small presentational pieces shared by the organizer portal pages, so the
// headers, back links and "not found" cards look the same everywhere.
// Nothing here fetches data or holds state.

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex min-h-10 items-center gap-1.5 rounded-full text-sm font-medium text-slate-500 transition-colors [@media(hover:hover)]:hover:text-[var(--brand-navy)]"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200 transition-all [@media(hover:hover)]:group-hover:-translate-x-0.5 [@media(hover:hover)]:group-hover:text-[var(--brand-pink)]">
        <ArrowLeft className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  );
}

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}

/** Page title block: small eyebrow, title, one line of help, actions on the right. */
export function PageHeader({ title, description, eyebrow, icon: Icon, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-3.5">
        {Icon && (
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[image:var(--gradient-brand)] text-white shadow-lg shadow-[var(--brand-pink)]/20 sm:flex">
            <Icon className="h-6 w-6" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-pink)]">{eyebrow}</p>
          )}
          <h1 className="truncate text-xl font-bold tracking-tight text-[var(--brand-navy)] sm:text-2xl lg:text-[1.75rem]">
            {title}
          </h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400", className)}>{children}</p>
  );
}

/** "Event not found / no access" and similar full-page messages. */
export function StateCard({
  icon: Icon,
  title,
  message,
  to,
  actionLabel,
  tone = "neutral",
}: {
  icon: LucideIcon;
  title?: string;
  message: ReactNode;
  to?: string;
  actionLabel?: string;
  tone?: "neutral" | "brand";
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <Card className="p-8 sm:p-10">
        <span
          className={cn(
            "mx-auto flex h-14 w-14 items-center justify-center rounded-full",
            tone === "brand" ? "bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]" : "bg-slate-100 text-slate-400"
          )}
        >
          <Icon className="h-7 w-7" />
        </span>
        {title && <h1 className="mt-4 text-lg font-semibold text-[var(--brand-navy)]">{title}</h1>}
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{message}</p>
        {to && actionLabel && (
          <Link to={to} className={buttonVariants({ variant: tone === "brand" ? "primary" : "outline", className: "mt-6" })}>
            {actionLabel}
          </Link>
        )}
      </Card>
    </div>
  );
}

/** Round icon chip used on cards (accent picks the colour). */
const ACCENTS = {
  pink: "bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]",
  navy: "bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]",
  green: "bg-[var(--brand-green)]/12 text-[var(--brand-green-dark)]",
  gold: "bg-[var(--brand-gold)]/15 text-[#8a5c0a]",
  sky: "bg-sky-100 text-sky-700",
} as const;
export type Accent = keyof typeof ACCENTS;

export function IconChip({ icon: Icon, accent = "pink", className }: { icon: LucideIcon; accent?: Accent; className?: string }) {
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", ACCENTS[accent], className)}>
      <Icon className="h-5 w-5" />
    </span>
  );
}

/** Text field look that matches the Input component, for plain <input>s. */
export const fieldClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-[var(--brand-navy)] placeholder:text-slate-400 transition-colors focus:border-[var(--brand-pink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-pink)]/30 sm:text-sm";

/** Pagination row used under lists. */
export function PageNav({
  label,
  onPrev,
  onNext,
  canPrev,
  canNext,
  className,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  className?: string;
}) {
  const btn =
    "flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors enabled:hover:border-[var(--brand-pink)] enabled:hover:text-[var(--brand-pink)] disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className={cn("flex items-center justify-between text-sm text-slate-500", className)}>
      <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-slate-200">{label}</span>
      <div className="flex gap-2">
        <button type="button" onClick={onPrev} disabled={!canPrev} className={btn} aria-label="Previous page">
          <span aria-hidden="true">‹</span>
        </button>
        <button type="button" onClick={onNext} disabled={!canNext} className={btn} aria-label="Next page">
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  );
}