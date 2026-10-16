import fullLogo from "@/assets/laverna-logo-full.png";
import mark from "@/assets/laverna-mark.png";
import { cn } from "@/lib/utils";

// The one place the LavernaEvents logo is drawn, so it looks identical in
// the navbar, footer, sidebars and sign-in screens.
//
// It shows the real brand artwork (laverna-logo-full.png: the mark, the
// heart flourish, LAVERNA, EVENTS and the colour lines), trimmed of empty
// margins. Nothing is redrawn or retyped.

export type LogoSize = "sm" | "md" | "lg" | "xl";

// Display height of the artwork in px. Width follows the picture's shape.
const HEIGHTS: Record<LogoSize, number> = { sm: 36, md: 48, lg: 62, xl: 110 };

// Intrinsic sizes - lets the browser reserve the space before the image
// loads, so nothing jumps.
const FULL = { width: 879, height: 321 };
const MARK = { width: 253, height: 317 };

export default function Logo({
  size = "md",
  tone = "dark",
  showWordmark = true,
  className,
}: {
  size?: LogoSize;
  /** "dark" for white/light backgrounds, "light" for navy or gradient ones
   *  (the artwork sits on a white tile so its dark lettering stays readable). */
  tone?: "dark" | "light";
  showWordmark?: boolean;
  className?: string;
}) {
  const h = HEIGHTS[size];
  const onDark = tone === "light";
  const art = showWordmark ? FULL : MARK;

  return (
    <span
      className={cn(
        "inline-flex max-w-full select-none items-center justify-center",
        onDark && "rounded-xl bg-white shadow-sm",
        className
      )}
      style={onDark ? { padding: `${Math.round(h * 0.14)}px ${Math.round(h * 0.2)}px` } : undefined}
    >
      <img
        src={showWordmark ? fullLogo : mark}
        alt="LavernaEvents"
        width={art.width}
        height={art.height}
        draggable={false}
        decoding="async"
        className="max-w-full"
        style={{ height: h, width: "auto" }}
      />
    </span>
  );
}