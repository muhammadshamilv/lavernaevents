// Matches backend/reviews/serializers.py.

export interface PublicReview {
    id: number;
    name: string;
    title: string;
    rating: number;
    message: string;
    created_at: string;
  }
  
  export interface PublicReviewsData {
    results: PublicReview[];
    count: number;
    /** null until the first review is published. */
    average: number | null;
  }
  
  export interface ReviewSubmission {
    name: string;
    title?: string;
    rating: number;
    message: string;
    /** Spam trap: a hidden field that real visitors leave empty. */
    website?: string;
  }
  
  export interface AdminReview extends PublicReview {
    is_read: boolean;
    is_published: boolean;
  }
  
  export interface AdminReviewCounts {
    total: number;
    unread: number;
    published: number;
  }
  
  export interface AdminReviewsData {
    results: AdminReview[];
    counts: AdminReviewCounts;
  }
  
  export type AdminReviewStatus = "all" | "new" | "published" | "hidden";
  
  export interface AdminReviewFilters {
    status: AdminReviewStatus;
    rating: number | null;
    search: string;
    /** 0 = counts only. */
    limit?: number;
  }
  
  export interface AdminReviewPatch {
    is_read?: boolean;
    is_published?: boolean;
  }