import { Check } from "lucide-react";
import { CHANNELS } from "@/lib/channels";
import { cn } from "@/lib/utils";
import type { NotificationChannel } from "@/types/notification.types";

interface ChannelSelectorProps {
  value: NotificationChannel | null;
  onChange: (channel: NotificationChannel) => void;
}

/**
 * Step 1 on the Guests page: choose HOW to send before touching any guest.
 */
export default function ChannelSelector({ value, onChange }: ChannelSelectorProps) {
  const selected = CHANNELS.find((channel) => channel.key === value) ?? null;

  return (
    <div className="premium-card p-4 lg:p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[image:var(--gradient-brand)] text-[11px] font-bold text-white">
          1
        </span>
        <p className="text-sm font-semibold text-[var(--brand-navy)]">Send invitations via</p>
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {CHANNELS.map((channel) => {
          const isSelected = channel.key === value;
          const Icon = channel.icon;

          return (
            <button
              key={channel.key}
              type="button"
              onClick={() => onChange(channel.key)}
              aria-pressed={isSelected}
              className={cn(
                "relative flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition-all active:scale-[0.98]",
                isSelected
                  ? "border-[var(--brand-pink)] bg-[var(--brand-pink)]/10 text-[var(--brand-pink)] shadow-sm shadow-[var(--brand-pink)]/10"
                  : "border-slate-200 bg-white text-slate-600 [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:border-slate-300 [@media(hover:hover)]:hover:shadow-sm"
              )}
            >
              <Icon className="h-4 w-4" />
              {channel.label}
              {isSelected && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-pink)] text-white ring-2 ring-white">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {selected
          ? selected.description
          : "Choose a channel to start sending. You can switch any time."}
      </p>
    </div>
  );
}