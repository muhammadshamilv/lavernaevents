import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Reveal from "./Reveal";

export default function CtaBand({
  title,
  description,
  primary,
  secondary,
}: {
  title: string;
  description: string;
  primary: { label: string; to: string };
  secondary?: { label: string; to: string };
}) {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <Reveal className="mx-auto max-w-6xl">
        <div
          className="relative overflow-hidden rounded-[2rem] px-6 py-12 text-white sm:px-12 sm:py-16"
          style={{ background: "var(--gradient-brand)" }}
        >
          <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-[var(--brand-gold)]/15 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 -right-10 h-64 w-64 rounded-full bg-white/10 blur-2xl" />

          <div className="relative max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
            <p className="mt-3 text-base text-white/80 sm:text-lg">{description}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                to={primary.to}
                className={cn(
                  buttonVariants({ variant: "primary", size: "lg" }),
                  "bg-white text-[var(--brand-pink)] hover:bg-white/90"
                )}
              >
                {primary.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
              {secondary && (
                <Link
                  to={secondary.to}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "border-white/40 bg-transparent text-white hover:bg-white/10"
                  )}
                >
                  {secondary.label}
                </Link>
              )}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}