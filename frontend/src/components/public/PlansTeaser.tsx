import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlans } from "@/queries/useMembershipQueries";
import { formatPrice, formatStorage } from "@/lib/format";
import { countLabel } from "@/lib/planLabels";
import type { MembershipPlan } from "@/types/membership.types";

function PlanTile({ plan }: { plan: MembershipPlan }) {
  const isFree = Number(plan.price) === 0;

  return (
    <Link
      to={`/pricing?plan=${plan.slug}`}
      className="group flex h-full flex-col rounded-3xl border border-slate-100 bg-white p-6 soft-shadow transition-transform [@media(hover:hover)]:hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-pink)]"
    >
      <h3 className="text-lg font-semibold text-[var(--brand-navy)]">{plan.name}</h3>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--brand-navy)]">
        {formatPrice(plan.price)}
        {!isFree && <span className="text-sm font-medium text-slate-400"> / {plan.duration_days} days</span>}
      </p>

      <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-600">
        {[
          `Up to ${plan.guest_limit.toLocaleString("en-IN")} guests`,
          `${plan.event_limit} active event${plan.event_limit === 1 ? "" : "s"}`,
          countLabel(plan.total_invitations, "invitation"),
          `${formatStorage(plan.storage_limit_mb)} storage`,
        ].map((line) => (
          <li key={line} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-green)]" />
            {line}
          </li>
        ))}
      </ul>

      <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand-pink)]">
        See this plan
        <ArrowRight className="h-4 w-4 transition-transform [@media(hover:hover)]:group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

// Live plans from the same endpoint as the Pricing page, so the home page
// can never advertise a price or limit the plan doesn't have.
export default function PlansTeaser() {
  const { data: plans, isLoading, isError } = usePlans();

  if (isError) {
    return (
      <p className="rounded-2xl border border-slate-100 bg-white p-6 text-center text-sm text-slate-500">
        Plans couldn't load right now.{" "}
        <Link to="/pricing" className="font-semibold text-[var(--brand-pink)]">
          Open the pricing page
        </Link>
        .
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-64 w-full rounded-3xl" />
        ))}
      </div>
    );
  }

  const shown = (plans ?? []).slice(0, 3);

  if (shown.length === 0) {
    return (
      <p className="rounded-2xl border border-slate-100 bg-white p-6 text-center text-sm text-slate-500">
        Plans will appear here soon.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {shown.map((plan) => (
        <PlanTile key={plan.slug} plan={plan} />
      ))}
    </div>
  );
}