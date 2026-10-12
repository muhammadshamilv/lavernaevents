import { Activity, AlertTriangle, CalendarDays, HardDrive, IndianRupee, LayoutDashboard, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/portal/PortalUI";
import { useAdminDashboardStats } from "@/queries/useAdminQueries";
import type { AdminChannelUsage } from "@/types/admin.types";

interface StatTileProps {
  label: string;
  value: string;
  icon: React.ElementType;
  accent: string;
}

function StatTile({ label, value, icon: Icon, accent }: StatTileProps) {
  return (
    <Card className="card-hover-lift relative overflow-hidden p-5">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.07]"
        style={{ backgroundColor: accent }}
      />
      <div className="flex items-center gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${accent}1a`, color: accent }}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-0.5 truncate text-2xl font-bold tracking-tight text-[var(--brand-navy)]">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function StatTileSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
    </Card>
  );
}

function formatCurrency(amount: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount ?? 0);
}

function formatStorage(mb: number | null | undefined): string {
  const safeMb = mb ?? 0;
  if (safeMb >= 1024) return `${(safeMb / 1024).toFixed(1)} GB`;
  return `${safeMb.toFixed(0)} MB`;
}

// Phase 26: platform channel pool health card. Pools can be in three
// states: healthy (plenty remaining), low (crossed low_balance_threshold -
// amber warning), or exhausted (0 remaining - red warning, sends on that
// channel are hard-blocked platform-wide). This card is the "mandatory
// monitoring" surface the admin dashboard needs - a visible warning only,
// no separate email/notification channel, per the confirmed scope.
function ChannelPoolCard({ usage }: { usage: AdminChannelUsage[] }) {
  if (usage.length === 0) {
    return null;
  }

  const anyWarning = usage.some((u) => u.is_low || u.is_exhausted);

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-[var(--brand-navy)]">
          <Activity className="h-4 w-4 text-[var(--brand-pink)]" />
          Platform Channel Capacity
        </h2>
        {anyWarning && (
          <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Attention needed
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {usage.map((pool) => {
          const pct =
            pool.total_capacity > 0
              ? Math.min((pool.used / pool.total_capacity) * 100, 100)
              : 0;

          const barClass = pool.is_exhausted
            ? "bg-rose-600"
            : pool.is_low
              ? "bg-amber-500"
              : "bg-[image:var(--gradient-brand)]";

          return (
            <div
              key={pool.channel}
              className={`rounded-2xl border p-3.5 ${
                pool.is_exhausted
                  ? "border-rose-200 bg-rose-50"
                  : pool.is_low
                    ? "border-amber-200 bg-amber-50"
                    : "border-slate-100 bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--brand-navy)]">
                  {pool.channel_display}
                </p>
                {pool.is_exhausted && (
                  <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    EMPTY
                  </span>
                )}
                {!pool.is_exhausted && pool.is_low && (
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                    LOW
                  </span>
                )}
              </div>
              <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${barClass}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {pool.remaining.toLocaleString()} remaining of{" "}
                {pool.total_capacity.toLocaleString()}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading, isError } = useAdminDashboardStats();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        className="mb-6"
        eyebrow="Admin"
        icon={LayoutDashboard}
        title="Admin Dashboard"
        description="Platform-wide overview across all organizers and photographers."
      />

      {isError && (
        <Card className="mb-6 bg-rose-50/60 p-6 text-center ring-1 ring-rose-100">
          <p className="text-sm text-rose-600">
            We couldn't load dashboard stats right now. Please refresh the page.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <>
            {Array.from({ length: 5 }).map((_, i) => (
              <StatTileSkeleton key={i} />
            ))}
          </>
        ) : stats ? (
          <>
            <StatTile
              label="Total Users"
              value={(stats.total_users ?? 0).toLocaleString()}
              icon={Users}
              accent="#241542"
            />
            <StatTile
              label="Active Events"
              value={(stats.active_events ?? 0).toLocaleString()}
              icon={CalendarDays}
              accent="#0f766e"
            />
            <StatTile
              label="Membership Sales"
              value={(stats.membership_sales ?? 0).toLocaleString()}
              icon={Users}
              accent="#b45309"
            />
            <StatTile
              label="Total Revenue"
              value={formatCurrency(stats.revenue)}
              icon={IndianRupee}
              accent="#15803d"
            />
            <StatTile
              label="Storage Usage"
              value={formatStorage(stats.storage_usage_mb)}
              icon={HardDrive}
              accent="#7c3aed"
            />
          </>
        ) : null}
      </div>

      {!isLoading && stats?.channel_usage && stats.channel_usage.length > 0 && (
        <div className="mt-4">
          <ChannelPoolCard usage={stats.channel_usage} />
        </div>
      )}
    </div>
  );
}