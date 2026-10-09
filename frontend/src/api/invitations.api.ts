import { apiClient } from "./client";
import type { ApiResponse, PaginatedResponse, PaginationMeta } from "@/types/api.types";
import type {
  ActiveFilledTemplate,
  ActiveTemplatePreview,
  CustomTemplate,
  CustomTemplateUploadPayload,
  EventStandardDefaults,
  FillActiveTemplatePayload,
  Invitation,
  InvitationPreviewRequest,
  InvitationPreviewResult,
  InvitationReport,
  InvitationTemplate,
  InvitationTemplateList,
  DeleteTemplateResult,
  TemplateListMeta,
} from "@/types/invitation.types";
import type {
  CreateReminderSchedulePayload,
  PendingWhatsAppReminder,
  ReminderSchedule,
} from "@/types/guest.types";

// NOTE: same URL-mounting pattern as guests.api.ts - invitations.urls is
// mounted at bare "api/" in config/urls.py.

/** Templates plus the plan's template usage (limit / used). */
export async function getInvitationTemplateList(): Promise<InvitationTemplateList> {
  const { data } = await apiClient.get<
    ApiResponse<InvitationTemplate[]> & { meta?: TemplateListMeta }
  >("/invitation-templates/");

  return {
    templates: data.data,
    meta: data.meta ?? { template_limit: null, template_count: 0 },
  };
}

export async function getInvitationTemplates(): Promise<InvitationTemplate[]> {
  return (await getInvitationTemplateList()).templates;
}

/** Remove one of the organizer's own uploaded templates. */
export async function deleteCustomTemplate(templateId: number): Promise<DeleteTemplateResult> {
  const { data } = await apiClient.delete<ApiResponse<DeleteTemplateResult>>(
    `/invitation-templates/${templateId}/`
  );

  return data.data;
}

export async function getMyCustomTemplates(): Promise<CustomTemplate[]> {
  const { data } = await apiClient.get<ApiResponse<CustomTemplate[]>>(
    "/invitation-templates/mine/"
  );

  return data.data;
}

export async function uploadCustomTemplate(
  payload: CustomTemplateUploadPayload
): Promise<CustomTemplate> {
  const formData = new FormData();

  formData.append("name", payload.name);
  formData.append("channel", payload.channel);

  if (payload.description) formData.append("description", payload.description);
  if (payload.body_text) formData.append("body_text", payload.body_text);
  if (payload.custom_fields && payload.custom_fields.length > 0) {
    // custom_fields is a nested array - multipart/form-data can't carry
    // real JSON structure, so it's sent as a JSON-encoded string field
    // and decoded server-side (see CustomTemplateUploadView.post).
    formData.append("custom_fields", JSON.stringify(payload.custom_fields));
  }
  if (payload.preview_image) formData.append("preview_image", payload.preview_image);
  if (payload.background_image) formData.append("background_image", payload.background_image);

  const { data } = await apiClient.post<ApiResponse<CustomTemplate>>(
    "/invitation-templates/upload/",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );

  return data.data;
}

export async function previewInvitation(
  eventId: number,
  payload: InvitationPreviewRequest
): Promise<InvitationPreviewResult> {
  const { data } = await apiClient.post<ApiResponse<InvitationPreviewResult>>(
    `/events/${eventId}/invitations/preview/`,
    payload
  );

  return data.data;
}

export async function getEventStandardDefaults(eventId: number): Promise<EventStandardDefaults> {
  const { data } = await apiClient.get<ApiResponse<EventStandardDefaults>>(
    `/events/${eventId}/invitations/standard-defaults/`
  );

  return data.data;
}

export async function getActiveFilledTemplate(): Promise<ActiveFilledTemplate | null> {
  const { data } = await apiClient.get<ApiResponse<ActiveFilledTemplate | null>>(
    "/invitation-templates/active/"
  );

  return data.data;
}

/** The confirmed template rendered the way guests will receive it. */
export async function getActiveTemplatePreview(): Promise<ActiveTemplatePreview | null> {
  const { data } = await apiClient.get<ApiResponse<ActiveTemplatePreview | null>>(
    "/invitation-templates/active/preview/"
  );

  return data.data;
}

export async function fillActiveTemplate(
  payload: FillActiveTemplatePayload
): Promise<ActiveFilledTemplate> {
  const { data } = await apiClient.post<ApiResponse<ActiveFilledTemplate>>(
    "/invitation-templates/active/",
    payload
  );

  return data.data;
}

export async function deselectActiveTemplate(): Promise<void> {
  await apiClient.delete<ApiResponse<null>>("/invitation-templates/active/");
}

export interface EventInvitationsPage {
  invitations: Invitation[];
  pagination: PaginationMeta;
}

export async function getEventInvitations(
  eventId: number,
  page = 1
): Promise<EventInvitationsPage> {
  const { data } = await apiClient.get<PaginatedResponse<Invitation>>(
    `/events/${eventId}/invitations/`,
    { params: { page } }
  );

  return { invitations: data.data, pagination: data.pagination };
}

export async function getReminderSchedules(eventId: number): Promise<ReminderSchedule[]> {
  const { data } = await apiClient.get<ApiResponse<ReminderSchedule[]>>(
    `/events/${eventId}/reminder-schedules/`
  );

  return data.data;
}

export async function createReminderSchedule(
  eventId: number,
  payload: CreateReminderSchedulePayload
): Promise<ReminderSchedule> {
  const { data } = await apiClient.post<ApiResponse<ReminderSchedule>>(
    `/events/${eventId}/reminder-schedules/`,
    payload
  );

  return data.data;
}

export async function deleteReminderSchedule(eventId: number, scheduleId: number): Promise<void> {
  await apiClient.delete<ApiResponse<null>>(
    `/events/${eventId}/reminder-schedules/${scheduleId}/`
  );
}

export async function getPendingWhatsAppReminders(): Promise<PendingWhatsAppReminder[]> {
  const { data } = await apiClient.get<ApiResponse<PendingWhatsAppReminder[]>>(
    "/pending-whatsapp-reminders/"
  );

  return data.data;
}

// --------------------------------------------------
// Invitation Report (Phase 24)
// --------------------------------------------------

export async function getInvitationReport(eventId: number): Promise<InvitationReport> {
  const { data } = await apiClient.get<ApiResponse<InvitationReport>>(
    `/events/${eventId}/invitations/report/`
  );

  return data.data;
}

/**
 * Downloads the Phase 24 PDF report as a Blob and returns an object URL
 * for it. The caller is responsible for revoking the returned URL
 * (URL.revokeObjectURL) once done with it.
 */
export async function downloadInvitationReportPdf(eventId: number): Promise<string> {
  const response = await apiClient.get(`/events/${eventId}/invitations/report/pdf/`, {
    responseType: "blob",
  });

  const blob = new Blob([response.data], { type: "application/pdf" });

  return URL.createObjectURL(blob);
}
