import { z } from "zod";
import type { EventStatus, EventType } from "@/types/event.types";

const EVENT_TYPE_VALUES: [EventType, ...EventType[]] = [
  "WEDDING",
  "RECEPTION",
  "ENGAGEMENT",
  "BIRTHDAY",
  "ANNIVERSARY",
  "HOUSEWARMING",
  "CORPORATE",
  "CONFERENCE",
  "SEMINAR",
  "RELIGIOUS",
  "FAMILY",
  "COMMUNITY",
  "PRIVATE",
  "CUSTOM",
];

const EVENT_STATUS_VALUES: [EventStatus, ...EventStatus[]] = [
  "DRAFT",
  "PUBLISHED",
  "CANCELLED",
  "COMPLETED",
];

// Today's date as YYYY-MM-DD in the BROWSER's local time zone (never UTC -
// toISOString() would give "yesterday" for early-morning users east of UTC).
export function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function isTodayOrFuture(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const value = new Date(`${dateStr}T00:00:00`);

  return value.getTime() >= today.getTime();
}

const baseEventDate = z
  .string()
  .min(1, "Event date is required.")
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "Enter a valid date.",
  });

const eventShape = {
  name: z
    .string()
    .trim()
    .min(1, "Event name is required.")
    .max(200, "Event name must be 200 characters or fewer."),
  event_type: z.enum(EVENT_TYPE_VALUES, { message: "Select an event type." }),
  custom_event_type_label: z
    .string()
    .trim()
    .max(100, "Label must be 100 characters or fewer.")
    .optional(),
  host_name: z.string().trim().max(150, "Host name must be 150 characters or fewer.").optional(),
  description: z.string().trim().optional(),
  event_date: baseEventDate,
  event_time: z.string().min(1, "Start time is required."),
  // Optional. May be earlier than the start time (event runs past midnight).
  event_end_time: z.string().optional(),
  venue_name: z.string().trim().max(200, "Venue name must be 200 characters or fewer.").optional(),
  address: z.string().trim().optional(),
  google_maps_link: z
    .union([
      z
        .string()
        .trim()
        .url("Enter a valid URL.")
        .refine((value) => /^https?:\/\//i.test(value), "Link must start with http:// or https://"),
      z.literal(""),
    ])
    .optional(),
  status: z.enum(EVENT_STATUS_VALUES).optional(),
};

function checkCustomLabel(
  data: { event_type: EventType; custom_event_type_label?: string },
  ctx: z.RefinementCtx
) {
  if (data.event_type === "CUSTOM" && !(data.custom_event_type_label?.trim().length ?? 0)) {
    ctx.addIssue({
      code: "custom",
      message: "Custom event type label is required when event type is Custom.",
      path: ["custom_event_type_label"],
    });
  }
}

// Used when creating a new event: event_date must not be in the past.
export const createEventSchema = z
  .object({
    ...eventShape,
    event_date: baseEventDate.refine(isTodayOrFuture, {
      message: "Event date can't be in the past.",
    }),
  })
  .superRefine(checkCustomLabel);

// Used when editing: no past-date check, so an organizer can still edit or
// complete an event after its day has arrived. (The server only rejects a
// CHANGED date that lands in the past.)
export const editEventSchema = z.object(eventShape).superRefine(checkCustomLabel);

export type EventFormValues = z.infer<typeof createEventSchema>;