import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEvent,
  deleteEvent,
  getEventById,
  getEvents,
  updateEvent,
} from "@/api/events.api";
import type {
  CreateEventPayload,
  EventListParams,
  UpdateEventPayload,
} from "@/types/event.types";

export const eventKeys = {
  all: ["events"] as const,
  lists: () => ["events", "list"] as const,
  list: (params: number | EventListParams) => ["events", "list", params] as const,
  detail: (id: number) => ["events", "detail", id] as const,
};

// Accepts a page number (older callers) or a params object (page + filters).
export function useEvents(arg: number | EventListParams) {
  return useQuery({
    queryKey: eventKeys.list(arg),
    queryFn: () => getEvents(arg),
    // Keeps showing the current results while the next page / filter loads,
    // instead of flashing a skeleton on every change.
    placeholderData: keepPreviousData,
  });
}

export function useEvent(id: number | undefined) {
  return useQuery({
    queryKey: eventKeys.detail(id ?? 0),
    queryFn: () => getEventById(id as number),
    enabled: !!id,
  });
}

export function useCreateEventMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateEventPayload) => createEvent(payload),
    onSuccess: () => {
      // Prefix match: invalidates every cached list (any page / filter).
      queryClient.invalidateQueries({ queryKey: eventKeys.lists() });
    },
  });
}

export function useUpdateEventMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateEventPayload }) =>
      updateEvent(id, payload),
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: eventKeys.lists() });
      // The response already IS the fresh record - write it straight in.
      queryClient.setQueryData(eventKeys.detail(event.id), event);
    },
  });
}

export function useDeleteEventMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteEvent(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: eventKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: eventKeys.lists() });
    },
  });
}