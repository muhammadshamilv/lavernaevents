import { CalendarDays, HardDrive } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminReports } from "@/queries/useAdminQueries";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatStorage(mb: number | null | undefined): string {
  const safeMb = Number(mb ?? 0);
  if (safeMb >= 1024) return `${(safeMb / 1024).toFixed(1)} GB`;
  return `${safeMb.toFixed(0)} MB`;
}

function formatShortDate(periodStr: string): string {
  // "YYYY-MM-DD" parsed as local time so the label never shifts a day.
  const [y, m, d] = periodStr.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

interface ChartPoint {
  period: string;
  value: number;
}

// Plain-div bar chart: no chart library needed for a 30-day trend. Tapping a
// bar (touch) or hovering/focusing it (desktop) shows its value; the first and
// last dates are printed under the axis so the range is always readable.
function BarChart({
  data,
  color,
  formatValue,
  label,
}: {
  data: ChartPoint[];
  color: string;
  formatValue: (value: number) => string;
  label: string;
}) {
  if (data.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-slate-400">No data for this period yet.</div>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const allZero = data.every((d) => d.value === 0);

  return (
    <div role="img" aria-label={`${label}: ${data.length} days, ${allZero ? "no activity" : `peak ${formatValue(max)}`}`}>
      <div className="flex h-40 items-end gap-[2px] sm:gap-1">
        {data.map((point) => (
          <div key={point.period} className="group relative flex h-full flex-1 items-end" title={`${formatShortDate(point.period)}: ${formatValue(point.value)}`}>
            <div
              className="w-full rounded-t-sm transition-opacity [@media(hover:hover)]:group-hover:opacity-80"
              style={{ height: `${Math.max((point.value / max) * 100, 2)}%`, backgroundColor: color, opacity: point.value === 0 ? 0.25 : 1 }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-[var(--brand-navy)] px-2 py-1 text-[10px] text-white [@media(hover:hover)]:group-hover:block">
              {formatShortDate(point.period)}: {formatValue(point.value)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
        <span>{formatShortDate(data[0].period)}</span>
        <span>{formatShortDate(data[data.length - 1].period)}</span>
      </div>
    </div>
  );
}

export default function Reports() {
  const { data: reports, isLoading, isError } = useAdminReports();

  const revenue: ChartPoint[] = (reports?.revenue_by_period ?? []).map((p) => ({ period: p.period, value: Number(p.amount ?? 0) }));
  const registrations: ChartPoint[] = (reports?.registrations_by_period ?? []).map((p) => ({ period: p.period, value: Number(p.count ?? 0) }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">Revenue, registrations, and platform usage trends.</p>
      </div>

      {isError ? (
        <Card className="p-8 text-center text-sm text-slate-500">We couldn't load reports right now. Please refresh the page.</Card>
      ) : isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      ) : reports ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0f766e]/10 text-[#0f766e]">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Active Events</p>
                  <p className="text-xl font-bold text-[var(--brand-navy)]">{reports.active_events_count ?? 0}</p>
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#7c3aed]/10 text-[#7c3aed]">
                  <HardDrive className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Storage Usage</p>
                  <p className="text-xl font-bold text-[var(--brand-navy)]">{formatStorage(reports.storage_usage_mb)}</p>
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="font-bold text-[var(--brand-navy)]">Revenue (last 30 days)</h2>
            <p className="mt-1 text-sm text-slate-500">Total: {formatCurrency(revenue.reduce((sum, p) => sum + p.value, 0))}</p>
            <div className="mt-4">
              <BarChart data={revenue} color="#d41472" formatValue={formatCurrency} label="Revenue per day" />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-bold text-[var(--brand-navy)]">Registrations (last 30 days)</h2>
            <p className="mt-1 text-sm text-slate-500">Total: {registrations.reduce((sum, p) => sum + p.value, 0)}</p>
            <div className="mt-4">
              <BarChart data={registrations} color="#241542" formatValue={(v) => String(v)} label="Registrations per day" />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 p-5">
              <h2 className="font-bold text-[var(--brand-navy)]">Membership Statistics</h2>
              <p className="mt-1 text-sm text-slate-500">Subscribers with an active, unexpired plan.</p>
            </div>
            {reports.membership_statistics && reports.membership_statistics.length > 0 ? (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">Plan</th>
                    <th className="px-5 py-3 text-right font-medium">Active Subscribers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {reports.membership_statistics.map((stat) => (
                    <tr key={stat.plan_name}>
                      <td className="px-5 py-3 font-medium text-[var(--brand-navy)]">{stat.plan_name}</td>
                      <td className="px-5 py-3 text-right text-slate-500">{stat.active_subscribers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-5 text-center text-sm text-slate-500">No subscription data yet.</div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}