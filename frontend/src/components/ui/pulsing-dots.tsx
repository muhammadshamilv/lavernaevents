import { cn } from "@/lib/utils";

// Three dots that swell one after another. Good for short waits where the
// length is unknown: "Sending", "Scanning", "Loading more".

const DOT_SIZES = { sm: "h-1.5 w-1.5", md: "h-2 w-2", lg: "h-3 w-3" } as const;

interface PulsingDotsProps {
  size?: keyof typeof DOT_SIZES;
  className?: string;
  label?: string;
  /** Set when text next to the dots already says what is happening. */
  decorative?: boolean;
}

export function PulsingDots({ size = "md", className, label = "Loading", decorative = false }: PulsingDotsProps) {
  return (
    <span
      role={decorative ? undefined : "status"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      className={cn("dots-pulse inline-flex items-center gap-1.5 text-[var(--brand-pink)]", className)}
    >
      <span className={cn("rounded-full bg-current", DOT_SIZES[size])} />
      <span className={cn("rounded-full bg-current", DOT_SIZES[size])} />
      <span className={cn("rounded-full bg-current", DOT_SIZES[size])} />
    </span>
  );
}