import mark from "@/assets/laverna-mark.png";
import { cn } from "@/lib/utils";

// The one place the LavernaEvents logo is drawn, so it looks identical in
// the navbar, footer, sidebars and sign-in screens.
//
// It is the trimmed brand mark (a transparent PNG with no empty margins)
// plus the name set as real text. Text stays sharp at every size and screen
// density, which a small picture of a wide lockup never does.

export type LogoSize = "sm" | "md" | "lg" | "xl";

const SIZES: Record<LogoSize, { mark: number; name: number; events: number; gap: number }> = {
  sm: { mark: 30, name: 15, events: 7.5, gap: 8 },
  md: { mark: 40, name: 20, events: 9.5, gap: 10 },
  lg: { mark: 52, name: 26, events: 12, gap: 12 },
  xl: { mark: 76, name: 38, events: 17, gap: 18 },
};

// Intrinsic size of laverna-mark.png - lets the browser reserve the space
// before the image loads, so nothing jumps.
const MARK_WIDTH = 253;
const MARK_HEIGHT = 317;

export default function Logo({
  size = "md",
  tone = "dark",
  showWordmark = true,
  className,
}: {
  size?: LogoSize;
  /** "dark" for white/light backgrounds, "light" for navy or gradient ones. */
  tone?: "dark" | "light";
  showWordmark?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  const onDark = tone === "light";

  return (
    <span className={cn("inline-flex select-none items-center", className)} style={{ gap: s.gap }}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center",
          onDark && "rounded-xl bg-white shadow-sm"
        )}
        style={onDark ? { padding: Math.max(4, s.mark * 0.1) } : undefined}
      >
        <img
          src={mark}
          alt={showWordmark ? "" : "LavernaEvents"}
          width={MARK_WIDTH}
          height={MARK_HEIGHT}
          draggable={false}
          decoding="async"
          style={{ height: s.mark, width: "auto" }}
        />
      </span>

      {showWordmark && (
        <span className="flex flex-col" style={{ gap: s.name * 0.2 }}>
          <span
            className={cn(
              "font-semibold uppercase leading-none",
              onDark ? "text-white" : "text-[var(--brand-navy)]"
            )}
            style={{ fontSize: s.name, letterSpacing: "0.1em" }}
          >
            Laverna
          </span>
          <span className="flex items-center" style={{ fontSize: s.events, gap: "0.7em" }} aria-hidden="true">
            <span className="h-px flex-1 bg-[var(--brand-pink)]/60" />
            <span
              className={cn(
                "font-semibold uppercase leading-none",
                onDark ? "text-[var(--brand-pink-light)]" : "text-[var(--brand-pink)]"
              )}
              style={{ letterSpacing: "0.36em", marginRight: "-0.36em" }}
            >
              Events
            </span>
            <span className="h-px flex-1 bg-[var(--brand-green)]/70" />
          </span>
        </span>
      )}
    </span>
  );
}