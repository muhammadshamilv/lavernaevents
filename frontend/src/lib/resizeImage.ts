/**
 * Shrinks a photo to at most `maxEdge` px on its long edge and re-encodes it
 * as JPEG, before it is uploaded.
 *
 * A phone selfie is typically 4-12 MB; on mobile data that is a long wait
 * and the server would only shrink it again before looking for a face.
 * `imageOrientation: "from-image"` makes the browser apply the camera's
 * rotation flag, so a portrait selfie is not uploaded lying on its side.
 *
 * Any problem (old browser, odd format) falls back to the original file -
 * the server accepts and handles full-size photos too.
 */
export async function resizeImageForUpload(
    file: File,
    maxEdge = 1280,
    quality = 0.88
  ): Promise<File> {
    try {
      if (typeof createImageBitmap !== "function") return file;
  
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  
      // Already small enough: no point re-encoding (and losing quality).
      if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
        bitmap.close();
        return file;
      }
  
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
  
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
  
      const context = canvas.getContext("2d");
      if (!context) {
        bitmap.close();
        return file;
      }
  
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
  
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality)
      );
  
      if (!blob || blob.size >= file.size) return file;
  
      return new File([blob], "selfie.jpg", { type: "image/jpeg" });
    } catch {
      return file;
    }
  }