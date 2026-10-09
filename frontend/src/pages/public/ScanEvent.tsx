import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Camera, Download, ImageOff, RotateCcw, WifiOff } from "lucide-react";
import logo from "@/assets/laverna-logo.png";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useScannedEvent, useSelfieMatchMutation } from "@/queries/useQRCodeQueries";
import { getGuestMediaDownloadHref } from "@/api/qrcode.api";
import { resolveMediaUrl } from "@/lib/media";
import { resizeImageForUpload } from "@/lib/resizeImage";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatEventDate } from "@/lib/eventDisplay";
import type { GuestMatchedMedia } from "@/types/qrcode.types";

type Step = "intro" | "matching" | "results";

function isNotFound(error: unknown): boolean {
  return (error as { response?: { status?: number } } | null)?.response?.status === 404;
}

/**
 * Public, guest-facing "scan QR -> selfie -> matched photos" page. No
 * login and no portal shell: a guest arriving here has no account.
 *
 * capture="user" opens the phone's camera already on the front lens, and
 * falls back to a plain file picker on desktop. The photo is shrunk in the
 * browser before upload (selfies are 4-12 MB) so matching is quick on
 * mobile data.
 */
export default function ScanEvent() {
  const { token } = useParams<{ token: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    data: event,
    isLoading: eventLoading,
    isError: eventError,
    error: eventErrorObject,
    refetch: refetchEvent,
  } = useScannedEvent(token);
  const selfieMutation = useSelfieMatchMutation(token ?? "");

  const [step, setStep] = useState<Step>("intro");
  const [matchedMedia, setMatchedMedia] = useState<GuestMatchedMedia[]>([]);
  const [selfieError, setSelfieError] = useState<string | null>(null);

  const handleFileChange = async (input: HTMLInputElement) => {
    const original = input.files?.[0];
    // Clear the input so choosing the same file again (retake) still fires.
    input.value = "";

    if (!original || !token || step === "matching") return;

    setSelfieError(null);
    setStep("matching");

    const file = await resizeImageForUpload(original);

    selfieMutation.mutate(file, {
      onSuccess: (result) => {
        setMatchedMedia(result.matched_media);
        setStep("results");
      },
      onError: (error) => {
        setSelfieError(getApiErrorMessage(error, "Couldn't process that selfie. Please try again."));
        setStep("intro");
      },
    });
  };

  const handleRetake = () => {
    setSelfieError(null);
    setMatchedMedia([]);
    setStep("intro");
  };

  if (eventLoading) {
    return (
      <div className="gradient-mesh-subtle flex min-h-dvh items-center justify-center px-5">
        <div className="w-full max-w-sm space-y-3 text-center">
          <Skeleton className="mx-auto h-10 w-10 rounded-full" />
          <Skeleton className="mx-auto h-4 w-40" />
        </div>
      </div>
    );
  }

  if (eventError || !event) {
    // 404 = switched off or wrong link; anything else (no signal, server
    // asleep) is temporary and must not tell the guest the code is dead.
    const inactive = isNotFound(eventErrorObject);

    return (
      <div className="gradient-mesh-subtle flex min-h-dvh items-center justify-center px-5 text-center">
        <div className="max-w-xs">
          {inactive ? (
            <ImageOff className="mx-auto h-10 w-10 text-slate-300" />
          ) : (
            <WifiOff className="mx-auto h-10 w-10 text-slate-300" />
          )}
          <h1 className="mt-4 text-lg font-bold text-[var(--brand-navy)]">
            {inactive ? "This QR code isn't active" : "Couldn't load this page"}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {inactive
              ? "It may have been switched off by the event organizer, or the link is incorrect."
              : "Please check your internet connection and try again."}
          </p>
          {!inactive && (
            <Button type="button" className="mt-5" onClick={() => refetchEvent()}>
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  const coverUrl = resolveMediaUrl(event.cover_image);

  return (
    <div className="gradient-mesh-subtle mobile-safe-bottom min-h-dvh px-5 pb-10 pt-8">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <img src={logo} alt="LavernaEvents" className="h-9 w-auto object-contain" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mt-6 w-full"
        >
          {coverUrl && (
            <div className="mb-5 h-40 w-full overflow-hidden rounded-2xl">
              <img src={coverUrl} alt={event.name} className="h-full w-full object-cover" />
            </div>
          )}

          <div className="text-center">
            <h1 className="break-words text-xl font-bold text-[var(--brand-navy)]">{event.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{formatEventDate(event.event_date)}</p>
          </div>

          {step === "intro" && (
            <div className="mt-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--brand-pink)]/10">
                <Camera className="h-7 w-7 text-[var(--brand-pink)]" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-[var(--brand-navy)]">
                Find your photos
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Take a quick selfie and we'll find every photo from this event you appear in.
              </p>

              {selfieError && (
                <p className="mt-4 text-sm text-rose-600" role="alert">
                  {selfieError}
                </p>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={(changeEvent) => void handleFileChange(changeEvent.target)}
              />
              <Button
                type="button"
                size="lg"
                className="mt-6 w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
                {selfieError ? "Try again" : "Take a selfie"}
              </Button>

              <p className="mt-4 text-xs text-slate-400">
                Your selfie is only used to find matching photos. It is not saved.
              </p>
            </div>
          )}

          {step === "matching" && (
            <div className="mt-10 text-center" role="status" aria-live="polite">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[var(--brand-pink)] border-t-transparent" />
              <p className="mt-4 text-sm text-slate-500">Finding your photos...</p>
              <p className="mt-1 text-xs text-slate-400">This can take up to half a minute.</p>
            </div>
          )}

          {step === "results" && (
            <div className="mt-8">
              {matchedMedia.length === 0 ? (
                <div className="text-center">
                  <ImageOff className="mx-auto h-10 w-10 text-slate-300" />
                  <h2 className="mt-4 text-lg font-semibold text-[var(--brand-navy)]">
                    No matching photos yet
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Check back later as more photos are uploaded, or try again with a clearer selfie.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-center text-sm font-medium text-slate-600" aria-live="polite">
                    We found {matchedMedia.length}{" "}
                    {matchedMedia.length === 1 ? "photo" : "photos"} of you
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {matchedMedia.map((media) => {
                      const photoUrl = resolveMediaUrl(media.file);
                      const previewUrl = resolveMediaUrl(media.thumbnail) || photoUrl;

                      return (
                        <div
                          key={media.id}
                          className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100"
                        >
                          {previewUrl && (
                            <a
                              href={photoUrl || previewUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block h-full w-full"
                              aria-label="Open photo"
                            >
                              <img
                                src={previewUrl}
                                alt={media.caption || "Matched photo"}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            </a>
                          )}
                          <a
                            href={getGuestMediaDownloadHref(media.download_url)}
                            download
                            className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-[var(--brand-navy)] shadow-md active:scale-95"
                            aria-label="Download photo"
                          >
                            <Download className="h-5 w-5" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <Button
                type="button"
                variant="outline"
                className="mt-6 w-full"
                onClick={handleRetake}
              >
                <RotateCcw className="h-4 w-4" />
                Take another selfie
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}