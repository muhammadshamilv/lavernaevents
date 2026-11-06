import { cn } from "@/lib/utils";

// A round spinner: a faint ring with a bright arc turning on it. It takes
// its colour from the text colour around it (currentColor), so it is pink
// on a page, white inside a primary button, and so on.

const SIZES = { xs: 16, sm: 20, md: 28, lg: 44 } as const;
export type SpinnerSize = keyof typeof SIZES;

interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  /** Read out by screen readers. */
  label?: string;
  /** Set when text next to the spinner already says what is loading. */
  decorative?: boolean;
}

export function Spinner({ size = "sm", className, label = "Loading", decorative = false }: SpinnerProps) {
  const px = SIZES[size];
  const stroke = size === "lg" ? 3.5 : 3;

  return (
    <svg
      role={decorative ? undefined : "status"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      viewBox="0 0 24 24"
      width={px}
      height={px}
      fill="none"
      className={cn("shrink-0 animate-spin motion-reduce:[animation-duration:2.4s]", className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.18" strokeWidth={stroke} />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
    </svg>
  );
}