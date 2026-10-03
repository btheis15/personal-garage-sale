/**
 * Photos. The Sell app shrinks them on the phone first; here the original is kept privately in
 * data/originals/ (it may carry the GPS location where it was taken), and resized WebP copies with
 * no location or camera data go to data/media/<id>/<width>.webp, which is what the website shows.
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const run = promisify(execFile);

/** Widths the website can ask for. The largest copy is capped at the photo's own width. */
export const IMAGE_WIDTHS = [320, 480, 640, 828, 1080, 1280, 1600, 2048];
const MIN_IMAGE_WIDTH = 300;

export class MediaError extends Error {
  status = 400;
}

export const widthsFor = (maxWidth) => [...IMAGE_WIDTHS.filter((w) => w < maxWidth), maxWidth];

/** Turns anything sharp can't read (iPhone HEIC photos) into JPEG with macOS's built-in `sips`. */
async function decodable(buffer) {
  try {
    await sharp(buffer).metadata();
    return buffer;
  } catch {
    if (process.platform !== "darwin") throw new MediaError("This file isn't a photo we can read. Try a JPEG or PNG.");
    const dir = await mkdtemp(path.join(os.tmpdir(), "gs-"));
    try {
      await writeFile(path.join(dir, "in"), buffer);
      await run("/usr/bin/sips", ["-s", "format", "jpeg", path.join(dir, "in"), "--out", path.join(dir, "out.jpg")]);
      return await readFile(path.join(dir, "out.jpg"));
    } catch {
      throw new MediaError("This file isn't a photo we can read. Try a JPEG, PNG or HEIC.");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

/** Saves a photo. Returns { id, width, height, maxWidth, url }. */
export async function saveImage(config, buffer) {
  const input = await decodable(buffer);
  const meta = await sharp(input).metadata();
  const width = meta.autoOrient?.width ?? meta.width;
  const height = meta.autoOrient?.height ?? meta.height;
  if (!width || !height) throw new MediaError("Couldn't read the photo's size.");
  if (width < MIN_IMAGE_WIDTH && height < MIN_IMAGE_WIDTH) throw new MediaError("This photo is too small. Try another one.");

  const id = randomUUID();
  const maxWidth = Math.min(width, IMAGE_WIDTHS.at(-1));
  const dir = path.join(config.mediaDir, id);
  await mkdir(dir, { recursive: true });
  try {
    for (const w of widthsFor(maxWidth)) {
      await sharp(input).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(dir, `${w}.webp`));
    }
    const ext = (meta.format === "jpeg" ? "jpg" : meta.format) || "bin";
    await writeFile(path.join(config.originalsDir, `${id}.${ext}`), input);
  } catch (e) {
    await rm(dir, { recursive: true, force: true });
    throw e;
  }
  return { id, width, height, maxWidth, url: `/media/${id}/${maxWidth}.webp` };
}

/** Removes a photo's files (when its item is deleted). */
export async function deleteImages(config, ids) {
  for (const id of ids) {
    if (!/^[0-9a-f-]{36}$/.test(id)) continue;
    await rm(path.join(config.mediaDir, id), { recursive: true, force: true });
    for (const ext of ["jpg", "png", "webp", "heif", "bin"]) await rm(path.join(config.originalsDir, `${id}.${ext}`), { force: true });
  }
}
