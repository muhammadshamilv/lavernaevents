// Field names here must match qr_codes/serializers.py exactly.

export interface EventQRCode {
  token: string;
  scan_url: string;
  is_active: boolean;
  png_download_url: string;
  pdf_download_url: string;
}

/** Public, guest-facing - what /scan/:token loads before the selfie step.
 * Deliberately small: no numeric id, no address (see
 * qr_codes/serializers.py's ScannedEventSerializer). */
export interface ScannedEvent {
  name: string;
  event_date: string;
  cover_image: string | null;
}

/** A matched photo as an anonymous guest sees it. Not the organizer's
 * GalleryMedia: it carries no `uploaded_by` (that is never shown to a
 * guest) but has a ready-made attachment download link. */
export interface GuestMatchedMedia {
  id: number;
  media_type: "IMAGE" | "VIDEO";
  file: string | null;
  thumbnail: string | null;
  caption: string;
  created_at: string;
  /** Path (relative to the site origin) that downloads this photo as a file. */
  download_url: string;
}

export interface SelfieMatchResult {
  match_count: number;
  matched_media: GuestMatchedMedia[];
}