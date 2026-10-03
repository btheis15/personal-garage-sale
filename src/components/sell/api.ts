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

export type Uploaded = { id: string; url: string; width: number; height: number; maxWidth: number };

const MAX_SIDE = 2048;

/**
 * Turns a photo from the camera or library into a JPEG at most 2048px on its longest side, so it
 * uploads quickly over a phone connection (the Mac mini makes the smaller sizes).
 */
async function shrink(file: File): Promise<Blob> {
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
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ("close" in bitmap) bitmap.close();
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo."))), "image/jpeg", 0.86));
}

/** Uploads one photo to the Mac mini (through the website). */
export async function uploadPhoto(file: File): Promise<Uploaded> {
  const blob = await shrink(file).catch(() => file);
  const form = new FormData();
  form.append("photo", blob, "photo.jpg");
  const res = await fetch("/api/sell/photos", { method: "POST", headers: { "x-sell-app": "1" }, body: form });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.reload();
    throw new Error("Please sign in again.");
  }
  if (!res.ok) throw new Error(data.error ?? `A photo didn't upload (${res.status}). Try again.`);
  return data.photo as Uploaded;
}

/** Uploads several, two at a time, calling onEach as each one lands (or fails). */
export async function uploadPhotos(files: File[], onEach: (index: number, photo: Uploaded | null, error?: string) => void) {
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const i = next++;
      try {
        onEach(i, await uploadPhoto(files[i]));
      } catch (e) {
        onEach(i, null, (e as Error).message);
      }
    }
  }
  await Promise.all([worker(), worker()]);
}

export const dollars = (cents: number | null | undefined) => (cents === null || cents === undefined ? "" : (cents / 100).toFixed(cents % 100 ? 2 : 0));
export const toCents = (text: string) => {
  const n = Number(text.replace(/[$,\s]/g, ""));
  return text.trim() === "" || !Number.isFinite(n) ? null : Math.round(n * 100);
};
