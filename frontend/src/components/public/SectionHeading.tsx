import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export default function SectionHeading({
  title,
  description,
  eyebrow,
  align = "left",
  tone = "dark",
  action,
  className,
}: {
  title: string;
  description?: string;
  /** Small uppercase label above the title. */
  eyebrow?: string;
  align?: "left" | "center";
  tone?: "dark" | "light";
  action?: ReactNode;
  className?: string;
}) {
  const centered = align === "center";

  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        centered && "items-center text-center sm:flex-col sm:items-center",
        className
      )}
    >
      <div className={cn("max-w-2xl", centered && "mx-auto")}>
        {eyebrow && (
          <p
            className={cn(
              "mb-3 text-xs font-semibold uppercase tracking-[0.18em]",
              tone === "light" ? "text-[var(--brand-pink-light)]" : "text-[var(--brand-pink)]"
            )}
          >
            {eyebrow}
          </p>
        )}
        <h2
          className={cn(
            "text-balance text-2xl font-semibold tracking-tight sm:text-4xl",
            tone === "light" ? "text-white" : "text-[var(--brand-navy)]"
          )}
        >
          {title}
        </h2>
        {description && (
          <p className={cn("mt-3 text-base sm:text-lg", tone === "light" ? "text-white/75" : "text-slate-500")}>
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}