import { apiClient } from "./client";
import type { ApiResponse } from "@/types/api.types";
import type {
  AdminReview,
  AdminReviewFilters,
  AdminReviewPatch,
  AdminReviewsData,
  PublicReviewsData,
  ReviewSubmission,
} from "@/types/review.types";

// ---- public ----------------------------------------------------------

export async function getPublicReviews(): Promise<PublicReviewsData> {
  const { data } = await apiClient.get<ApiResponse<PublicReviewsData>>("/reviews/");
  return data.data;
}

export async function submitReview(payload: ReviewSubmission): Promise<void> {
  await apiClient.post<ApiResponse<unknown>>("/reviews/", payload);
}

// ---- admin -----------------------------------------------------------

export async function getAdminReviews(filters: AdminReviewFilters): Promise<AdminReviewsData> {
  const params: Record<string, string | number> = { status: filters.status };

  if (filters.rating) params.rating = filters.rating;
  if (filters.search.trim()) params.search = filters.search.trim();
  if (filters.limit !== undefined) params.limit = filters.limit;

  const { data } = await apiClient.get<ApiResponse<AdminReviewsData>>("/admin-panel/reviews/", { params });
  return data.data;
}

export async function updateAdminReview(reviewId: number, patch: AdminReviewPatch): Promise<AdminReview> {
  const { data } = await apiClient.patch<ApiResponse<AdminReview>>(`/admin-panel/reviews/${reviewId}/`, patch);
  return data.data;
}

export async function deleteAdminReview(reviewId: number): Promise<void> {
  await apiClient.delete(`/admin-panel/reviews/${reviewId}/`);
}

export async function markAllAdminReviewsRead(): Promise<void> {
  await apiClient.post("/admin-panel/reviews/mark-all-read/");
}