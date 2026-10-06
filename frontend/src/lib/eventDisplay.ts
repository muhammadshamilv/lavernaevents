import { EVENT_TYPE_OPTIONS, type EventStatus, type EventType } from "@/types/event.types";

export function eventTypeLabel(type: EventType, customLabel?: string): string {
  if (type === "CUSTOM" && customLabel) return customLabel;
  return EVENT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function formatEventDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;

  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatEventTime(timeStr: string): string {
  const [hoursStr, minutesStr] = timeStr.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return timeStr;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** "7:00 PM" or, when an end time is given, "7:00 PM - 10:00 PM". */
export function formatTimeRange(start: string, end?: string | null): string {
  if (!start) return "";
  if (!end) return formatEventTime(start);

  return `${formatEventTime(start)} - ${formatEventTime(end)}`;
}

const STATUS_BADGE_CLASSES: Record<EventStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-rose-100 text-rose-700",
  COMPLETED: "bg-blue-100 text-blue-700",
};

export function eventStatusBadgeClass(status: EventStatus): string {
  return STATUS_BADGE_CLASSES[status] ?? "bg-slate-100 text-slate-600";
}