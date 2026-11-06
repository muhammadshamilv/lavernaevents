import { cn } from "@/lib/utils";

// One progress bar for the whole app: uploads, plan usage, storage, scans.
// Give it a value from 0 to 100, or leave the value out for a bar that
// travels back and forth while the length is not known.

const TONES = {
  brand: "bg-[image:var(--gradient-brand)]",
  success: "bg-[var(--brand-green)]",
  warning: "bg-amber-400",
  danger: "bg-rose-500",
  navy: "bg-[var(--brand-navy)]",
} as const;

const HEIGHTS = { xs: "h-1", sm: "h-2", md: "h-2.5", lg: "h-3" } as const;

export type ProgressTone = keyof typeof TONES;

interface ProgressBarProps {
  /** 0 to 100. Leave out when the length is not known. */
  value?: number;
  /** What is progressing, for screen readers. */
  label: string;
  tone?: ProgressTone;
  size?: keyof typeof HEIGHTS;
  /** Shows a moving light across the fill while work is still going on. */
  active?: boolean;
  /** The fill is drawn at least this wide so a bar that just started is visible. */
  minFill?: number;
  className?: string;
  fillClassName?: string;
}

export function ProgressBar({
  value,
  label,
  tone = "brand",
  size = "sm",
  active = false,
  minFill = 0,
  className,
  fillClassName,
}: ProgressBarProps) {
  const indeterminate = value === undefined;
  const clamped = indeterminate ? 0 : Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
      className={cn("relative w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-100", HEIGHTS[size], className)}
    >
      {indeterminate ? (
        <div className={cn("progress-indeterminate h-full w-2/5 rounded-full", TONES[tone], fillClassName)} />
      ) : (
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            TONES[tone],
            active && "progress-sheen",
            fillClassName
          )}
          style={{ width: `${Math.max(clamped, minFill)}%` }}
        />
      )}
    </div>
  );
}