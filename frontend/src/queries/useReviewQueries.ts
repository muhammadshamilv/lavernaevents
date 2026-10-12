import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAdminReview,
  getAdminReviews,
  getPublicReviews,
  markAllAdminReviewsRead,
  submitReview,
  updateAdminReview,
} from "@/api/review.api";
import type { AdminReviewFilters, AdminReviewPatch } from "@/types/review.types";

export const reviewKeys = {
  public: ["reviews", "public"] as const,
  admin: ["reviews", "admin"] as const,
  adminList: (filters: AdminReviewFilters) => ["reviews", "admin", "list", filters] as const,
  adminCounts: ["reviews", "admin", "counts"] as const,
};

// ---- public ----------------------------------------------------------

export function usePublicReviews() {
  return useQuery({
    queryKey: reviewKeys.public,
    queryFn: getPublicReviews,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useSubmitReviewMutation() {
  return useMutation({ mutationFn: submitReview });
}

// ---- admin -----------------------------------------------------------

export function useAdminReviews(filters: AdminReviewFilters) {
  return useQuery({
    queryKey: reviewKeys.adminList(filters),
    queryFn: () => getAdminReviews(filters),
    placeholderData: keepPreviousData,
    refetchOnMount: "always",
  });
}

// Just the numbers, for the "new reviews" badge in the admin menu.
export function useAdminReviewCounts() {
  return useQuery({
    queryKey: reviewKeys.adminCounts,
    queryFn: () => getAdminReviews({ status: "all", rating: null, search: "", limit: 0 }).then((data) => data.counts),
    staleTime: 30 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
}

export function useUpdateAdminReviewMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reviewId, patch }: { reviewId: number; patch: AdminReviewPatch }) =>
      updateAdminReview(reviewId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reviewKeys.admin });
      queryClient.invalidateQueries({ queryKey: reviewKeys.public });
    },
  });
}

export function useDeleteAdminReviewMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteAdminReview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reviewKeys.admin });
      queryClient.invalidateQueries({ queryKey: reviewKeys.public });
    },
  });
}

export function useMarkAllReviewsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllAdminReviewsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reviewKeys.admin }),
  });
}