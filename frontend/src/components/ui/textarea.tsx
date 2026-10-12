import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

// Same look as <Input>, for longer text.
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, hasError, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-28 w-full resize-y rounded-2xl border bg-white px-4 py-3 text-sm leading-relaxed text-[var(--brand-navy)] placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--brand-pink)]/40 disabled:cursor-not-allowed disabled:opacity-50",
        hasError ? "border-rose-300 focus:ring-rose-300/40" : "border-slate-200 focus:border-[var(--brand-pink)]",
        className
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };