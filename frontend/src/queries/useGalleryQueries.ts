import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteGalleryMedia,
  getEventGalleryPage,
  getFaceScanStatus,
  startFaceScan,
  toggleGalleryMediaFeatured,
} from "@/api/gallery.api";

export const galleryKeys = {
  all: ["gallery"] as const,
  event: (eventId: number) => ["gallery", "event", eventId] as const,
  // Sits under the event key, so every upload / delete refreshes it too.
  faceScan: (eventId: number) => ["gallery", "event", eventId, "face-scan"] as const,
};

/**
 * The event's gallery, loaded a page at a time. `data` is still the plain
 * flat list of media (so existing consumers keep working); use
 * `fetchNextPage` / `hasNextPage` for "Load more", and `storage` for the
 * organizer's usage figure.
 */
export function useEventGallery(eventId: number | undefined) {
  const query = useInfiniteQuery({
    queryKey: galleryKeys.event(eventId ?? 0),
    queryFn: ({ pageParam }) => getEventGalleryPage(eventId as number, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.page + 1 : undefined),
    enabled: !!eventId,
    // A 404 means "no access / no such event" - retrying cannot help.
    retry: false,
  });

  return {
    ...query,
    data: query.data?.pages.flatMap((page) => page.results),
    totalCount: query.data?.pages[0]?.count ?? 0,
    storage: query.data?.pages[0]?.storage ?? null,
  };
}

function useInvalidateGallery(eventId: number | undefined) {
  const queryClient = useQueryClient();

  return () => {
    if (eventId) {
      queryClient.invalidateQueries({ queryKey: galleryKeys.event(eventId) });
    }
  };
}

export function useDeleteGalleryMediaMutation(eventId: number | undefined) {
  const invalidate = useInvalidateGallery(eventId);

  return useMutation({
    mutationFn: (mediaId: number) => deleteGalleryMedia(eventId as number, mediaId),
    onSuccess: invalidate,
  });
}

export function useToggleGalleryMediaFeaturedMutation(eventId: number | undefined) {
  const invalidate = useInvalidateGallery(eventId);

  return useMutation({
    mutationFn: (mediaId: number) => toggleGalleryMediaFeatured(eventId as number, mediaId),
    onSuccess: invalidate,
  });
}

/** Face-scan progress. Polls every 5 s while photos are still waiting. */
export function useFaceScanStatus(eventId: number | undefined) {
  return useQuery({
    queryKey: galleryKeys.faceScan(eventId ?? 0),
    queryFn: () => getFaceScanStatus(eventId as number),
    enabled: !!eventId,
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data;
      return status && status.pending > 0 && status.available && status.plan_enabled ? 5000 : false;
    },
  });
}

export function useStartFaceScanMutation(eventId: number | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => startFaceScan(eventId as number),
    onSuccess: (summary) => {
      if (eventId) queryClient.setQueryData(galleryKeys.faceScan(eventId), summary);
    },
  });
}
