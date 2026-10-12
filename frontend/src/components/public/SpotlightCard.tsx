import type { ReactNode } from "react";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { cn } from "@/lib/utils";

// A card with a soft pink glow that follows the mouse. On touch screens
// there is no pointer to follow, so it is simply a clean card.
export default function SpotlightCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const x = useMotionValue(-300);
  const y = useMotionValue(-300);
  const glow = useMotionTemplate`radial-gradient(340px circle at ${x}px ${y}px, rgba(212, 20, 114, 0.09), transparent 70%)`;

  return (
    <div
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse") return;
        const rect = event.currentTarget.getBoundingClientRect();
        x.set(event.clientX - rect.left);
        y.set(event.clientY - rect.top);
      }}
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-slate-100 bg-white soft-shadow transition-all duration-300 [@media(hover:hover)]:hover:-translate-y-1 [@media(hover:hover)]:hover:border-[var(--brand-pink)]/20",
        className
      )}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 [@media(hover:hover)]:group-hover:opacity-100"
        style={{ background: glow }}
      />
      <div className="relative h-full">{children}</div>
    </div>
  );
}