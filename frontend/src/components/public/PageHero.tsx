import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Aurora from "./Aurora";

// Top band shared by every inner public page (Features, Pricing, About...).
export default function PageHero({
  title,
  description,
  icon: Icon,
  eyebrow,
  children,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  /** A short label above the title, e.g. "Features". */
  eyebrow?: string;
  children?: ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  const rise = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <section
      className="relative overflow-hidden rounded-b-[2rem] text-white sm:rounded-b-[3rem]"
      style={{ background: "var(--gradient-brand)" }}
    >
      <Aurora />

      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:px-8">
        <motion.div {...rise(0)} className="flex items-center gap-3">
          {Icon && (
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/25 backdrop-blur-sm">
              <Icon className="h-6 w-6" />
            </span>
          )}
          {eyebrow && (
            <span className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/85 ring-1 ring-white/20">
              {eyebrow}
            </span>
          )}
        </motion.div>

        <motion.h1
          {...rise(0.08)}
          className="mt-5 max-w-3xl text-balance text-3xl font-semibold leading-[1.12] tracking-tight sm:text-5xl"
        >
          {title}
        </motion.h1>
        <motion.p {...rise(0.16)} className="mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
          {description}
        </motion.p>
        {children && (
          <motion.div {...rise(0.24)} className="mt-8 flex flex-wrap gap-3">
            {children}
          </motion.div>
        )}
      </div>
    </section>
  );
}