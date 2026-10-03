"use client";

import { useRef, useState, ViewTransition } from "react";
import type { Photo } from "@/lib/types";
import { ChevronLeft, ChevronRight } from "./icons";
import { itemVtName } from "./ItemCard";
import { ItemPhoto } from "./ItemPhoto";

/** Swipe through the photos on a phone; thumbnails and arrows on a computer. */
export function Gallery({ photos, title, slug, dim = false }: { photos: Photo[]; title: string; slug: string; dim?: boolean }) {
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

  const goTo = (i: number) => {
    const el = strip.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };
  const onScroll = () => {
    const el = strip.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  if (!photos.length)
    return (
      <div className="relative aspect-square overflow-hidden rounded-lg bg-kraft">
        <ItemPhoto url={null} alt={title} sizes="100vw" />
      </div>
    );

  return (
    <div className={dim ? "opacity-70 grayscale" : ""}>
      <div className="relative">
        <div ref={strip} onScroll={onScroll} className="no-scrollbar flex aspect-square snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-2xl bg-kraft shadow-[0_24px_50px_-28px_rgba(31,42,55,0.45)]">
          {photos.map((p, i) => {
            const slide = (
              <div className="relative h-full w-full shrink-0 snap-center">
                <ItemPhoto url={p.url} alt={i === 0 ? title : `${title}, photo ${i + 1}`} sizes="(min-width: 768px) 50vw, 100vw" priority={i === 0} fit="contain" />
              </div>
            );
            // The first photo morphs in from the card that was tapped.
            return i === 0 ? (
              <ViewTransition key={p.url} name={itemVtName(slug)} share="morph" default="none">
                {slide}
              </ViewTransition>
            ) : (
              <div key={p.url} className="contents">
                {slide}
              </div>
            );
          })}
        </div>
        {photos.length > 1 && (
          <>
            <button type="button" onClick={() => goTo(Math.max(0, index - 1))} disabled={index === 0} className="absolute top-1/2 left-2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow disabled:opacity-0 md:grid" aria-label="Previous photo">
              <ChevronLeft />
            </button>
            <button type="button" onClick={() => goTo(Math.min(photos.length - 1, index + 1))} disabled={index === photos.length - 1} className="absolute top-1/2 right-2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow disabled:opacity-0 md:grid" aria-label="Next photo">
              <ChevronRight />
            </button>
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 md:hidden" aria-hidden="true">
              {photos.map((p, i) => (
                <span key={p.url} className={`h-1.5 rounded-full bg-white shadow transition-all ${i === index ? "w-5" : "w-1.5 opacity-60"}`} />
              ))}
            </div>
          </>
        )}
      </div>
      {photos.length > 1 && (
        <div className="mt-3 hidden gap-2 md:flex">
          {photos.map((p, i) => (
            <button key={p.url} type="button" onClick={() => goTo(i)} className={`relative size-20 overflow-hidden rounded-lg bg-kraft ring-2 transition ${i === index ? "ring-tag" : "ring-transparent opacity-70 hover:opacity-100"}`} aria-label={`Photo ${i + 1}`}>
              <ItemPhoto url={p.url} alt="" sizes="80px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
