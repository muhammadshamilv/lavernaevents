import { apiClient } from "./client";
import type { ApiResponse, PaginatedResponse, PaginationMeta } from "@/types/api.types";
import type {
  CreateEventPayload,
  Event,
  EventListItem,
  EventListParams,
  UpdateEventPayload,
} from "@/types/event.types";

export interface EventsPage {
  events: EventListItem[];
  pagination: PaginationMeta;
}

type EventPayload = CreateEventPayload | UpdateEventPayload;

function hasFile(payload: EventPayload): boolean {
  return payload.cover_image instanceof File;
}

function buildEventFormData(payload: EventPayload): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;

    if (key === "cover_image") {
      if (value instanceof File) {
        formData.append("cover_image", value);
      }
      continue;
    }

    formData.append(key, String(value));
  }

  return formData;
}

// apiClient sets a default "Content-Type: application/json" header on the
// whole instance. axios only skips JSON-stringifying a FormData body when the
// EFFECTIVE Content-Type is not already application/json, so it must be
// cleared per request for multipart uploads.
const MULTIPART_CONFIG = { headers: { "Content-Type": undefined } };

// Accepts a bare page number (older callers) or a full params object.
export async function getEvents(arg: number | EventListParams = 1): Promise<EventsPage> {
  const params: EventListParams = typeof arg === "number" ? { page: arg } : arg;

  const query: Record<string, string | number> = { page: params.page ?? 1 };
  if (params.search?.trim()) query.search = params.search.trim();
  if (params.status) query.status = params.status;
  if (params.when) query.when = params.when;

  const { data } = await apiClient.get<PaginatedResponse<EventListItem>>("/events/", {
    params: query,
  });

  return { events: data.data, pagination: data.pagination };
}

export async function getEventById(id: number): Promise<Event> {
  const { data } = await apiClient.get<ApiResponse<Event>>(`/events/${id}/`);
  return data.data;
}

export async function createEvent(payload: CreateEventPayload): Promise<Event> {
  const body = hasFile(payload) ? buildEventFormData(payload) : payload;

  const { data } = await apiClient.post<ApiResponse<Event>>(
    "/events/",
    body,
    hasFile(payload) ? MULTIPART_CONFIG : undefined
  );

  return data.data;
}

export async function updateEvent(id: number, payload: UpdateEventPayload): Promise<Event> {
  const body = hasFile(payload) ? buildEventFormData(payload) : payload;

  const { data } = await apiClient.patch<ApiResponse<Event>>(
    `/events/${id}/`,
    body,
    hasFile(payload) ? MULTIPART_CONFIG : undefined
  );

  return data.data;
}

export async function deleteEvent(id: number): Promise<void> {
  await apiClient.delete<ApiResponse<Record<string, never>>>(`/events/${id}/`);
}