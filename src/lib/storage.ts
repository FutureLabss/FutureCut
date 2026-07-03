// ============================================================
// FutureCut — Storage Helper (Supabase + Local Fallback)
// ============================================================
// Automatically uploads files to Supabase Storage if env
// variables are defined, or falls back to local disk storage otherwise.
// ============================================================

import fs from "fs";
import path from "path";

/**
 * Save an uploaded file to storage (Supabase or Local).
 * Returns the public access URL of the stored file.
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
