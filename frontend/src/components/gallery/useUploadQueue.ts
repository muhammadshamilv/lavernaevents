import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { uploadGalleryMedia } from "@/api/gallery.api";
import { galleryKeys } from "@/queries/useGalleryQueries";
import { getApiErrorMessage } from "@/lib/apiError";

export type UploadStatus = "queued" | "uploading" | "done" | "error";

export interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  /** 0-100 */
  progress: number;
  error?: string;
}

// Same rules as the server (gallery/services.py); checking here gives an
// instant message instead of a long upload that is then refused.
const IMAGE_TYPES = ["jpg", "jpeg", "png", "webp"];
const VIDEO_TYPES = ["mp4", "mov", "webm"];
const MAX_IMAGE_MB = 25;
const MAX_VIDEO_MB = 100;
const CONCURRENCY = 3;

export const GALLERY_ACCEPT =
  "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";

function validate(file: File): string | null {
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";

  if (IMAGE_TYPES.includes(extension)) {
    return file.size > MAX_IMAGE_MB * 1024 * 1024 ? `Photos can be up to ${MAX_IMAGE_MB} MB.` : null;
  }

  if (VIDEO_TYPES.includes(extension)) {
    return file.size > MAX_VIDEO_MB * 1024 * 1024 ? `Videos can be up to ${MAX_VIDEO_MB} MB.` : null;
  }

  return "Unsupported file type. Use JPG, PNG, WebP, MP4, MOV or WebM.";
}

let counter = 0;

/**
 * Uploads many files without flooding the server: at most 3 run at a time,
 * each with its own progress bar and error, failed ones can be retried, and
 * the gallery refreshes once when the batch finishes (not after every
 * file). The browser warns before closing the tab while uploads run.
 */
export function useUploadQueue(eventId: number | undefined) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const mounted = useRef(true);
  const wasBusy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    if (!mounted.current) return;
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  const add = useCallback((files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;

    const next: UploadItem[] = Array.from(files).map((file) => {
      const problem = validate(file);
      return {
        id: `upload-${++counter}`,
        file,
        status: problem ? "error" : "queued",
        progress: 0,
        error: problem ?? undefined,
      };
    });

    setItems((current) => [...current, ...next]);
  }, []);

  // Start queued files whenever a slot is free.
  useEffect(() => {
    if (!eventId) return;

    const running = items.filter((item) => item.status === "uploading").length;
    const free = CONCURRENCY - running;

    if (free <= 0) return;

    items
      .filter((item) => item.status === "queued")
      .slice(0, free)
      .forEach((item) => {
        patch(item.id, { status: "uploading", progress: 0 });

        uploadGalleryMedia(eventId, item.file, {
          onProgress: (percent) => patch(item.id, { progress: percent }),
        })
          .then(() => patch(item.id, { status: "done", progress: 100 }))
          .catch((error) =>
            patch(item.id, {
              status: "error",
              error: getApiErrorMessage(error, "Upload failed."),
            })
          );
      });
  }, [items, eventId, patch]);

  const isBusy = items.some((item) => item.status === "queued" || item.status === "uploading");

  // Refresh the gallery once, when a batch finishes.
  useEffect(() => {
    if (wasBusy.current && !isBusy && eventId) {
      queryClient.invalidateQueries({ queryKey: galleryKeys.event(eventId) });
    }
    wasBusy.current = isBusy;
  }, [isBusy, eventId, queryClient]);

  // Don't let a closed tab silently drop half a wedding's photos.
  useEffect(() => {
    if (!isBusy) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isBusy]);

  const retry = useCallback((id: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id && item.status === "error" && !validate(item.file)
          ? { ...item, status: "queued", progress: 0, error: undefined }
          : item
      )
    );
  }, []);

  const retryAllFailed = useCallback(() => {
    setItems((current) =>
      current.map((item) =>
        item.status === "error" && !validate(item.file)
          ? { ...item, status: "queued", progress: 0, error: undefined }
          : item
      )
    );
  }, []);

  const remove = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id || item.status === "uploading"));
  }, []);

  const clearFinished = useCallback(() => {
    setItems((current) => current.filter((item) => item.status === "queued" || item.status === "uploading"));
  }, []);

  return { items, add, retry, retryAllFailed, remove, clearFinished, isBusy };
}