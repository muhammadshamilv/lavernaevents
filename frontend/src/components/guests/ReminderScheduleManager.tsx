import { useState } from "react";
import { AlarmClock, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getApiErrorMessage } from "@/lib/apiError";
import { toastStore } from "@/stores/toast.store";
import {
  useCreateReminderScheduleMutation,
  useDeleteReminderScheduleMutation,
  useReminderSchedules,
} from "@/queries/useInvitationQueries";
import { useGuestCategories } from "@/queries/useGuestQueries";
import { cn } from "@/lib/utils";
import type { ReminderSchedule } from "@/types/guest.types";

interface ReminderScheduleManagerProps {
  eventId: number;
}

/**
 * Lets the organizer set up automatic reminder delays, scoped either to a
 * whole guest category or to a single guest (an individual override).
 * Per Phase 22's design, only one active schedule can exist per
 * category/guest at a time - the backend enforces this, and this panel
 * just lists existing schedules and lets you add or remove one.
 *
 * Individual-guest schedules are set from GuestCardList (per-guest "Remind
 * me" action) rather than here; this panel is for category-wide rules and
 * for reviewing/removing any schedule, category or guest-level, in one
 * place.
 */
export default function ReminderScheduleManager({ eventId }: ReminderScheduleManagerProps) {
  const { data: schedules, isLoading } = useReminderSchedules(eventId);
  const { data: categories } = useGuestCategories(eventId);
  const createMutation = useCreateReminderScheduleMutation(eventId);
  const deleteMutation = useDeleteReminderScheduleMutation(eventId);

  const [adding, setAdding] = useState(false);
  const [categoryId, setCategoryId] = useState<string>("");
  const [delayHours, setDelayHours] = useState<string>("24");
  const [deleteTarget, setDeleteTarget] = useState<ReminderSchedule | null>(null);

  const categorySchedules = (schedules ?? []).filter((s) => s.category != null);

  const handleCreate = () => {
    if (!categoryId) {
      toastStore.show("Choose a category first.", "error");
      return;
    }
    const hours = Number(delayHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
      toastStore.show("Enter a whole number of hours between 1 and 720.", "error");
      return;
    }

    createMutation.mutate(
      { category: Number(categoryId), delay_hours: hours },
      {
        onSuccess: () => {
          setAdding(false);
          setCategoryId("");
          setDelayHours("24");
          toastStore.show("Reminder schedule saved.");
        },
        onError: (error) => {
          toastStore.show(getApiErrorMessage(error, "Could not save this schedule."), "error");
        },
      }
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        toastStore.show("Reminder schedule removed.");
      },
      onError: (error) => {
        toastStore.show(getApiErrorMessage(error, "Could not remove this schedule."), "error");
        setDeleteTarget(null);
      },
    });
  };

  if (isLoading) {
    return <div className="h-24 w-full animate-pulse rounded-3xl bg-slate-100" />;
  }

  return (
    <div className="premium-card p-4 lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
            <AlarmClock className="h-[18px] w-[18px]" />
          </span>
          <h3 className="text-sm font-semibold text-[var(--brand-navy)]">
            Automatic reminders by category
          </h3>
        </div>
        {!adding && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-full px-3.5 text-xs"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add schedule
          </Button>
        )}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Guests in a category get an automatic reminder (on the same channel as your active
        template) a set number of hours after they're sent an invitation, if they haven't
        responded yet.
      </p>

      {adding && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl border border-[var(--brand-pink)]/15 bg-[var(--brand-pink)]/[0.03] p-3">
          <div className="min-w-[160px] flex-1">
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Category"
            >
              <option value="">Choose category</option>
              {(categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-28">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={720}
              step={1}
              aria-label="Hours after the invitation is sent"
              value={delayHours}
              onChange={(e) => setDelayHours(e.target.value)}
              placeholder="Hours"
            />
          </div>
          <Button size="sm" onClick={handleCreate} isLoading={createMutation.isPending}>
            Save
          </Button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {categorySchedules.length > 0 ? (
        <div className="mt-3 space-y-2">
          {categorySchedules.map((schedule) => (
            <div
              key={schedule.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3.5 py-2 text-sm ring-1 ring-slate-100",
                !schedule.is_active && "opacity-50"
              )}
            >
              <span className="min-w-0 font-medium text-[var(--brand-navy)]">
                {schedule.category_name}
                <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-normal text-slate-500 ring-1 ring-slate-200">
                  reminds after {schedule.delay_hours}h
                </span>
              </span>
              <button
                type="button"
                onClick={() => setDeleteTarget(schedule)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label="Remove schedule"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        !adding && (
          <p className="mt-3 rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
            No category reminders set up yet.
          </p>
        )
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove this reminder schedule?"
        description={
          deleteTarget
            ? `Guests in "${deleteTarget.category_name}" will no longer get an automatic reminder.`
            : ""
        }
        confirmLabel="Remove"
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}