import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Power,
  QrCode as QrCodeIcon,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvent } from "@/queries/useEventQueries";
import {
  useDownloadEventQRCodeMutation,
  useEventQRCode,
  useEventQRCodePreview,
  useSetQRCodeActiveMutation,
} from "@/queries/useQRCodeQueries";
import { toastStore } from "@/stores/toast.store";
import { getApiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

function httpStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

/**
 * Organizer's QR code page for one event. The preview is the SAME
 * backend-generated PNG the "Download PNG" button saves, so what you see is
 * exactly what gets printed. The organizer can also switch the code off
 * (guests then see "not active") and back on.
 */
export default function EventQRCode() {
  const { id } = useParams<{ id: string }>();
  const eventId = id ? Number(id) : undefined;

  const { data: event, isLoading: eventLoading } = useEvent(eventId);
  const {
    data: qrCode,
    isLoading: qrLoading,
    isError,
    error: qrError,
  } = useEventQRCode(eventId);
  const { data: previewBlob, isError: previewError } = useEventQRCodePreview(eventId, !!qrCode);

  const downloadMutation = useDownloadEventQRCodeMutation();
  const activeMutation = useSetQRCodeActiveMutation(eventId ?? 0);

  const [downloadingFormat, setDownloadingFormat] = useState<"png" | "pdf" | null>(null);

  // An object URL for the preview blob; revoked when it changes/unmounts.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!previewBlob) {
      setPreviewUrl(null);
      return;
    }

    const url = window.URL.createObjectURL(previewBlob);
    setPreviewUrl(url);

    return () => window.URL.revokeObjectURL(url);
  }, [previewBlob]);

  const handleDownload = (format: "png" | "pdf") => {
    if (!eventId) return;

    setDownloadingFormat(format);

    downloadMutation.mutate(
      { eventId, format },
      {
        onSuccess: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `event-${eventId}-qr-code.${format}`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          // Revoking right away can cancel the download on Safari/mobile.
          window.setTimeout(() => window.URL.revokeObjectURL(url), 10_000);
        },
        onError: (error) => {
          toastStore.show(
            getApiErrorMessage(error, `Couldn't download the ${format.toUpperCase()}.`),
            "error"
          );
        },
        onSettled: () => setDownloadingFormat(null),
      }
    );
  };

  const handleToggleActive = () => {
    if (!qrCode) return;

    const next = !qrCode.is_active;

    activeMutation.mutate(next, {
      onSuccess: () =>
        toastStore.show(next ? "QR code is active again." : "QR code switched off."),
      onError: (error) =>
        toastStore.show(getApiErrorMessage(error, "Couldn't update the QR code."), "error"),
    });
  };

  const handleCopyLink = async () => {
    if (!qrCode) return;

    try {
      await navigator.clipboard.writeText(qrCode.scan_url);
      toastStore.show("Link copied.");
    } catch {
      toastStore.show("Couldn't copy - long-press the link to copy it.", "error");
    }
  };

  if (eventLoading || qrLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
        <Skeleton className="h-4 w-32" />
        <Card className="mt-6 p-8">
          <Skeleton className="mx-auto h-56 w-56" />
        </Card>
      </div>
    );
  }

  // A plan without QR codes (or no plan) gets a clear upgrade message,
  // not a generic "couldn't load".
  const status = httpStatus(qrError);
  if (isError && (status === 402 || status === 403)) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Card className="p-8">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
            <Sparkles className="h-6 w-6" />
          </span>
          <h1 className="mt-4 font-semibold text-[var(--brand-navy)]">QR codes aren't in your plan</h1>
          <p className="mt-2 text-sm text-slate-500">
            {getApiErrorMessage(qrError, "Upgrade your plan to give guests a QR code for their photos.")}
          </p>
          <Link to="/pricing" className={buttonVariants({ className: "mt-6" })}>
            View plans
          </Link>
        </Card>
      </div>
    );
  }

  if (isError || !event || !qrCode) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Card className="p-8">
          <p className="text-sm text-slate-500">
            This event's QR code couldn't be loaded, or you don't have access to it.
          </p>
          <Link
            to="/portal/events"
            className={buttonVariants({ variant: "outline", className: "mt-6" })}
          >
            Back to events
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mobile-safe-bottom px-4 py-6 sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto max-w-2xl">
        <Link
          to={`/portal/events/${event.id}`}
          className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-slate-500 [@media(hover:hover)]:hover:text-[var(--brand-navy)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to event
        </Link>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Card className="mt-4 p-5 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]">
                <QrCodeIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="font-semibold text-[var(--brand-navy)]">QR Code</h1>
                <p className="truncate text-sm text-slate-500">{event.name}</p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                  qrCode.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                )}
              >
                {qrCode.is_active ? "Active" : "Switched off"}
              </span>
            </div>

            <div className="mt-6 flex justify-center rounded-2xl bg-white p-2 sm:p-6">
              <div
                className={cn(
                  "flex aspect-square w-full max-w-[14rem] items-center justify-center rounded-xl border border-slate-100 bg-white p-4 transition-opacity",
                  !qrCode.is_active && "opacity-40"
                )}
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="Event QR code" className="h-full w-full object-contain" />
                ) : previewError ? (
                  <p className="text-center text-xs text-rose-600">Couldn't load the QR code preview.</p>
                ) : (
                  <Skeleton className="h-full w-full" />
                )}
              </div>
            </div>

            <p className="mt-5 text-center text-sm text-slate-500">
              Guests scan this code to open the event's gallery, take a selfie, and download
              every photo they appear in.
            </p>

            {!qrCode.is_active && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">
                Switched off: guests who scan it will see "This QR code isn't active". Printed
                copies work again as soon as you switch it back on.
              </p>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDownload("png")}
                isLoading={downloadingFormat === "png"}
                disabled={downloadingFormat !== null}
              >
                <Download className="h-4 w-4" />
                Download PNG
              </Button>
              <Button
                type="button"
                onClick={() => handleDownload("pdf")}
                isLoading={downloadingFormat === "pdf"}
                disabled={downloadingFormat !== null}
              >
                <FileText className="h-4 w-4" />
                Download PDF
              </Button>
            </div>

            <p className="mt-3 text-center text-xs text-slate-400">
              Print the PDF and place it at your venue for guests to scan.
            </p>

            <div className="mt-6 rounded-2xl border border-slate-100 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Guest link
              </p>
              <p className="mt-1.5 break-all text-sm text-[var(--brand-navy)]">{qrCode.scan_url}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={handleCopyLink}>
                  <Copy className="h-3.5 w-3.5" />
                  Copy link
                </Button>
                <a
                  href={qrCode.scan_url}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open guest page
                </a>
              </div>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleToggleActive}
                isLoading={activeMutation.isPending}
              >
                <Power className="h-4 w-4" />
                {qrCode.is_active ? "Switch QR code off" : "Switch QR code on"}
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}