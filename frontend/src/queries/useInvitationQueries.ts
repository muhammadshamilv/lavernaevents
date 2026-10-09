import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createReminderSchedule,
  deleteReminderSchedule,
  deleteCustomTemplate,
  deselectActiveTemplate,
  fillActiveTemplate,
  getActiveFilledTemplate,
  getActiveTemplatePreview,
  getEventInvitations,
  getEventStandardDefaults,
  getInvitationReport,
  getInvitationTemplateList,
  getMyCustomTemplates,
  getPendingWhatsAppReminders,
  getReminderSchedules,
  previewInvitation,
  uploadCustomTemplate,
} from "@/api/invitations.api";
import type {
  CustomTemplateUploadPayload,
  FillActiveTemplatePayload,
  InvitationPreviewRequest,
} from "@/types/invitation.types";
import type { CreateReminderSchedulePayload } from "@/types/guest.types";

export const invitationKeys = {
  templates: ["invitations", "templates"] as const,
  templateList: ["invitations", "templates", "list"] as const,
  myTemplates: ["invitations", "templates", "mine"] as const,
  activeTemplate: ["invitations", "templates", "active"] as const,
  activePreview: ["invitations", "templates", "active", "preview"] as const,
  standardDefaults: (eventId: number) => ["invitations", "standard-defaults", eventId] as const,
  eventList: (eventId: number, page: number) =>
    ["invitations", "event", eventId, "list", page] as const,
};

// One request feeds both hooks below (same query key): the template list
// and the plan's template usage that comes back with it.
export function useInvitationTemplates() {
  return useQuery({
    queryKey: invitationKeys.templateList,
    queryFn: getInvitationTemplateList,
    staleTime: 5 * 60 * 1000,
    select: (result) => result.templates,
  });
}

export function useTemplateUsage() {
  return useQuery({
    queryKey: invitationKeys.templateList,
    queryFn: getInvitationTemplateList,
    staleTime: 5 * 60 * 1000,
    select: (result) => result.meta,
  });
}

export function useDeleteCustomTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (templateId: number) => deleteCustomTemplate(templateId),
    onSuccess: () => {
      // The template list, usage count and (if it was the active one) the
      // active template all change.
      queryClient.invalidateQueries({ queryKey: invitationKeys.templates });
      queryClient.removeQueries({ queryKey: invitationKeys.activePreview });
    },
  });
}

export function useMyCustomTemplates() {
  return useQuery({
    queryKey: invitationKeys.myTemplates,
    queryFn: getMyCustomTemplates,
  });
}

export function useUploadCustomTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CustomTemplateUploadPayload) => uploadCustomTemplate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.templates });
      queryClient.invalidateQueries({ queryKey: invitationKeys.myTemplates });
    },
  });
}

export function useEventInvitations(eventId: number, page: number) {
  return useQuery({
    queryKey: invitationKeys.eventList(eventId, page),
    queryFn: () => getEventInvitations(eventId, page),
    placeholderData: keepPreviousData,
  });
}

export function usePreviewInvitationMutation(eventId: number) {
  return useMutation({
    mutationFn: (payload: InvitationPreviewRequest) => previewInvitation(eventId, payload),
  });
}

// --------------------------------------------------
// Active filled template
// --------------------------------------------------

export function useEventStandardDefaults(eventId: number | null) {
  return useQuery({
    queryKey: invitationKeys.standardDefaults(eventId ?? 0),
    queryFn: () => getEventStandardDefaults(eventId as number),
    enabled: eventId !== null,
    staleTime: 30 * 1000,
  });
}

// Read by the Templates page (so the selected/filled state survives a
// reload) and by the Guests page (to gate sending on having a template).
export function useActiveFilledTemplate() {
  return useQuery({
    queryKey: invitationKeys.activeTemplate,
    queryFn: getActiveFilledTemplate,
  });
}

/**
 * The confirmed template rendered the way guests will receive it (the
 * organizer's text drawn on the card). `version` is the active template's
 * updated_at: it is part of the query key, so editing the filled details
 * fetches a fresh preview and an unchanged one is served from cache.
 */
export function useActiveTemplatePreview(version: string | undefined) {
  return useQuery({
    queryKey: [...invitationKeys.activePreview, version ?? ""] as const,
    queryFn: getActiveTemplatePreview,
    enabled: !!version,
    staleTime: 5 * 60 * 1000,
  });
}

export function useFillActiveTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: FillActiveTemplatePayload) => fillActiveTemplate(payload),
    onSuccess: (active) => {
      queryClient.setQueryData(invitationKeys.activeTemplate, active);
      // Filling a never-before-used platform template consumes a slot,
      // so the gallery's in_library flags may have changed.
      queryClient.invalidateQueries({ queryKey: invitationKeys.templates });
    },
  });
}

export function useDeselectActiveTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deselectActiveTemplate(),
    onSuccess: () => {
      queryClient.setQueryData(invitationKeys.activeTemplate, null);
      queryClient.removeQueries({ queryKey: invitationKeys.activePreview });
    },
  });
}

export function useReminderSchedules(eventId: number) {
  return useQuery({
    queryKey: ["invitations", "reminder-schedules", eventId] as const,
    queryFn: () => getReminderSchedules(eventId),
  });
}

export function useCreateReminderScheduleMutation(eventId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateReminderSchedulePayload) =>
      createReminderSchedule(eventId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations", "reminder-schedules", eventId] });
    },
  });
}

export function useDeleteReminderScheduleMutation(eventId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (scheduleId: number) => deleteReminderSchedule(eventId, scheduleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations", "reminder-schedules", eventId] });
    },
  });
}

export function usePendingWhatsAppReminders() {
  return useQuery({
    queryKey: ["invitations", "pending-whatsapp-reminders"] as const,
    queryFn: getPendingWhatsAppReminders,
    // Time-sensitive list (reminders become "due" on their own).
    staleTime: 60 * 1000,
  });
}

// --------------------------------------------------
// Invitation Report (Phase 24)
// --------------------------------------------------

export function useInvitationReport(eventId: number) {
  return useQuery({
    queryKey: ["invitations", "report", eventId] as const,
    queryFn: () => getInvitationReport(eventId),
  });
}