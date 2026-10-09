import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export default function SectionHeading({
  title,
  description,
  align = "left",
  tone = "dark",
  action,
  className,
}: {
  title: string;
  description?: string;
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
        <h2
          className={cn(
            "text-2xl font-semibold tracking-tight sm:text-4xl",
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