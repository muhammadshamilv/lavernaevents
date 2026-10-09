import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, History, PlusCircle } from "lucide-react";
import { Card, FormError } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import AdminDialog, { DialogActions } from "@/components/admin/AdminDialog";
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/apiError";
import { toastStore } from "@/stores/toast.store";
import {
  useAdminChannelPoolTopupHistory,
  useAdminChannelPools,
  useTopupAdminChannelPoolMutation,
} from "@/queries/useAdminQueries";
import type { InvitationChannelKey, PlatformChannelPool } from "@/types/admin.types";

const MAX_TOPUP = 10_000_000;

const topupSchema = z.object({
  channel: z.enum(["WHATSAPP", "EMAIL", "SMS", "VOICE_CALL"]),
  amount: z
    .string()
    .regex(/^\d+$/, "Enter a whole number")
    .refine((value) => Number(value) >= 1, "Must be at least 1")
    .refine((value) => Number(value) <= MAX_TOPUP, `Must be at most ${MAX_TOPUP.toLocaleString()}`),
  low_balance_threshold: z
    .string()
    .regex(/^\d+$/, "Enter a whole number")
    .refine((value) => Number(value) <= MAX_TOPUP, `Must be at most ${MAX_TOPUP.toLocaleString()}`),
  note: z.string().max(255, "Keep the note under 255 characters").optional(),
});

type TopupFormValues = z.infer<typeof topupSchema>;

const CHANNEL_OPTIONS: { value: InvitationChannelKey; label: string }[] = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "SMS", label: "SMS" },
  { value: "VOICE_CALL", label: "Voice Call" },
];

function TopupFormDialog({ pool, onClose }: { pool: PlatformChannelPool; onClose: () => void }) {
  const topupMutation = useTopupAdminChannelPoolMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<TopupFormValues>({
    resolver: zodResolver(topupSchema),
    defaultValues: {
      channel: pool.channel,
      amount: "",
      low_balance_threshold: String(pool.low_balance_threshold),
      note: "",
    },
  });

  const onSubmit = (values: TopupFormValues) => {
    topupMutation.mutate(
      {
        channel: values.channel,
        amount: Number(values.amount),
        low_balance_threshold: Number(values.low_balance_threshold),
        note: values.note?.trim() || "",
      },
      {
        onSuccess: () => {
          toastStore.show("Pool topped up.");
          onClose();
        },
        onError: (error) => {
          for (const [field, message] of Object.entries(getApiFieldErrors(error))) {
            setError(field as keyof TopupFormValues, { message });
          }
          toastStore.show(getApiErrorMessage(error, "Could not top up pool."), "error");
        },
      }
    );
  };

  return (
    <AdminDialog
      title={pool.is_configured ? "Top up channel pool" : "Set up channel pool"}
      description="Adds to the platform-wide capacity of this channel. This is separate from any organizer's own plan quota."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="mt-3 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="channel">Channel</Label>
          <Select id="channel" {...register("channel")}>
            {CHANNEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount to add</Label>
          <Input id="amount" type="number" inputMode="numeric" min={1} hasError={!!errors.amount} {...register("amount")} />
          <FormError message={errors.amount?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="low_balance_threshold">Warn me when this many are left</Label>
          <Input
            id="low_balance_threshold"
            type="number"
            inputMode="numeric"
            min={0}
            hasError={!!errors.low_balance_threshold}
            {...register("low_balance_threshold")}
          />
          <FormError message={errors.low_balance_threshold?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="note">Note (optional)</Label>
          <Input id="note" placeholder="e.g. Monthly Twilio top-up" hasError={!!errors.note} {...register("note")} />
          <FormError message={errors.note?.message} />
        </div>

        <DialogActions>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={topupMutation.isPending}>
            Top up
          </Button>
        </DialogActions>
      </form>
    </AdminDialog>
  );
}

function HistoryDialog({ channel, onClose }: { channel: InvitationChannelKey; onClose: () => void }) {
  const { data: history, isLoading, isError } = useAdminChannelPoolTopupHistory(channel);

  return (
    <AdminDialog title="Topup history" description="The 50 most recent top-ups for this channel." onClose={onClose} size="lg">
      <div className="mt-3 space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)
        ) : isError ? (
          <p className="py-6 text-center text-sm text-rose-600">Couldn't load the history.</p>
        ) : history && history.length > 0 ? (
          history.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--brand-navy)]">+{entry.amount.toLocaleString()}</p>
                <p className="text-xs text-slate-400">{new Date(entry.created_at).toLocaleString("en-IN")}</p>
              </div>
              {entry.note && <p className="mt-1 break-words text-sm text-slate-500">{entry.note}</p>}
              <p className="mt-1 text-xs text-slate-400">By {entry.topped_up_by_name ?? "Unknown"}</p>
            </div>
          ))
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">No topups recorded yet.</p>
        )}
      </div>

      <DialogActions>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </AdminDialog>
  );
}

function PoolCard({
  pool,
  onTopup,
  onHistory,
}: {
  pool: PlatformChannelPool;
  onTopup: () => void;
  onHistory: () => void;
}) {
  const percent = pool.total_capacity > 0 ? Math.min((pool.used / pool.total_capacity) * 100, 100) : 0;
  const barColor = pool.is_exhausted ? "#dc2626" : pool.is_low ? "#d97706" : "#0f766e";

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-[var(--brand-navy)]">{pool.channel_display}</h3>
        {!pool.is_configured ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">Not set up</span>
        ) : pool.is_exhausted ? (
          <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Exhausted
          </span>
        ) : pool.is_low ? (
          <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Low
          </span>
        ) : (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Healthy</span>
        )}
      </div>

      {pool.is_configured ? (
        <>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            aria-label={`${pool.channel_display} capacity used`}
            className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
          >
            <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, backgroundColor: barColor }} />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div>
              <p className="font-bold text-[var(--brand-navy)]">{pool.total_capacity.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Capacity</p>
            </div>
            <div>
              <p className="font-bold text-[var(--brand-navy)]">{pool.used.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Used</p>
            </div>
            <div>
              <p className="font-bold text-[var(--brand-navy)]">{pool.remaining.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Remaining</p>
            </div>
          </div>

          <p className="mt-2 text-center text-xs text-slate-400">
            Warns at {pool.low_balance_threshold.toLocaleString()} remaining
          </p>
        </>
      ) : (
        <p className="mt-4 flex-1 text-sm text-slate-500">
          No limit is applied to this channel yet, so sends are never blocked. Top it up to start tracking capacity.
        </p>
      )}

      <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
        <Button variant="outline" size="sm" className="flex-1" onClick={onHistory}>
          <History className="h-3.5 w-3.5" />
          History
        </Button>
        <Button size="sm" className="flex-1" onClick={onTopup}>
          <PlusCircle className="h-3.5 w-3.5" />
          {pool.is_configured ? "Top up" : "Set up"}
        </Button>
      </div>
    </Card>
  );
}

export default function ChannelPools() {
  const { data: pools, isLoading, isError } = useAdminChannelPools();
  const [topupPool, setTopupPool] = useState<PlatformChannelPool | null>(null);
  const [historyChannel, setHistoryChannel] = useState<InvitationChannelKey | null>(null);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Platform Channel Pools</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every send on a channel, whatever the organizer or plan, is counted against that channel's platform-wide pool.
          An exhausted pool blocks the channel for everyone until it's topped up.
        </p>
      </div>

      {isError ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          We couldn't load channel pools right now. Please refresh the page.
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-3xl" />
          ))}
        </div>
      ) : pools && pools.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pools.map((pool) => (
            <PoolCard
              key={pool.channel}
              pool={pool}
              onTopup={() => setTopupPool(pool)}
              onHistory={() => setHistoryChannel(pool.channel)}
            />
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center text-sm text-slate-500">No channel pools found.</Card>
      )}

      {topupPool && <TopupFormDialog pool={topupPool} onClose={() => setTopupPool(null)} />}

      {historyChannel && <HistoryDialog channel={historyChannel} onClose={() => setHistoryChannel(null)} />}
    </div>
  );
}
