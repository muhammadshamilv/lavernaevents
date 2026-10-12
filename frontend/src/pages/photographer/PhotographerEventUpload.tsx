import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Camera, ImagePlus, ImageOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BackLink, PageHeader, StateCard } from "@/components/portal/PortalUI";
import { useMyPhotographerEvents } from "@/queries/usePhotographerQueries";
import { useEventGallery } from "@/queries/useGalleryQueries";
import { formatEventDate, formatEventTime } from "@/lib/eventDisplay";
import MediaGrid from "@/components/gallery/MediaGrid";
import MediaLightbox from "@/components/gallery/MediaLightbox";
import UploadQueuePanel from "@/components/gallery/UploadQueuePanel";
import { GALLERY_ACCEPT, useUploadQueue } from "@/components/gallery/useUploadQueue";

export default function PhotographerEventUpload() {
  const { id } = useParams<{ id: string }>();
  const eventId = id ? Number(id) : undefined;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // A photographer cannot read GET /events/:id/, so the event details come
  // from their "my events" list (only currently valid grants are listed).
  const { data: grants, isLoading: grantsLoading } = useMyPhotographerEvents();
  const grant = grants?.find((g) => g.event.id === eventId);

  const gallery = useEventGallery(grant ? eventId : undefined);
  const media = gallery.data;
  const queue = useUploadQueue(grant ? eventId : undefined);

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (grantsLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-8 w-64" />
        <Skeleton className="mt-6 h-40 w-full rounded-3xl" />
      </div>
    );
  }

  if (!grant || !eventId) {
    return (
      <StateCard
        icon={ImageOff}
        message="You don't have access to this event. It may not exist, or your access may have been removed or expired."
        to="/photographer"
        actionLabel="Back to my events"
      />
    );
  }

  return (
    <div className="mobile-safe-bottom px-4 py-6 sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <BackLink to="/photographer">Back to my events</BackLink>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-4">
          <PageHeader
            title={grant.event.name}
            description={`${formatEventDate(grant.event.event_date)} · ${formatEventTime(grant.event.event_time)}`}
          />

          <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-white p-3 pl-4 shadow-sm ring-1 ring-slate-100">
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--brand-navy)]">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
                <Camera className="h-4 w-4" />
              </span>
              {gallery.totalCount} uploaded
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept={GALLERY_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                queue.add(e.target.files);
                // Lets the same file be picked again after a failure.
                e.target.value = "";
              }}
            />
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              <ImagePlus className="h-4 w-4" />
              Upload
            </Button>
          </div>

          <UploadQueuePanel
            items={queue.items}
            onRetry={queue.retry}
            onRetryAll={queue.retryAllFailed}
            onRemove={queue.remove}
            onClear={queue.clearFinished}
          />

          <div className="mt-4">
            {gallery.isLoading && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[1, 2, 3].map((n) => (
                  <Skeleton key={n} className="aspect-square w-full rounded-2xl" />
                ))}
              </div>
            )}

            {gallery.isError && (
              <Card className="bg-rose-50/60 p-6 text-center text-sm text-rose-600 ring-1 ring-rose-100">
                Couldn't load the gallery. Your access may have ended.
              </Card>
            )}

            {!gallery.isLoading && !gallery.isError && (!media || media.length === 0) && (
              <Card className="p-10 text-center">
                <span
                  className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ background: "var(--gradient-brand-soft)" }}
                >
                  <Camera className="h-6 w-6 text-[var(--brand-navy)]" />
                </span>
                <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-slate-500">
                  Nothing uploaded yet. Tap Upload to add your first photos or videos.
                </p>
              </Card>
            )}

            {media && media.length > 0 && (
              <>
                <MediaGrid items={media} onOpen={setViewerIndex} className="grid grid-cols-2 gap-3 sm:grid-cols-3" />

                {gallery.hasNextPage && (
                  <div className="mt-5 text-center">
                    <Button variant="outline" isLoading={gallery.isFetchingNextPage} onClick={() => gallery.fetchNextPage()}>
                      Load more
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>

      {viewerIndex !== null && media && (
        <MediaLightbox
          items={media}
          index={Math.min(viewerIndex, media.length - 1)}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
}