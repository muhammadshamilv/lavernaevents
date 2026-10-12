// Field names here must match gallery/serializers.py and gallery/views.py exactly.

import type { EventStatus, EventType } from "@/types/event.types";

export type GalleryMediaType = "IMAGE" | "VIDEO";

export interface GalleryUploadedBy {
  id: number;
  full_name: string;
  role: string;
}

export interface GalleryMedia {
  id: number;
  media_type: GalleryMediaType;
  file: string;
  thumbnail: string | null;
  caption: string;
  is_featured: boolean;
  uploaded_by: GalleryUploadedBy | null;
  created_at: string;
}

/** Storage used by the organizer across all events (organizers only). */
export interface GalleryStorage {
  used_bytes: number;
  /** null = unlimited */
  limit_bytes: number | null;
}

/** One page of GET /events/:id/gallery/ (featured first, then newest). */
export interface GalleryPage {
  results: GalleryMedia[];
  count: number;
  page: number;
  page_size: number;
  has_more: boolean;
  /** null when a photographer is looking. */
  storage: GalleryStorage | null;
}

/** GET/POST /events/:id/gallery/face-scan/ - how far the "find my photos"
 * face scanning of this event's photos has got (photos only, not videos). */
export interface FaceScanSummary {
  total: number;
  pending: number;
  processed: number;
  failed: number;
  faces_found: number;
  /** false when the server has no face recognition library installed. */
  available: boolean;
  /** false when the organizer's plan does not include QR codes / face search. */
  plan_enabled: boolean;
}

// ---------------------------------------------------------------------------
// The organizer's Gallery hub - GET /gallery/overview/ (gallery/overview.py)
// ---------------------------------------------------------------------------

/** One small preview picture on an event card. `thumbnail` is null for a
 * video that has no poster frame. */
export interface GalleryOverviewPreview {
  id: number;
  media_type: GalleryMediaType;
  thumbnail: string | null;
}

export interface GalleryOverviewEvent {
  id: number;
  name: string;
  event_type: EventType;
  custom_event_type_label: string;
  event_date: string;
  venue_name: string;
  status: EventStatus;
  cover_image: string | null;
  photo_count: number;
  video_count: number;
  /** How many of this event's items were uploaded by photographers. */
  photographer_count: number;
  last_upload_at: string | null;
  previews: GalleryOverviewPreview[];
}

/** Across ALL of the organizer's events, not only the page shown. */
export interface GalleryTotals {
  photos: number;
  videos: number;
  from_photographers: number;
  events_with_media: number;
}

export interface GalleryOverviewPage {
  results: GalleryOverviewEvent[];
  count: number;
  page: number;
  page_size: number;
  has_more: boolean;
  totals: GalleryTotals;
}

export interface GalleryOverviewParams {
  page?: number;
  search?: string;
  /** Only events that have items uploaded by a photographer. */
  photographersOnly?: boolean;
}