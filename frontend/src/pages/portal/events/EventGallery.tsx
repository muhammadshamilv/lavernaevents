import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Camera, ImagePlus, Star, Trash2, UserPlus, Users, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
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
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
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
          className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100"
        >
          <div
            className={cn("h-full rounded-full", nearFull ? "bg-rose-500" : "bg-[var(--brand-pink)]")}
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

  // Close the invite sheet with Escape.
  useEffect(() => {
    if (!grantOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGrantOpen(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grantOpen]);

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
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Card className="p-8">
          <p className="text-sm text-slate-500">This event couldn't be found, or you don't have access to it.</p>
          <Link to="/portal/events" className={buttonVariants({ variant: "outline", className: "mt-6" })}>
            Back to events
          </Link>
        </Card>
      </div>
    );
  }

  const revokeGrant = grants?.find((g) => g.id === revokeTarget);

  return (
    <div className="mobile-safe-bottom px-4 py-6 sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <Link
          to={`/portal/events/${eventId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-[var(--brand-navy)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to event
        </Link>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-[var(--brand-navy)] sm:text-2xl">Gallery</h1>
              <p className="mt-1 truncate text-sm text-slate-500">{event.name}</p>
            </div>

            <div className="flex gap-2">
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
            </div>
          </div>

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
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[var(--brand-navy)]" />
                <p className="text-sm font-semibold text-[var(--brand-navy)]">Photographers with access</p>
              </div>
              <div className="mt-3 space-y-2">
                {grants.map((grant) => {
                  const expired = grant.is_active && !grant.is_currently_valid;

                  return (
                    <div key={grant.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
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
              <Card className="p-10 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--gradient-brand-soft)" }}>
                  <Camera className="h-5 w-5 text-[var(--brand-navy)]" />
                </span>
                <p className="mt-3 text-sm text-slate-500">No photos or videos yet. Upload some, or invite a photographer to contribute.</p>
              </Card>
            )}

            {media && media.length > 0 && (
              <>
                <p className="mb-3 text-xs text-slate-400">{gallery.totalCount} item{gallery.totalCount === 1 ? "" : "s"}</p>
                <MediaGrid
                  items={media}
                  onOpen={setViewerIndex}
                  renderActions={(item) => (
                    <>
                      <button
                        type="button"
                        onClick={() => featureMutation.mutate(item.id)}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-700 active:bg-white"
                        aria-label={item.is_featured ? "Remove from featured" : "Mark as featured"}
                      >
                        <Star className={cn("h-4 w-4", item.is_featured && "fill-[var(--brand-gold)] text-[var(--brand-gold)]")} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item.id)}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-rose-600 active:bg-white"
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

      {/* Invite photographer: bottom sheet on phones, centered dialog on larger screens */}
      {grantOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:px-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setGrantOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-photographer-title"
            className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] soft-shadow-lg sm:max-w-sm sm:rounded-3xl"
          >
            <div className="flex items-center justify-between">
              <h2 id="invite-photographer-title" className="text-lg font-bold text-[var(--brand-navy)]">
                Invite photographer
              </h2>
              <button
                type="button"
                onClick={() => setGrantOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 active:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Enter the mobile number of a registered photographer account to let them upload to this event's gallery.
            </p>

            <form onSubmit={handleGrant} className="mt-4 space-y-4">
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
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base outline-none focus:border-[var(--brand-pink)] sm:text-sm"
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
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base outline-none focus:border-[var(--brand-pink)] sm:text-sm"
                />
                <p className="mt-1 text-xs text-slate-400">Leave empty to keep access until you revoke it.</p>
              </div>

              {grantError && (
                <p className="text-sm text-rose-600" role="alert">
                  {grantError}
                </p>
              )}

              <Button type="submit" isLoading={grantMutation.isPending} className="w-full">
                Grant access
              </Button>
            </form>
          </div>
        </div>
      )}

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