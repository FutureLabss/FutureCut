// ============================================================
// FutureCut — Storage Helper (Supabase + Local Fallback)
// ============================================================
// Two upload paths are supported:
//
// 1. saveFile() — server-side upload, used only for small assets
//    or local dev. NOT used for videos in production, since the
//    file body has to pass through the Netlify function request,
//    which caps out at 6MB / 10s.
//
// 2. createSignedUploadUrl() — used for videos. Issues a
//    short-lived, scoped Supabase Storage upload token so the
//    BROWSER can upload the file directly to Supabase, bypassing
//    the Netlify function entirely (no size/time limit from our
//    infra in that path).
// ============================================================

import fs from "fs";
import path from "path";

export type SignedUpload = {
  /** Full URL the client should PUT the file to. */
  uploadUrl: string;
  /** Public URL to use once the upload completes. */
  publicUrl: string;
};

/**
 * Create a signed upload URL + token for a given storage path.
 * The returned uploadUrl can be PUT to directly from the browser
 * with no server-side auth needed beyond the embedded token.
 * Token is short-lived (Supabase default: 2 hours).
 */
export async function createSignedUploadUrl(
  bucket: "uploads" | "renders",
  filename: string
): Promise<SignedUpload> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing); " +
        "direct upload is unavailable in this environment."
    );
  }

  const cleanUrl = supabaseUrl.replace(/\/$/, "");

  const res = await fetch(
    `${cleanUrl}/storage/v1/object/upload/sign/${bucket}/${filename}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Could not create signed upload URL: ${errText}`);
  }

  const data = (await res.json()) as { url: string };
  // data.url looks like "/object/upload/sign/uploads/path?token=..."
  const uploadUrl = `${cleanUrl}/storage/v1${data.url}`;
  const publicUrl = `${cleanUrl}/storage/v1/object/public/${bucket}/${filename}`;

  return { uploadUrl, publicUrl };
}

/**
 * Save an uploaded file to storage (Supabase or Local).
 * Returns the public access URL of the stored file.
 *
 * Kept for small, non-video assets and local dev only — see
 * module comment above for why videos should use
 * createSignedUploadUrl() + a direct browser upload instead.
 */
export async function saveFile(
  file: File,
  bucket: "uploads" | "renders",
  filename: string
): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseKey) {
    const cleanUrl = supabaseUrl.replace(/\/$/, "");
    const uploadUrl = `${cleanUrl}/storage/v1/object/${bucket}/${filename}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true",
      },
      body: buffer,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Supabase Storage upload failed: ${errText}`);
    }

    // Return public URL format
    return `${cleanUrl}/storage/v1/object/public/${bucket}/${filename}`;
  } else {
    // Local development fallback
    const localDir = path.join(process.cwd(), "public", bucket);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    const filepath = path.join(localDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filepath, buffer);

    return `/${bucket}/${filename}`;
  }
}
