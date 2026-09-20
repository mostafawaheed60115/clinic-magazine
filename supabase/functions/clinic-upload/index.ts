import { AwsClient } from "aws4fetch";
import { requireActiveAdmin } from "../_shared/auth.ts";
import { errorResponse, isAllowedOrigin, jsonResponse } from "../_shared/http.ts";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FORM_BYTES = MAX_BYTES + 128 * 1024;

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`MISSING_${name}`);
  return value;
}

function failure(request: Request, error: unknown): Response {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  const map: Record<string, [number, string]> = {
    AUTH_REQUIRED: [401, "Authentication is required."],
    AUTH_INVALID: [401, "The access token is invalid or expired."],
    AUTH_FORBIDDEN: [403, "Administrator access is required."],
    AUTH_LOOKUP_FAILED: [503, "Authorization lookup failed."],
    ORIGIN_FORBIDDEN: [403, "Origin is not allowed."],
    INVALID_MULTIPART: [400, "Upload must use multipart/form-data."],
    FILE_REQUIRED: [400, "A WebP file is required in the file field."],
    FILE_TOO_LARGE: [413, "The WebP file must be at most 5 MB."],
    INVALID_WEBP: [415, "The uploaded file is not a valid WebP image."],
    R2_NOT_CONFIGURED: [503, "Image storage is not configured."],
    R2_UPLOAD_FAILED: [502, "Image storage rejected the upload."],
    INTERNAL_ERROR: [500, "The upload could not be completed."],
  };
  const [status, message] = map[code] ?? map.INTERNAL_ERROR;
  return errorResponse(request, status, code in map ? code : "INTERNAL_ERROR", message);
}

function isWebp(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 20) return false;
  const ascii = (start: number, length: number) =>
    new TextDecoder().decode(bytes.subarray(start, start + length));
  if (ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WEBP") return false;
  const riffLength = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
  // The RIFF chunk length excludes its eight byte header. Reject truncated or
  // concatenated payloads before sending bytes to the object store.
  if (riffLength !== bytes.byteLength - 8) return false;
  const firstChunkLength = bytes[16] | (bytes[17] << 8) | (bytes[18] << 16) | (bytes[19] << 24);
  const firstChunkEnd = 20 + firstChunkLength + (firstChunkLength & 1);
  return firstChunkLength > 0 && firstChunkEnd <= bytes.byteLength;
}

async function boundedFormData(request: Request): Promise<FormData> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_FORM_BYTES) throw new Error("FILE_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_MULTIPART");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_FORM_BYTES) throw new Error("FILE_TOO_LARGE");
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const replay = new Request(request.url, { method: "POST", headers: request.headers, body: bytes });
  return await replay.formData();
}

async function upload(file: File): Promise<{ url: string; key: string }> {
  if (file.size > MAX_BYTES) throw new Error("FILE_TOO_LARGE");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error("FILE_TOO_LARGE");
  if (!isWebp(bytes)) throw new Error("INVALID_WEBP");

  let accountId: string;
  let accessKeyId: string;
  let secretAccessKey: string;
  let bucket: string;
  let publicBaseUrl: string;
  try {
    accountId = env("R2_ACCOUNT_ID");
    accessKeyId = env("R2_ACCESS_KEY_ID");
    secretAccessKey = env("R2_SECRET_ACCESS_KEY");
    bucket = env("R2_BUCKET");
    publicBaseUrl = env("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  } catch {
    throw new Error("R2_NOT_CONFIGURED");
  }
  if (!/^https:\/\//i.test(publicBaseUrl)) throw new Error("R2_NOT_CONFIGURED");

  const key = `clinic/${crypto.randomUUID()}.webp`;
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}/${key}`;
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const response = await client.fetch(endpoint, {
    method: "PUT",
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    body: bytes,
  });
  if (!response.ok) throw new Error("R2_UPLOAD_FAILED");
  return { key, url: `${publicBaseUrl}/${key}` };
}

Deno.serve(async (request) => {
  if (!isAllowedOrigin(request)) return errorResponse(request, 403, "ORIGIN_FORBIDDEN", "Origin is not allowed.");
  if (request.method === "OPTIONS") return jsonResponse(request, { ok: true });
  if (request.method !== "POST") return errorResponse(request, 405, "METHOD_NOT_ALLOWED", "Use POST.");

  try {
    await requireActiveAdmin(request);
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) throw new Error("INVALID_MULTIPART");
    const form = await boundedFormData(request);
    const entry = form.get("file");
    if (!(entry instanceof File)) throw new Error("FILE_REQUIRED");
    const result = await upload(entry);
    return jsonResponse(request, { ok: true, ...result }, 201);
  } catch (error) {
    return failure(request, error);
  }
});
