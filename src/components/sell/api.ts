"use client";

/** The Sell app's requests to its own API (the header proves they come from these pages). */
export async function sellApi<T = Record<string, unknown>>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "x-sell-app": "1", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.reload();
    throw new Error("Please sign in again.");
  }
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Something went wrong (${res.status}).`);
  return data as T;
}

export type Uploaded = { path: string; url: string; width: number; height: number };

const MAX_SIDE = 1600;

/** Turns a photo from the camera or library into a JPEG at most 1600px on its longest side. */
async function shrink(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(async () => {
    // Older Safari: through an <img>.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });
  const w = "naturalWidth" in bitmap ? bitmap.naturalWidth : bitmap.width;
  const h = "naturalHeight" in bitmap ? bitmap.naturalHeight : bitmap.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap) bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo."))), "image/jpeg", 0.85));
  return { blob, width, height };
}

/** Shrinks the photos and uploads them straight to Supabase Storage. Calls onEach as each one lands. */
export async function uploadPhotos(files: File[], onEach: (index: number, photo: Uploaded) => void) {
  const { uploads } = await sellApi<{ uploads: { path: string; signedUrl: string; url: string }[] }>("POST", "/api/sell/uploads", { count: files.length });
  await Promise.all(
    files.map(async (file, i) => {
      const { blob, width, height } = await shrink(file);
      const u = uploads[i];
      const res = await fetch(u.signedUrl, { method: "PUT", headers: { "content-type": "image/jpeg", "cache-control": "max-age=31536000", "x-upsert": "false" }, body: blob });
      if (!res.ok) throw new Error(`A photo didn't upload (${res.status}). Try again.`);
      onEach(i, { path: u.path, url: u.url, width, height });
    }),
  );
}

export const dollars = (cents: number | null | undefined) => (cents === null || cents === undefined ? "" : (cents / 100).toFixed(cents % 100 ? 2 : 0));
export const toCents = (text: string) => {
  const n = Number(text.replace(/[$,\s]/g, ""));
  return text.trim() === "" || !Number.isFinite(n) ? null : Math.round(n * 100);
};
