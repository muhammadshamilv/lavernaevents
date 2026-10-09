import { Card } from "@/components/ui/card";
import { useMyUsage } from "@/queries/useMembershipQueries";
import { Skeleton } from "@/components/ui/skeleton";

function QuotaBar({
  label,
  used,
  limit,
  remaining,
  topup = 0,
}: {
  label: string;
  used: number | null;
  /** The plan's own allowance (null = unlimited). */
  limit: number | null;
  remaining: number | null;
  /** Extra allowance bought on top of the plan. */
  topup?: number | null;
}) {
  const isUnlimited = limit === null;
  // Top-ups extend the plan limit, so "used / total" and "left" agree.
  const total = isUnlimited ? null : limit + (topup ?? 0);
  const percentUsed =
    total !== null && total > 0 && used !== null ? Math.min((used / total) * 100, 100) : 0;
  const nearlyOut = percentUsed >= 90;

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-[var(--brand-navy)]">{label}</span>
        <span className="text-slate-500">
          {isUnlimited
            ? "Unlimited"
            : `${used ?? 0} / ${total} used${remaining !== null ? ` · ${remaining} left` : ""}`}
        </span>
      </div>
      {!isUnlimited && (
        <div
          role="progressbar"
          aria-label={`${label} used`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percentUsed)}
          className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100"
        >
          <div
            className={`h-full rounded-full transition-all ${nearlyOut ? "bg-rose-500" : "bg-[var(--brand-pink)]"}`}
            style={{ width: `${percentUsed}%` }}
          />
        </div>
      )}
      {!isUnlimited && !!topup && topup > 0 && (
        <p className="mt-1 text-xs text-slate-400">Includes {topup} extra from top-ups.</p>
      )}
    </div>
  );
}

export default function UsageOverview() {
  const { data: usage, isLoading, isError } = useMyUsage();

  if (isLoading) {
    return (
      <Card className="space-y-4 p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-full" />
      </Card>
    );
  }

  if (isError || !usage) {
    return (
      <Card className="p-5 text-sm text-slate-500">
        Couldn't load your usage summary right now.
      </Card>
    );
  }

  if (!usage.has_active_plan) {
    return (
      <Card className="p-5">
        <p className="text-sm text-slate-500">
          You don't have an active membership plan yet. Choose a plan to start
          sending invitations.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h3 className="text-base font-semibold text-[var(--brand-navy)]">
          {usage.plan_name} plan usage
        </h3>
        <p className="mt-0.5 text-sm text-slate-500">
          Invitations are shared across WhatsApp, Email, and SMS.
        </p>
      </div>

      <div className="space-y-4">
        <QuotaBar
          label="Invitations"
          used={usage.invitations_used}
          limit={usage.total_invitations}
          remaining={usage.invitations_remaining}
          topup={usage.invitations_topup}
        />
        <QuotaBar
          label="Template library"
          used={usage.template_count}
          limit={usage.template_limit}
          remaining={usage.template_remaining}
        />
        <QuotaBar
          label="Voice calls"
          used={usage.voice_calls_used}
          limit={usage.voice_call_limit}
          remaining={usage.voice_calls_remaining}
          topup={usage.voice_calls_topup}
        />
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-4">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
          Guests: {usage.guest_limit ?? "Unlimited"}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
          Events: {usage.event_limit ?? "Unlimited"}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
          Storage: {usage.storage_limit_mb != null ? `${usage.storage_limit_mb} MB` : "Unlimited"}
        </span>
        {usage.gallery_enabled && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
            Gallery
          </span>
        )}
        {usage.qr_code_enabled && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
            QR Code
          </span>
        )}
        {usage.photographer_access_enabled && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
            Photographer Access
          </span>
        )}
      </div>
    </Card>
  );
}