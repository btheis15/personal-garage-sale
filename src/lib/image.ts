import type { ImageLoader } from "next/image";

/**
 * Photos from the Mac mini come in fixed widths (/media/<id>/<width>.webp); pick the smallest one
 * at least as wide as the screen needs, so phones load small files.
 */
const WIDTHS = [320, 480, 640, 828, 1080, 1280, 1600, 2048];
const MEDIA = /^\/media\/([0-9a-f-]{36})\/(\d+)\.webp$/;

export const mediaLoader: ImageLoader = ({ src, width }) => {
  const m = src.match(MEDIA);
  if (!m) return src;
  const largest = Number(m[2]);
  const w = WIDTHS.find((x) => x >= width && x < largest) ?? largest;
  return `/media/${m[1]}/${w}.webp`;
};

export const isMedia = (src: string) => MEDIA.test(src);
