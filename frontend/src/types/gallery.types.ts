// Field names here must match gallery/serializers.py and gallery/views.py exactly.

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
