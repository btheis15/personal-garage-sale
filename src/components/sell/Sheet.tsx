"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "../icons";

/**
 * A sheet that rises from the bottom over a blurred page (a card in the middle on a computer).
 * Drag it down from the top to close it, like the Om Threads Sell app's.
 */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const sheet = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const close = () => {
    setClosing(true);
    setTimeout(onClose, 260);
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, []);

  // Swipe down to close: follows the finger, and closes past 110px or on a quick flick.
  useEffect(() => {
    const el = sheet.current;
    const bg = scrim.current;
    if (!el || !bg) return;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let speed = 0;
    let fromTop = false;
    let dragging = false;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startY = lastY = e.touches[0].clientY;
      lastT = e.timeStamp;
      speed = 0;
      fromTop = el.scrollTop <= 0;
      dragging = false;
    };
    const move = (e: TouchEvent) => {
      const y = e.touches[0].clientY;
      const dy = y - startY;
      if (!dragging && fromTop && dy > 6 && el.scrollTop <= 0) {
        dragging = true;
        el.classList.add("dragging");
      }
      if (!dragging) return;
      e.preventDefault();
      const d = Math.max(0, dy);
      el.style.setProperty("--drag", `${d}px`);
      bg.style.opacity = String(Math.max(0.15, 1 - d / 420));
      speed = (y - lastY) / Math.max(1, e.timeStamp - lastT);
      lastY = y;
      lastT = e.timeStamp;
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove("dragging");
      if (lastY - startY > 110 || speed > 0.55) return closeRef.current();
      el.style.removeProperty("--drag");
      bg.style.opacity = "";
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={label}>
      <div ref={scrim} className={`scrim absolute inset-0 bg-ink/45 transition-opacity duration-300 ${closing ? "opacity-0" : ""}`} onClick={close} />
      <div ref={sheet} className={`sheet relative max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-paper p-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl ${closing ? "closing" : ""}`}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-kraft-dark sm:hidden" aria-hidden="true" />
        <button type="button" onClick={close} className="absolute top-3 right-3 z-10 grid size-10 place-items-center rounded-full hover:bg-kraft" aria-label="Close">
          <CloseIcon />
        </button>
        {children}
      </div>
    </div>
  );
}
