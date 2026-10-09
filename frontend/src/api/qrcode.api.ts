import { API_BASE_URL, apiClient } from "./client";
import type { ApiResponse } from "@/types/api.types";
import type { EventQRCode, ScannedEvent, SelfieMatchResult } from "@/types/qrcode.types";

// Same pattern gallery.api.ts uses for FormData uploads through
// apiClient, which otherwise defaults Content-Type to application/json
// globally - setting it to undefined lets axios/the browser set the
// correct multipart boundary itself.
const MULTIPART_CONFIG = { headers: { "Content-Type": undefined } };

// --- Organizer-facing (authenticated) ---------------------------------

export async function getEventQRCode(eventId: number): Promise<EventQRCode> {
  const response = await apiClient.get<ApiResponse<EventQRCode>>(
    `/events/${eventId}/qr-code/`
  );
  return response.data.data;
}

/** Switch the event's QR code off (guests then see "not active") or on. */
export async function setEventQRCodeActive(
  eventId: number,
  isActive: boolean
): Promise<EventQRCode> {
  const response = await apiClient.patch<ApiResponse<EventQRCode>>(
    `/events/${eventId}/qr-code/`,
    { is_active: isActive }
  );
  return response.data.data;
}

/** PNG/PDF downloads return file bytes, not JSON, so they are fetched as a
 * blob through apiClient (which carries the cookie auth and the refresh-
 * token interceptor) and handed to the browser as a download. */
export async function downloadEventQRCodeFile(
  eventId: number,
  format: "png" | "pdf"
): Promise<Blob> {
  const response = await apiClient.get(`/events/${eventId}/qr-code/${format}/`, {
    responseType: "blob",
  });
  return response.data;
}

// --- Guest-facing (public, no auth) ------------------------------------

export async function getScannedEvent(token: string): Promise<ScannedEvent> {
  const response = await apiClient.get<ApiResponse<ScannedEvent>>(`/qr/${token}/`);
  return response.data.data;
}

export async function matchSelfie(token: string, selfie: File): Promise<SelfieMatchResult> {
  const formData = new FormData();
  formData.append("selfie", selfie);

  const response = await apiClient.post<ApiResponse<SelfieMatchResult>>(
    `/qr/${token}/selfie/`,
    formData,
    MULTIPART_CONFIG
  );
  return response.data.data;
}

/** The backend returns `download_url` as "/api/qr/<token>/media/<id>/download/".
 * In production the site proxies /api to the backend, in development the
 * API lives on another port - so build the link from the same base the
 * rest of the app uses. A plain <a href> to it downloads the file. */
export function getGuestMediaDownloadHref(downloadUrl: string): string {
  return `${API_BASE_URL}${downloadUrl.replace(/^\/api/, "")}`;
}