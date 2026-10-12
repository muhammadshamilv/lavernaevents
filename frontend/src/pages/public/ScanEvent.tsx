import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Camera, CalendarDays, Download, ImageOff, Lock, Plus, RotateCcw, ScanFace, Sparkles, Sun, WifiOff } from "lucide-react";
import Logo from "@/components/brand/Logo";
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

// Up to three selfies of the same guest (front and a little to each side)
// are used together; the server keeps whichever matches a photo best.
const MAX_SELFIES = 3;

/** "photo", "photos", "photos and videos"... for a list of matches. */
function describeMedia(items: GuestMatchedMedia[]): string {
  const videos = items.filter((item) => item.media_type === "VIDEO").length;
  const photos = items.length - videos;

  if (videos === 0) return photos === 1 ? "photo" : "photos";
  if (photos === 0) return videos === 1 ? "video" : "videos";
  return "photos and videos";
}

function isNotFound(error: unknown): boolean {
  return (error as { response?: { status?: number } } | null)?.response?.status === 404;
}

/** One matched photo or video, with its download button. */
function MatchTile({ media }: { media: GuestMatchedMedia }) {
  const fileUrl = resolveMediaUrl(media.file);
  const previewUrl = resolveMediaUrl(media.thumbnail) || fileUrl;
  const isVideo = media.media_type === "VIDEO";

  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100 shadow-md ring-1 ring-slate-900/5">
      {isVideo && fileUrl ? (
        <video
          src={`${fileUrl}#t=0.5`}
          poster={resolveMediaUrl(media.thumbnail) ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
          aria-label={media.caption || "Matched video"}
        />
      ) : (
        previewUrl && (
          <a href={fileUrl || previewUrl} target="_blank" rel="noreferrer" className="block h-full w-full" aria-label="Open photo">
            <img src={previewUrl} alt={media.caption || "Matched photo"} loading="lazy" className="h-full w-full object-cover" />
          </a>
        )
      )}
      <a
        href={getGuestMediaDownloadHref(media.download_url)}
        download
        className={`absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-[var(--brand-navy)] shadow-lg backdrop-blur transition-transform active:scale-95 ${
          isVideo ? "top-2" : "bottom-2"
        }`}
        aria-label={isVideo ? "Download video" : "Download photo"}
      >
        <Download className="h-5 w-5" />
      </a>
    </div>
  );
}

const TIPS = [
  { icon: Sun, text: "Face the camera in good light" },
  { icon: ScanFace, text: "Take off sunglasses or a hat" },
  { icon: Lock, text: "Your selfie is never saved" },
];

/** Searching animation: a face frame with a scanning line. */
function MatchingView({ reduce }: { reduce: boolean }) {
  return (
    <div className="mt-10 text-center" role="status" aria-live="polite">
      <div className="relative mx-auto h-36 w-36">
        <span aria-hidden="true" className="absolute inset-0 rounded-[2rem] bg-[var(--brand-pink)]/10" />
        {/* corner brackets */}
        {["left-0 top-0 border-l-4 border-t-4 rounded-tl-3xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-3xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl"].map((cls) => (
          <span key={cls} aria-hidden="true" className={`absolute h-9 w-9 border-[var(--brand-pink)] ${cls}`} />
        ))}
        <ScanFace className="absolute inset-0 m-auto h-14 w-14 text-[var(--brand-pink)]" strokeWidth={1.5} />
        {!reduce && (
          <motion.span
            aria-hidden="true"
            className="absolute inset-x-3 h-0.5 rounded-full bg-[var(--brand-pink)] shadow-[0_0_14px_3px_rgba(212,20,114,0.5)]"
            initial={{ top: "12%" }}
            animate={{ top: ["12%", "86%", "12%"] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>
      <p className="mt-6 text-base font-semibold text-[var(--brand-navy)]">Finding your photos and videos...</p>
      <p className="mt-1 text-sm text-slate-500">This can take up to half a minute.</p>
    </div>
  );
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
  const reduce = !!useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // true while the guest is adding one more selfie to the ones already used
  const addingRef = useRef(false);

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
  const [selfies, setSelfies] = useState<File[]>([]);

  // Preview of the selfie(s) in use, shown as small avatars on the results.
  const selfiePreviews = useMemo(() => selfies.map((file) => URL.createObjectURL(file)), [selfies]);
  useEffect(() => () => selfiePreviews.forEach((url) => URL.revokeObjectURL(url)), [selfiePreviews]);

  const openCamera = (adding: boolean) => {
    addingRef.current = adding;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (input: HTMLInputElement) => {
    const original = input.files?.[0];
    // Clear the input so choosing the same file again (retake) still fires.
    input.value = "";

    if (!original || !token || step === "matching") return;

    const adding = addingRef.current && selfies.length > 0 && selfies.length < MAX_SELFIES;
    const previous = adding ? selfies : [];

    setSelfieError(null);
    setStep("matching");

    const file = await resizeImageForUpload(original);
    const next = [...previous, file];

    selfieMutation.mutate(next, {
      onSuccess: (result) => {
        setSelfies(next);
        setMatchedMedia(result.matched_media);
        setStep("results");
      },
      onError: (error) => {
        setSelfieError(getApiErrorMessage(error, "Couldn't process that selfie. Please try again."));
        // A failed extra selfie keeps the results the guest already has.
        setStep(adding ? "results" : "intro");
      },
    });
  };

  const handleRetake = () => {
    setSelfieError(null);
    setMatchedMedia([]);
    setSelfies([]);
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
      <div className="gradient-mesh-subtle flex min-h-dvh flex-col items-center justify-center px-5 text-center">
        <Logo size="md" tone="dark" />
        <div className="mt-8 w-full max-w-xs rounded-3xl bg-white p-7 soft-shadow-lg">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            {inactive ? <ImageOff className="h-7 w-7" /> : <WifiOff className="h-7 w-7" />}
          </span>
          <h1 className="mt-4 text-lg font-bold text-[var(--brand-navy)]">{inactive ? "This QR code isn't active" : "Couldn't load this page"}</h1>
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
  const sureMedia = matchedMedia.filter((media) => media.match_confidence !== "possible");
  const possibleMedia = matchedMedia.filter((media) => media.match_confidence === "possible");

  return (
    <div className="gradient-mesh-subtle mobile-safe-bottom relative min-h-dvh overflow-hidden px-4 pb-12 pt-6 sm:px-6 sm:pt-10">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--brand-pink)]/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-1/2 h-72 w-72 rounded-full bg-[var(--brand-navy)]/10 blur-3xl" />

      <div className="relative mx-auto flex max-w-md flex-col items-center sm:max-w-2xl">
        <Logo size="md" tone="dark" />

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 w-full"
        >
          {/* Event header */}
          <div className="overflow-hidden rounded-3xl bg-white soft-shadow-lg">
            {coverUrl ? (
              <div className="relative h-40 w-full sm:h-52">
                <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 text-left text-white sm:p-6">
                  <h1 className="break-words text-xl font-bold leading-tight drop-shadow sm:text-2xl">{event.name}</h1>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-white/90">
                    <CalendarDays className="h-4 w-4" />
                    {formatEventDate(event.event_date)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-[image:var(--gradient-brand)] p-5 text-left text-white sm:p-7">
                <h1 className="break-words text-xl font-bold leading-tight sm:text-2xl">{event.name}</h1>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-white/90">
                  <CalendarDays className="h-4 w-4" />
                  {formatEventDate(event.event_date)}
                </p>
              </div>
            )}

            {step === "intro" && (
              <div className="p-5 text-center sm:p-8">
                <div className="relative mx-auto h-20 w-20">
                  {!reduce && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-[var(--brand-pink)]/15" />}
                  <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
                    <Camera className="h-9 w-9" />
                  </span>
                </div>
                <h2 className="mt-5 text-xl font-semibold text-[var(--brand-navy)]">Find your photos</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                  Take a quick selfie and we'll find every photo and video from this event you appear in.
                </p>

                <ul className="mx-auto mt-5 grid max-w-md gap-2 sm:grid-cols-3">
                  {TIPS.map(({ icon: Icon, text }) => (
                    <li key={text} className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-left text-xs text-slate-600 sm:flex-col sm:gap-1.5 sm:text-center">
                      <Icon className="h-4 w-4 shrink-0 text-[var(--brand-pink)]" />
                      {text}
                    </li>
                  ))}
                </ul>

                {selfieError && (
                  <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600" role="alert">
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
                <Button type="button" size="lg" className="mt-6 w-full sm:mx-auto sm:w-auto sm:min-w-64" onClick={() => openCamera(false)}>
                  <Camera className="h-4 w-4" />
                  {selfieError ? "Try again" : "Take a selfie"}
                </Button>

                <p className="mt-4 text-xs text-slate-400">Your selfie is only used to find matching photos. It is not saved.</p>
              </div>
            )}

            {step === "matching" && (
              <div className="px-5 pb-10 sm:px-8">
                <MatchingView reduce={reduce} />
              </div>
            )}
          </div>

          <AnimatePresence>
            {step === "results" && (
              <motion.div
                key="results"
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="mt-6"
              >
                {selfieError && (
                  <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-center text-sm text-rose-600" role="alert">
                    {selfieError}
                  </p>
                )}

                {sureMedia.length === 0 && possibleMedia.length === 0 ? (
                  <div className="rounded-3xl bg-white p-7 text-center soft-shadow">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <ImageOff className="h-7 w-7" />
                    </span>
                    <h2 className="mt-4 text-lg font-semibold text-[var(--brand-navy)]">No matching photos yet</h2>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
                      Check back later as more photos are uploaded, or add another selfie taken from a slightly different angle.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 rounded-2xl bg-white p-3.5 soft-shadow">
                      <div className="flex -space-x-2">
                        {selfiePreviews.map((url) => (
                          <img key={url} src={url} alt="" className="h-11 w-11 rounded-full border-2 border-white object-cover" />
                        ))}
                      </div>
                      <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--brand-navy)]" aria-live="polite">
                        {sureMedia.length > 0 ? (
                          <>
                            <Sparkles className="mr-1 inline h-4 w-4 text-[var(--brand-gold)]" />
                            We found {sureMedia.length} {describeMedia(sureMedia)} of you
                          </>
                        ) : (
                          "No sure matches yet, but these might be you"
                        )}
                      </p>
                    </div>

                    {sureMedia.length > 0 && (
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {sureMedia.map((media) => (
                          <MatchTile key={media.id} media={media} />
                        ))}
                      </div>
                    )}

                    {possibleMedia.length > 0 && (
                      <div className={sureMedia.length > 0 ? "mt-8" : "mt-4"}>
                        {sureMedia.length > 0 && (
                          <>
                            <h3 className="text-center text-sm font-semibold text-[var(--brand-navy)]">Might be you</h3>
                            <p className="mt-1 text-center text-xs text-slate-500">These look similar, but we're less sure.</p>
                          </>
                        )}
                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {possibleMedia.map((media) => (
                            <MatchTile key={media.id} media={media} />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {selfies.length > 0 && selfies.length < MAX_SELFIES && (
                  <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white/70 p-4 text-center">
                    <p className="text-sm font-medium text-slate-700">Missing some photos of you?</p>
                    <p className="mt-1 text-xs text-slate-500">Add a selfie from a slightly different angle to find more.</p>
                    <Button type="button" variant="outline" className="mt-3 w-full sm:w-auto" onClick={() => openCamera(true)}>
                      <Plus className="h-4 w-4" />
                      Add another selfie
                    </Button>
                  </div>
                )}

                <Button type="button" variant="ghost" className="mt-4 w-full" onClick={handleRetake}>
                  <RotateCcw className="h-4 w-4" />
                  Start over with a new selfie
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <p className="mt-8 text-xs text-slate-400">Photo search by LavernaEvents</p>
      </div>
    </div>
  );
}