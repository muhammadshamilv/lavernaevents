export type GuestResponseStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "MAYBE";

export interface InvitationPublicDetails {
  guest_name: string;
  event_name: string;
  event_type: string;
  event_type_label: string;
  host_name: string;
  description: string;
  event_date: string;
  event_time: string;
  event_end_time: string | null;
  /** Ready-to-show time, e.g. "7:00 PM - 10:00 PM". */
  time_text: string;
  venue_name: string;
  address: string;
  google_maps_link: string;
  cover_image: string | null;
  invitation_image: string | null;
  /** The font colour the organizer picked on the card ("" if automatic). */
  accent_color: string;
  response_status: GuestResponseStatus;
  already_responded: boolean;
  /** .ics file for Apple / Outlook calendars. */
  calendar_url: string;
  /** Opens Google Calendar with the event already filled in. */
  google_calendar_url: string;
}

export interface SubmitResponsePayload {
  response: "ACCEPTED" | "REJECTED" | "MAYBE";
}

export interface SubmitResponseResult {
  response_status: GuestResponseStatus;
}