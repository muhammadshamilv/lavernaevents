import { Link } from "react-router-dom";
import { Check, Tag } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";
import CtaBand from "@/components/public/CtaBand";
import FaqAccordion from "@/components/public/FaqAccordion";
import { FAQ_GROUPS } from "@/components/public/faqData";
import PageHero from "@/components/public/PageHero";
import Reveal, { Stagger, StaggerItem } from "@/components/public/Reveal";
import SectionHeading from "@/components/public/SectionHeading";
import PricingGrid from "@/components/membership/PricingGrid";

const ALL_PLANS_INCLUDE = [
  "Secure event photo storage",
  "Personal invitation links for every guest",
  "Live RSVP tracking",
  "Works on any phone, with nothing to install",
  "Upgrade whenever your event grows",
  "Extra invitations available as topup packs",
];

const BILLING_FAQS = FAQ_GROUPS.find((group) => group.id === "billing")?.items ?? [];

export default function Pricing() {
  usePageMeta(
    "Pricing",
    "Simple plans for every guest list. Compare events, guests, invitations and storage, and upgrade whenever your event grows."
  );

  return (
    <div>
      <PageHero
        icon={Tag}
        eyebrow="Pricing"
        title="Simple plans that grow with your guest list"
        description="Choose the plan that fits how you're planning. Upgrade any time as your event grows."
      />

      <PricingGrid hideHeader />

      <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <SectionHeading eyebrow="Every plan" title="What's included, whichever you choose" align="center" />
          </Reveal>
          <Stagger className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-2" gap={0.06}>
            {ALL_PLANS_INCLUDE.map((line) => (
              <StaggerItem key={line}>
                <div className="card-hover-lift flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3.5 text-sm text-slate-600 soft-shadow">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-green)]/15 text-[var(--brand-green-dark)] ring-4 ring-[var(--brand-green)]/10">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  {line}
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {BILLING_FAQS.length > 0 && (
        <section className="px-4 pb-4 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <Reveal>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-pink)]">Billing</p>
              <h2 className="text-balance text-2xl font-semibold tracking-tight text-[var(--brand-navy)] sm:text-4xl">
                Questions about plans and payment
              </h2>
              <p className="mt-3 text-slate-500 sm:text-lg">
                Payments are handled by Cashfree's secure checkout. See our refund terms on the{" "}
                <Link to="/refunds" className="font-semibold text-[var(--brand-pink)] hover:underline">
                  Refunds &amp; Cancellations
                </Link>{" "}
                page.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white px-5 soft-shadow-lg sm:px-8">
                <FaqAccordion items={BILLING_FAQS} />
              </div>
            </Reveal>
          </div>
        </section>
      )}

      <CtaBand
        title="Not sure which plan fits?"
        description="Tell us about your event and we'll help you choose."
        primary={{ label: "Talk to us", to: "/contact" }}
        secondary={{ label: "See all features", to: "/features" }}
      />
    </div>
  );
}