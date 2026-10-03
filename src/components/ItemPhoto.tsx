"use client";

import Image from "next/image";
import { isMedia, mediaLoader } from "@/lib/image";
import { TagIcon } from "./icons";

/** An item's photo, filling its (relatively positioned) box; a plain tile when there's none. */
export function ItemPhoto({ url, alt, sizes, priority = false, fit = "cover" }: { url?: string | null; alt: string; sizes: string; priority?: boolean; fit?: "cover" | "contain" }) {
  if (!url)
    return (
      <div className="absolute inset-0 grid place-items-center bg-kraft text-kraft-dark">
        <TagIcon size={40} />
      </div>
    );
  return (
    <Image
      src={url}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={fit === "cover" ? "object-cover" : "object-contain"}
      // The Mac mini already made every size; sample drawings are SVGs.
      {...(isMedia(url) ? { loader: mediaLoader } : { unoptimized: true })}
    />
  );
}
