import { cloudConfigured, getSupabase, imageUploadUrl } from "./cloud.js";
import { isDemoMode } from "./auth.js";

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 2048;
const MAX_PIXELS = 25_000_000;
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
    assertActive(signal);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
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

function uploadDemo(prepared, { signal, onProgress } = {}) {
  assertActive(signal);
  return blobAsDataUrl(prepared.blob).then((url) => {
    assertActive(signal);
    onProgress?.(1);
    return { url, key: "demo/local.webp" };
  });
}

export async function uploadImage(prepared, { signal, onProgress } = {}) {
  if (!prepared?.blob || prepared.blob.type !== "image/webp")
    throw uploadError("A prepared WebP image is required", "invalid_image");
  if (isDemoMode()) return uploadDemo(prepared, { signal, onProgress });
  if (!cloudConfigured)
    throw uploadError("Image uploads are not configured", "unconfigured");
  assertActive(signal);
  const client = getSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token)
    throw uploadError("Sign in before uploading images", "unauthorized");
  const form = new FormData();
  form.append("file", prepared.blob, "image.webp");
  const result = await new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let abortListener;
    const cleanup = () => {
      if (signal && abortListener)
        signal.removeEventListener("abort", abortListener);
      request.onload = null;
      request.onerror = null;
      request.onabort = null;
      request.ontimeout = null;
    };
    const fail = (error) => {
      cleanup();
      reject(error);
    };
    request.open("POST", imageUploadUrl());
    request.timeout = 120_000;
    request.setRequestHeader(
      "apikey",
      String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
    );
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.responseType = "text";
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onload = () => {
      let body;
      try {
        body = JSON.parse(request.responseText || "{}");
      } catch {
        body = {};
      }
      if (request.status < 200 || request.status >= 300)
        return fail(
          uploadError(
            typeof body.error === "string"
              ? body.error
              : body.error?.message || "Image upload failed",
            body.error?.code || "upload_failed",
          ),
        );
      const payload = body.data || body;
      if (!payload.url)
        return fail(
          uploadError("Upload response did not include a URL", "upload_failed"),
        );
      onProgress?.(1);
      cleanup();
      resolve({ url: payload.url, key: payload.key || "" });
    };
    request.onerror = () => fail(uploadError("Image upload failed", "network"));
    request.ontimeout = () =>
      fail(uploadError("Image upload timed out", "timeout"));
    request.onabort = () => fail(uploadError("Upload cancelled", "aborted"));
    if (signal) {
      abortListener = () => {
        request.abort();
        fail(uploadError("Upload cancelled", "aborted"));
      };
      if (signal.aborted)
        return fail(uploadError("Upload cancelled", "aborted"));
      signal.addEventListener("abort", abortListener, { once: true });
    }
    request.send(form);
  });
  return result;
}

export { MAX_INPUT_BYTES, MAX_OUTPUT_BYTES, MAX_DIMENSION, MAX_PIXELS };
