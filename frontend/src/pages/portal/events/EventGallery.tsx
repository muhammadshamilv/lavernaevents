import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Camera, CalendarX, ImagePlus, Star, Trash2, UserPlus, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/modal";
import { BackLink, PageHeader, StateCard, fieldClass } from "@/components/portal/PortalUI";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useEvent } from "@/queries/useEventQueries";
import {
  useEventGallery,
  useDeleteGalleryMediaMutation,
  useToggleGalleryMediaFeaturedMutation,
} from "@/queries/useGalleryQueries";
import {
  useEventPhotographerAccess,
  useGrantPhotographerAccessMutation,
  useRevokePhotographerAccessMutation,
} from "@/queries/usePhotographerQueries";
import { getApiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import FaceSearchStatus from "@/components/gallery/FaceSearchStatus";
import MediaGrid from "@/components/gallery/MediaGrid";
import MediaLightbox from "@/components/gallery/MediaLightbox";
import UploadQueuePanel from "@/components/gallery/UploadQueuePanel";
import { GALLERY_ACCEPT, useUploadQueue } from "@/components/gallery/useUploadQueue";
import type { GalleryStorage } from "@/types/gallery.types";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function StorageBar({ storage }: { storage: GalleryStorage }) {
  const { used_bytes, limit_bytes } = storage;
  const percent = limit_bytes ? Math.min(100, Math.round((used_bytes / limit_bytes) * 100)) : 0;
  const nearFull = percent >= 90;

  return (
    <div className="mt-5 rounded-2xl border border-slate-100 bg-white p-4 soft-shadow">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>Storage used (all your events)</span>
        <span className={cn("font-semibold", nearFull && "text-rose-600")}>
          {limit_bytes ? `${formatBytes(used_bytes)} of ${formatBytes(limit_bytes)}` : `${formatBytes(used_bytes)} · unlimited`}
        </span>
      </div>
      {limit_bytes ? (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Storage used"
          className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-500", nearFull ? "bg-rose-500" : "bg-[image:var(--gradient-brand)]")}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

export default function EventGallery() {
  const { id } = useParams<{ id: string }>();
  const eventId = id ? Number(id) : undefined;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: event, isLoading: eventLoading } = useEvent(eventId);
  const gallery = useEventGallery(eventId);
  const media = gallery.data;
  const { data: grants, isLoading: grantsLoading } = useEventPhotographerAccess(eventId);

  const queue = useUploadQueue(eventId);
  const deleteMutation = useDeleteGalleryMediaMutation(eventId);
  const featureMutation = useToggleGalleryMediaFeaturedMutation(eventId);
  const grantMutation = useGrantPhotographerAccessMutation(eventId);
  const revokeMutation = useRevokePhotographerAccessMutation(eventId);

  const [grantOpen, setGrantOpen] = useState(false);
  const [mobileNumber, setMobileNumber] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [grantError, setGrantError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<number | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const handleGrant = (e: React.FormEvent) => {
    e.preventDefault();
    setGrantError(null);

    grantMutation.mutate(
      {
        mobile_number: mobileNumber.trim(),
        // datetime-local has no timezone; the browser's local time is sent as an exact instant.
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      },
      {
        onSuccess: () => {
          setMobileNumber("");
          setExpiresAt("");
          setGrantOpen(false);
        },
        onError: (err) => setGrantError(getApiErrorMessage(err, "Couldn't grant access.")),
      }
    );
  };

  if (eventLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-7 w-56" />
      </div>
    );
  }

  if (!event || !eventId) {
    return (
      <StateCard
        icon={CalendarX}
        title="Event not found"
        message="This event couldn't be found, or you don't have access to it."
        to="/portal/events"
        actionLabel="Back to events"
      />
    );
  }

  const revokeGrant = grants?.find((g) => g.id === revokeTarget);

  return (
    <div className="mobile-safe-bottom px-4 py-6 sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <BackLink to={`/portal/events/${eventId}`}>Back to event</BackLink>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept={GALLERY_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              queue.add(e.target.files);
              e.target.value = "";
            }}
          />
          <PageHeader
            eyebrow="Gallery"
            icon={Camera}
            title={event.name}
            description="Photos and videos for this event."
            actions={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setGrantError(null);
                    setGrantOpen(true);
                  }}
                  aria-label="Invite photographer"
                >
                  <UserPlus className="h-4 w-4" />
                  <span className="hidden sm:inline">Invite photographer</span>
                </Button>
                <Button size="sm" onClick={() => fileInputRef.current?.click()} aria-label="Upload photos or videos">
                  <ImagePlus className="h-4 w-4" />
                  <span className="hidden sm:inline">Upload</span>
                </Button>
              </>
            }
          />

          {gallery.storage && <StorageBar storage={gallery.storage} />}

          <UploadQueuePanel
            items={queue.items}
            onRetry={queue.retry}
            onRetryAll={queue.retryAllFailed}
            onRemove={queue.remove}
            onClear={queue.clearFinished}
          />

          <FaceSearchStatus eventId={eventId} />

          {/* Photographer access grants */}
          {!grantsLoading && grants && grants.length > 0 && (
            <Card className="mt-5 p-4 sm:p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]">
                  <Users className="h-4 w-4" />
                </span>
                <p className="text-sm font-semibold text-[var(--brand-navy)]">Photographers with access</p>
              </div>
              <div className="mt-3 space-y-2">
                {grants.map((grant) => {
                  const expired = grant.is_active && !grant.is_currently_valid;

                  return (
                    <div key={grant.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--brand-navy)]">{grant.photographer.full_name}</p>
                        <p className="truncate text-xs text-slate-400">{grant.photographer.mobile_number}</p>
                        {grant.is_currently_valid && grant.expires_at && (
                          <p className="mt-0.5 text-xs text-amber-600">
                            Until {new Date(grant.expires_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                      {grant.is_currently_valid ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRevokeTarget(grant.id)}
                          className="shrink-0 border-rose-200 text-rose-600 hover:bg-rose-50"
                        >
                          Revoke
                        </Button>
                      ) : (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                          {expired ? "Expired" : "Revoked"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Media grid */}
          <div className="mt-6">
            {gallery.isLoading && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {[1, 2, 3, 4].map((n) => (
                  <Skeleton key={n} className="aspect-square w-full rounded-2xl" />
                ))}
              </div>
            )}

            {gallery.isError && (
              <Card className="p-6 text-center text-sm text-rose-600">Couldn't load the gallery. Please refresh the page.</Card>
            )}

            {!gallery.isLoading && !gallery.isError && (!media || media.length === 0) && (
              <Card className="border-dashed p-10 text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "var(--gradient-brand-soft)" }}>
                  <Camera className="h-7 w-7 text-[var(--brand-navy)]" />
                </span>
                <p className="mt-3 text-sm text-slate-500">No photos or videos yet. Upload some, or invite a photographer to contribute.</p>
              </Card>
            )}

            {media && media.length > 0 && (
              <>
                <p className="mb-3 text-xs font-medium text-slate-500">{gallery.totalCount} item{gallery.totalCount === 1 ? "" : "s"}</p>
                <MediaGrid
                  items={media}
                  onOpen={setViewerIndex}
                  renderActions={(item) => (
                    <>
                      <button
                        type="button"
                        onClick={() => featureMutation.mutate(item.id)}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-md transition-transform active:scale-90"
                        aria-label={item.is_featured ? "Remove from featured" : "Mark as featured"}
                      >
                        <Star className={cn("h-4 w-4", item.is_featured && "fill-[var(--brand-gold)] text-[var(--brand-gold)]")} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item.id)}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-rose-600 shadow-md transition-transform active:scale-90"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                />

                {gallery.hasNextPage && (
                  <div className="mt-6 text-center">
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

      {/* Invite photographer: bottom sheet on phones, centred dialog on larger screens */}
      <Modal
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        busy={grantMutation.isPending}
        size="sm"
        icon={UserPlus}
        title="Invite photographer"
        description="Enter the mobile number of a registered photographer account to let them upload to this event's gallery."
      >
        <form onSubmit={handleGrant} className="space-y-4">
          <div>
            <label htmlFor="photographer-mobile" className="text-xs font-semibold text-slate-500">
              Photographer's mobile number
            </label>
            <input
              id="photographer-mobile"
              type="tel"
              inputMode="tel"
              autoFocus
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              placeholder="9876543210"
              required
              className={`${fieldClass} mt-1.5 h-12`}
            />
          </div>

          <div>
            <label htmlFor="photographer-expiry" className="text-xs font-semibold text-slate-500">
              Access ends (optional)
            </label>
            <input
              id="photographer-expiry"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className={`${fieldClass} mt-1.5 h-12`}
            />
            <p className="mt-1 text-xs text-slate-400">Leave empty to keep access until you revoke it.</p>
          </div>

          {grantError && (
            <p className="text-sm text-rose-600" role="alert">
              {grantError}
            </p>
          )}

          <ModalActions>
            <Button type="submit" isLoading={grantMutation.isPending}>
              Grant access
            </Button>
          </ModalActions>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this media?"
        description="This photo or video will be permanently removed from the gallery."
        confirmLabel="Delete"
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget !== null) {
            deleteMutation.mutate(deleteTarget, { onSettled: () => setDeleteTarget(null) });
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoke access?"
        description={`${revokeGrant?.photographer.full_name ?? "This photographer"} will no longer be able to open or upload to this gallery. Photos they already uploaded stay.`}
        confirmLabel="Revoke"
        destructive
        isLoading={revokeMutation.isPending}
        onConfirm={() => {
          if (revokeTarget !== null) {
            revokeMutation.mutate(revokeTarget, { onSettled: () => setRevokeTarget(null) });
          }
        }}
        onCancel={() => setRevokeTarget(null)}
      />

      {viewerIndex !== null && media && media.length > 0 && (
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