import * as React from "react";
import { cn } from "@/lib/utils";

// Grey placeholder shapes shown while content loads. A soft light sweeps
// across them (see .skeleton-shimmer in index.css) and stops for people who
// have turned motion off.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton-shimmer rounded-xl bg-slate-200/70", className)}
      {...props}
    />
  );
}

export { Skeleton };