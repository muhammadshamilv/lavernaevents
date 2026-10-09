import { apiClient } from "./client";
import type { ApiResponse, PaginatedResponse, PaginationMeta } from "@/types/api.types";
import type {
  ContactImportPayload,
  ContactImportResult,
  CreateGuestCategoryPayload,
  CreateGuestPayload,
  CSVImportResult,
  Guest,
  GuestCategory,
  InvitationStatus,
  ResponseStatus,
  UpdateGuestCategoryPayload,
  UpdateGuestPayload,
} from "@/types/guest.types";

export interface GuestsQueryParams {
  page?: number;
  search?: string;
  response_status?: ResponseStatus;
  invitation_status?: InvitationStatus;
  // A category id, or "uncategorized" for guests without one.
  category?: number | "uncategorized";
}

export interface GuestsPage {
  guests: Guest[];
  pagination: PaginationMeta;
}

export async function getGuests(
  eventId: number,
  params: GuestsQueryParams = {}
): Promise<GuestsPage> {
  const { data } = await apiClient.get<PaginatedResponse<Guest>>(
    `/events/${eventId}/guests/`,
    { params }
  );

  return { guests: data.data, pagination: data.pagination };
}

export async function getGuestById(eventId: number, guestId: number): Promise<Guest> {
  const { data } = await apiClient.get<ApiResponse<Guest>>(
    `/events/${eventId}/guests/${guestId}/`
  );

  return data.data;
}

export async function createGuest(
  eventId: number,
  payload: CreateGuestPayload
): Promise<Guest> {
  const { data } = await apiClient.post<ApiResponse<Guest>>(
    `/events/${eventId}/guests/`,
    payload
  );

  return data.data;
}

export async function updateGuest(
  eventId: number,
  guestId: number,
  payload: UpdateGuestPayload
): Promise<Guest> {
  const { data } = await apiClient.patch<ApiResponse<Guest>>(
    `/events/${eventId}/guests/${guestId}/`,
    payload
  );

  return data.data;
}

export async function deleteGuest(eventId: number, guestId: number): Promise<void> {
  await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/events/${eventId}/guests/${guestId}/`
  );
}

export async function importGuestsCsv(
  eventId: number,
  file: File,
  categoryId?: number
): Promise<CSVImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  if (categoryId) {
    formData.append("category_id", String(categoryId));
  }

  const { data } = await apiClient.post<ApiResponse<CSVImportResult>>(
    `/events/${eventId}/guests/import-csv/`,
    formData,
    { headers: { "Content-Type": undefined } }
  );

  return data.data;
}

export async function exportGuestsCsv(eventId: number): Promise<void> {
  const response = await apiClient.get(`/events/${eventId}/guests/export-csv/`, {
    responseType: "blob",
  });

  const blob = new Blob([response.data], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `guests-event-${eventId}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

export async function importGuestsFromContacts(
  eventId: number,
  payload: ContactImportPayload
): Promise<ContactImportResult> {
  const { data } = await apiClient.post<ApiResponse<ContactImportResult>>(
    `/events/${eventId}/guests/import-contacts/`,
    payload
  );

  return data.data;
}

// ---------------------------------------------------------------------------
// Guest Categories (Phase 15)
// ---------------------------------------------------------------------------

export async function getGuestCategories(eventId: number): Promise<GuestCategory[]> {
  const { data } = await apiClient.get<ApiResponse<GuestCategory[]>>(
    `/events/${eventId}/guest-categories/`
  );

  return data.data;
}

export async function createGuestCategory(
  eventId: number,
  payload: CreateGuestCategoryPayload
): Promise<GuestCategory> {
  const { data } = await apiClient.post<ApiResponse<GuestCategory>>(
    `/events/${eventId}/guest-categories/`,
    payload
  );

  return data.data;
}

export async function updateGuestCategory(
  eventId: number,
  categoryId: number,
  payload: UpdateGuestCategoryPayload
): Promise<GuestCategory> {
  const { data } = await apiClient.patch<ApiResponse<GuestCategory>>(
    `/events/${eventId}/guest-categories/${categoryId}/`,
    payload
  );

  return data.data;
}

export async function deleteGuestCategory(eventId: number, categoryId: number): Promise<void> {
  await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/events/${eventId}/guest-categories/${categoryId}/`
  );
}
