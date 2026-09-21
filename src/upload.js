import {
  cleanupFreshManagedImage,
  cloudConfigured,
  getSupabase,
  IMAGE_BUCKET,
} from "./cloud.js";
import { isDemoMode } from "./auth.js";

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 2048;
const MAX_PIXELS = 25_000_000;
const UPLOAD_TIMEOUT_MS = 30_000;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const uploadError = (message, code = "upload") => {
  const error = new Error(message);
  error.code = code;
  return error;
};

function assertActive(signal) {
  if (signal?.aborted) throw uploadError("Upload cancelled", "aborted");
}

async function decode(file, signal) {
  assertActive(signal);
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    try {
      assertActive(signal);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch (error) {
      bitmap.close();
      throw error;
    }
  }
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = sourceUrl;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () =>
        reject(uploadError("Image could not be decoded", "invalid_image"));
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => {},
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function blobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(reader.error || uploadError("Could not prepare image"));
    reader.readAsDataURL(blob);
  });
}

export async function prepareImage(file, { signal } = {}) {
  if (!file || !ACCEPTED_TYPES.has(file.type))
    throw uploadError("Choose a valid JPG, PNG, or WebP image", "invalid_type");
  if (file.size > MAX_INPUT_BYTES)
    throw uploadError("Image is larger than 10 MB", "input_too_large");
  assertActive(signal);
  const decoded = await decode(file, signal);
  try {
    if (!decoded.width || !decoded.height)
      throw uploadError("Image could not be decoded", "invalid_image");
    if (decoded.width * decoded.height > MAX_PIXELS)
      throw uploadError(
        "Image dimensions are too large to process safely",
        "dimensions",
      );
    const scale = Math.min(
      1,
      MAX_DIMENSION / decoded.width,
      MAX_DIMENSION / decoded.height,
    );
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context)
      throw uploadError("WebP conversion is unavailable", "no_canvas");
    context.drawImage(decoded.source, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(uploadError("WebP conversion failed", "no_webp")),
        "image/webp",
        0.84,
      );
    });
    assertActive(signal);
    if (blob.type !== "image/webp")
      throw uploadError("WebP conversion is unavailable", "no_webp");
    if (blob.size > MAX_OUTPUT_BYTES)
      throw uploadError(
        "Converted image is larger than 5 MB",
        "output_too_large",
      );
    return {
      blob,
      previewUrl: URL.createObjectURL(blob),
      width,
      height,
      originalBytes: file.size,
      bytes: blob.size,
    };
  } catch (error) {
    if (error?.code) throw error;
    throw uploadError("Image could not be prepared", "invalid_image");
  } finally {
    decoded.close();
  }
}

export function releaseImage(prepared) {
  if (prepared?.previewUrl) URL.revokeObjectURL(prepared.previewUrl);
}

/** Give an uncertain upload time to finish before removing a fresh object. */
export function scheduleManagedImageCleanup(url, delay = 5_000) {
  if (!url) return () => {};
  const timer = setTimeout(() => {
    cleanupFreshManagedImage(url).catch(() => {});
  }, delay);
  return () => clearTimeout(timer);
}

function uploadDemo(prepared, { signal, onProgress } = {}) {
  assertActive(signal);
  return blobAsDataUrl(prepared.blob).then((url) => {
    assertActive(signal);
    onProgress?.(1);
    return { url, key: "demo/local.webp" };
  });
}

export async function uploadImage(
  prepared,
  { signal, onProgress, storageClient, timeoutMs = UPLOAD_TIMEOUT_MS } = {},
) {
  if (!prepared?.blob || prepared.blob.type !== "image/webp")
    throw uploadError("A prepared WebP image is required", "invalid_image");
  if (isDemoMode() && !storageClient)
    return uploadDemo(prepared, { signal, onProgress });
  if (!cloudConfigured)
    throw uploadError("Image uploads are not configured", "unconfigured");
  assertActive(signal);
  const client = storageClient || getSupabase();
  if (signal?.aborted) throw uploadError("Upload cancelled", "aborted");
  onProgress?.(0);
  const key = `clinic/${crypto.randomUUID()}.webp`;
  const { data: publicData } = client.storage
    .from(IMAGE_BUCKET)
    .getPublicUrl(key);
  const publicUrl = publicData?.publicUrl || "";
  let timeout;
  let removeAbort;
  let uploadPromise;
  try {
    uploadPromise = client.storage
      .from(IMAGE_BUCKET)
      .upload(key, prepared.blob, {
        cacheControl: "31536000",
        contentType: "image/webp",
        upsert: false,
      });
    const cancellation = new Promise((_, reject) => {
      timeout = setTimeout(
        () => reject(uploadError("Image upload timed out", "timeout")),
        timeoutMs,
      );
      if (!signal) return;
      const onAbort = () => reject(uploadError("Upload cancelled", "aborted"));
      signal.addEventListener("abort", onAbort, { once: true });
      removeAbort = () => signal.removeEventListener("abort", onAbort);
    });
    const { error } = await Promise.race([uploadPromise, cancellation]);
    if (error) {
      const code = /bucket|not found|configured/i.test(error.message || "")
        ? "storage_not_configured"
        : "storage_upload_failed";
      throw uploadError(error.message || "Image upload failed", code);
    }
    assertActive(signal);
    if (!publicUrl)
      throw uploadError(
        "Storage did not return a public image URL",
        "storage_upload_failed",
      );
    onProgress?.(1);
    return { url: publicUrl, key };
  } catch (error) {
    // Storage requests may finish server side after a timeout or abort. Clean
    // only after it settles: this rejected upload was never returned to a save.
    if (publicUrl) {
      error.storageKey = key;
      error.storageUrl = publicUrl;
      uploadPromise?.then(
        () => cleanupFreshManagedImage(publicUrl, client),
        () => {},
      );
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    removeAbort?.();
  }
}

export {
  MAX_INPUT_BYTES,
  MAX_OUTPUT_BYTES,
  MAX_DIMENSION,
  MAX_PIXELS,
  UPLOAD_TIMEOUT_MS,
};
