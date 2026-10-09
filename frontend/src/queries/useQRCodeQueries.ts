import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  downloadEventQRCodeFile,
  getEventQRCode,
  getScannedEvent,
  matchSelfie,
  setEventQRCodeActive,
} from "@/api/qrcode.api";

export const qrCodeKeys = {
  event: (eventId: number) => ["qr-code", "event", eventId] as const,
  preview: (eventId: number) => ["qr-code", "preview", eventId] as const,
  scanned: (token: string) => ["qr-code", "scanned", token] as const,
};

export function useEventQRCode(eventId?: number) {
  return useQuery({
    queryKey: qrCodeKeys.event(eventId ?? 0),
    queryFn: () => getEventQRCode(eventId as number),
    enabled: typeof eventId === "number",
    // A plan without QR codes answers 402/403 - retrying cannot help.
    retry: false,
  });
}

/** The PNG shown on the QR page - the very file the "Download PNG" button
 * saves, so the preview is exactly what gets printed. Only fetched once
 * the QR code itself loaded (i.e. the plan allows it). */
export function useEventQRCodePreview(eventId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qrCodeKeys.preview(eventId ?? 0),
    queryFn: () => downloadEventQRCodeFile(eventId as number, "png"),
    enabled: enabled && typeof eventId === "number",
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useDownloadEventQRCodeMutation() {
  return useMutation({
    mutationFn: ({ eventId, format }: { eventId: number; format: "png" | "pdf" }) =>
      downloadEventQRCodeFile(eventId, format),
  });
}

export function useSetQRCodeActiveMutation(eventId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (isActive: boolean) => setEventQRCodeActive(eventId, isActive),
    onSuccess: (qrCode) => {
      queryClient.setQueryData(qrCodeKeys.event(eventId), qrCode);
    },
  });
}

/** Public, guest-facing: loads the event info for the /scan/:token
 * landing page. The route has no auth at all, so the URL token is the only
 * precondition. */
export function useScannedEvent(token?: string) {
  return useQuery({
    queryKey: qrCodeKeys.scanned(token ?? ""),
    queryFn: () => getScannedEvent(token as string),
    enabled: Boolean(token),
    retry: false,
  });
}

export function useSelfieMatchMutation(token: string) {
  return useMutation({
    mutationFn: (selfie: File) => matchSelfie(token, selfie),
  });
}