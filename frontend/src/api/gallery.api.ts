import { apiClient } from "./client";
import type { ApiResponse } from "@/types/api.types";
import type { FaceScanSummary, GalleryMedia, GalleryPage } from "@/types/gallery.types";

// apiClient defaults to a JSON Content-Type, which must be explicitly
// cleared per-request for axios to send a real multipart body instead of
// silently JSON-stringifying the FormData (losing the file).
const MULTIPART_CONFIG = { headers: { "Content-Type": undefined } };

export const GALLERY_PAGE_SIZE = 60;

export async function getEventGalleryPage(eventId: number, page: number): Promise<GalleryPage> {
  const { data } = await apiClient.get<ApiResponse<GalleryPage>>(`/events/${eventId}/gallery/`, {
    params: { page, page_size: GALLERY_PAGE_SIZE },
  });
  return data.data;
}

export async function uploadGalleryMedia(
  eventId: number,
  file: File,
  options: { caption?: string; onProgress?: (percent: number) => void } = {}
): Promise<GalleryMedia> {
  const formData = new FormData();
  formData.append("file", file);
  if (options.caption) formData.append("caption", options.caption);

  const { data } = await apiClient.post<ApiResponse<GalleryMedia>>(
    `/events/${eventId}/gallery/`,
    formData,
    {
      ...MULTIPART_CONFIG,
      // Photos are several MB and videos far more: the default timeout
      // would cut a slow mobile upload off half-way.
      timeout: 5 * 60 * 1000,
      onUploadProgress: (event) => {
        if (options.onProgress && event.total) {
          options.onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
        }
      },
    }
  );
  return data.data;
}

export async function deleteGalleryMedia(eventId: number, mediaId: number): Promise<void> {
  await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/events/${eventId}/gallery/${mediaId}/`
  );
}

export async function toggleGalleryMediaFeatured(
  eventId: number,
  mediaId: number
): Promise<GalleryMedia> {
  const { data } = await apiClient.patch<ApiResponse<GalleryMedia>>(
    `/events/${eventId}/gallery/${mediaId}/`
  );
  return data.data;
}

export async function getFaceScanStatus(eventId: number): Promise<FaceScanSummary> {
  const { data } = await apiClient.get<ApiResponse<FaceScanSummary>>(
    `/events/${eventId}/gallery/face-scan/`
  );
  return data.data;
}

/** Re-queues photos that failed and starts scanning the ones waiting. */
export async function startFaceScan(eventId: number): Promise<FaceScanSummary> {
  const { data } = await apiClient.post<ApiResponse<FaceScanSummary>>(
    `/events/${eventId}/gallery/face-scan/`
  );
  return data.data;
}
