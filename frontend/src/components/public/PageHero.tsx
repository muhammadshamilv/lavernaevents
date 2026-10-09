import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// Top band shared by every inner public page (Features, Pricing, About...).
export default function PageHero({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-b-[2rem] text-white sm:rounded-b-[3rem]"
      style={{ background: "var(--gradient-brand)" }}
    >
      <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[var(--brand-pink-light)]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-[var(--brand-green)]/15 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        {Icon && (
          <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/25">
            <Icon className="h-6 w-6" />
          </span>
        )}
        <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-base text-white/80 sm:text-lg">{description}</p>
        {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
      </div>
    </section>
  );
}