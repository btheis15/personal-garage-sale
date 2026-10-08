"use client";

import { useState } from "react";

/** Copy a link, with a "Copied" that rolls in for a moment (and the phone's share sheet when there is one). */
export function CopyLink({ text, label = "Copy link", share }: { text: string; label?: string; share?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        className="btn btn-outline"
        onClick={async () => {
          await navigator.clipboard?.writeText(text).catch(() => {});
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        }}
      >
        <span key={String(done)} className="animate-fade-in">
          {done ? "Copied ✓" : label}
        </span>
      </button>
      {share && typeof navigator !== "undefined" && "share" in navigator && (
        <button type="button" className="btn btn-primary" onClick={() => navigator.share({ title: share, url: text }).catch(() => {})}>
          Share
        </button>
      )}
    </div>
  );
}
