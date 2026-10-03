import Image from "next/image";
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
      // Sample drawings are SVGs; uploaded photos go through Vercel's image optimizer.
      unoptimized={url.endsWith(".svg")}
    />
  );
}
