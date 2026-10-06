export type EventType =
  | "WEDDING"
  | "RECEPTION"
  | "ENGAGEMENT"
  | "BIRTHDAY"
  | "ANNIVERSARY"
  | "HOUSEWARMING"
  | "CORPORATE"
  | "CONFERENCE"
  | "SEMINAR"
  | "RELIGIOUS"
  | "FAMILY"
  | "COMMUNITY"
  | "PRIVATE"
  | "CUSTOM";

export const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: "WEDDING", label: "Wedding" },
  { value: "RECEPTION", label: "Reception" },
  { value: "ENGAGEMENT", label: "Engagement" },
  { value: "BIRTHDAY", label: "Birthday" },
  { value: "ANNIVERSARY", label: "Anniversary" },
  { value: "HOUSEWARMING", label: "Housewarming" },
  { value: "CORPORATE", label: "Corporate Event" },
  { value: "CONFERENCE", label: "Conference" },
  { value: "SEMINAR", label: "Seminar" },
  { value: "RELIGIOUS", label: "Religious Event" },
  { value: "FAMILY", label: "Family Function" },
  { value: "COMMUNITY", label: "Community Program" },
  { value: "PRIVATE", label: "Private Event" },
  { value: "CUSTOM", label: "Custom Event" },
];

export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED" | "COMPLETED";

export const EVENT_STATUS_OPTIONS: { value: EventStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "COMPLETED", label: "Completed" },
];

export interface Event {
  id: number;
  name: string;
  event_type: EventType;
  custom_event_type_label: string;
  host_name: string;
  description: string;
  event_date: string;
  event_time: string;
  event_end_time: string | null;
  venue_name: string;
  address: string;
  google_maps_link: string;
  cover_image: string | null;
  status: EventStatus;
  created_at: string;
  updated_at: string;
}

// Lighter fields only - matches EventListSerializer, used by GET /events/.
export interface EventListItem {
  id: number;
  name: string;
  event_type: EventType;
  event_date: string;
  event_time: string;
  event_end_time: string | null;
  venue_name: string;
  status: EventStatus;
  cover_image: string | null;
}

export interface CreateEventPayload {
  name: string;
  event_type: EventType;
  custom_event_type_label?: string;
  host_name?: string;
  description?: string;
  event_date: string;
  event_time: string;
  event_end_time?: string;
  venue_name?: string;
  address?: string;
  google_maps_link?: string;
  cover_image?: File | null;
  status?: EventStatus;
}

export type UpdateEventPayload = Partial<CreateEventPayload>;