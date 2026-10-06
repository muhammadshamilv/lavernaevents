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
  custom_event_type_label: z.string().trim().optional(),
  host_name: z.string().trim().optional(),
  description: z.string().trim().optional(),
  event_date: baseEventDate,
  event_time: z.string().min(1, "Event time is required."),
  // Optional. Guests then see a From - To range instead of one time.
  event_end_time: z.string().optional(),
  venue_name: z.string().trim().optional(),
  address: z.string().trim().optional(),
  google_maps_link: z
    .union([z.string().trim().url("Enter a valid URL."), z.literal("")])
    .optional(),
  status: z.enum(EVENT_STATUS_VALUES).optional(),
};

function requireCustomLabel(data: { event_type: EventType; custom_event_type_label?: string }) {
  return (
    data.event_type !== "CUSTOM" || (data.custom_event_type_label?.trim().length ?? 0) > 0
  );
}

const customLabelRefineOptions = {
  message: "Custom event type label is required when event type is Custom.",
  path: ["custom_event_type_label"],
};

// Used when creating a new event: event_date must not be in the past.
export const createEventSchema = z
  .object({
    ...eventShape,
    event_date: baseEventDate.refine(isTodayOrFuture, {
      message: "Event date can't be in the past.",
    }),
  })
  .refine(requireCustomLabel, customLabelRefineOptions);

// Used when editing an existing event: no past-date check. An event created
// for a valid future date will naturally have that date fall into the past
// once the day arrives - the organizer must still be able to edit venue,
// description, status (e.g. marking it COMPLETED), etc. after that point
// without the form refusing to save because of its own unchanged date.
export const editEventSchema = z
  .object(eventShape)
  .refine(requireCustomLabel, customLabelRefineOptions);

export type EventFormValues = z.infer<typeof createEventSchema>;