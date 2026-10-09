import { useState } from "react";
import { Film, ImageIcon, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { resolveMediaUrl } from "@/lib/media";
import { getApiErrorMessage } from "@/lib/apiError";
import { toastStore } from "@/stores/toast.store";
import { useAdminMedia, useDeleteAdminMediaMutation } from "@/queries/useAdminQueries";
import type { AdminGalleryMedia } from "@/types/admin.types";

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "Unknown size";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default function MediaManagement() {
  const [mediaType, setMediaType] = useState<"IMAGE" | "VIDEO" | "">("");
  const [page, setPage] = useState(1);
  const [deletingMedia, setDeletingMedia] = useState<AdminGalleryMedia | null>(null);

  const { data, isLoading, isError } = useAdminMedia({
    page,
    media_type: mediaType || undefined,
  });

  const deleteMutation = useDeleteAdminMediaMutation();

  const handleDelete = () => {
    if (!deletingMedia) return;
    deleteMutation.mutate(deletingMedia.id, {
      onSuccess: () => {
        toastStore.show("Media deleted.");
        setDeletingMedia(null);
      },
      onError: (error) => {
        toastStore.show(getApiErrorMessage(error, "Could not delete media."), "error");
        setDeletingMedia(null);
      },
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Media Management</h1>
          <p className="mt-1 text-sm text-slate-500">
            Browse and moderate media uploaded across every event.
          </p>
        </div>
        <Select
          aria-label="Filter by media type"
          value={mediaType}
          onChange={(e) => {
            setMediaType(e.target.value as "IMAGE" | "VIDEO" | "");
            setPage(1);
          }}
          className="sm:w-44"
        >
          <option value="">All media</option>
          <option value="IMAGE">Images</option>
          <option value="VIDEO">Videos</option>
        </Select>
      </div>

      {isError ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          We couldn't load media right now. Please refresh the page.
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-2xl" />
          ))}
        </div>
      ) : data && data.media.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.media.map((item) => {
            const previewUrl = resolveMediaUrl(item.thumbnail || (item.media_type === "IMAGE" ? item.file : null));

            return (
              <Card key={item.id} className="relative overflow-hidden">
                <div className="flex aspect-square items-center justify-center bg-slate-100">
                  {previewUrl ? (
                    <img src={previewUrl} alt={item.caption || item.event_name} className="h-full w-full object-cover" />
                  ) : item.media_type === "VIDEO" ? (
                    <Film className="h-8 w-8 text-slate-300" />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-slate-300" />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setDeletingMedia(item)}
                  className="absolute right-1.5 top-1.5 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-rose-600 shadow-sm"
                  aria-label="Delete media"
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                <div className="p-2.5 pr-3">
                  <p className="truncate text-xs font-semibold text-[var(--brand-navy)]">
                    {item.event_name}
                  </p>
                  <p className="truncate text-[11px] text-slate-400">
                    {item.uploaded_by_name ?? "Unknown uploader"} · {formatFileSize(item.file_size)}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-8 text-center text-sm text-slate-500">No media found.</Card>
      )}

      {data && data.pagination.total_pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-slate-500">
            Page {data.pagination.current_page} of {data.pagination.total_pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.pagination.total_pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!deletingMedia}
        title="Delete this media?"
        description="This permanently removes the file from the event's gallery. The organizer and the photographer will no longer see it."
        confirmLabel="Delete"
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeletingMedia(null)}
      />
    </div>
  );
}