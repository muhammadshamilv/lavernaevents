import { useState } from "react";
import { MessageSquareHeart, Quote } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/ui/star-rating";
import { usePublicReviews } from "@/queries/useReviewQueries";
import type { PublicReview } from "@/types/review.types";
import Reveal, { Stagger, StaggerItem } from "./Reveal";
import ReviewFormModal from "./ReviewFormModal";
import SectionHeading from "./SectionHeading";
import SpotlightCard from "./SpotlightCard";

const FIRST_SCREEN = 6;

// Colours for the initials badge, picked from the name so a person always
// gets the same one.
const BADGES = [
  "linear-gradient(135deg, #d41472, #ae0e5d)",
  "linear-gradient(135deg, #3a2266, #241542)",
  "linear-gradient(135deg, #4caf37, #3a8a29)",
  "linear-gradient(135deg, #f0b429, #f97316)",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
  return letters.toUpperCase();
}

function badgeFor(name: string): string {
  let sum = 0;
  for (const char of name) sum += char.charCodeAt(0);
  return BADGES[sum % BADGES.length];
}

function ReviewCard({ review }: { review: PublicReview }) {
  const date = new Date(review.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" });

  return (
    <SpotlightCard className="flex h-full flex-col p-6">
      <div className="flex items-center justify-between">
        <StarRating value={review.rating} size="sm" />
        <Quote className="h-6 w-6 text-[var(--brand-pink)]/20" aria-hidden="true" />
      </div>
      <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-slate-600">{review.message}</blockquote>
      <figcaption className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ background: badgeFor(review.name) }}
        >
          {initials(review.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[var(--brand-navy)]">{review.name}</span>
          <span className="block truncate text-xs text-slate-400">
            {review.title ? `${review.title} · ${date}` : date}
          </span>
        </span>
      </figcaption>
    </SpotlightCard>
  );
}

// Published reviews, plus the "write a review" box. Until there are real
// reviews it shows an invitation instead of anything made up.
export default function ReviewsSection() {
  const { data, isLoading } = usePublicReviews();
  const [formOpen, setFormOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const reviews = data?.results ?? [];
  const visible = showAll ? reviews : reviews.slice(0, FIRST_SCREEN);
  const hasReviews = reviews.length > 0;

  return (
    <section className="px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8" aria-labelledby="reviews-heading">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <SectionHeading
            eyebrow="Reviews"
            title={hasReviews ? "Loved by hosts and guests" : "Be the first to share your experience"}
            description={
              hasReviews
                ? undefined
                : "Used LavernaEvents for your celebration? Your words help the next host decide."
            }
            action={
              <Button variant="outline" onClick={() => setFormOpen(true)} className="shrink-0">
                <MessageSquareHeart className="h-4 w-4" />
                Write a review
              </Button>
            }
          />
        </Reveal>
        <span id="reviews-heading" className="sr-only">
          Customer reviews
        </span>

        {hasReviews && data?.average != null && (
          <Reveal className="mt-6">
            <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-slate-100 bg-white px-5 py-2.5 soft-shadow">
              <span className="text-2xl font-semibold tracking-tight text-[var(--brand-navy)]">
                {data.average.toFixed(1)}
              </span>
              <StarRating value={data.average} size="md" />
              <span className="text-sm text-slate-500">
                from {data.count} review{data.count === 1 ? "" : "s"}
              </span>
            </div>
          </Reveal>
        )}

        {isLoading ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-52 w-full rounded-3xl" />
            ))}
          </div>
        ) : hasReviews ? (
          <>
            <Stagger className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3" gap={0.07}>
              {visible.map((review) => (
                <StaggerItem key={review.id}>
                  <figure className="h-full">
                    <ReviewCard review={review} />
                  </figure>
                </StaggerItem>
              ))}
            </Stagger>

            {reviews.length > FIRST_SCREEN && (
              <div className="mt-8 flex justify-center">
                <Button variant="ghost" onClick={() => setShowAll((value) => !value)}>
                  {showAll ? "Show fewer reviews" : `Show all ${reviews.length} reviews`}
                </Button>
              </div>
            )}
          </>
        ) : (
          <Reveal className="mt-8">
            <div
              className="relative overflow-hidden rounded-3xl border border-dashed border-[var(--brand-pink)]/30 px-6 py-12 text-center sm:py-16"
              style={{ background: "var(--gradient-brand-soft)" }}
            >
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[var(--brand-pink)] soft-shadow">
                <MessageSquareHeart className="h-7 w-7" />
              </span>
              <p className="mx-auto mt-5 max-w-md text-slate-600">
                No reviews yet. If you've used LavernaEvents, we'd love to hear how it went.
              </p>
              <Button className="mt-6" onClick={() => setFormOpen(true)}>
                Write the first review
              </Button>
            </div>
          </Reveal>
        )}
      </div>

      <ReviewFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </section>
  );
}