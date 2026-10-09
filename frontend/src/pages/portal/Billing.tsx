import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  Mail,
  MessageSquare,
  Phone,
  Receipt,
} from "lucide-react";
import { Card, FormError } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMySubscription,
  useMyUsage,
  useTopupPacks,
} from "@/queries/useMembershipQueries";
import {
  useCreateTopupCheckoutSessionMutation,
  usePaymentHistory,
} from "@/queries/usePaymentQueries";
import { formatPrice, formatStorage } from "@/lib/format";
import { getApiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import type { TopupPack } from "@/types/membership.types";
import type { PaymentHistoryItem, PaymentStatus } from "@/types/payment.types";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysLeft(value: string): number {
  return Math.max(Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000), 0);
}

function UsageBar({
  label,
  used,
  topup,
  total,
  remaining,
  icon: Icon,
}: {
  label: string;
  used: number | null;
  topup: number | null;
  total: number | null;
  remaining: number | null;
  icon: React.ElementType;
}) {
  const isUnlimited = total === null;
  const safeUsed = used ?? 0;
  const safeTopup = topup ?? 0;
  const effectiveTotal = isUnlimited ? null : (total ?? 0) + safeTopup;
  const pct =
    effectiveTotal && effectiveTotal > 0 ? Math.min((safeUsed / effectiveTotal) * 100, 100) : 0;
  const isNone = !isUnlimited && effectiveTotal === 0;
  const isLow =
    !isUnlimited && !isNone && remaining !== null && effectiveTotal
      ? remaining / effectiveTotal < 0.1
      : false;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <p className="text-sm font-semibold text-[var(--brand-navy)]">{label}</p>
      </div>

      {isUnlimited ? (
        <p className="mt-3 text-sm text-slate-500">Unlimited</p>
      ) : isNone ? (
        <p className="mt-3 text-sm text-slate-500">Not included in your plan.</p>
      ) : (
        <>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: isLow ? "#dc2626" : "#0f766e" }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>
              {safeUsed.toLocaleString()} used of {effectiveTotal?.toLocaleString()}
              {safeTopup > 0 && (
                <span className="text-slate-400"> (incl. {safeTopup.toLocaleString()} topup)</span>
              )}
            </span>
            <span className={isLow ? "font-semibold text-rose-600" : ""}>
              {(remaining ?? 0).toLocaleString()} left
            </span>
          </div>
          {isLow && (
            <p className="mt-2 flex items-center gap-1 text-xs font-medium text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Running low - consider buying a topup pack below.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function LimitTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-[var(--brand-navy)]">{value}</p>
    </div>
  );
}

function PlanSummary() {
  const { data: subscription, isLoading: subLoading } = useMySubscription();
  const { data: usage, isLoading: usageLoading } = useMyUsage();

  if (subLoading || usageLoading) {
    return <Skeleton className="h-40 w-full rounded-3xl" />;
  }

  if (!subscription || !usage?.has_active_plan) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-slate-500">You don't have an active plan.</p>
        <Link to="/pricing" className={buttonVariants({ className: "mt-4" })}>
          Choose a plan
        </Link>
      </Card>
    );
  }

  const remainingDays = daysLeft(subscription.expires_at);
  const endingSoon = remainingDays <= 7;
  const templates =
    usage.template_limit === null
      ? `${usage.template_count ?? 0} / unlimited`
      : `${usage.template_count ?? 0} / ${usage.template_limit}`;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Current plan
          </p>
          <h2 className="mt-1 truncate text-xl font-bold text-[var(--brand-navy)]">
            {subscription.plan.name}
          </h2>
          <p
            className={cn(
              "mt-1 flex items-center gap-1.5 text-sm",
              endingSoon ? "font-medium text-rose-600" : "text-slate-500"
            )}
          >
            <CalendarClock className="h-4 w-4 shrink-0" />
            {remainingDays === 0
              ? "Ends today"
              : `${remainingDays} day${remainingDays === 1 ? "" : "s"} left`}
            <span className="text-slate-400">- until {formatDate(subscription.expires_at)}</span>
          </p>
        </div>

        <Link to="/pricing" className={buttonVariants({ variant: "outline" })}>
          Change plan
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <LimitTile label="Guests per event" value={String(usage.guest_limit ?? "-")} />
        <LimitTile label="Active events" value={String(usage.event_limit ?? "-")} />
        <LimitTile label="Templates" value={templates} />
        <LimitTile
          label="Storage"
          value={usage.storage_limit_mb == null ? "-" : formatStorage(usage.storage_limit_mb)}
        />
      </div>
    </Card>
  );
}

function TopupPackCard({ pack }: { pack: TopupPack }) {
  const checkoutMutation = useCreateTopupCheckoutSessionMutation();

  const handleBuy = () => {
    checkoutMutation.mutate(pack.id, {
      onSuccess: (result) => {
        window.location.href = result.checkout_url;
      },
    });
  };

  const Icon = pack.kind === "VOICE_CALLS" ? Phone : MessageSquare;

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {pack.kind === "VOICE_CALLS" ? "Voice Calls" : "Invitations"}
        </p>
      </div>
      <h3 className="mt-2 font-bold text-[var(--brand-navy)]">{pack.name}</h3>
      <p className="mt-1 text-sm text-slate-500">
        +{pack.quantity.toLocaleString()} {pack.kind === "VOICE_CALLS" ? "calls" : "invitations"}
      </p>
      <p className="mt-3 text-2xl font-bold text-[var(--brand-navy)]">{formatPrice(pack.price)}</p>

      <div className="mt-4 flex-1" />

      <Button className="mt-4 w-full" isLoading={checkoutMutation.isPending} onClick={handleBuy}>
        Buy this pack
      </Button>
      {checkoutMutation.isError && (
        <div className="mt-2">
          <FormError
            message={getApiErrorMessage(checkoutMutation.error, "Couldn't start checkout.")}
          />
        </div>
      )}
    </Card>
  );
}

const STATUS_STYLE: Record<PaymentStatus, { label: string; className: string }> = {
  PAID: { label: "Paid", className: "bg-emerald-50 text-emerald-700" },
  FAILED: { label: "Failed", className: "bg-rose-50 text-rose-700" },
  CREATED: { label: "Not completed", className: "bg-amber-50 text-amber-700" },
};

function HistoryRow({ item }: { item: PaymentHistoryItem }) {
  const style = STATUS_STYLE[item.status];

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--brand-navy)]">
          {item.description}
        </p>
        <p className="text-xs text-slate-400">
          {item.kind === "TOPUP" ? "Topup" : "Plan"} - {formatDate(item.created_at)}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-[var(--brand-navy)]">
          {formatPrice(item.amount)}
        </p>
        <span
          className={cn(
            "mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold",
            style.className
          )}
        >
          {style.label}
        </span>
      </div>
    </li>
  );
}

export default function Billing() {
  const { data: usage, isLoading: usageLoading, isError: usageError } = useMyUsage();
  const { data: packs, isLoading: packsLoading, isError: packsError } = useTopupPacks();
  const { data: history, isLoading: historyLoading } = usePaymentHistory();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--brand-navy)] sm:text-2xl">Billing & Usage</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your plan, what you've used, and extra packs when you need more.
        </p>
      </div>

      <PlanSummary />

      <h2 className="mb-3 mt-8 text-lg font-bold text-[var(--brand-navy)]">Usage</h2>

      {usageError ? (
        <Card className="p-6 text-center text-sm text-slate-500">
          We couldn't load your usage right now. Please refresh the page.
        </Card>
      ) : usageLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-28 w-full rounded-3xl" />
          <Skeleton className="h-28 w-full rounded-3xl" />
        </div>
      ) : usage?.has_active_plan ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <UsageBar
            label="Invitations"
            used={usage.invitations_used}
            topup={usage.invitations_topup}
            total={usage.total_invitations}
            remaining={usage.invitations_remaining}
            icon={Mail}
          />
          <UsageBar
            label="Voice Calls"
            used={usage.voice_calls_used}
            topup={usage.voice_calls_topup}
            total={usage.voice_call_limit}
            remaining={usage.voice_calls_remaining}
            icon={Phone}
          />
        </div>
      ) : null}

      <div className="mt-8">
        <h2 className="text-lg font-bold text-[var(--brand-navy)]">Buy a topup pack</h2>
        <p className="mt-1 text-sm text-slate-500">
          Topup packs add extra invitations or voice calls on top of your plan. They don't
          expire with the month and carry over if you change plan.
        </p>

        {packsError ? (
          <Card className="mt-4 p-6 text-center text-sm text-slate-500">
            We couldn't load topup packs right now. Please refresh the page.
          </Card>
        ) : packsLoading ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-3xl" />
            ))}
          </div>
        ) : packs && packs.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {packs.map((pack) => (
              <TopupPackCard key={pack.id} pack={pack} />
            ))}
          </div>
        ) : (
          <Card className="mt-4 p-6 text-center text-sm text-slate-500">
            No topup packs are available right now.
          </Card>
        )}
      </div>

      <div className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--brand-navy)]">
          <Receipt className="h-5 w-5 text-slate-400" />
          Billing history
        </h2>

        <Card className="mt-3 px-5">
          {historyLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : history && history.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {history.map((item) => (
                <HistoryRow key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">No payments yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}