import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZE = { sm: "h-3.5 w-3.5", md: "h-5 w-5", lg: "h-8 w-8" } as const;

// Read-only stars, e.g. "4 out of 5".
export function StarRating({
  value,
  size = "md",
  className,
}: {
  value: number;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const rounded = Math.round(value);

  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          aria-hidden="true"
          className={cn(
            SIZE[size],
            star <= rounded ? "fill-[var(--brand-gold)] text-[var(--brand-gold)]" : "fill-slate-100 text-slate-200"
          )}
        />
      ))}
    </span>
  );
}

const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

// Tap-to-choose stars for a form. A real radio group underneath, so it works
// with a keyboard (arrow keys) and a screen reader.
export function StarRatingInput({
  value,
  onChange,
  hasError,
  id,
}: {
  value: number;
  onChange: (value: number) => void;
  hasError?: boolean;
  id?: string;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div>
      <div
        id={id}
        role="radiogroup"
        aria-label="Your rating"
        onMouseLeave={() => setHover(0)}
        className={cn("inline-flex items-center gap-1 rounded-2xl px-1 py-0.5", hasError && "ring-2 ring-rose-200")}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <label
            key={star}
            onMouseEnter={() => setHover(star)}
            className="cursor-pointer rounded-lg p-1 transition-transform active:scale-90 [@media(hover:hover)]:hover:scale-110 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--brand-pink)]"
          >
            <input
              type="radio"
              name="rating"
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              className="sr-only"
              aria-label={`${star} star${star === 1 ? "" : "s"}`}
            />
            <Star
              aria-hidden="true"
              className={cn(
                "h-9 w-9 transition-colors",
                star <= shown ? "fill-[var(--brand-gold)] text-[var(--brand-gold)]" : "fill-slate-100 text-slate-300"
              )}
            />
          </label>
        ))}
      </div>
      <p className="mt-1 h-5 text-sm font-medium text-slate-500" aria-live="polite">
        {shown > 0 ? RATING_WORDS[shown] : "Tap a star"}
      </p>
    </div>
  );
}