import { useEffect, useState } from "react";
import { CheckCheck, Eye, EyeOff, MessageSquareHeart, Search, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/portal/PortalUI";
import { StarRating } from "@/components/ui/star-rating";
import { toastStore } from "@/stores/toast.store";
import { getApiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import {
  useAdminReviews,
  useDeleteAdminReviewMutation,
  useMarkAllReviewsReadMutation,
  useUpdateAdminReviewMutation,
} from "@/queries/useReviewQueries";
import type { AdminReview, AdminReviewStatus } from "@/types/review.types";

const TABS: { value: AdminReviewStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "published", label: "Published" },
  { value: "hidden", label: "Hidden" },
];

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusBadge({ review }: { review: AdminReview }) {
  const published = review.is_published;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        published ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
      )}
    >
      {published ? "Published" : "Hidden"}
    </span>
  );
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function AdminReviews() {
  const [status, setStatus] = useState<AdminReviewStatus>("all");
  const [rating, setRating] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const search = useDebounced(searchText.trim());

  const [openId, setOpenId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<AdminReview | null>(null);

  const { data, isLoading, isError, refetch } = useAdminReviews({ status, rating, search });
  const updateMutation = useUpdateAdminReviewMutation();
  const deleteMutation = useDeleteAdminReviewMutation();
  const markAllMutation = useMarkAllReviewsReadMutation();

  const reviews = data?.results ?? [];
  const counts = data?.counts;
  const selected = reviews.find((review) => review.id === openId) ?? null;

  const tabCount = (value: AdminReviewStatus): number | undefined => {
    if (!counts) return undefined;
    if (value === "all") return counts.total;
    if (value === "new") return counts.unread;
    if (value === "published") return counts.published;
    return counts.total - counts.published;
  };

  // Opening a review marks it as read.
  const openReview = (review: AdminReview) => {
    setOpenId(review.id);
    if (!review.is_read) {
      updateMutation.mutate({ reviewId: review.id, patch: { is_read: true } });
    }
  };

  const togglePublished = (review: AdminReview) => {
    updateMutation.mutate(
      { reviewId: review.id, patch: { is_published: !review.is_published } },
      {
        onSuccess: () =>
          toastStore.show(review.is_published ? "Review hidden from the site." : "Review is now live on the site."),
        onError: (error) => toastStore.show(getApiErrorMessage(error, "Couldn't update the review."), "error"),
      }
    );
  };

  const confirmDelete = () => {
    if (!deleting) return;
    deleteMutation.mutate(deleting.id, {
      onSuccess: () => {
        toastStore.show("Review deleted.");
        if (openId === deleting.id) setOpenId(null);
        setDeleting(null);
      },
      onError: (error) => toastStore.show(getApiErrorMessage(error, "Couldn't delete the review."), "error"),
    });
  };

  const markAllRead = () => {
    markAllMutation.mutate(undefined, {
      onSuccess: () => toastStore.show("All reviews marked as read."),
      onError: (error) => toastStore.show(getApiErrorMessage(error, "Couldn't update the reviews."), "error"),
    });
  };

  const hasFilters = status !== "all" || rating !== null || search !== "";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Admin"
        icon={MessageSquareHeart}
        title="Reviews"
        description="Read what visitors wrote and choose which reviews appear on the website."
        actions={
          <Button
            variant="outline"
            onClick={markAllRead}
            isLoading={markAllMutation.isPending}
            disabled={!counts || counts.unread === 0}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </Button>
        }
      />

      <div className="space-y-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Filter reviews">
          {TABS.map((tab) => {
            const active = status === tab.value;
            const count = tabCount(tab.value);
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatus(tab.value)}
                className={cn(
                  "flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all active:scale-95",
                  active
                    ? "border-transparent bg-[var(--brand-navy)] text-white shadow-md"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {tab.label}
                {count !== undefined && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs",
                      active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search by name or message"
              className="pl-10"
              aria-label="Search reviews"
            />
          </div>
          <Select
            value={rating ?? ""}
            onChange={(event) => setRating(event.target.value ? Number(event.target.value) : null)}
            className="sm:w-44"
            aria-label="Filter by rating"
          >
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {value} star{value === 1 ? "" : "s"}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full rounded-3xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-8 text-center">
          <p className="text-sm text-rose-700">Couldn't load the reviews.</p>
          <Button variant="outline" className="mt-4" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : reviews.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
            <MessageSquareHeart className="h-7 w-7" />
          </span>
          <p className="mt-4 font-medium text-[var(--brand-navy)]">
            {hasFilters ? "No reviews match these filters" : "No reviews yet"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {hasFilters ? "Try a different filter." : "New reviews from the website will show up here."}
          </p>
          {hasFilters && (
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => {
                setStatus("all");
                setRating(null);
                setSearchText("");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((review) => (
            <li key={review.id}>
              <button
                type="button"
                onClick={() => openReview(review)}
                className={cn(
                  "group relative w-full rounded-3xl border bg-white p-4 text-left transition-all [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-lg sm:p-5",
                  review.is_read ? "border-slate-100" : "border-[var(--brand-pink)]/30 bg-[var(--brand-pink)]/[0.03]"
                )}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {!review.is_read && (
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--brand-pink)]" aria-label="Unread" />
                  )}
                  <StarRating value={review.rating} size="sm" />
                  <StatusBadge review={review} />
                  <span className="ml-auto text-xs text-slate-400">{formatDate(review.created_at)}</span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-600">{review.message}</p>
                <p className="mt-3 text-sm font-semibold text-[var(--brand-navy)]">
                  {review.name}
                  {review.title && <span className="font-normal text-slate-400"> · {review.title}</span>}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={selected !== null}
        onClose={() => setOpenId(null)}
        size="md"
        icon={Star}
        title={selected?.name ?? "Review"}
        description={selected?.title || undefined}
        busy={updateMutation.isPending}
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <StarRating value={selected.rating} size="md" />
              <StatusBadge review={selected} />
              <span className="text-xs text-slate-400">{formatDate(selected.created_at)}</span>
            </div>
            <p className="max-h-[40dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
              {selected.message}
            </p>
            <ModalActions>
              <Button variant="outline" onClick={() => setDeleting(selected)} className="text-rose-600 hover:bg-rose-50">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
              <Button onClick={() => togglePublished(selected)} isLoading={updateMutation.isPending}>
                {selected.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {selected.is_published ? "Hide from site" : "Publish on site"}
              </Button>
            </ModalActions>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        destructive
        title="Delete this review?"
        description={
          deleting ? `The review from ${deleting.name} will be removed for good. This can't be undone.` : ""
        }
        confirmLabel="Delete review"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}